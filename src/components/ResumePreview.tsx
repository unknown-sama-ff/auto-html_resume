import React, { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MapPin, AtSign, Link2, Phone } from 'lucide-react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, closestCenter, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { FONT_STACKS } from '../../shared/design';
import { getBaseNodeStyle, inheritedNodeStyle } from '../lib/design';
import { orderedSections, sectionColumn, sectionTitle, type SectionColumn } from '../lib/sections';
import { InlineText } from './InlineText';
import { getNodeContent } from '../lib/ai';
import { EditableSection } from './EditableSection';
import type { ResumeData } from '../types';

type Props = {
  resume: ResumeData; selectedNodeId?: string; onSelect?: (id: string) => void; scale?: number; interactive?: boolean;
  onEdit?: (id: string, value: string) => void; onDeleteSection?: (id: string) => void;
  onMoveSection?: (source: string, target: string | null, column: SectionColumn, after?: boolean) => void;
};
function DropColumn({ column, ids, className, enabled, children }: { column: SectionColumn; ids: string[]; className: string; enabled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'column-' + column, data: { column }, disabled: !enabled });
  return <div ref={setNodeRef} className={className + (enabled ? ' section-drop-column' : '') + (enabled && isOver ? ' is-column-over' : '')} data-column={column}>
    <SortableContext items={ids}>{children}{enabled && ids.length === 0 && <div className="column-drop-hint">拖入栏目</div>}</SortableContext>
  </div>;
}
export function ResumePreview({ resume, selectedNodeId = '', onSelect, scale = 1, interactive = true, onEdit, onDeleteSection, onMoveSection }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(1123);
  const [dragId, setDragId] = useState<string | null>(null);
  const keyboardTarget = useRef<string | null>(null);
  const keyboardDrag = useRef(false);
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
    event.preventDefault();
    const activeId = String(context.active?.id ?? '');
    const currentId = keyboardTarget.current ?? activeId;
    const currentColumn = currentId.startsWith('column-') ? currentId.slice(7) as SectionColumn : sectionColumn(resume, currentId);
    const sections = orderedSections(resume);
    let target: string | null = null;
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      const siblings = sections.filter(id => sectionColumn(resume, id) === currentColumn);
      const index = currentId.startsWith('column-') ? -1 : siblings.indexOf(currentId);
      target = siblings[index + (event.code === 'ArrowDown' ? 1 : -1)] ?? null;
      if (!target && resume.design.templateId === 'portfolio') {
        const adjacent = event.code === 'ArrowDown' && currentColumn === 'main' ? 'side'
          : event.code === 'ArrowUp' && currentColumn === 'side' ? 'main' : null;
        if (adjacent) {
          const candidates = sections.filter(id => sectionColumn(resume, id) === adjacent && id !== activeId);
          target = (event.code === 'ArrowDown' ? candidates[0] : candidates.at(-1)) ?? 'column-' + adjacent;
        }
      }
    } else {
      const currentRect = context.droppableRects.get(currentId);
      if (currentRect) {
        const center = currentRect.left + currentRect.width / 2;
        const direction = event.code === 'ArrowRight' ? 1 : -1;
        const spatialAdjacent = (['main', 'side'] as const).filter(column => column !== currentColumn)
          .map(column => ({ column, rect: context.droppableRects.get('column-' + column) }))
          .filter(entry => entry.rect && direction * (entry.rect.left + entry.rect.width / 2 - center) > 1)
          .sort((a, b) => Math.abs(a.rect!.left + a.rect!.width / 2 - center) - Math.abs(b.rect!.left + b.rect!.width / 2 - center))[0];
        // The gallery's support index sits below the main area; retain left/right column navigation there.
        const stackedColumn = resume.design.templateId === 'portfolio'
          ? event.code === 'ArrowRight' && currentColumn === 'main' ? 'side'
            : event.code === 'ArrowLeft' && currentColumn === 'side' ? 'main' : null
          : null;
        const adjacent = stackedColumn ? { column: stackedColumn, rect: context.droppableRects.get('column-' + stackedColumn) } : spatialAdjacent;
        if (adjacent) {
          if (stackedColumn) target = 'column-' + adjacent.column;
          else {
            const candidates = sections.filter(id => sectionColumn(resume, id) === adjacent.column && id !== activeId);
            target = candidates.sort((a, b) => {
              const aRect = context.droppableRects.get(a), bRect = context.droppableRects.get(b);
              return Math.abs((aRect?.top ?? 0) + (aRect?.height ?? 0) / 2 - currentRect.top - currentRect.height / 2)
                - Math.abs((bRect?.top ?? 0) + (bRect?.height ?? 0) / 2 - currentRect.top - currentRect.height / 2);
            })[0] ?? 'column-' + adjacent.column;
          }
        }
      }
    }
    if (!target) return currentCoordinates;
    const targetRect = context.droppableRects.get(target), collisionRect = context.collisionRect;
    if (!targetRect || !collisionRect) return currentCoordinates;
    keyboardTarget.current = target;
    // Center the overlay on the logical target; scaled parent rectangles cannot become a false next sibling.
    return { x: targetRect.left + (targetRect.width - collisionRect.width) / 2, y: targetRect.top + (targetRect.height - collisionRect.height) / 2 };
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }));
  const collisions: CollisionDetection = args => {
    const target = keyboardDrag.current && keyboardTarget.current;
    return closestCenter(target ? { ...args, droppableContainers: args.droppableContainers.filter(container => String(container.id) === target) } : args);
  };
  const editable = interactive && Boolean(onEdit);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function node(id: string, component = id, path = id) {
    const defaults = getBaseNodeStyle(resume, id), local = resume.nodeStyles[id], page = resume.nodeStyles.page, inherited = inheritedNodeStyle(resume, id);
    return {
      className: 'resume-node' + (interactive && selectedNodeId === id ? ' is-selected' : ''),
      'data-node-id': id, 'data-component': component, 'data-content-path': path,
      style: {
        color: page?.color ?? local?.color ?? inherited.color ?? defaults.color,
        fontFamily: FONT_STACKS[local?.fontFamily ?? inherited.fontFamily ?? page?.fontFamily ?? defaults.fontFamily],
        fontSize: (local?.fontSize ?? inherited.fontSize ?? defaults.fontSize) * ((page?.fontSize ?? 14) / 14),
        fontWeight: local?.fontWeight ?? inherited.fontWeight ?? page?.fontWeight ?? defaults.fontWeight,
        marginBottom: local?.marginBottom ?? defaults.marginBottom,
        ...(local?.accent !== undefined ? { borderLeft: local.accent ? '2px solid ' + resume.design.accentColor : 'none', paddingLeft: local.accent ? 8 : undefined } : {}),
      } as CSSProperties,
      ...(interactive ? { tabIndex: 0, onClick: (event: React.MouseEvent<HTMLElement>) => { event.stopPropagation(); onSelect?.(id); }, onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (!event.currentTarget.isContentEditable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onSelect?.(id); }
      } } : {}),
    };
  }
  function text(id: string, value: ReactNode, as: 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span' | 'strong' | 'small' | 'li' = 'span', className = '', multiline = false, label = id) {
    const props = node(id);
    return <InlineText as={as} id={id} label={label} content={getNodeContent(resume,id)} format={className === 'tag-row' ? 'tags' : ['project-description','custom-content'].includes(className) ? 'paragraphs' : 'plain'} nodeProps={{ ...props, className: props.className + ' ' + className }} onEdit={editable ? onEdit : undefined} multiline={multiline}>{value}</InlineText>;
  }
  const order = orderedSections(resume);
  const columns = { main: order.filter(id => sectionColumn(resume, id) === 'main'), side: order.filter(id => sectionColumn(resume, id) === 'side'), full: order.filter(id => sectionColumn(resume, id) === 'full') };
  function selectSection(id: string) {
    onSelect?.(['summary', 'skills', 'awards'].includes(id) ? id : id.startsWith('custom-') ? id + '-content' : id === 'projects' ? 'project-1-description' : id === 'experience' ? 'experience-1' : id === 'education' ? 'education-1' : id + '-section-title');
  }
  function step(id: string, direction: -1 | 1) {
    const column = sectionColumn(resume, id);
    const siblings = columns[column];
    const target = siblings[siblings.indexOf(id) + direction];
    if (target) onMoveSection?.(id, target, column, direction === 1);
  }
  function content(id: string): ReactNode {
    if (id === 'summary') return text('summary', resume.summary, 'p', 'resume-summary', true, '个人简介');
    if (id === 'projects') return resume.projects.map((item, index) => <article className="project-item" key={item.id}>
      {text('project-' + (index + 1) + '-title', item.title, 'h3', '', false, '项目名称')}
      {text('project-' + (index + 1) + '-meta', item.meta, 'span', 'project-meta', false, '项目时间与角色')}
      {text('project-' + (index + 1) + '-description', item.description.map((line, i) => <p key={i}>{line}</p>), 'div', 'project-description', true, '项目描述')}
      {text('project-' + (index + 1) + '-stack', item.stack.map((tag, i) => <span key={i}>{tag}</span>), 'div', 'tag-row', true, '技术标签（每行一项）')}
    </article>);
    if (id === 'experience') return resume.experience.map((item, index) => <article {...node('experience-' + (index + 1))} className={node('experience-' + (index + 1)).className + ' experience-item'} key={index}>
      <div className="experience-header">{text('experience-' + (index + 1) + '-role', item.role, 'strong', '', false, '职位')}{text('experience-' + (index + 1) + '-period', item.period, 'span', '', false, '任职时间')}</div>
      {text('experience-' + (index + 1) + '-company', item.company, 'div', 'experience-company', false, '公司')}
      <ul>{item.bullets.map((line, i) => <React.Fragment key={i}>{text('experience-' + (index + 1) + '-bullet-' + (i + 1), line, 'li', '', false, '工作经历描述')}</React.Fragment>)}</ul>
    </article>);
    if (id === 'education') return resume.education.map((item, index) => <div {...node('education-' + (index + 1))} className={node('education-' + (index + 1)).className + ' education-item'} key={index}>
      {text('education-' + (index + 1) + '-school', item.school, 'strong', '', false, '学校')}{text('education-' + (index + 1) + '-degree', item.degree, 'span', '', false, '学位与专业')}{text('education-' + (index + 1) + '-period', item.period, 'small', '', false, '就读时间')}
    </div>);
    if (id === 'skills') return <div {...node('skills')} className={node('skills').className + ' skill-list'}>{resume.skills.map((item, i) => <div className="skill-item" key={i}>
      {text('skill-' + (i + 1) + '-label', item.label, 'span', '', false, '技能')}{text('skill-' + (i + 1) + '-level', item.level, 'small', '', false, '熟练程度')}
    </div>)}</div>;
    if (id === 'awards') return <div {...node('awards')} className={node('awards').className + ' awards-list'}>{resume.awards.map((item, i) => <React.Fragment key={i}>{text('award-' + (i + 1), item, 'p', '', false, '获奖或证书')}</React.Fragment>)}</div>;
    const item = resume.customSections.find(section => 'custom-' + section.id === id);
    return item && text(id + '-content', item.items.map((line, i) => <p key={i}>{line}</p>), 'div', 'custom-content', true, item.title);
  }
  function section(id: string) {
    const title = sectionTitle(resume, id), custom = id.startsWith('custom-');
    return <EditableSection key={id} id={id} title={title} column={sectionColumn(resume, id)} interactive={editable} onSelect={() => selectSection(id)} onDelete={() => onDeleteSection?.(id)} onStep={direction => step(id, direction)}>
      {id !== 'summary' && text(custom ? id + '-title' : id + '-section-title', title, 'h2', 'section-heading', false, '栏目标题')}
      {content(id)}
    </EditableSection>;
  }
  const identity = <header className="resume-header"><div className="resume-header-copy">
    {text('profile-name', resume.name, 'h1', '', false, '姓名')}{text('profile-role', resume.role, 'p', '', false, '职业定位')}
    <div {...node('profile-contact')} className={node('profile-contact').className + ' contact-row'}>
      {(resume.location || editable) && <span><MapPin size={11} />{text('profile-location', resume.location, 'span', '', false, '地点')}</span>}
      {(resume.email || editable) && <span><AtSign size={11} />{text('profile-email', resume.email, 'span', '', false, '邮箱')}</span>}
      {(resume.phone || editable) && <span><Phone size={11} />{text('profile-phone', resume.phone, 'span', '', false, '电话')}</span>}
      {(resume.website || editable) && <span><Link2 size={11} />{text('profile-website', resume.website, 'span', '', false, '网址')}</span>}
    </div></div>{resume.avatarDataUrl && <div {...node('profile-avatar')} className={node('profile-avatar').className + ' avatar-wrap'} style={{ ...node('profile-avatar').style, zoom: resume.design.avatarScale }}>
      <div className={'resume-avatar ' + resume.design.avatarShape}><img src={resume.avatarDataUrl} alt="个人头像" /></div>
    </div>}</header>;
  const template = resume.design.templateId;
  const style = {
    '--resume-accent': resume.design.accentColor, '--section-gap': (resume.nodeStyles.page?.marginBottom ?? resume.design.sectionGap) + 'px', '--resume-font': FONT_STACKS[resume.design.fontFamily],
    background: resume.design.paperColor, color: resume.nodeStyles.page?.color ?? resume.design.inkColor, fontWeight: resume.nodeStyles.page?.fontWeight,
    borderLeft: resume.nodeStyles.page?.accent ? '2px solid ' + resume.design.accentColor : undefined, transform: 'scale(' + scale + ')', transformOrigin: 'top left',
  } as CSSProperties;
  function column(id: SectionColumn, className: string) { return <DropColumn column={id} ids={columns[id]} enabled={editable} className={className}>{columns[id].map(section)}</DropColumn>; }
  let body: ReactNode;
  if (template === 'modern') body = <div className="resume-layout-shell"><aside className="resume-identity-panel">{identity}{column('side', 'resume-side-sections')}</aside><main className="resume-main-column">{column('full', 'resume-full-sections')}{column('main', 'resume-main-sections')}</main></div>;
  else if (template === 'minimal' || template === 'academic' || template === 'compact' || template === 'classic') body = <>{identity}{column('full', 'resume-full-sections')}<main className="resume-body-single">{column('main', 'resume-main-sections')}</main></>;
  else if (template === 'portfolio') body = <>{identity}{column('full', 'resume-full-sections')}<main className="resume-body-single">{column('main', 'resume-main-sections')}</main>{column('side', 'resume-support-grid')}</>;
  else if (template === 'campus') body = <>{identity}{column('full', 'resume-full-sections')}<div className="resume-grid">{column('side', 'resume-side-column')}{column('main', 'resume-main-column')}</div></>;
  else body = <>{identity}{column('full', 'resume-full-sections')}<div className="resume-grid">{column('main', 'resume-main-column')}{column('side', 'resume-side-column')}</div></>;
  function finishDrag(event: DragEndEvent) {
    const keyboard = keyboardDrag.current, keyboardId = keyboardTarget.current;
    keyboardDrag.current = false; keyboardTarget.current = null; setDragId(null);
    if (!keyboard && !event.over) return;
    const source = String(event.active.id), targetId = keyboard ? keyboardId : event.over && String(event.over.id);
    if (!targetId) return;
    const column = keyboard
      ? targetId.startsWith('column-') ? targetId.slice(7) as SectionColumn : sectionColumn(resume, targetId)
      : event.over?.data.current?.column as SectionColumn | undefined;
    if (!column) return;
    const target = targetId.startsWith('column-') ? null : targetId;
    const translated = event.active.rect.current.translated;
    const after = keyboard
      ? Boolean(target && sectionColumn(resume, source) === column && order.indexOf(source) < order.indexOf(target))
      : Boolean(target && translated && event.over && translated.top + translated.height / 2 > event.over.rect.top + event.over.rect.height / 2);
    onMoveSection?.(source, target, column, after);
  }
  return <DndContext sensors={sensors} collisionDetection={collisions} onDragStart={event => { keyboardDrag.current = event.activatorEvent.type === 'keydown'; keyboardTarget.current = String(event.active.id); setDragId(String(event.active.id)); }} onDragCancel={() => { keyboardDrag.current = false; keyboardTarget.current = null; setDragId(null); }} onDragEnd={finishDrag}>
    <div className="resume-paper-wrap" style={{ width: 794 * scale, height: height * scale }}><div ref={ref} className={'resume-paper resume-document template-' + template + ' density-' + resume.design.density + ' headings-' + resume.design.headingStyle + (interactive ? ' interactive-paper' : ' export-paper')} style={style} data-template={template} data-node-id="page" data-component="page">
      {interactive && <button className="page-selection-control" onClick={() => onSelect?.('page')}>选择整页</button>}{body}
    </div></div>
    {interactive && <DragOverlay>{dragId && <div className="section-drag-overlay">↕ {sectionTitle(resume, dragId)}</div>}</DragOverlay>}
  </DndContext>;
}
