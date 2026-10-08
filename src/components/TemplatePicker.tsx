import { RESUME_TEMPLATES, type TemplateId } from '../../shared/design';
import type { ResumeData } from '../types';

export function TemplatePicker({ value, onChange, allowAuto = false, disabled = false }: { value: TemplateId | 'auto'; onChange: (id: TemplateId | 'auto') => void; allowAuto?: boolean; disabled?: boolean }) {
  return <div className="template-picker" role="group" aria-label="简历模板">
    {allowAuto && <button type="button" className={`template-option template-auto ${value === 'auto' ? 'active' : ''}`} aria-pressed={value === 'auto'} disabled={disabled} onClick={() => onChange('auto')}><strong>AI 自主设计</strong><small>根据岗位与资料选择版式和配色</small></button>}
    {RESUME_TEMPLATES.map(template => <button type="button" className={`template-option ${value === template.id ? 'active' : ''}`} aria-pressed={value === template.id} disabled={disabled} key={template.id} onClick={() => onChange(template.id)}>
      <span className={`template-mini mini-${template.id}`} style={{ '--mini-accent': template.design.accentColor } as React.CSSProperties} aria-hidden="true"><i className="mini-head" /><i className="mini-side" /><i className="mini-body" /></span><strong>{template.label}</strong><small>{template.description}</small>
    </button>)}
  </div>;
}

export function DesignPanel({ resume, onChange, onSelectPage, onSelectAvatar }: { resume: ResumeData; onChange: (resume: ResumeData, label: string) => void; onSelectPage: () => void; onSelectAvatar: () => void }) {
  function set(key: keyof ResumeData['design'], value: string | number) { onChange({ ...resume, design: { ...resume.design, [key]: value } }, '调整整页设计'); }
  return <div className="design-controls"><div className="design-control-fields">
    <label>字体<select aria-label="简历字体" value={resume.design.fontFamily} onChange={e => set('fontFamily', e.target.value)}><option value="sans">清晰无衬线</option><option value="serif">经典衬线</option><option value="mono">技术等宽</option></select></label>
    <label>密度<select aria-label="简历密度" value={resume.design.density} onChange={e => set('density', e.target.value)}><option value="compact">紧凑</option><option value="comfortable">舒适</option><option value="spacious">宽松</option></select></label>
    <label>标题<select aria-label="标题风格" value={resume.design.headingStyle} onChange={e => set('headingStyle', e.target.value)}><option value="line">横线</option><option value="accent">左侧强调</option><option value="plain">纯文字</option></select></label>
    <label>主题色<input aria-label="简历主题色" type="color" value={resume.design.accentColor} onChange={e => set('accentColor', e.target.value)} /></label>
    <label>文字色<input aria-label="简历文字色" type="color" value={resume.design.inkColor} onChange={e => set('inkColor', e.target.value)} /></label>
    <label>纸张色<input aria-label="简历纸张色" type="color" value={resume.design.paperColor} onChange={e => set('paperColor', e.target.value)} /></label>
  </div><button type="button" className="outline-button" onClick={onSelectPage}>让 AI 调整整页设计</button><button type="button" className="outline-button" onClick={onSelectAvatar}>头像设置</button><small>切换模板保留内容和局部样式，支持撤销。</small></div>;
}
