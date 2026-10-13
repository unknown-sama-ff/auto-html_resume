import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Check, Code2, Download, FileText, History, Maximize2, Minus, MoreHorizontal, MousePointer2, Plus, Redo2, Send, Settings2, Sparkles, Target, Undo2, WandSparkles, X, RefreshCcw } from 'lucide-react';
import { initialResume, fallbackPresets } from './data';
import { resumeSchema } from '../shared/contracts';
import { AUTHOR_PRESET_ID, AUTHOR_PRESET_LABEL } from '../shared/modelOptions';
import { applyPatch, cloneResume, getNodeMeta, requestAIEdit, updateContent } from './lib/ai';
import { emptyWorkspace, makeVersion, migrateWorkspace, workspaceReducer } from './lib/workspace';
import { loadWorkspace, saveWorkspace } from './lib/storage';
import { createBackupBlob, mergeBackupImport } from './lib/backup';
import { getNewRoleProfile } from './lib/newRole';
import { readMaterial } from './lib/materials';
import { readAvatarPhoto } from './lib/photos';
import type { ParsedMaterial } from './lib/materials';
import { requestGeneration } from './lib/generation';

import { ResumePreview } from './components/ResumePreview';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { DeleteVersionDialog } from './components/DeleteVersionDialog';
import { BackupDialog } from './components/BackupDialog';
import { Inspector } from './components/Inspector';
import { ModelSettings } from './components/ModelSettings';
import { TemplatePicker, DesignPanel } from './components/TemplatePicker';
import { SourceReview } from './components/SourceReview';
import { AddSectionPanel } from './components/AddSectionPanel';
import { MatchEditingPanel } from './components/MatchEditingPanel';
import { VoiceTextarea } from './components/VoiceTextarea';
import { hideSection, moveSection, sectionTitle } from './lib/sections';
import { defaultRequirementNodeId, requirementPrompt, type MatchRequirement } from './lib/matchEditing';
import { applyTemplate } from './lib/design';
import { templateById, type TemplateId } from '../shared/design';
import { MatchPage, HistoryPage } from './components/VersionPages';
import { downloadResume, printResume } from './lib/export';
import type { EditPatch, ModelConfig, ModelPreset, ResumeData, ResumeVersion, WorkspaceState } from './types';
import './App.css';
import './styles/resume.css';
type View = 'home'|'workspace'|'match'|'history';
export default function App(){
  const [state,dispatch]=useReducer(workspaceReducer,emptyWorkspace);
  const stateRef=useRef(state);
  useEffect(()=>{stateRef.current=state;},[state]);
  const [hydrated,setHydrated]=useState(false);const [loadError,setLoadError]=useState('');const [loadAttempt,setLoadAttempt]=useState(0);const [view,setView]=useState<View>('home');
  const saveRevision=useRef(0);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>{try{return localStorage.getItem('folio-sidebar')!=='expanded';}catch{return true;}});
  const [scale,setScale]=useState(.85);const [fullscreen,setFullscreen]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);const [chat,setChat]=useState('');
  const [pending,setPending]=useState<{patch:EditPatch;versionId:string;before:ResumeData}|null>(null);
  const [editing,setEditing]=useState(false);const editController=useRef<AbortController|null>(null);
  const [generating,setGenerating]=useState(false);const [reading,setReading]=useState(false);
  const materialProcessing=useRef(false);
  const [photoBusy,setPhotoBusy]=useState(false);const photoProcessing=useRef(false);
  const [error,setError]=useState('');const [lastSavedState,setLastSavedState]=useState<typeof state|null>(null);const [saveError,setSaveError]=useState('');
  const saveStatus=!hydrated?'正在载入本地版本…':saveError|| (lastSavedState===state?'已本地保存':'正在保存…');
  const [profileText,setProfileText]=useState('');const [jobText,setJobText]=useState('');
  const [templateId,setTemplateId]=useState<TemplateId|'auto'>('auto');
  const [sourceVersion,setSourceVersion]=useState<ResumeVersion|null>(null);
  const [sourceProfile,setSourceProfile]=useState<{kind:'original'|'resume';fileName:string}|null>(null);
  const [previewSuggestion,setPreviewSuggestion]=useState(false);
  const [profileMaterial,setProfileMaterial]=useState<ParsedMaterial|null>(null);const [jobMaterial,setJobMaterial]=useState<ParsedMaterial|null>(null);
  const [photo,setPhoto]=useState('');const [consent,setConsent]=useState(false);
  const [deleteTargetId,setDeleteTargetId]=useState<string|null>(null);
  const [showBackup,setShowBackup]=useState(false);const [notice,setNotice]=useState('');
  const [showModels,setShowModels]=useState(false);const [presets,setPresets]=useState<ModelPreset[]>(fallbackPresets);
  const [mobileWorkspaceSection,setMobileWorkspaceSection]=useState<'edit'|'match'|'history'>('edit');
  const focusEditor = useRef(false);
  const [config,setConfig]=useState<ModelConfig>({mode:'preset',presetId:AUTHOR_PRESET_ID,url:'',apiKey:'',model:''});
  const [draftConfig,setDraftConfig]=useState(config);
  const active=state.versions.find(v=>v.id===state.activeVersionId)??null;
  const deleteTarget=state.versions.find(version=>version.id===deleteTargetId)??null;
  const selection=useMemo(()=>{if(!active||!selectedId)return null;try{return getNodeMeta(active.resume,selectedId);}catch{return null;}},[active,selectedId]);
  const previewResume=useMemo(()=>active&&pending&&previewSuggestion&&pending.versionId===active.id?applyPatch(active.resume,pending.patch):active?.resume,[active,pending,previewSuggestion]);
  useEffect(()=>{
    let cancelled=false;
    void loadWorkspace<unknown>().then(raw=>{
      if(cancelled)return;
      const workspace=migrateWorkspace(raw);stateRef.current=workspace;
      dispatch({type:'hydrate',state:workspace});setHydrated(true);
    }).catch(()=>{if(!cancelled)setLoadError('请重试。读取成功前暂停编辑与保存，以免覆盖已有内容。');});
    return()=>{cancelled=true;};
  },[loadAttempt]);
  useEffect(()=>{
    if(!hydrated)return;
    const revision=++saveRevision.current;
    void saveWorkspace(state).then(()=>{if(revision===saveRevision.current){setLastSavedState(state);setSaveError('');}}).catch(()=>{if(revision===saveRevision.current)setSaveError('保存失败：浏览器空间不足，请先下载备份');});
  },[state,hydrated]);
  useEffect(()=>{try{localStorage.setItem('folio-sidebar',sidebarCollapsed?'collapsed':'expanded');}catch{/* Sidebar preferences can be used without browser storage. */}},[sidebarCollapsed]);
  useEffect(()=>{const controller=new AbortController();void fetch('/api/ai/presets',{signal:controller.signal}).then(r=>r.ok?r.json():null).then((data:unknown)=>{if(!Array.isArray(data))return;const author=data.find(item=>isModelPreset(item)&&item.id===AUTHOR_PRESET_ID);if(!isModelPreset(author))return;setPresets([{...author,label:AUTHOR_PRESET_LABEL}]);}).catch(()=>undefined);return()=>controller.abort();},[]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape'){setFullscreen(false);setShowModels(false);setDeleteTargetId(null);if(window.matchMedia('(max-width:930px)').matches)setSidebarCollapsed(true);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  useEffect(()=>{const mobileDrawerOpen=!sidebarCollapsed&&window.matchMedia('(max-width:930px)').matches;if(!fullscreen&&!deleteTarget&&!showBackup&&!mobileDrawerOpen)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[fullscreen,deleteTarget,showBackup,sidebarCollapsed]);
  useEffect(()=>()=>editController.current?.abort(),[]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (view !== 'workspace' || showModels || deleteTargetId || showBackup || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select'))) return;
      const current = stateRef.current.versions.find(version => version.id === stateRef.current.activeVersionId);
      const type = event.shiftKey ? 'redo' : 'undo';
      if (!current || !(type === 'undo' ? current.past.length : current.future.length)) return;
      event.preventDefault(); editController.current?.abort(); setEditing(false); setPending(null);
      dispatch({ type, id: current.id });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, showModels, deleteTargetId, showBackup]);
  useEffect(() => {
    if (!focusEditor.current || view !== 'workspace') return;
    focusEditor.current = false;
    const target = selectedId && document.querySelector('.preview-stage [data-node-id="' + CSS.escape(selectedId) + '"]');
    if (target instanceof HTMLElement) target.scrollIntoView({ block: 'center', inline: 'nearest' });
    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="AI修改要求"]')?.focus({ preventScroll: true });
  }, [view, selectedId, chat]);
  useEffect(()=>{if(view!=='workspace')return;document.querySelector('.editor-column .chat-card')?.setAttribute('id','workspace-edit-card');document.querySelector('.editor-column .match-editing-panel')?.setAttribute('id','workspace-match-card');document.querySelector('.editor-column .conversation-card')?.setAttribute('id','workspace-recent-conversation');},[view,active?.id]);
  useEffect(()=>{
    if(view!=='workspace'||!window.matchMedia('(max-width:610px)').matches)return;
    const targets=[
      ['edit','workspace-edit-card'],
      ['match','workspace-match-card'],
      ['history','workspace-recent-conversation'],
    ] as const;
    const visible=new Map<string,number>();
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)visible.set(entry.target.id,entry.isIntersecting?entry.intersectionRatio:0);
      const current=targets.map(([section,id])=>({section,ratio:visible.get(id)??0})).sort((a,b)=>b.ratio-a.ratio)[0];
      if(current&&current.ratio>0)setMobileWorkspaceSection(current.section);
    },{rootMargin:'-12% 0px -35% 0px',threshold:[0,.1,.25,.5,.75,1]});
    for(const [,id] of targets){const target=document.getElementById(id);if(target)observer.observe(target);}
    return()=>observer.disconnect();
  },[view,active?.id]);
  function historyAction(type: 'undo' | 'redo') {
    if (!active) return;
    editController.current?.abort(); setEditing(false); setPending(null); dispatch({ type, id: active.id });
  }
  function editRequirement(item: MatchRequirement, targetNodeId?: string) {
    if (!active) return;
    editController.current?.abort(); setEditing(false); setPending(null); setPreviewSuggestion(false);
    setSelectedId(targetNodeId ?? defaultRequirementNodeId(active.resume, item));
    setChat(requirementPrompt(item)); focusEditor.current = true; navigate('workspace');
  }
  function openModels(){setDraftConfig({...config});setShowModels(true);}
  function navigate(next:View){setFullscreen(false);setError('');if(next!=='home'&&!active){setView('home');return;}setView(next);}
  function scrollWorkspaceSection(section:'edit'|'match'|'history'){setMobileWorkspaceSection(section);const targetId=section==='edit'?'workspace-edit-card':section==='match'?'workspace-match-card':'workspace-recent-conversation';document.getElementById(targetId)?.scrollIntoView({behavior:'smooth',block:'start'});}
  function startNewRoleVersion(source: ResumeVersion|null = stateRef.current.versions.find(version=>version.id===stateRef.current.activeVersionId) ?? null){
    if(!hydrated||generating||reading||photoBusy)return;
    const reusable = source && !source.isDemo ? source : null;
    let profile;
    try { profile=reusable?getNewRoleProfile(reusable):null; }
    catch(cause){setError(errorText(cause));return;}
    editController.current?.abort();
    setEditing(false);
    setPreviewSuggestion(false);
    setSourceVersion(reusable);
    setSourceProfile(profile?{kind:profile.kind,fileName:profile.fileName}:null);
    setProfileText(profile?.text ?? '');
    setProfileMaterial(null);
    setJobText('');
    setJobMaterial(null);
    setPhoto(reusable?.resume.avatarDataUrl ?? '');
    setTemplateId(reusable?.resume.design.templateId ?? 'auto');
    setConsent(false);
    setError('');
    setNotice('');
    setFullscreen(false);
    setPending(null);
    setSelectedId(null);
    setChat('');
    setView('home');
    if(window.matchMedia('(max-width:930px)').matches)setSidebarCollapsed(true);
  }
  function selectVersion(id:string){if(window.matchMedia('(max-width:930px)').matches)setSidebarCollapsed(true);editController.current?.abort();setEditing(false);dispatch({type:'switch',id});setPending(null);setSelectedId(null);setChat('');setError('');setFullscreen(false);setSourceVersion(null);setSourceProfile(null);setView('workspace');}
  function commit(resume:ResumeData,label:string,source:'manual'|'ai'|'restore'='manual'){
    if(!active)return;const parsed=resumeSchema.safeParse(resume);if(!parsed.success){setError('内容或样式超出限制（姓名不能为空），请检查后保存。');return;}
    dispatch({type:'commit',id:active.id,resume:parsed.data,label,source});setPending(null);setError('');
  }
  async function readFile(kind:'profile'|'job',file:File){
    if(materialProcessing.current||photoProcessing.current)return;
    materialProcessing.current=true;setReading(true);setError('');
    try{const parsed=await readMaterial(file);if(kind==='profile')setProfileMaterial(parsed);else setJobMaterial(parsed);}
    catch(e){setError(errorText(e));}finally{materialProcessing.current=false;setReading(false);}
  }
  async function readPhoto(file:File,inEditor=false){
    if(photoProcessing.current||materialProcessing.current)return;
    photoProcessing.current=true;setPhotoBusy(true);setError('');
    const versionId=active?.id;const before=active?.resume;
    try{
      const dataUrl=await readAvatarPhoto(file);
      if(inEditor){
        const current=stateRef.current.versions.find(version=>version.id===versionId);
        if(stateRef.current.activeVersionId!==versionId||!current||current.resume!==before)throw new Error('照片处理期间简历已切换或变动，请在当前版本重新上传。');
        dispatch({type:'commit',id:current.id,resume:{...current.resume,avatarDataUrl:dataUrl},label:'更换头像',source:'manual'});setPending(null);
      }else setPhoto(dataUrl);
    }catch(e){setError(errorText(e));}finally{photoProcessing.current=false;setPhotoBusy(false);}
  }
  function addVersion(version:ResumeVersion){if(stateRef.current.versions.length>=50){setError('本地版本达到50份，请先备份并整理。');return;}dispatch({type:'add',version});setSelectedId(null);setPending(null);setChat('');setView('workspace');setSidebarCollapsed(true);}
  async function generate(){
    if(!hydrated||generating||reading||materialProcessing.current||photoProcessing.current||!consent)return;setGenerating(true);setError('');
    try{
      const profile=[profileText,profileMaterial?.text].filter(Boolean).join('\n\n');const job=[jobText,jobMaterial?.text].filter(Boolean).join('\n\n');
      const result=await requestGeneration(config,profile,job,profileMaterial?.image?[profileMaterial.image]:[],jobMaterial?.image?[jobMaterial.image]:[],undefined,templateId);
      if(photo)result.resume.avatarDataUrl=photo;
      addVersion(makeVersion(result,{jobText:job,profileText:profile,profileFileName:profileMaterial?.name??sourceProfile?.fileName,jobFileName:jobMaterial?.name}));
      setSourceVersion(null);setSourceProfile(null);
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
      if(controller.signal.aborted||editController.current!==controller)return;
      const current=stateRef.current.versions.find(v=>v.id===id);
      if(stateRef.current.activeVersionId!==id||!current||JSON.stringify(current.resume)!==JSON.stringify(before)){setError('简历在请求期间已变动，此建议已丢弃，请重新选择后发送。');return;}
      if(!resumeSchema.safeParse(applyPatch(before,patch)).success)throw new Error('AI建议超出了内容或样式范围，当前简历已保留。');
      setPreviewSuggestion(false);setPending({patch,versionId:id,before});
      dispatch({type:'message',id,message:{id:crypto.randomUUID(),role:'assistant',content:patch.preview,meta:'等待应用 · 未改变当前版本'}});
    }catch(e){if(!controller.signal.aborted)setError(errorText(e));}finally{if(editController.current===controller)setEditing(false);}
  }
  function apply(){if(!pending||!active||pending.versionId!==active.id)return;if(JSON.stringify(pending.before)!==JSON.stringify(active.resume)){setError('简历已变动，请重新请求AI修改。');setPending(null);return;}try{commit(applyPatch(active.resume,pending.patch),pending.patch.preview,'ai');}catch(e){setError(errorText(e));}}
  function duplicate(){if(!active)return;const version=makeVersion({resume:active.resume,jobTitle:active.role,report:active.report??{summary:'尚未分析岗位',requirements:[]},warnings:active.warnings},{jobText:active.jobText,profileText:active.profileText,isDemo:active.isDemo,profileFileName:active.profileFileName,jobFileName:active.jobFileName});version.title=`${active.title} · 副本`;addVersion(version);}
  async function pdf(){if(!active)return;try{await printResume(active.resume);}catch(e){setError(errorText(e));}}
  function confirmDelete(){
    const id=deleteTargetId;
    if(!id||!stateRef.current.versions.some(version=>version.id===id)){setDeleteTargetId(null);return;}
    const removingActive=stateRef.current.activeVersionId===id;
    if(removingActive){editController.current?.abort();setEditing(false);setPending(null);setSelectedId(null);setChat('');setFullscreen(false);}
    if(stateRef.current.versions.length===1)setView('home');
    dispatch({type:'delete',id});setDeleteTargetId(null);setError('');
  }
  function backupVersions(includeHistory=true){const url=URL.createObjectURL(createBackupBlob(stateRef.current,includeHistory));const a=document.createElement('a');a.href=url;a.download=includeHistory?'easy-resume-versions-backup.json':'easy-resume-contents-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function restoreBackup(imported:WorkspaceState){
    if(!hydrated)throw new Error('请先重新读取本地简历，再恢复备份。');
    editController.current?.abort();editController.current=null;setEditing(false);setPending(null);
    const {workspace,importedCount}=mergeBackupImport(stateRef.current,imported);
    ++saveRevision.current;
    try { await saveWorkspace(workspace); }
    catch { setSaveError('备份恢复保存失败，请检查浏览器空间后重试');throw new Error('本地保存失败，备份尚未恢复。请检查浏览器可用空间后重试，当前简历已保留。'); }
    setSelectedId(null);setChat('');setFullscreen(false);
    stateRef.current=workspace;dispatch({type:'hydrate',state:workspace});setLastSavedState(workspace);setSaveError('');
    setSourceVersion(null);setSourceProfile(null);setView('workspace');setSidebarCollapsed(true);setShowBackup(false);setError('');
    setNotice(`已恢复 ${importedCount} 份简历，可在“我的简历”中选择并继续编辑。`);
  }
  const isHome=view==='home'||!active;
  const sidebar=<Sidebar view={isHome?'home':view} collapsed={sidebarCollapsed} versions={state.versions} activeVersionId={state.activeVersionId} busy={!hydrated||generating||reading||photoBusy} onToggle={()=>setSidebarCollapsed(value=>!value)} onNavigate={next=>{navigate(next);if(window.matchMedia('(max-width:930px)').matches)setSidebarCollapsed(true);}} onStartNewVersion={()=>startNewRoleVersion()} onSelect={selectVersion} onDelete={setDeleteTargetId} onBackup={()=>setShowBackup(true)}/>;
  const backupDialog=showBackup?<BackupDialog versionCount={state.versions.length} onClose={()=>setShowBackup(false)} onDownload={backupVersions} onRestore={restoreBackup}/>:null;
  const savedNotice=notice?<div className="workspace-notice" role="status"><Check size={16}/><span>{notice}</span><button className="quiet-icon" aria-label="关闭恢复提示" onClick={()=>setNotice('')}><X size={14}/></button></div>:null;
  const deleteDialog=deleteTarget?<DeleteVersionDialog version={deleteTarget} onCancel={()=>setDeleteTargetId(null)} onConfirm={confirmDelete}/>:null;
  const sidebarScrim=!sidebarCollapsed?<button className="sidebar-scrim" aria-label="收起侧边栏背景" onClick={()=>setSidebarCollapsed(true)}/>:null;
  const modal=showModels?<ModelSettings config={draftConfig} presets={presets} onChange={setDraftConfig} onClose={()=>setShowModels(false)} onSave={()=>{setConfig({...draftConfig});setShowModels(false);}}/>:null;
  if(!hydrated)return <main className="workspace-load-screen"><div className="workspace-load-card"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true">e</div><strong>easy 简历</strong></div>{loadError?<div role="alert"><h1>暂时无法读取本地简历</h1><p>{loadError}</p><button className="primary-button" onClick={()=>{setLoadError('');setLoadAttempt(value=>value+1);}}><RefreshCcw size={15}/>重新读取本地简历</button></div>:<div role="status"><h1><RefreshCcw className="spin" size={20}/>正在读取本地简历…</h1><p>读取完成后即可继续编辑。</p></div>}</div></main>;
  if(isHome)return <div className={`app-shell home-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>{sidebar}<div className="app-main home-main">{savedNotice}<LandingPage profileText={profileText} jobText={jobText} profileMaterial={profileMaterial} jobMaterial={jobMaterial} onProfile={setProfileText} onJob={setJobText} onFile={(kind,file)=>void readFile(kind,file)} onPhoto={file=>void readPhoto(file)} photo={photo} busy={generating||!hydrated} reading={reading||photoBusy} photoBusy={photoBusy} consent={consent} onConsent={setConsent} error={error} onStart={()=>void generate()} onDemo={demo} onModels={openModels} onOpenSidebar={()=>setSidebarCollapsed(false)} versionCount={state.versions.length} sidebarExpanded={!sidebarCollapsed} templateId={templateId} onTemplate={setTemplateId} sourceVersionTitle={sourceVersion?.title} sourceProfileKind={sourceProfile?.kind} sourceFileName={sourceProfile?.fileName} onBackToSource={()=>sourceVersion&&selectVersion(sourceVersion.id)} onBackup={()=>setShowBackup(true)}/></div>{sidebarScrim}{modal}{deleteDialog}{backupDialog}</div>;
   return <div className={`app-shell workspace-shell ${sidebarCollapsed?'sidebar-collapsed':''}`}>{sidebar}
  <main className="app-main"><header className="topbar"><div className="breadcrumbs"><select aria-label="选择简历版本" className="version-select" value={active.id} onChange={e=>selectVersion(e.target.value)}>{state.versions.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></div><div className="topbar-actions"><span className="save-state"><span className="save-dot"/>{saveStatus}</span><button className="model-status-button" onClick={openModels}><Settings2 size={15}/>AI 模型</button><div className="export-actions"><button className="outline-button" onClick={()=>{try{downloadResume(active.resume);}catch(e){setError(errorText(e));}}}><Download size={15}/>导出 HTML</button><button className="outline-button" onClick={()=>void pdf()}><FileText size={15}/>导出 PDF</button></div></div></header>
  {error&&<div className="workspace-alert" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}><X size={14}/></button></div>}
  {savedNotice}
  {view==='match'&&<MatchPage version={active} onBack={()=>navigate('workspace')} onEditRequirement={editRequirement}/>}
  {view==='history'&&<HistoryPage version={active} onBack={()=>navigate('workspace')} onRestore={op=>{commit(cloneResume(op.after),`恢复：${op.label}`,'restore');navigate('workspace');}}/>}
  {view==='workspace'&&<><div className="document-heading"><div><span className="panel-kicker">{active.isDemo?'DEMO / 示例数据':'EDITOR / 岗位定制版本'}</span><input aria-label="版本名称" value={active.title} onChange={e=>dispatch({type:'rename',id:active.id,title:e.target.value})}/><p>{active.role} · {active.jobFileName||'点击简历区块即可修改'}</p></div><div className="document-actions"><button className="outline-button" onClick={duplicate}>复制当前版本</button><button className="primary-button compact" onClick={()=>startNewRoleVersion(active)}><Plus size={14}/>基于当前版本创建岗位简历</button></div></div>
  {active.isDemo&&<div className="demo-notice"><Sparkles size={15}/>当前是示例资料，内容不属于你。<button onClick={()=>navigate('home')}>用我的资料生成</button></div>}
  <section className="workspace-design"><div className="workspace-design-heading"><h2>简历设计</h2><span>{templateById(active.resume.design.templateId).label}</span></div><TemplatePicker value={active.resume.design.templateId} onChange={id=>{if(id!=='auto')commit(applyTemplate(active.resume,id),`切换模板：${templateById(id).label}`);}}/><DesignPanel resume={active.resume} onChange={(resume,label)=>commit(resume,label)} onSelectPage={()=>{setSelectedId('page');setPending(null);}} onSelectAvatar={()=>{setSelectedId('profile-avatar');setPending(null);}}/><SourceReview key={active.id} profileText={active.profileText} resume={active.resume} onChange={(resume,label)=>commit(resume,label)}/></section><section className="workbench-grid editor-workbench"><div className="editor-column"><div className="panel-heading"><div><span className="panel-kicker">ASSISTANT</span><h2>AI 编辑助手</h2></div></div><div className="chat-card"><div className="chat-card-topline"><div className="ai-avatar"><WandSparkles size={16}/></div><div><strong>选择区块，再描述修改</strong><span>建议需确认，不会覆盖其他版本</span></div></div>
  <div className="selected-context-chip"><MousePointer2 size={14}/><span><small>当前编辑对象</small><strong>{selection?.label??'尚未选择，请点击右侧简历区块'}</strong></span>{selection&&<button aria-label="取消选择" onClick={()=>{setSelectedId(null);setPending(null);}}><X size={14}/></button>}</div>
  <MatchEditingPanel version={active} onEdit={editRequirement} onView={()=>navigate('match')}/><form className="chat-form" onSubmit={e=>{e.preventDefault();void submitEdit();}}><VoiceTextarea aria-label="AI修改要求" value={chat} onChange={setChat} label="AI修改要求" rows={5} maxLength={8000} placeholder="例如：把标题改成深蓝色；将这段项目描述精简为两条，保留已提供的事实。"/><div className="chat-actions"><button className="tool-button" type="button" disabled={!selection} onClick={()=>selection&&setChat(`当前组件样式：\n${selection.code}\n\n我的修改要求：`)}><Code2 size={15}/>代码上下文</button><button className="send-button" type="submit" disabled={!selection||!chat.trim()||editing}>{editing?<RefreshCcw className="spin" size={16}/>:<Send size={16}/>}{editing?'请求中…':'生成修改'}</button></div></form>
  </div>{pending&&<div className="patch-card"><div className="patch-head"><span><WandSparkles size={14}/>AI修改建议</span><button className="quiet-icon" aria-label="放弃建议" onClick={()=>setPending(null)}><X size={14}/></button></div><p>{pending.patch.preview}</p><div className="patch-reason">{pending.patch.reason}</div>{pending.patch.operation==='rewriteText'&&<div className="rewrite-diff"><label>修改前<pre>{selection?.content}</pre></label><label>修改后<pre>{String(pending.patch.value)}</pre></label></div>}<div className="patch-actions"><button className="ghost-button" onClick={()=>setPreviewSuggestion(v=>!v)}>{previewSuggestion?'查看当前版本':'预览建议'}</button><button className="ghost-button" onClick={()=>setPending(null)}>放弃</button><button className="apply-button" onClick={apply}><Check size={14}/>应用修改</button></div></div>}
  <div className="conversation-card"><div className="conversation-heading"><span>本版本最近对话</span><button aria-label="查看修改历史" className="quiet-icon" onClick={()=>navigate('history')}><MoreHorizontal size={16}/></button></div>{active.messages.length===0?<p className="empty-conversation">先选中一个区块，再告诉AI你想如何调整。</p>:active.messages.slice(-4).map(m=><div className={`message-row ${m.role}`} key={m.id}><div className="message-copy"><small>{m.role==='user'?'你':'AI'}</small><p>{m.content}</p></div></div>)}</div>
  </div>
  <div className={`preview-column ${fullscreen?'is-fullscreen':''}`} role={fullscreen?'dialog':undefined} aria-modal={fullscreen||undefined} aria-label={fullscreen?'放大简历预览':undefined}><div className="preview-toolbar"><div><span className="panel-kicker">A4 CANVAS</span><strong>{pending&&previewSuggestion?'建议预览 · 尚未保存':'实时预览'}</strong></div><div className="preview-tools"><button className="icon-button" aria-label="撤销" title="撤回 Ctrl+Z" disabled={!active.past.length} onClick={()=>historyAction('undo')}><Undo2 size={16}/></button><button className="icon-button" aria-label="重做" title="重做 Ctrl+Shift+Z" disabled={!active.future.length} onClick={()=>historyAction('redo')}><Redo2 size={16}/></button><button className="zoom-step" aria-label="缩小预览" onClick={()=>setScale(v=>Math.max(.3,Number((v-.05).toFixed(2))))}><Minus size={13}/></button><input className="zoom-range" type="range" min=".3" max="1.5" step=".05" value={scale} onChange={e=>setScale(Number(e.target.value))} aria-label="预览缩放"/><span className="zoom-label">{Math.round(scale*100)}%</span><button className="zoom-step" aria-label="放大预览" onClick={()=>setScale(v=>Math.min(1.5,Number((v+.05).toFixed(2))))}><Plus size={13}/></button><button className="icon-button" aria-label={fullscreen?'退出全屏预览':'全屏预览'} onClick={()=>setFullscreen(v=>!v)}>{fullscreen?<X size={16}/>:<Maximize2 size={16}/>}</button></div></div><AddSectionPanel key={active.id} resume={active.resume} onChange={(resume,label)=>commit(resume,label)}/><div className="preview-stage"><ResumePreview resume={previewResume??active.resume} selectedNodeId={selectedId??''} onSelect={id=>{editController.current?.abort();setEditing(false);setPending(null);setSelectedId(id);}} key={active.id} scale={scale} onEdit={pending&&previewSuggestion?undefined:(id,value)=>commit(updateContent(active.resume,id,value),'修改'+getNodeMeta(active.resume,id).label)} onDeleteSection={id=>{commit(hideSection(active.resume,id),'删除栏目：'+sectionTitle(active.resume,id));setSelectedId(null);}} onMoveSection={(source,target,column,after)=>commit(moveSection(active.resume,source,target,column,after),'调整栏目顺序：'+sectionTitle(active.resume,source))}/></div><div className="preview-footer"><small>缩放只影响屏幕，导出使用真实A4尺寸。PDF通过打印窗口选择“另存为PDF”。</small></div></div>
  {selection?<Inspector key={selection.id+selection.content} resume={active.resume} selection={selection} onContent={value=>commit(updateContent(active.resume,selection.id,value),`修改${selection.label}`)} onStyle={(key,value)=>{const next=cloneResume(active.resume);if(key==='avatarShape')next.design.avatarShape=value==='circle'?'circle':'square';else if(key==='avatarScale')next.design.avatarScale=Number(value);else next.nodeStyles[selection.id]={...next.nodeStyles[selection.id],[key]:value};commit(next,`调整${selection.label}样式`);}} onCode={()=>setChat(`当前组件样式：\n${selection.code}\n\n我的修改要求：`)} onPhoto={file=>void readPhoto(file,true)} photoBusy={photoBusy}/>:<aside className="insight-column"><div className="insight-heading"><h2>选择器</h2></div><div className="empty-inspector"><MousePointer2 size={28}/><h3>选择要修改的区块</h3><p>点击简历中的姓名、项目、经历或技能，即可修改内容、颜色、字号和间距。</p></div></aside>}
   </section><nav className="mobile-workbench-nav" aria-label="工作台快捷操作"><button type="button" className={mobileWorkspaceSection==='edit'?'active':''} aria-current={mobileWorkspaceSection==='edit'?'location':undefined} onClick={()=>scrollWorkspaceSection('edit')}><WandSparkles size={16}/><span>编辑</span></button><button type="button" className={mobileWorkspaceSection==='match'?'active':''} aria-current={mobileWorkspaceSection==='match'?'location':undefined} onClick={()=>scrollWorkspaceSection('match')}><Target size={16}/><span>匹配</span></button><button type="button" className={mobileWorkspaceSection==='history'?'active':''} aria-current={mobileWorkspaceSection==='history'?'location':undefined} onClick={()=>scrollWorkspaceSection('history')}><History size={16}/><span>历史</span></button></nav></>}
  </main>{fullscreen&&<button className="fullscreen-scrim" aria-label="关闭全屏背景" onClick={()=>setFullscreen(false)}/ >}{sidebarScrim}{modal}{deleteDialog}{backupDialog}</div>;
}
function errorText(error:unknown){return error instanceof Error?error.message:'操作失败，请检查设置后重试。';}
function isModelPreset(value:unknown):value is ModelPreset{if(typeof value!=='object'||!value)return false;const v=value as Record<string,unknown>;return ['id','label','provider','model','baseUrl','description'].every(key=>typeof v[key]==='string');}
