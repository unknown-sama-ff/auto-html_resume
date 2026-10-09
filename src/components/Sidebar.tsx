import { History, Home, LayoutTemplate, PanelLeftClose, PanelLeftOpen, Plus, ShieldCheck, Target, Trash2 } from 'lucide-react';
import type { ResumeVersion } from '../types';
type SidebarView = 'home' | 'workspace' | 'match' | 'history';
type Props = {
  view: SidebarView; collapsed: boolean; versions: ResumeVersion[]; activeVersionId: string | null; busy: boolean;
  onToggle: () => void; onNavigate: (view: SidebarView) => void; onSelect: (id: string) => void;
  onDelete: (id: string) => void; onBackup: () => void;
};
export function Sidebar(p: Props) {
  const hasActive = p.versions.some(version => version.id === p.activeVersionId);
  const links = [
    { id: 'home', label: '工具介绍 / 新建简历', Icon: Home },
    { id: 'workspace', label: '简历工作台', Icon: LayoutTemplate },
    { id: 'match', label: '岗位匹配', Icon: Target },
    { id: 'history', label: '修改历史', Icon: History },
  ] as const;
  return <aside className="side-rail" aria-label="简历侧边栏" id="resume-sidebar">
    <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">e</div><div className="brand-copy"><strong>easy 简历</strong><span>AI RESUME STUDIO</span></div></div>
    <button className="sidebar-toggle" aria-label={p.collapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!p.collapsed} aria-controls="sidebar-versions" title={p.collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={p.onToggle}>
      {p.collapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}
    </button>
    <div className="rail-caption">RESUME STUDIO</div>
    <nav className="rail-nav" aria-label="工作台导航">{links.map(link => <button key={link.id} className={`rail-nav-item ${p.view === link.id ? 'active' : ''}`} aria-label={link.label} title={link.label} disabled={p.busy || (!hasActive && link.id !== 'home')} onClick={() => p.onNavigate(link.id)}><link.Icon size={16}/><span>{link.label}</span></button>)}</nav>
    <div className="version-block" id="sidebar-versions">
      <div className="section-label-row"><span>我的简历 · {p.versions.length}</span><button aria-label="新建岗位简历" className="quiet-icon" disabled={p.busy} onClick={() => p.onNavigate('home')}><Plus size={15}/></button></div>
      <div className="version-list">{p.versions.map(version => <div className={`version-row ${p.activeVersionId === version.id ? 'is-active' : ''}`} data-version-id={version.id} key={version.id}>
        <button data-version-id={version.id} className={`version-item ${p.activeVersionId === version.id ? 'active' : ''}`} title={version.title} disabled={p.busy} aria-pressed={p.activeVersionId === version.id} onClick={() => p.onSelect(version.id)}><span className="version-dot" style={{ background: version.accent }}/><span className="version-copy"><strong>{version.title}</strong><small>{version.isDemo ? '示例 · ' : ''}{new Date(version.updatedAt).toLocaleDateString('zh-CN')}</small></span></button>
        <button className="version-delete" aria-label={`删除版本：${version.title}`} title={`删除版本：${version.title}`} disabled={p.busy} onClick={() => p.onDelete(version.id)}><Trash2 size={14}/></button>
      </div>)}</div>
      {p.versions.length === 0 && <div className="sidebar-empty"><strong>还没有保存的简历</strong><p>在主页上传个人资料和岗位要求，即可生成第一份简历。</p></div>}
      {p.versions.length > 0 && <button className="rail-backup" onClick={p.onBackup}>下载全部版本备份</button>}
    </div>
    <div className="rail-bottom"><div className="privacy-card"><ShieldCheck size={15}/><span>版本只保存在本浏览器<br/><small>建议删除前下载备份</small></span></div></div>
  </aside>;
}
