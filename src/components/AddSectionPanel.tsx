import React, { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import type { ResumeData } from '../types';
import { appendCustomSection } from '../lib/sourceReview';
import { allSections, hasSectionContent, restoreSection, SECTION_LABELS, sectionTitle } from '../lib/sections';
import { updateContent } from '../lib/ai';
import { resumeSchema } from '../../shared/contracts';

export function AddSectionPanel({ resume, onChange }: { resume: ResumeData; onChange: (resume: ResumeData, label: string) => void }): React.ReactElement {
  const [open, setOpen] = useState(false), [kind, setKind] = useState('custom'), [title, setTitle] = useState(''), [content, setContent] = useState(''), [error, setError] = useState('');
  const hidden = allSections(resume).filter(id => resume.hiddenSections.includes(id) && hasSectionContent(resume, id));
  const missing = Object.keys(SECTION_LABELS).filter(id => !hasSectionContent(resume, id));
  const formats: Record<string, string> = {
    custom: '每行一条内容', summary: '填写个人简介', skills: '每行一项技能，可用 | 分隔熟练程度', awards: '每行一项获奖或证书',
    projects: '首行项目名称，第二行时间 / 角色，其余行填写项目描述', experience: '首行公司，第二行职位，第三行时间，其余行填写经历描述', education: '首行学校，第二行学位 / 专业，第三行就读时间',
  };
  function add() {
    try {
      let next = structuredClone(resume);
      if (kind === 'custom') next = appendCustomSection(resume, title, content.split('\n'));
      else if (['summary', 'skills', 'awards'].includes(kind)) next = updateContent(next, kind, content.trim());
      else if (kind === 'projects') next = updateContent({ ...next, projects: [{ id: crypto.randomUUID(), title: '', meta: '', description: [], stack: [] }] }, 'project-1-title', content.split('\n')[0]?.trim() ?? '');
      if (kind === 'projects') { const lines = content.split('\n').map(line => line.trim()); next.projects[0].meta = lines[1] ?? ''; next.projects[0].description = lines.slice(2).filter(Boolean); }
      if (kind === 'experience') next = updateContent({ ...next, experience: [{ company: '', role: '', period: '', bullets: [] }] }, 'experience-1', content);
      if (kind === 'education') next = updateContent({ ...next, education: [{ school: '', degree: '', period: '' }] }, 'education-1', content);
      next = restoreSection(next, kind);
      const parsed = resumeSchema.safeParse(next);
      if (!parsed.success) throw new Error('栏目内容超出限制：简介最多 6000 字；每条内容最多 3000 字；技能、奖项或描述最多 30 条。请缩短后重试。');
      onChange(parsed.data, '添加栏目：' + (kind === 'custom' ? title.trim() : SECTION_LABELS[kind]));
      setOpen(false); setKind('custom'); setContent(''); setTitle(''); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '请检查栏目内容'); }
  }
  return <div className="add-section-panel">
    <div className="canvas-actions-row"><div><strong>在简历上直接编辑</strong><small>点击文字修改，离开后保存 · 拖动栏目把手排序</small></div><button className="outline-button add-section-button" aria-expanded={open} onClick={() => setOpen(value => !value)}><Plus size={15} />添加栏目</button></div>
    {open && <div className="add-section-form">
      <div className="add-section-form-heading"><strong>添加或恢复栏目</strong><button className="quiet-icon" aria-label="关闭添加栏目" onClick={() => setOpen(false)}><X size={15} /></button></div>
      {hidden.length > 0 && <div className="restore-sections">{hidden.map(id => <button key={id} className="ghost-button" onClick={() => onChange(restoreSection(resume, id), '恢复栏目：' + sectionTitle(resume, id))}><RotateCcw size={13} />恢复 {sectionTitle(resume, id)}</button>)}</div>}
      <label className="input-label">栏目类型<select aria-label="添加栏目类型" value={kind} onChange={event => { setKind(event.target.value); setContent(''); setError(''); }}><option value="custom">自定义栏目</option>{missing.map(id => <option key={id} value={id}>{SECTION_LABELS[id]}</option>)}</select></label>
      {kind === 'custom' && <><div className="section-presets">{['语言能力', '课程学习', '研究经历', '志愿活动'].map(value => <button className="ghost-button" key={value} onClick={() => setTitle(value)}>{value}</button>)}</div><label className="input-label">栏目名称<input aria-label="新栏目名称" value={title} maxLength={195} placeholder="例如：语言能力、研究经历" onChange={event => setTitle(event.target.value)} /></label></>}
      <label className="input-label">{formats[kind]}<textarea aria-label="新栏目内容" value={content} rows={4} maxLength={45000} placeholder={formats[kind]} onChange={event => setContent(event.target.value)} /></label>
      <button className="primary-button compact" disabled={!content.trim() || kind === 'custom' && !title.trim()} onClick={add}><Plus size={14} />加入简历</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
