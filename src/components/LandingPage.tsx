import { BriefcaseBusiness, FileText, LayoutTemplate, Settings2, ShieldCheck, Sparkles, Target, Upload, WandSparkles, RefreshCcw } from 'lucide-react';
import type { ParsedMaterial } from '../lib/materials';
import { SponsorButton } from './SponsorButton';
type Props = {
  profileText:string;jobText:string;profileMaterial:ParsedMaterial|null;jobMaterial:ParsedMaterial|null;
  onProfile:(value:string)=>void;onJob:(value:string)=>void;onFile:(kind:'profile'|'job',file:File)=>void;
  onPhoto:(file:File)=>void;photo:string;busy:boolean;reading:boolean;error:string;consent:boolean;onConsent:(value:boolean)=>void;
  onStart:()=>void;onDemo:()=>void;onModels:()=>void;onOpenSidebar:()=>void;versionCount:number;sidebarExpanded:boolean;
};
export function LandingPage(p:Props){
  const ready=Boolean((p.profileText.trim()||p.profileMaterial?.text||p.profileMaterial?.image) && (p.jobText.trim()||p.jobMaterial?.text||p.jobMaterial?.image));
  return <div className="landing-shell"><header className="landing-topbar"><div className="brand-lockup landing-brand"><div className="brand-mark">f/a</div><div><strong>folio</strong><span>atelier</span></div></div><div className="landing-header-actions"><SponsorButton/><span className="landing-topnote"><ShieldCheck size={14}/>本地保存 · 按需AI处理</span><button className="outline-button" onClick={p.onModels}><Settings2 size={15}/> AI 模型</button><button className="outline-button home-versions-button" aria-label="打开版本侧边栏" aria-expanded={p.sidebarExpanded} aria-controls="sidebar-versions" onClick={p.onOpenSidebar}><LayoutTemplate size={15}/>我的简历 <span className="home-version-count">{p.versionCount}</span></button></div></header>
  <main className="landing-main"><section className="landing-hero"><div className="eyebrow-ui"><Sparkles size={14}/> AI RESUME STUDIO</div><h1>一份经历，<br/><em>不同岗位的答案。</em></h1><p>folio atelier 帮你整理个人资料、对照岗位要求，生成可编辑的简历。每个岗位拥有独立版本；生成后可选中区块，让 AI 改写或调整样式，最后下载 HTML 或打印为 PDF。</p><div className="landing-hero-meta"><span>01 · 提供个人资料</span><span>02 · 提供岗位要求</span><span>03 · AI生成并继续编辑</span></div></section>
  <section className="intake-grid">{(['profile','job'] as const).map(kind=>{
    const profile=kind==='profile';const material=profile?p.profileMaterial:p.jobMaterial;
    return <div className={`intake-card ${!profile?'job-intake':''}`} key={kind}><div className="intake-card-head"><span className="intake-number">{profile?'01':'02'}</span><div><strong>{profile?'你的个人资料':'你的目标岗位'}</strong><small>{profile?'学校、课程、项目、实习、获奖、技能与作品链接':'岗位职责、必备技能、经验要求与招聘截图'}</small></div></div>
    <label className="intake-upload">{profile?<Upload size={18}/>:<BriefcaseBusiness size={18}/>}<span><b>{material?.name??(profile?'上传已有简历或个人资料':'上传岗位文件或截图')}</b><small>{p.reading?'正在读取文件…':material?.image?'图片将由支持视觉的模型读取':material?`已解析${material.format.toUpperCase()}文字，可与下方补充内容一起分析`:'TXT、PDF、Word .docx、HTML、PNG/JPEG/WebP'}</small></span><input aria-label={profile?'上传个人资料文件':'上传岗位要求文件'} type="file" accept=".txt,.pdf,.docx,.doc,.html,.htm,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,image/png,image/jpeg,image/webp" disabled={p.busy||p.reading} onChange={e=>{const f=e.target.files?.[0];if(f)p.onFile(kind,f);e.target.value='';}}/></label>
    <label className="input-label">{profile?'补充个人信息':'补充岗位要求'}<textarea value={profile?p.profileText:p.jobText} onChange={e=>(profile?p.onProfile:p.onJob)(e.target.value)} placeholder={profile?'例如：姓名、学校和课程、项目和结果、实习和获奖。请填写真实信息。':'例如：数据分析师，负责经营分析，要求熟悉Python和SQL。'} rows={7} maxLength={45000} disabled={p.busy}/></label>
    {material?.text&&<details className="extracted-material"><summary>查看提取的文字</summary><pre>{material.text}</pre></details>}
    </div>;
  })}</section>
  <div className="photo-intake"><label className="upload-avatar-button"><Upload size={14}/>{p.photo?'已上传头像 · 点击更换':'上传证件照 / 职业头像（可选）'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={p.busy||p.reading} onChange={e=>{const f=e.target.files?.[0];if(f)p.onPhoto(f);e.target.value='';}}/></label>{p.photo&&<img src={p.photo} alt="待使用头像"/>}<small>头像只加入本地简历，不作为AI经历材料。不要上传身份证或护照。</small></div>
  <label className="consent-line"><input type="checkbox" checked={p.consent} onChange={e=>p.onConsent(e.target.checked)}/><span>我同意将以上材料发给所选AI通道。作者预设由后端临时处理；自定义URL由浏览器直连，不经过后端。简历版本只保存在本浏览器。</span></label>
  {p.error&&<div role="alert" className="workspace-alert intake-alert">{p.error} <button onClick={p.onModels}>检查模型设置</button></div>}
  <section className="landing-actions"><div className="landing-action-copy"><span className={`intake-status ${ready?'ready':''}`}>{p.reading?'正在解析上传材料…':ready?'资料已就绪':'请提供个人资料和目标岗位资料'}</span><small>模型失败不会加载示例或覆盖旧版本。所有新生成结果均可修改。</small></div><div className="landing-action-buttons"><button className="landing-secondary" onClick={p.onDemo} disabled={p.busy}>体验示例（不调用AI）</button><button className="primary-button landing-start" onClick={()=>p.onStart()} disabled={!ready||!p.consent||p.busy||p.reading}>{p.busy?<RefreshCcw size={15} className="spin"/>:<WandSparkles size={15}/>} {p.busy?'正在生成，请稍候…':'生成我的岗位简历'}</button></div></section>
  <section className="landing-footer"><span><FileText size={14}/>同一渲染器预览 / 导出</span><span><Target size={14}/>岗位匹配依据可见</span><span><LayoutTemplate size={14}/>独立版本与修改历史</span></section></main></div>;
}
