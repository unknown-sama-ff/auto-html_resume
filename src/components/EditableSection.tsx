import React, { type ReactNode } from 'react';
import { ArrowDown, ArrowUp, GripVertical, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import type { SectionColumn } from '../lib/sections';

type Props = {
  id: string; title: string; column: SectionColumn; interactive: boolean; children: ReactNode;
  onSelect?: () => void; onDelete?: () => void; onStep?: (direction: -1 | 1) => void;
};
export function EditableSection(props: Props): React.ReactElement {
  if (!props.interactive) return <section className="resume-section" data-section={props.id}>{props.children}</section>;
  return <SortableSection {...props} />;
}
function SortableSection({ id, title, column, children, onSelect, onDelete, onStep }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, isOver } = useSortable({ id, data: { column } });
  return <section ref={setNodeRef} className={'resume-section editable-section' + (isDragging ? ' is-dragging' : '') + (isOver ? ' is-drop-target' : '')} data-section={id}>
    <div className="section-edit-tools" aria-label={title + '栏目操作'}>
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="section-drag-handle" aria-label={'拖动栏目 ' + title} title="拖动排序；也可按空格开始、方向键移动"><GripVertical size={15} /></button>
      <span>{title}</span>
      <button aria-label={'上移栏目 ' + title} title="上移" onClick={() => onStep?.(-1)}><ArrowUp size={13} /></button>
      <button aria-label={'下移栏目 ' + title} title="下移" onClick={() => onStep?.(1)}><ArrowDown size={13} /></button>
      <button aria-label={'调整栏目 ' + title} title="调整栏目" onClick={onSelect}><SlidersHorizontal size={13} /></button>
      <button aria-label={'删除栏目 ' + title} title="删除（可撤回）" onClick={onDelete}><Trash2 size={13} /></button>
    </div>
    {children}
  </section>;
}
