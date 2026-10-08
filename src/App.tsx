import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Check, Code2, Download, FileText, Maximize2, Minus, MoreHorizontal, MousePointer2, Plus, Redo2, Send, Settings2, Sparkles, Undo2, WandSparkles, X, RefreshCcw } from 'lucide-react';
import { initialResume, fallbackPresets } from './data';
import { resumeSchema } from '../shared/contracts';
import { AUTHOR_PRESET_ID, AUTHOR_PRESET_LABEL } from '../shared/modelOptions';
import { applyPatch, cloneResume, getNodeMeta, requestAIEdit, updateContent } from './lib/ai';
import { emptyWorkspace, makeVersion, migrateWorkspace, workspaceReducer } from './lib/workspace';
import { loadWorkspace, saveWorkspace } from './lib/storage';
import { readMaterial } from './lib/materials';
import type { ParsedMaterial } from './lib/materials';
import { requestGeneration } from './lib/generation';

import { ResumePreview } from './components/ResumePreview';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { DeleteVersionDialog } from './components/DeleteVersionDialog';
import { Inspector } from './components/Inspector';
import { ModelSettings } from './components/ModelSettings';
import { MatchPage, HistoryPage } from './components/VersionPages';
import type { EditPatch, ModelConfig, ModelPreset, ResumeData, ResumeVersion } from './types';
import './App.css';
type View = 'home'|'workspace'|'match'|'history';
export default function App(){
  const [state,dispatch]=useReducer(workspaceReducer,emptyWorkspace);
  const stateRef=useRef(state);
  useEffect(()=>{stateRef.current=state;},[state]);
  const [hydrated,setHydrated]=useState(false);const [view,setView]=useState<View>('home');
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem('folio-sidebar')!=='expanded');
  const [scale,setScale]=useState(.85);const [fullscreen,setFullscreen]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);const [chat,setChat]=useState('');
  const [pending,setPending]=useState<{patch:EditPatch;versionId:string;before:ResumeData}|null>(null);
  const [editing,setEditing]=useState(false);const editController=useRef<AbortController|null>(null);
  const [generating,setGenerating]=useState(false);const [reading,setReading]=useState(false);
  const [error,setError]=useState('');const [lastSavedState,setLastSavedState]=useState<typeof state|null>(null);const [saveError,setSaveError]=useState('');
  const saveStatus=!hydrated?'正在载入本地版本…':saveError|| (lastSavedState===state?'已本地保存':'正在保存…');
  const [profileText,setProfileText]=useState('');const [jobText,setJobText]=useState('');
  const [profileMaterial,setProfileMaterial]=useState<ParsedMaterial|null>(null);const [jobMaterial,setJobMaterial]=useState<ParsedMaterial|null>(null);
  const [photo,setPhoto]=useState('');const [consent,setConsent]=useState(false);
  const [deleteTargetId,setDeleteTargetId]=useState<string|null>(null);
  const [showModels,setShowModels]=useState(false);const [presets,setPresets]=useState<ModelPreset[]>(fallbackPresets);
  const [config,setConfig]=useState<ModelConfig>({mode:'preset',presetId:AUTHOR_PRESET_ID,url:'',apiKey:'',model:''});
  const [draftConfig,setDraftConfig]=useState(config);
  const active=state.versions.find(v=>v.id===state.activeVersionId)??null;
  const deleteTarget=state.versions.find(version=>version.id===deleteTargetId)??null;
  const selection=useMemo(()=>active&&selectedId?getNodeMeta(active.resume,selectedId):null,[active,selectedId]);
  useEffect(()=>{void loadWorkspace<unknown>().then(raw=>{dispatch({type:'hydrate',state:migrateWorkspace(raw)});setHydrated(true);}).catch(()=>{setError('本地资料读取失败，请不要清空浏览器数据。');setHydrated(true);});},[]);
  useEffect(()=>{
    if(!hydrated)return;
    void saveWorkspace(state).then(()=>{setLastSavedState(state);setSaveError('');}).catch(()=>setSaveError('保存失败：浏览器空间不足，请先下载备份'));
  },[state,hydrated]);
  useEffect(()=>{localStorage.setItem('folio-sidebar',sidebarCollapsed?'collapsed':'expanded');},[sidebarCollapsed]);
  useEffect(()=>{const controller=new AbortController();void fetch('/api/ai/presets',{signal:controller.signal}).then(r=>r.ok?r.json():null).then((data:unknown)=>{if(!Array.isArray(data))return;const author=data.find(item=>isModelPreset(item)&&item.id===AUTHOR_PRESET_ID);if(!isModelPreset(author))return;setPresets([{...author,label:AUTHOR_PRESET_LABEL}]);}).catch(()=>undefined);return()=>controller.abort();},[]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape'){setFullscreen(false);setShowModels(false);setDeleteTargetId(null);if(window.matchMedia('(max-width:930px)').matches)setSidebarCollapsed(true);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  useEffect(()=>{if(!fullscreen&&!deleteTarget)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[fullscreen,deleteTarget]);
  useEffect(()=>()=>editController.current?.abort(),[]);
  function openModels(){setDraftConfig({...config});setShowModels(true);}
  function navigate(next:View){setFullscreen(false);setError('');if(next!=='home'&&!active){setView('home');return;}setView(next);}
  function selectVersion(id:string){if(window.matchMedia('(max-width:930px)').matches)setSidebarCollapsed(true);editController.current?.abort();setEditing(false);dispatch({type:'switch',id});setPending(null);setSelectedId(null);setChat('');setError('');setFullscreen(false);setView('workspace');}
  function commit(resume:ResumeData,label:string,source:'manual'|'ai'|'restore'='manual'){
    if(!active)return;const parsed=resumeSchema.safeParse(resume);if(!parsed.success){setError('内容或样式超出限制（姓名不能为空），请检查后保存。');return;}
    dispatch({type:'commit',id:active.id,resume:parsed.data,label,source});setPending(null);setError('');
  }
  async function readFile(kind:'profile'|'job',file:File){setReading(true);setError('');try{const parsed=await readMaterial(file);if(kind==='profile')setProfileMaterial(parsed);else setJobMaterial(parsed);}catch(e){setError(errorText(e));}finally{setReading(false);}}
  async function readPhoto(file:File,inEditor=false){setReading(true);setError('');try{const parsed=await readMaterial(file);if(!parsed.image)throw new Error('头像请选择PNG、JPEG或WebP图片。');if(inEditor&&active)commit({...active.resume,avatarDataUrl:parsed.image.dataUrl},'更换头像');else setPhoto(parsed.image.dataUrl);}catch(e){setError(errorText(e));}finally{setReading(false);}}
  function addVersion(version:ResumeVersion){if(stateRef.current.versions.length>=50){setError('本地版本达到50份，请先备份并整理。');return;}dispatch({type:'add',version});setSelectedId(null);setPending(null);setChat('');setView('workspace');setSidebarCollapsed(true);}
  async function generate(){
    if(generating||reading||!consent)return;setGenerating(true);setError('');
    try{
      const profile=[profileText,profileMaterial?.text].filter(Boolean).join('\n\n');const job=[jobText,jobMaterial?.text].filter(Boolean).join('\n\n');
      const result=await requestGeneration(config,profile,job,profileMaterial?.image?[profileMaterial.image]:[],jobMaterial?.image?[jobMaterial.image]:[]);
      if(photo)result.resume.avatarDataUrl=photo;
      addVersion(makeVersion(result,{jobText:job,profileFileName:profileMaterial?.name,jobFileName:jobMaterial?.name}));
    }catch(e){setError(errorText(e));}finally{setGenerating(false);}
  }
  function demo(){const resume=cloneResume(initialResume);addVersion(makeVersion({resume,jobTitle:'AI产品设计师（示例）',report:{summary:'这是示例资料的演示分析，不代表你的能力。',requirements:[{requirement:'产品设计经验',status:'matched',evidence:'示例简历包含产品设计经历',suggestion:'请替换为自己的经历。'}]},warnings:['示例内容不能作为你的真实简历投递。']},{isDemo:true}));}
  async function submitEdit(){
    if(!active||!selection||!chat.trim()||editing)return;
    const id=active.id;const before=cloneResume(active.resume);const prompt=chat.trim();setChat('');setError('');setPending(null);setEditing(true);
    dispatch({type:'message',id,message:{id:crypto.randomUUID(),role:'user',content:prompt,meta:selection.label}});
    const controller=new AbortController();editController.current=controller;
    try{
      const patch=await requestAIEdit(config,prompt,selection,controller.signal);
      const current=stateRef.current.versions.find(v=>v.id===id);
      if(stateRef.current.activeVersionId!==id||!current||JSON.stringify(current.resume)!==JSON.stringify(before)){setError('简历在请求期间已变动，此建议已丢弃，请重新选择后发送。');return;}
      setPending({patch,versionId:id,before});
      dispatch({type:'message',id,message:{id:crypto.randomUUID(),role:'assistant',content:patch.preview,meta:'等待应用 · 未改变当前版本'}});
    }catch(e){if(!controller.signal.aborted)setError(errorText(e));}finally{if(editController.current===controller)setEditing(false);}
  }
  function apply(){if(!pending||!active||pending.versionId!==active.id)return;if(JSON.stringify(pending.before)!==JSON.stringify(active.resume)){setError('简历已变动，请重新请求AI修改。');setPending(null);return;}try{commit(applyPatch(active.resume,pending.patch),pending.patch.preview,'ai');}catch(e){setError(errorText(e));}}
  function duplicate(){if(!active)return;const version=makeVersion({resume:active.resume,jobTitle:active.role,report:active.report??{summary:'尚未分析岗位',requirements:[]},warnings:active.warnings},{jobText:active.jobText,isDemo:active.isDemo,profileFileName:active.profileFileName,jobFileName:active.jobFileName});version.title=`${active.title} · 副本`;addVersion(version);}
  async function pdf(){if(!active)return;try{await (await import('./lib/export')).printResume(active.resume);}catch(e){setError(errorText(e));}}
  function confirmDelete(){
    const id=deleteTargetId;
    if(!id||!stateRef.current.versions.some(version=>version.id===id)){setDeleteTargetId(null);return;}
    const removingActive=stateRef.current.activeVersionId===id;
    if(removingActive){editController.current?.abort();setEditing(false);setPending(null);setSelectedId(null);setChat('');setFullscreen(false);}
    if(stateRef.current.versions.length===1)setView('home');
    dispatch({type:'delete',id});setDeleteTargetId(null);setError('');
  }
  function backupVersions(){const url=URL.createObjectURL(new Blob([JSON.stringify(state)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='folio-versions-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const isHome=view==='home'||!active;
  const sidebar=<Sidebar view={isHome?'home':view} collapsed={sidebarCollapsed} versions={state.versions} activeVersionId={state.activeVersionId} busy={!hydrated||generating||reading} onToggle={()=>setSidebarCollapsed(value=>!value)} onNavigate={next=>{navigate(next);if(window.matchMedia('(max-width:930px)').matches)setSidebarCollapsed(true);}} onSelect={selectVersion} onDelete={setDeleteTargetId} onBackup={backupVersions}/>;
  const deleteDialog=deleteTarget?<DeleteVersionDialog version={deleteTarget} onCancel={()=>setDeleteTargetId(null)} onConfirm={confirmDelete}/>:null;
  const sidebarScrim=!sidebarCollapsed?<button className="sidebar-scrim" aria-label="收起侧边栏背景" onClick={()=>setSidebarCollapsed(true)}/>:null;
  const modal=showModels?<ModelSettings config={draftConfig} presets={presets} onChange={setDraftConfig} onClose={()=>setShowModels(false)} onSave={()=>{setConfig({...draftConfig});setShowModels(false);}}/>:null;
  if(isHome)return <div className={`app-shell home-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>{sidebar}<div className="app-main home-main"><LandingPage profileText={profileText} jobText={jobText} profileMaterial={profileMaterial} jobMaterial={jobMaterial} onProfile={setProfileText} onJob={setJobText} onFile={(kind,file)=>void readFile(kind,file)} onPhoto={file=>void readPhoto(file)} photo={photo} busy={generating||!hydrated} reading={reading} consent={consent} onConsent={setConsent} error={error} onStart={()=>void generate()} onDemo={demo} onModels={openModels} onOpenSidebar={()=>setSidebarCollapsed(false)} versionCount={state.versions.length} sidebarExpanded={!sidebarCollapsed}/></div>{sidebarScrim}{modal}{deleteDialog}</div>;
  return <div className={`app-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>{sidebar}
  <main className="app-main"><header className="topbar"><div className="breadcrumbs"><select aria-label="选择简历版本" className="version-select" value={active.id} onChange={e=>selectVersion(e.target.value)}>{state.versions.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></div><div className="topbar-actions"><span className="save-state"><span className="save-dot"/>{saveStatus}</span><button className="icon-button" aria-label="撤销" disabled={!active.past.length} onClick={()=>{dispatch({type:'undo',id:active.id});setPending(null);}}><Undo2 size={16}/></button><button className="icon-button" aria-label="重做" disabled={!active.future.length} onClick={()=>{dispatch({type:'redo',id:active.id});setPending(null);}}><Redo2 size={16}/></button><button className="model-status-button" onClick={openModels}><Settings2 size={15}/>AI 模型</button><div className="export-actions"><button className="outline-button" onClick={()=>void import('./lib/export').then(exporter=>exporter.downloadResume(active.resume)).catch(e=>setError(errorText(e)))}><Download size={15}/>导出 HTML</button><button className="outline-button" onClick={()=>void pdf()}><FileText size={15}/>导出 PDF</button></div></div></header>
  {error&&<div className="workspace-alert" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}><X size={14}/></button></div>}
  {view==='match'&&<MatchPage version={active} onBack={()=>navigate('workspace')}/>}
  {view==='history'&&<HistoryPage version={active} onBack={()=>navigate('workspace')} onRestore={op=>{commit(cloneResume(op.after),`恢复：${op.label}`,'restore');navigate('workspace');}}/>}
  {view==='workspace'&&<><div className="document-heading"><div><span className="panel-kicker">{active.isDemo?'DEMO / 示例数据':'EDITOR / 岗位定制版本'}</span><input aria-label="版本名称" value={active.title} onChange={e=>dispatch({type:'rename',id:active.id,title:e.target.value})}/><p>{active.role} · {active.jobFileName||'点击简历区块即可修改'}</p></div><div className="document-actions"><button className="outline-button" onClick={duplicate}>复制当前版本</button><button className="primary-button compact" onClick={()=>navigate('home')}><Plus size={14}/>新建岗位版本</button></div></div>
  {active.isDemo&&<div className="demo-notice"><Sparkles size={15}/>当前是示例资料，内容不属于你。<button onClick={()=>navigate('home')}>用我的资料生成</button></div>}
  <section className="workbench-grid editor-workbench"><div className="editor-column"><div className="panel-heading"><div><span className="panel-kicker">ASSISTANT</span><h2>AI 编辑助手</h2></div></div><div className="chat-card"><div className="chat-card-topline"><div className="ai-avatar"><WandSparkles size={16}/></div><div><strong>选择区块，再描述修改</strong><span>建议需确认，不会覆盖其他版本</span></div></div>
  <div className="selected-context-chip"><MousePointer2 size={14}/><span><small>当前编辑对象</small><strong>{selection?.label??'尚未选择，请点击右侧简历区块'}</strong></span>{selection&&<button aria-label="取消选择" onClick={()=>{setSelectedId(null);setPending(null);}}><X size={14}/></button>}</div>
  <form className="chat-form" onSubmit={e=>{e.preventDefault();void submitEdit();}}><textarea aria-label="AI修改要求" value={chat} onChange={e=>setChat(e.target.value)} rows={5} maxLength={8000} placeholder="例如：把标题改成深蓝色；将这段项目描述精简为两条，保留已提供的事实。"/><div className="chat-actions"><button className="tool-button" type="button" disabled={!selection} onClick={()=>selection&&setChat(`当前组件样式：\n${selection.code}\n\n我的修改要求：`)}><Code2 size={15}/>代码上下文</button><button className="send-button" type="submit" disabled={!selection||!chat.trim()||editing}>{editing?<RefreshCcw className="spin" size={16}/>:<Send size={16}/>}{editing?'请求中…':'生成修改'}</button></div></form>
  </div>{pending&&<div className="patch-card"><div className="patch-head"><span><WandSparkles size={14}/>AI修改建议</span><button className="quiet-icon" aria-label="放弃建议" onClick={()=>setPending(null)}><X size={14}/></button></div><p>{pending.patch.preview}</p><div className="patch-reason">{pending.patch.reason}</div>{pending.patch.operation==='rewriteText'&&<div className="rewrite-diff"><label>修改前<pre>{selection?.content}</pre></label><label>修改后<pre>{String(pending.patch.value)}</pre></label></div>}<div className="patch-actions"><button className="ghost-button" onClick={()=>setPending(null)}>放弃</button><button className="apply-button" onClick={apply}><Check size={14}/>应用修改</button></div></div>}
  <div className="conversation-card"><div className="conversation-heading"><span>本版本最近对话</span><button aria-label="查看修改历史" className="quiet-icon" onClick={()=>navigate('history')}><MoreHorizontal size={16}/></button></div>{active.messages.length===0?<p className="empty-conversation">先选中一个区块，再告诉AI你想如何调整。</p>:active.messages.slice(-4).map(m=><div className={`message-row ${m.role}`} key={m.id}><div className="message-copy"><small>{m.role==='user'?'你':'AI'}</small><p>{m.content}</p></div></div>)}</div>
  </div>
  <div className={`preview-column ${fullscreen?'is-fullscreen':''}`} role={fullscreen?'dialog':undefined} aria-modal={fullscreen||undefined} aria-label={fullscreen?'放大简历预览':undefined}><div className="preview-toolbar"><div><span className="panel-kicker">A4 CANVAS</span><strong>实时预览</strong></div><div className="preview-tools"><button className="zoom-step" aria-label="缩小预览" onClick={()=>setScale(v=>Math.max(.3,Number((v-.05).toFixed(2))))}><Minus size={13}/></button><input className="zoom-range" type="range" min=".3" max="1.5" step=".05" value={scale} onChange={e=>setScale(Number(e.target.value))} aria-label="预览缩放"/><span className="zoom-label">{Math.round(scale*100)}%</span><button className="zoom-step" aria-label="放大预览" onClick={()=>setScale(v=>Math.min(1.5,Number((v+.05).toFixed(2))))}><Plus size={13}/></button><button className="icon-button" aria-label={fullscreen?'退出全屏预览':'全屏预览'} onClick={()=>setFullscreen(v=>!v)}>{fullscreen?<X size={16}/>:<Maximize2 size={16}/>}</button></div></div><div className="preview-stage"><ResumePreview resume={active.resume} selectedNodeId={selectedId??''} onSelect={id=>{editController.current?.abort();setEditing(false);setPending(null);setSelectedId(id);}} scale={scale}/></div><div className="preview-footer"><small>缩放只影响屏幕，导出使用真实A4尺寸。PDF通过打印窗口选择“另存为PDF”。</small></div></div>
  {selection?<Inspector key={selection.id+selection.content} resume={active.resume} selection={selection} onContent={value=>commit(updateContent(active.resume,selection.id,value),`修改${selection.label}`)} onStyle={(key,value)=>{const next=cloneResume(active.resume);if(key==='avatarShape')next.design.avatarShape=value==='circle'?'circle':'square';else next.nodeStyles[selection.id]={...next.nodeStyles[selection.id],[key]:value};commit(next,`调整${selection.label}样式`);}} onCode={()=>setChat(`当前组件样式：\n${selection.code}\n\n我的修改要求：`)} onPhoto={file=>void readPhoto(file,true)}/>:<aside className="insight-column"><div className="insight-heading"><h2>选择器</h2></div><div className="empty-inspector"><MousePointer2 size={28}/><h3>选择要修改的区块</h3><p>点击简历中的姓名、项目、经历或技能，即可修改内容、颜色、字号和间距。</p></div></aside>}
  </section></>}
  </main>{fullscreen&&<button className="fullscreen-scrim" aria-label="关闭全屏背景" onClick={()=>setFullscreen(false)}/ >}{sidebarScrim}{modal}{deleteDialog}</div>;
}
function errorText(error:unknown){return error instanceof Error?error.message:'操作失败，请检查设置后重试。';}
function isModelPreset(value:unknown):value is ModelPreset{if(typeof value!=='object'||!value)return false;const v=value as Record<string,unknown>;return ['id','label','provider','model','baseUrl','description'].every(key=>typeof v[key]==='string');}
