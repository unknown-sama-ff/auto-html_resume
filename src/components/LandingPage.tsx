import { BriefcaseBusiness, FileText, LayoutTemplate, Settings2, ShieldCheck, Sparkles, Target, Upload, WandSparkles, RefreshCcw } from 'lucide-react';
import type { ParsedMaterial } from '../lib/materials';
import { SponsorButton } from './SponsorButton';
import { AuthorLinks } from './AuthorLinks';
import { TemplatePicker } from './TemplatePicker';
import type { TemplateId } from '../../shared/design';
type Props = {
  profileText:string;jobText:string;profileMaterial:ParsedMaterial|null;jobMaterial:ParsedMaterial|null;
  onProfile:(value:string)=>void;onJob:(value:string)=>void;onFile:(kind:'profile'|'job',file:File)=>void;
  onPhoto:(file:File)=>void;photo:string;busy:boolean;reading:boolean;photoBusy:boolean;error:string;consent:boolean;onConsent:(value:boolean)=>void;
  onStart:()=>void;onDemo:()=>void;onModels:()=>void;onOpenSidebar:()=>void;versionCount:number;sidebarExpanded:boolean;
  templateId:TemplateId|'auto';onTemplate:(id:TemplateId|'auto')=>void;
};
export function LandingPage(p:Props){
  const ready=Boolean((p.profileText.trim()||p.profileMaterial?.text||p.profileMaterial?.image) && (p.jobText.trim()||p.jobMaterial?.text||p.jobMaterial?.image));
  return <div className="landing-shell"><header className="landing-topbar"><div className="brand-lockup landing-brand"><div className="brand-mark" aria-hidden="true">e</div><div><strong>easy 简历</strong><span>AI RESUME STUDIO</span></div></div><div className="landing-header-actions"><AuthorLinks/><SponsorButton/><span className="landing-topnote"><ShieldCheck size={14}/>本地保存 · 按需AI处理</span><button className="outline-button" onClick={p.onModels}><Settings2 size={15}/> AI 模型</button><button className="outline-button home-versions-button" aria-label="打开版本侧边栏" aria-expanded={p.sidebarExpanded} aria-controls="sidebar-versions" onClick={p.onOpenSidebar}><LayoutTemplate size={15}/>我的简历 <span className="home-version-count">{p.versionCount}</span></button></div></header>
  <main className="landing-main"><section className="landing-hero"><div className="eyebrow-ui"><Sparkles size={14}/> 免费简历工具 · AI简历生成</div><h1>一份经历，<br/><em>不同岗位的答案。</em></h1><p>easy 简历是一款免费的在线简历工具。上传个人资料和岗位要求，用AI一键生成简历：从真实资料中找到相关经历，改写个人简介、项目和工作描述，并调整技能重点。每个岗位拥有独立版本；生成后可核对依据、继续编辑，最后下载HTML或打印为PDF。</p><div className="landing-hero-meta"><span>01 · 提供个人资料</span><span>02 · 提供岗位要求</span><span>03 · AI生成并继续编辑</span></div></section>
  <section className="intake-grid">{(['profile','job'] as const).map(kind=>{
    const profile=kind==='profile';const material=profile?p.profileMaterial:p.jobMaterial;
    return <div className={`intake-card ${!profile?'job-intake':''}`} key={kind}><div className="intake-card-head"><span className="intake-number">{profile?'01':'02'}</span><div><strong>{profile?'你的个人资料':'你的目标岗位'}</strong><small>{profile?'学校、课程、项目、实习、获奖、技能与作品链接':'岗位职责、必备技能、经验要求与招聘截图'}</small></div></div>
    <label className="intake-upload">{profile?<Upload size={18}/>:<BriefcaseBusiness size={18}/>}<span><b>{material?.name??(profile?'上传已有简历或个人资料':'上传岗位文件或截图')}</b><small>{p.reading?'正在读取文件…':material?.image?'图片已就绪，将由支持视觉的模型读取':material?`已解析${material.format.toUpperCase()}文字，可与下方补充内容一起分析`:'TXT、PDF、Word .docx、HTML；图片原图≤10 MB，自动处理至≤2 MB / 最长边3200px'}</small></span><input aria-label={profile?'上传个人资料文件':'上传岗位要求文件'} type="file" accept=".txt,.pdf,.docx,.doc,.html,.htm,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,image/png,image/jpeg,image/webp" disabled={p.busy||p.reading} onChange={e=>{const f=e.target.files?.[0];if(f)p.onFile(kind,f);e.target.value='';}}/></label>
    <label className="input-label">{profile?'补充个人信息':'补充岗位要求'}<textarea value={profile?p.profileText:p.jobText} onChange={e=>(profile?p.onProfile:p.onJob)(e.target.value)} placeholder={profile?'例如：姓名、学校和课程、项目和结果、实习和获奖。请填写真实信息。':'例如：数据分析师，负责经营分析，要求熟悉Python和SQL。'} rows={7} maxLength={45000} disabled={p.busy}/></label>
    {material?.text&&<details className="extracted-material"><summary>查看提取的文字</summary><pre>{material.text}</pre></details>}
    </div>;
  })}</section>
  <section className="intake-design"><h2>选择简历的视觉方向</h2><p>让 AI 按岗位自主设计，或先选一种版式。生成后仍可切换和修改。</p><TemplatePicker value={p.templateId} onChange={p.onTemplate} allowAuto disabled={p.busy}/></section>
  <div className="photo-intake" aria-busy={p.photoBusy}><label className="upload-avatar-button"><Upload size={14}/>{p.photoBusy?'正在处理照片…':p.photo?'已上传头像 · 点击更换':'上传证件照 / 职业头像（可选）'}<input aria-label="上传证件照或职业头像" type="file" accept="image/png,image/jpeg,image/webp" disabled={p.busy||p.reading} onChange={e=>{const f=e.target.files?.[0];if(f)p.onPhoto(f);e.target.value='';}}/></label>{p.photo&&<img src={p.photo} alt="待使用头像"/>}<small>PNG/JPEG/WebP 原图不超过 10 MB，自动缩小至最长边 1600px、压缩至 1.5 MB 内。头像只加入本地简历，不作为AI经历材料。不要上传身份证或护照。</small></div>
  <label className="consent-line"><input type="checkbox" checked={p.consent} onChange={e=>p.onConsent(e.target.checked)}/><span>我同意将以上材料发给所选AI通道，先分析岗位，再改写正文。每次生成调用模型两次，会增加等待和模型用量。作者预设由后端临时处理；自定义URL由浏览器直连，不经过后端。简历版本只保存在本浏览器。</span></label>
  {p.error&&<div role="alert" className="workspace-alert intake-alert">{p.error} <button onClick={p.onModels}>检查模型设置</button></div>}
  <section className="landing-actions"><div className="landing-action-copy"><span className={`intake-status ${ready?'ready':''}`}>{p.photoBusy?'正在处理照片…':p.reading?'正在读取材料或处理图片…':ready?'资料已就绪':'请提供个人资料和目标岗位资料'}</span><small>{p.busy?'正在分析岗位要求并改写经历，复杂请求可能需要数分钟，请勿重复提交。':'模型失败不会加载示例或覆盖旧版本。所有新生成结果均可修改。'}</small></div><div className="landing-action-buttons"><button className="landing-secondary" onClick={p.onDemo} disabled={p.busy||p.reading}>体验示例（不调用AI）</button><button className="primary-button landing-start" onClick={()=>p.onStart()} disabled={!ready||!p.consent||p.busy||p.reading}>{p.busy?<RefreshCcw size={15} className="spin"/>:<WandSparkles size={15}/>} {p.busy?'正在生成，请稍候…':'生成我的岗位简历'}</button></div></section>
  <section className="landing-footer"><span><FileText size={14}/>同一渲染器预览 / 导出</span><span><Target size={14}/>岗位匹配依据可见</span><span><LayoutTemplate size={14}/>独立版本与修改历史</span></section>
  <section className="landing-guide" aria-label="简历工具使用说明"><h2>免费简历工具，AI一键生成简历</h2><p>一键简历生成只是起点，你还可以直接修改文字、调整栏目，为每个目标岗位保存独立版本。</p><div className="landing-guide-grid">
    <article><h3>如何一键生成简历？</h3><p>上传或粘贴个人资料和岗位要求，选择模板与AI模型，确认处理授权后生成简历。生成后可以直接编辑文字、拖动栏目，再导出HTML或打印为PDF。</p></article>
    <article><h3>免费简历工具包含哪些功能？</h3><p>模板、可视化编辑、岗位版本管理和HTML/PDF导出免费使用，无需注册。自定义AI模型可能按服务商规则计费，生成和修改前请核对所选通道。</p></article>
    <article><h3>AI简历如何对应不同岗位？</h3><p>AI根据你提供的真实资料分析岗位要求，调整简介、项目和经历描述。你可以查看材料依据，并针对不匹配的地方继续修改；投递前请核对所有事实。</p></article>
  </div></section></main></div>;
}
