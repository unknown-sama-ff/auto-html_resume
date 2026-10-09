import React, { useCallback, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
type Props = {
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span' | 'strong' | 'small' | 'li';
  nodeProps: HTMLAttributes<HTMLElement>; id: string; label: string; children: ReactNode; content: string; format?: 'plain' | 'paragraphs' | 'tags';
  onEdit?: (id: string, value: string) => void; multiline?: boolean;
};
export function InlineText({ as: Tag = 'span', nodeProps, id, label, children, content, format = 'plain', onEdit, multiline = false }: Props) {
  const before = useRef('');
  const beforeHtml = useRef('');
  const cancelled = useRef(false);
  const element = useRef<HTMLElement>(null);
  const restoreContent = useCallback((target: HTMLElement) => {
    if (format === 'plain') target.textContent = content;
    else target.replaceChildren(...content.split('\n').filter(Boolean).map(line => {
      const child = document.createElement(format === 'tags' ? 'span' : 'p');
      child.textContent = line;
      return child;
    }));
  }, [content, format]);
  useLayoutEffect(() => {
    if (onEdit && element.current && document.activeElement !== element.current) restoreContent(element.current);
  }, [restoreContent, onEdit]);
  if (!onEdit) return <Tag key="static" {...nodeProps}>{children}</Tag>;
  return <Tag key="editing" {...nodeProps} ref={element as React.Ref<never>} contentEditable="plaintext-only" suppressContentEditableWarning role="textbox" aria-label={'编辑' + label} aria-multiline={multiline} spellCheck={false}
    onFocus={event => { before.current = event.currentTarget.innerText; beforeHtml.current = event.currentTarget.innerHTML; cancelled.current = false; }}
    onBlur={event => {
      const value = event.currentTarget.innerText.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (!cancelled.current && event.currentTarget.innerText !== before.current) {
        onEdit(id, multiline ? value : value.replace(/\n/g, ' '));
      }
      restoreContent(event.currentTarget);
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.innerHTML = beforeHtml.current; event.currentTarget.blur(); event.stopPropagation(); }
      if (event.key === 'Enter' && !event.nativeEvent.isComposing && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.blur(); }
    }}
  />;
}
