import { useEffect, useRef } from 'react';
import type { ResumeVersion } from '../types';
import { Trash2 } from 'lucide-react';
export function DeleteVersionDialog({ version, onCancel, onConfirm }: { version: ResumeVersion; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLElement>('.version-select, .sidebar-toggle')?.focus();
    };
  }, []);
  return <div className="modal-backdrop delete-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={dialog} className="model-modal delete-version-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-version-title" aria-describedby="delete-version-description" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key !== 'Tab') return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons?.[0]; const last = buttons?.[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="modal-head"><div><span className="panel-kicker"><Trash2 size={14}/> VERSION DELETE</span><h2 id="delete-version-title">删除简历版本</h2><p id="delete-version-description">将从此浏览器删除下面这份版本，以及它的岗位分析、编辑对话和修改历史。此操作不能通过“撤销”恢复，其他版本和已下载文件不会受到影响。</p></div></div>
      <div className="delete-version-name">{version.title}</div>
      <div className="modal-foot"><button ref={cancel} className="ghost-button" onClick={onCancel}>取消</button><button className="danger-button" onClick={onConfirm}><Trash2 size={14}/>确认删除</button></div>
    </section>
  </div>;
}
