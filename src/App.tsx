import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent, MouseEvent, ReactNode } from 'react';
import {
  AtSign,
  Blocks,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileText,
  History,
  Image,
  LayoutTemplate,
  Lightbulb,
  Link2,
  MapPin,
  Maximize2,
  MoreHorizontal,
  MoveVertical,
  Palette,
  PanelRight,
  Paperclip,
  Plus,
  Redo2,
  RefreshCcw,
  Save,
  ScanSearch,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Split,
  Target,
  Type,
  Undo2,
  Upload,
  WandSparkles,
  X,
  MousePointer2,
} from 'lucide-react';
import { fallbackPresets, initialMessages, initialResume, initialVersions } from './data';
import { applyPatch, buildLocalPatch, cloneResume, getNodeMeta, getNodeStyle, requestAIEdit } from './lib/ai';
import { loadWorkspace, saveWorkspace } from './lib/storage';
import type { ChatMessage, EditPatch, ModelConfig, ModelPreset, PersistedAppState, ResumeData, ResumeVersion } from './types';
import './App.css';

const colors = ['#D96945', '#193B35', '#65735A', '#8A6B4D', '#3D5960'];

type IconButtonProps = {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
};

function IconButton({ label, children, onClick, active = false, disabled = false }: IconButtonProps) {
  return <button className={`icon-button ${active ? 'is-active' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function getNodeVisualStyle(resume: ResumeData, nodeId: string): CSSProperties {
  const style = getNodeStyle(resume, nodeId);
  return {
    color: style.color,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    marginBottom: `${style.marginBottom}px`,
    ...(style.accent ? { borderLeftColor: resume.design.accentColor } : {}),
  };
}

function ResumePreview({ resume, selectedNodeId, onSelect }: { resume: ResumeData; selectedNodeId: string; onSelect: (nodeId: string) => void }) {
  const select = (event: MouseEvent<HTMLElement>, nodeId: string) => {
    event.stopPropagation();
    onSelect(nodeId);
  };
  const nodeClass = (nodeId: string, extra = '') => `resume-node ${selectedNodeId === nodeId ? 'is-selected' : ''} ${extra}`.trim();
  const paperStyle = {
    background: resume.design.paperColor,
    color: resume.design.inkColor,
    '--resume-accent': resume.design.accentColor,
    '--section-gap': `${resume.design.sectionGap}px`,
  } as CSSProperties;

  return (
    <div className="resume-paper-wrap">
      <div className="resume-paper" style={paperStyle} data-node-id="page" onClick={(event) => select(event, 'page')}>
        <div className="paper-corner">A4 / 01</div>
        <header className="resume-header">
          <div className={nodeClass('profile-avatar', 'avatar-wrap')} onClick={(event) => select(event, 'profile-avatar')}>
            <div className={`resume-avatar ${resume.design.avatarShape}`}>
              {resume.avatarDataUrl ? <img src={resume.avatarDataUrl} alt="个人头像" /> : <><CircleUserRound size={38} strokeWidth={1.25} /><span>LY</span></>}
            </div>
          </div>
          <div className="resume-header-copy">
            <h1 className={nodeClass('profile-name')} style={getNodeVisualStyle(resume, 'profile-name')} onClick={(event) => select(event, 'profile-name')}>{resume.name}</h1>
            <p className={nodeClass('profile-role')} style={getNodeVisualStyle(resume, 'profile-role')} onClick={(event) => select(event, 'profile-role')}>{resume.role}</p>
            <div className={nodeClass('profile-contact', 'contact-row')} onClick={(event) => select(event, 'profile-contact')}>
              <span><MapPin size={11} /> {resume.location}</span><span><AtSign size={11} /> {resume.email}</span><span><Link2 size={11} /> {resume.website}</span>
            </div>
          </div>
          <div className="header-stamp"><span>OPEN TO</span><strong>AI PRODUCT</strong><small>2024 / 2025</small></div>
        </header>
        <div className="resume-rule" />
        <section className={nodeClass('summary', 'resume-summary')} style={getNodeVisualStyle(resume, 'summary')} onClick={(event) => select(event, 'summary')}><span className="eyebrow">PROFILE / 01</span><p>{resume.summary}</p></section>
        <div className="resume-grid">
          <div className="resume-main-column">
            <section className="resume-section">
              <div className={nodeClass('projects-section-title', 'section-heading')} style={getNodeVisualStyle(resume, 'projects-section-title')} onClick={(event) => select(event, 'projects-section-title')}><span>SELECTED PROJECTS</span><span className="section-index">01</span></div>
              {resume.projects.map((project, index) => {
                const titleId = `project-${index + 1}-title`;
                const descriptionId = `project-${index + 1}-description`;
                return <article className="project-item" key={project.id}><div className="project-topline"><h2 className={nodeClass(titleId)} style={getNodeVisualStyle(resume, titleId)} onClick={(event) => select(event, titleId)}>{project.title}</h2><span className="project-meta">{project.meta}</span></div><div className={nodeClass(descriptionId, 'project-description')} style={getNodeVisualStyle(resume, descriptionId)} onClick={(event) => select(event, descriptionId)}>{project.description.map((line) => <p key={line}>{line}</p>)}</div><div className="tag-row">{project.stack.map((tag) => <span key={tag}>{tag}</span>)}</div></article>;
              })}
            </section>
            <section className="resume-section">
              <div className={nodeClass('experience-section-title', 'section-heading')} style={getNodeVisualStyle(resume, 'experience-section-title')} onClick={(event) => select(event, 'experience-section-title')}><span>EXPERIENCE</span><span className="section-index">02</span></div>
              {resume.experience.map((item) => <article className={nodeClass('experience-1', 'experience-item')} key={item.company} onClick={(event) => select(event, 'experience-1')}><div className="experience-header"><strong>{item.role}</strong><span>{item.period}</span></div><div className="experience-company">{item.company}</div><ul>{item.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></article>)}
            </section>
          </div>
          <aside className="resume-side-column">
            <section className="resume-section side-section"><div className={nodeClass('skills-section-title', 'section-heading')} style={getNodeVisualStyle(resume, 'skills-section-title')} onClick={(event) => select(event, 'skills-section-title')}><span>CAPABILITIES</span><span className="section-index">03</span></div><div className={nodeClass('skills', 'skill-list')} onClick={(event) => select(event, 'skills')}>{resume.skills.map((skill) => <div className="skill-item" key={skill.label}><span>{skill.label}</span><small>{skill.level}</small></div>)}</div></section>
            <section className="resume-section side-section"><div className={nodeClass('education-section-title', 'section-heading')} style={getNodeVisualStyle(resume, 'education-section-title')} onClick={(event) => select(event, 'education-section-title')}><span>EDUCATION</span><span className="section-index">04</span></div>{resume.education.map((item) => <div className={nodeClass('education-1', 'education-item')} key={item.school} onClick={(event) => select(event, 'education-1')}><strong>{item.school}</strong><span>{item.degree}</span><small>{item.period}</small></div>)}</section>
            <section className="resume-section side-section"><div className={nodeClass('awards-section-title', 'section-heading')} style={getNodeVisualStyle(resume, 'awards-section-title')} onClick={(event) => select(event, 'awards-section-title')}><span>RECOGNITION</span><span className="section-index">05</span></div><div className={nodeClass('awards', 'awards-list')} onClick={(event) => select(event, 'awards')}>{resume.awards.map((award) => <p key={award}>{award}</p>)}</div></section>
            <div className="resume-note"><span className="note-mark">+</span><p>Design is a way of making the invisible structure of a problem visible.</p></div>
          </aside>
        </div>
        <footer className="resume-footer"><span>LIN ZHIXING / PRODUCT DESIGN</span><span>folio atelier · 2024</span></footer>
      </div>
    </div>
  );
}

function MatchBar({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="match-bar"><div><span>{label}</span><small>{value}%</small></div><div className="bar-track"><span style={{ width: `${value}%`, background: color }} /></div></div>;
}

function ModelSettings({ config, presets, onChange, onClose, onSave }: { config: ModelConfig; presets: ModelPreset[]; onChange: (config: ModelConfig) => void; onClose: () => void; onSave: () => void }) {
  const selectedPreset = presets.find((preset) => preset.id === config.presetId);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="model-modal" role="dialog" aria-modal="true" aria-labelledby="model-settings-title">
    <div className="modal-head"><div><span className="panel-kicker">MODEL GATEWAY / 03</span><h2 id="model-settings-title">AI 模型设置</h2><p>选择后端预设，或输入一个 OpenAI-compatible 的完整调用地址。</p></div><button className="quiet-icon" onClick={onClose} aria-label="关闭模型设置"><X size={17} /></button></div>
    <div className="model-mode-tabs"><button className={config.mode === 'preset' ? 'active' : ''} onClick={() => onChange({ ...config, mode: 'preset' })}><ShieldCheck size={15} /> 后端预设</button><button className={config.mode === 'custom' ? 'active' : ''} onClick={() => onChange({ ...config, mode: 'custom' })}><Settings2 size={15} /> 自定义模型</button></div>
    {config.mode === 'preset' ? <div className="preset-list">{presets.filter((preset) => preset.id !== 'custom').map((preset) => <button className={`preset-item ${config.presetId === preset.id ? 'active' : ''}`} key={preset.id} onClick={() => onChange({ ...config, presetId: preset.id, model: preset.model, url: preset.baseUrl })}><span className="preset-radio" /> <span><strong>{preset.label}</strong><small>{preset.provider} · {preset.model || '由后端环境变量决定'}</small><em>{preset.description}</em></span><ChevronRight size={15} /></button>)}</div> : <div className="model-form"><label>完整 URL<span>例如 https://api.openai.com/v1/chat/completions</span><input value={config.url} onChange={(event) => onChange({ ...config, url: event.target.value })} placeholder="https://.../v1/chat/completions" /></label><label>模型名称<input value={config.model} onChange={(event) => onChange({ ...config, model: event.target.value })} placeholder="gpt-4o-mini / deepseek-chat / qwen..." /></label><label>API Key <span>只存在当前浏览器会话，不会写入本地简历</span><input type="password" value={config.apiKey} onChange={(event) => onChange({ ...config, apiKey: event.target.value })} placeholder="sk-..." /></label><div className="model-note"><ShieldCheck size={14} /><span>前端会把自定义配置临时发给 Railway 后端代理，浏览器不会直接暴露跨域请求。</span></div></div>}
    {config.mode === 'preset' && selectedPreset && <div className="selected-preset"><span className="status-dot" /><div><strong>{selectedPreset.label}</strong><small>{selectedPreset.baseUrl} · {selectedPreset.model || '后端配置模型'}</small></div><span className="selected-label">READY</span></div>}
    <div className="modal-foot"><button className="ghost-button" onClick={onClose}>取消</button><button className="apply-button" onClick={onSave}><Check size={14} /> 保存模型选择</button></div>
  </section></div>;
}

function App() {
  const [resume, setResume] = useState<ResumeData>(initialResume);
  const [versions, setVersions] = useState<ResumeVersion[]>(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState('version-product');
  const [selectedNodeId, setSelectedNodeId] = useState('project-1-title');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [chatInput, setChatInput] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [past, setPast] = useState<ResumeData[]>([]);
  const [future, setFuture] = useState<ResumeData[]>([]);
  const [pendingPatch, setPendingPatch] = useState<EditPatch | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'code'>('properties');
  const [showMatchPanel, setShowMatchPanel] = useState(true);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [toast, setToast] = useState('已自动保存');
  const [modelStatus, setModelStatus] = useState<'idle' | 'connected' | 'fallback'>('idle');
  const [hydrated, setHydrated] = useState(false);
  const [presets, setPresets] = useState<ModelPreset[]>(fallbackPresets);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({ mode: 'preset', presetId: 'openai', url: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' });

  const selectedMeta = useMemo(() => getNodeMeta(resume, selectedNodeId), [resume, selectedNodeId]);
  const activeVersion = versions.find((version) => version.id === activeVersionId) ?? versions[0];
  const matchScore = resume.summary.length > 120 ? 86 : 81;

  useEffect(() => {
    void loadWorkspace<PersistedAppState>().then((saved) => {
      if (saved) {
        setResume(saved.resume);
        setVersions(saved.versions);
        setActiveVersionId(saved.activeVersionId);
        setMessages(saved.messages);
        setPast(saved.past);
        setFuture(saved.future);
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    void fetch('/api/ai/presets').then((response) => response.ok ? response.json() as Promise<unknown> : Promise.reject(new Error('presets unavailable'))).then((payload) => {
      if (!Array.isArray(payload)) return;
      const remotePresets = payload.filter(isModelPreset);
      if (remotePresets.length > 0) setPresets(remotePresets);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedAppState = { resume, activeVersionId, versions, messages, past, future };
    void saveWorkspace(payload);
  }, [activeVersionId, future, hydrated, messages, past, resume, versions]);

  useEffect(() => {
    const timer = window.setTimeout(() => setToast('已自动保存'), 1400);
    return () => window.clearTimeout(timer);
  }, [resume, messages, activeVersionId]);

  function commitResume(next: ResumeData, label: string) {
    setPast((current) => [...current.slice(-39), cloneResume(resume)]);
    setFuture([]);
    setResume(next);
    setToast(label);
  }

  function updateNodeStyle(key: 'color' | 'fontSize' | 'marginBottom' | 'accent', value: string | number | boolean) {
    const next = cloneResume(resume);
    next.nodeStyles[selectedNodeId] = { ...next.nodeStyles[selectedNodeId], [key]: value };
    commitResume(next, '样式已更新');
  }

  function updateSelectedContent(value: string) {
    const next = cloneResume(resume);
    if (selectedNodeId === 'profile-name') next.name = value;
    if (selectedNodeId === 'profile-role') next.role = value;
    if (selectedNodeId === 'summary') next.summary = value;
    if (selectedNodeId === 'project-1-title') next.projects[0].title = value;
    if (selectedNodeId === 'project-2-title') next.projects[1].title = value;
    if (selectedNodeId === 'project-1-description') next.projects[0].description = value.split('\n').filter(Boolean);
    if (selectedNodeId === 'project-2-description') next.projects[1].description = value.split('\n').filter(Boolean);
    if (selectedNodeId === 'experience-1') next.experience[0].bullets = value.split('\n').filter(Boolean);
    if (selectedNodeId === 'awards') next.awards = value.split('\n').filter(Boolean);
    commitResume(next, '内容已更新');
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((current) => [cloneResume(resume), ...current]);
    setPast((current) => current.slice(0, -1));
    setResume(previous);
    setToast('已撤销上一步');
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((current) => [...current, cloneResume(resume)]);
    setFuture((current) => current.slice(1));
    setResume(next);
    setToast('已重做');
  }

  function addMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const instruction = chatInput.trim();
    if (!instruction || isGenerating) return;
    addMessage({ id: `user-${Date.now()}`, role: 'user', content: instruction, meta: selectedMeta.label });
    setChatInput('');
    setIsGenerating(true);
    try {
      const patch = await requestAIEdit(modelConfig, instruction, selectedMeta, resume);
      setPendingPatch(patch);
      setModelStatus('connected');
      addMessage({ id: `assistant-${Date.now()}`, role: 'assistant', content: patch.preview, meta: patch.requiresConfirmation ? '在线模型 · 等待确认' : '在线模型 · 可直接应用' });
    } catch (error) {
      const patch = buildLocalPatch(instruction, selectedMeta, resume);
      setPendingPatch(patch);
      setModelStatus('fallback');
      const reason = error instanceof Error ? error.message : '后端模型未连接';
      addMessage({ id: `assistant-${Date.now()}`, role: 'assistant', content: `${patch.preview}（当前使用本地演示补丁：${reason}）`, meta: '演示模式 · 未发送简历到第三方模型' });
    } finally {
      setIsGenerating(false);
    }
  }

  function applyPendingPatch() {
    if (!pendingPatch) return;
    commitResume(applyPatch(resume, pendingPatch), pendingPatch.requiresConfirmation ? 'AI 内容修改已应用' : 'AI 样式修改已应用');
    setPendingPatch(null);
  }

  function handleAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAttachmentName(file.name);
    addMessage({ id: `file-${Date.now()}`, role: 'user', content: `已附加参考文件：${file.name}`, meta: '选中对象上下文同步' });
    setToast('参考文件已加入当前编辑上下文');
  }

  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      commitResume({ ...resume, avatarDataUrl: reader.result }, '头像已更新');
    };
    reader.readAsDataURL(file);
  }

  function createVersion() {
    const id = `version-${Date.now()}`;
    const version: ResumeVersion = { id, title: '未命名岗位版本', role: '待填写岗位', updatedAt: '刚刚创建', accent: '#D96945', status: 'draft' };
    setVersions((current) => [version, ...current]);
    setActiveVersionId(id);
    setToast('已创建新的岗位版本');
  }

  function selectVersion(versionId: string) {
    setActiveVersionId(versionId);
    setToast('已切换简历版本');
  }

  function exportHtml() {
    const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const projectHtml = resume.projects.map((project) => `<article><h2>${escapeHtml(project.title)}</h2><small>${escapeHtml(project.meta)}</small><p>${project.description.map(escapeHtml).join('<br>')}</p></article>`).join('');
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(resume.name)} - ${escapeHtml(resume.role)}</title><style>@page{size:A4;margin:0}body{margin:0;background:#eee8dd;color:${resume.design.inkColor};font-family:Georgia,serif}.resume{box-sizing:border-box;width:794px;min-height:1123px;margin:32px auto;padding:62px 64px;background:${resume.design.paperColor}}h1{font-size:42px;color:#193B35;margin:0 0 8px}h2{font-size:18px;margin:28px 0 5px;color:${resume.design.inkColor}}.role{color:${resume.design.accentColor};font-weight:bold}.rule{border-top:1px solid #cfc5b5;margin:24px 0}.summary{font-size:14px;line-height:1.8;color:#4b5955}article p{line-height:1.7;font-size:13px}small{color:#788079}</style></head><body><main class="resume"><h1>${escapeHtml(resume.name)}</h1><div class="role">${escapeHtml(resume.role)}</div><div class="rule"></div><p class="summary">${escapeHtml(resume.summary)}</p><h2>SELECTED PROJECTS</h2>${projectHtml}<h2>EXPERIENCE</h2><p>${resume.experience.map((item) => `${escapeHtml(item.role)} · ${escapeHtml(item.company)}<br>${item.bullets.map(escapeHtml).join('<br>')}`).join('<br><br>')}</p></main></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${resume.name}-resume.html`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('HTML 已下载');
  }

  function syncCodeToChat() {
    setInspectorTab('code');
    setChatInput(`请基于这段当前组件代码修改：\n${selectedMeta.code}\n\n我的要求：`);
    setToast('代码上下文已同步到聊天框');
  }

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-lockup"><div className="brand-mark"><span>f</span><span>/</span><span>a</span></div><div><strong>folio</strong><span>atelier</span></div></div>
        <div className="rail-caption">AI resume studio <span>01</span></div>
        <nav className="rail-nav" aria-label="工作台导航"><button className="rail-nav-item active"><LayoutTemplate size={16} /><span>简历工作台</span><span className="nav-count">03</span></button><button className="rail-nav-item"><Target size={16} /><span>岗位匹配</span></button><button className="rail-nav-item"><History size={16} /><span>修改历史</span></button></nav>
        <div className="version-block"><div className="section-label-row"><span>我的版本</span><button className="quiet-icon" onClick={createVersion} aria-label="创建新版本"><Plus size={15} /></button></div><div className="version-list">{versions.map((version) => <button className={`version-item ${activeVersionId === version.id ? 'active' : ''}`} key={version.id} onClick={() => selectVersion(version.id)}><span className="version-dot" style={{ background: version.accent }} /><span className="version-copy"><strong>{version.title}</strong><small>{version.updatedAt}</small></span>{activeVersionId === version.id && <ChevronRight size={14} />}</button>)}</div></div>
        <div className="rail-bottom"><div className="privacy-card"><ShieldCheck size={15} /><span>本地保存已开启<br /><small>AI 修改按需发送</small></span></div><button className="profile-mini"><span className="mini-avatar">LY</span><span><strong>林知行</strong><small>个人工作区</small></span><MoreHorizontal size={15} /></button></div>
      </aside>

      <main className="app-main">
        <header className="topbar"><div className="breadcrumbs"><span>WORKSPACE</span><ChevronRight size={13} /><strong>{activeVersion?.title ?? '产品设计师 / AI 工具'}</strong></div><div className="topbar-actions"><span className="save-state"><span className="save-dot" />{toast}</span><div className="topbar-divider" /><IconButton label="撤销" onClick={undo} disabled={past.length === 0}><Undo2 size={16} /></IconButton><IconButton label="重做" onClick={redo} disabled={future.length === 0}><Redo2 size={16} /></IconButton><button className={`model-status-button ${modelStatus}`} onClick={() => setShowModelSettings(true)}><span className="model-status-dot" /><Settings2 size={15} /> AI 模型</button><button className="outline-button" onClick={exportHtml}><Download size={15} /> 导出 HTML</button><button className="primary-button compact"><Save size={15} /> 保存版本</button></div></header>
        <div className="page-intro"><div><div className="eyebrow-ui"><Sparkles size={14} /> EDITORIAL MODE / 01</div><h1>把经历，编辑成<br /><em>更像你的答案。</em></h1></div><div className="intro-note"><span>目标岗位</span><strong>AI 产品设计师</strong><small>深圳 · 全职 · 3–5 年</small></div></div>
        <section className="workbench-grid">
          <div className="editor-column">
            <div className="panel-heading"><div><span className="panel-kicker">EDIT / 01</span><h2>编辑工作台</h2></div><button className="text-button"><ScanSearch size={15} /> 解析资料</button></div>
            <div className="context-card"><div className="context-card-header"><span><CircleUserRound size={15} /> 个人资料</span><span className="context-status"><CheckCircle2 size={13} /> 已确认 92%</span></div><div className="context-card-body"><strong>{resume.name}</strong><span>{resume.role}</span><small>{resume.email} · {resume.location}</small></div><div className="context-footer"><button className="chip-button"><FileText size={13} /> 4 份材料</button><button className="chip-button"><Upload size={13} /> 继续上传</button></div></div>
            <div className="context-card role-context"><div className="context-card-header"><span><BriefcaseBusiness size={15} /> 目标岗位</span><span className="context-status warm"><Target size={13} /> 匹配度 {matchScore}%</span></div><div className="context-card-body"><strong>AI 产品设计师</strong><span>Northstar Labs · 深圳</span><small>产品策略 · AI 交互 · 复杂系统 · 设计系统</small></div><div className="context-footer"><button className="chip-button"><FileText size={13} /> JD 已解析</button><button className="chip-button"><RefreshCcw size={13} /> 重新分析</button></div></div>
            <div className="chat-card"><div className="chat-card-topline"><div className="ai-avatar"><WandSparkles size={16} /></div><div><strong>AI 编辑助手</strong><span>选中元素，再告诉我想怎么改</span></div><span className="online-dot" /></div><div className="selected-context-chip"><span className="selection-cursor"><MousePointer2 size={14} /></span><span><small>当前编辑对象</small><strong>{selectedMeta.label}</strong></span><button onClick={() => setSelectedNodeId('page')} aria-label="取消选择"><X size={13} /></button></div><div className="selected-path">{selectedMeta.breadcrumb} <ChevronRight size={12} /> <span>{selectedMeta.path}</span></div><form className="chat-form" onSubmit={(event) => void handleSubmit(event)}><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="例如：把这个标题改成深蓝色，字号小一点；或者压缩这段经历，更突出结果。" rows={3} /><div className="chat-actions"><div className="chat-tools"><label className="tool-button" title="附加参考文件"><Paperclip size={15} /><input type="file" accept="image/*,.pdf,.txt,.css,.json" onChange={handleAttachment} /></label><button type="button" className={`tool-button ${inspectorTab === 'code' ? 'active' : ''}`} onClick={syncCodeToChat}><Code2 size={15} /> 代码上下文</button>{attachmentName && <span className="attachment-pill"><FileCode2 size={12} /> {attachmentName}</span>}</div><button className="send-button" type="submit" disabled={isGenerating || chatInput.trim().length === 0}>{isGenerating ? <RefreshCcw className="spin" size={16} /> : <Send size={16} />}<span>{isGenerating ? '生成中' : '生成修改'}</span></button></div></form><div className="chat-suggestion"><Lightbulb size={14} /><span>试试“把项目经历改成两条，更像 AI 产品岗位”</span></div></div>
            <div className="conversation-card"><div className="conversation-heading"><span>最近对话</span><button className="quiet-icon" aria-label="更多对话"><MoreHorizontal size={16} /></button></div><div className="message-list">{messages.slice(-4).map((message) => <div className={`message-row ${message.role}`} key={message.id}><div className="message-icon">{message.role === 'assistant' ? <Bot size={14} /> : <CircleUserRound size={14} />}</div><div className="message-copy"><p>{message.content}</p>{message.meta && <small>{message.meta}</small>}</div></div>)}</div></div>
          </div>

          <div className="preview-column"><div className="preview-toolbar"><div><span className="panel-kicker">PREVIEW / A4</span><strong>实时预览</strong></div><div className="preview-tools"><button className="zoom-control">85% <ChevronDown size={13} /></button><IconButton label="最大化预览"><Maximize2 size={15} /></IconButton><IconButton label="更多预览选项"><MoreHorizontal size={16} /></IconButton></div></div><div className="preview-stage"><div className="stage-note stage-note-top"><span>点击任意区块开始编辑</span><span className="stage-line" /></div><ResumePreview resume={resume} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} /><div className="stage-note stage-note-bottom"><span className="stage-line" /><span>打印安全 · 内容可追溯</span></div></div><div className="preview-footer"><div className="preview-legend"><span><span className="legend-dot selected" />当前选中</span><span><span className="legend-dot suggested" />AI 建议</span></div><button className="print-button" onClick={() => window.print()}><Download size={15} /> 导出 PDF</button></div></div>

          <aside className="insight-column"><div className="insight-heading"><div><span className="panel-kicker">INSPECT / 02</span><h2>选择器</h2></div><button className="quiet-icon" aria-label="关闭选择器"><PanelRight size={15} /></button></div><div className="inspector-card"><div className="inspector-tabs"><button className={inspectorTab === 'properties' ? 'active' : ''} onClick={() => setInspectorTab('properties')}><SlidersHorizontal size={14} /> 属性</button><button className={inspectorTab === 'code' ? 'active' : ''} onClick={() => setInspectorTab('code')}><Code2 size={14} /> 代码</button></div><div className="inspector-target"><span className="target-icon"><Blocks size={15} /></span><div><strong>{selectedMeta.label}</strong><small>{selectedMeta.breadcrumb}</small></div><button className="quiet-icon" aria-label="选择器更多选项"><MoreHorizontal size={15} /></button></div>{inspectorTab === 'properties' ? <><div className="inspector-section"><div className="inspector-label"><Type size={14} /> 内容</div><textarea className="inspector-textarea" value={selectedMeta.content} onChange={(event) => updateSelectedContent(event.target.value)} rows={selectedMeta.kind === 'summary' || selectedMeta.kind === 'project-description' ? 5 : 2} placeholder="选择一个可编辑的文字区块" /></div><div className="inspector-section"><div className="inspector-label"><Palette size={14} /> 颜色</div><div className="color-row">{colors.map((color) => <button key={color} className={`color-swatch ${selectedMeta.style.color === color ? 'active' : ''}`} style={{ background: color }} aria-label={`选择颜色 ${color}`} onClick={() => updateNodeStyle('color', color)} />)}<input className="color-input" type="color" value={selectedMeta.style.color} onChange={(event) => updateNodeStyle('color', event.target.value)} /></div></div><div className="inspector-section"><div className="inspector-label"><Type size={14} /> 字体层级 <span>{selectedMeta.style.fontSize}px</span></div><input className="range-input" type="range" min="10" max="42" value={selectedMeta.style.fontSize} onChange={(event) => updateNodeStyle('fontSize', Number(event.target.value))} /></div><div className="inspector-section"><div className="inspector-label"><MoveVertical size={14} /> 下方间距 <span>{selectedMeta.style.marginBottom}px</span></div><input className="range-input" type="range" min="0" max="36" value={selectedMeta.style.marginBottom} onChange={(event) => updateNodeStyle('marginBottom', Number(event.target.value))} /></div><div className="inspector-section inspector-toggle-row"><span><Split size={14} /> 左侧强调线</span><button className={`toggle ${selectedMeta.style.accent ? 'on' : ''}`} onClick={() => updateNodeStyle('accent', !selectedMeta.style.accent)}><span /></button></div>{selectedMeta.kind === 'avatar' && <div className="inspector-section"><div className="inspector-label"><Image size={14} /> 头像形状</div><div className="segmented-control"><button className={resume.design.avatarShape === 'circle' ? 'active' : ''} onClick={() => commitResume({ ...resume, design: { ...resume.design, avatarShape: 'circle' } }, '头像已改为圆形')}>圆形</button><button className={resume.design.avatarShape === 'square' ? 'active' : ''} onClick={() => commitResume({ ...resume, design: { ...resume.design, avatarShape: 'square' } }, '头像已改为方形')}>方形</button></div><label className="upload-avatar-button"><Upload size={14} /> 上传头像<input type="file" accept="image/*" onChange={handleAvatarUpload} /></label></div>}</> : <div className="code-panel"><div className="code-panel-head"><span><FileCode2 size={14} /> scoped-style.css</span><button className="quiet-icon" aria-label="复制代码" onClick={() => void navigator.clipboard?.writeText(selectedMeta.code)}><Copy size={14} /></button></div><pre><code>{selectedMeta.code}</code></pre><div className="code-safe"><ShieldCheck size={13} /> 只允许修改当前组件的安全属性</div><button className="code-sync-button" onClick={syncCodeToChat}><Send size={13} /> 将代码同步到聊天框</button></div>}</div>

            {pendingPatch && <div className="patch-card"><div className="patch-head"><span><WandSparkles size={14} /> AI 修改预览</span><button className="quiet-icon" onClick={() => setPendingPatch(null)} aria-label="关闭修改预览"><X size={14} /></button></div><p>{pendingPatch.preview}</p><div className="patch-reason"><span>WHY</span>{pendingPatch.reason}</div><div className="patch-actions"><button className="ghost-button" onClick={() => setPendingPatch(null)}>放弃</button><button className="apply-button" onClick={applyPendingPatch}><Check size={14} /> 应用修改</button></div></div>}
            {showMatchPanel && <div className="match-card"><div className="match-head"><div><span className="panel-kicker">ROLE FIT</span><h3>岗位匹配画像</h3></div><button className="quiet-icon" onClick={() => setShowMatchPanel(false)} aria-label="关闭岗位匹配画像"><X size={14} /></button></div><div className="match-score"><div className="score-ring"><strong>{matchScore}</strong><span>/100</span></div><div><strong>很有潜力</strong><span>你的经历已经覆盖主要要求</span></div></div><div className="match-bars"><MatchBar label="产品策略" value={92} color="#D96945" /><MatchBar label="AI 场景理解" value={84} color="#193B35" /><MatchBar label="结果表达" value={68} color="#8A9B83" /></div><button className="full-width-button">查看 3 个提升建议 <ChevronRight size={14} /></button></div>}
          </aside>
        </section>
      </main>
      {showModelSettings && <ModelSettings config={modelConfig} presets={presets} onChange={setModelConfig} onClose={() => setShowModelSettings(false)} onSave={() => { setShowModelSettings(false); setToast(modelConfig.mode === 'custom' ? '已保存自定义模型配置（仅本次会话）' : '已选择后端预设模型'); }} />}
    </div>
  );
}

function isModelPreset(value: unknown): value is ModelPreset {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.label === 'string' && typeof record.provider === 'string' && typeof record.model === 'string' && typeof record.baseUrl === 'string' && typeof record.description === 'string';
}

export default App;

