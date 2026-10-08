import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumePreview } from '../src/components/ResumePreview';
import { initialResume } from '../src/data';
import { designSchema, resumeSchema } from '../shared/contracts';
import { RESUME_TEMPLATES, templateDesign } from '../shared/design';
import { buildGenerationMessages, parseGeneration } from '../shared/generation';
import { buildEditMessages, parseEditPatch } from '../shared/edit';
import { applyTemplate } from '../src/lib/design';
import { applyPatch, getNodeMeta, updateContent, validatePatch } from '../src/lib/ai';
import { appendCustomSection, unmatchedSourceLines } from '../src/lib/sourceReview';
import { emptyWorkspace, makeVersion, migrateWorkspace, workspaceReducer } from '../src/lib/workspace';

test('six layouts render all facts and stable selectable IDs with distinct reading arrangements',()=>{
  const resume=appendCustomSection(initialResume,'语言与研究',['English C1','OTHER_FACT_001']);
  const keys=['profile-name','project-1-title','project-1-description','education-1',`custom-${resume.customSections[0].id}-content`];
  for(const {id} of RESUME_TEMPLATES){
    const changed=applyTemplate(resume,id);
    const html=renderToStaticMarkup(createElement(ResumePreview,{resume:changed,interactive:false}));
    assert.match(html,new RegExp(`data-template="${id}"`));
    for(const key of keys)assert.match(html,new RegExp(`data-node-id="${key}"`));
    for(const fact of [resume.name,resume.education[0].school,resume.experience[0].company,resume.projects[0].title,'OTHER_FACT_001'])assert.ok(html.includes(fact));
    assert.deepEqual(changed.customSections,resume.customSections);
    assert.deepEqual(changed.projects,resume.projects);
    if(id==='academic')assert.ok(html.indexOf('data-section="education"')<html.indexOf('data-section="projects"'));
    if(id==='modern')assert.ok(html.includes('resume-identity-panel'));
  }
});

test('template changes preserve local edits and are isolated, undoable and persistent',()=>{
  const original={...initialResume,nodeStyles:{'project-1-title':{color:'#112233',fontSize:19}}};
  const result={resume:original,jobTitle:'工程师',report:{summary:'',requirements:[]},warnings:[]};
  const a=makeVersion(result,{profileText:'保留的原始材料'}),b=makeVersion(result);
  let state=workspaceReducer(emptyWorkspace,{type:'add',version:a});state=workspaceReducer(state,{type:'add',version:b});
  const changed=applyTemplate(original,'modern');
  state=workspaceReducer(state,{type:'commit',id:a.id,resume:changed,label:'切换模板',source:'manual'});
  assert.equal(state.versions.find(v=>v.id===b.id)?.resume.design.templateId,'minimal');
  state=workspaceReducer(state,{type:'undo',id:a.id});assert.equal(state.versions.find(v=>v.id===a.id)?.resume.design.templateId,'minimal');
  state=workspaceReducer(state,{type:'redo',id:a.id});
  const restored=migrateWorkspace(JSON.parse(JSON.stringify(state))).versions.find(v=>v.id===a.id)!;
  assert.equal(restored.resume.design.templateId,'modern');assert.deepEqual(restored.resume.nodeStyles,original.nodeStyles);assert.equal(restored.profileText,'保留的原始材料');
});

test('old v2 backups receive default template/custom sections without dropping history',()=>{
  const version=makeVersion({resume:initialResume,jobTitle:'测试',report:{summary:'',requirements:[]},warnings:[]});
  const state=workspaceReducer(emptyWorkspace,{type:'add',version});
  const raw=JSON.parse(JSON.stringify(state));delete raw.versions[0].profileText;delete raw.versions[0].resume.customSections;
  for(const key of ['templateId','fontFamily','density','headingStyle'])delete raw.versions[0].resume.design[key];
  const restored=migrateWorkspace(raw);assert.equal(restored.versions.length,1);assert.equal(restored.versions[0].resume.design.templateId,'minimal');assert.deepEqual(restored.versions[0].resume.customSections,[]);assert.equal(restored.versions[0].profileText,'');
});

test('AI design protocol admits only whitelisted page settings and requires confirmation',()=>{
  const base={id:'patch',targetNodeId:'page',operation:'setTheme' as const,path:'design.templateId',value:'academic',reason:'教育优先',preview:'整页切换学术模板',requiresConfirmation:false};
  const patch=parseEditPatch(JSON.stringify(base),'page');assert.equal(patch.requiresConfirmation,true);
  assert.equal(applyPatch(initialResume,patch).design.templateId,'academic');
  assert.throws(()=>validatePatch({...base,targetNodeId:'profile-name'},getNodeMeta(initialResume,'profile-name')));
  assert.throws(()=>parseEditPatch(JSON.stringify({...base,path:'design.css',value:'@import "evil"'}),'page'));
  assert.throws(()=>getNodeMeta(initialResume,'unregistered-node'));
  assert.equal(designSchema.safeParse({...templateDesign('modern'),templateId:'arbitrary'}).success,false);
  assert.equal(designSchema.safeParse({...templateDesign('modern'),accentColor:'url(javascript:evil)'}).success,false);
  assert.match(JSON.stringify(buildEditMessages('选择学术风格',getNodeMeta(initialResume,'page'))),/setTheme/);
  const context=getNodeMeta({...initialResume,nodeStyles:{page:{color:'#112233',fontSize:21},'project-1-title':{fontSize:16}}},'project-1-title');
  assert.equal(context.style.color,'#112233');assert.equal(context.style.fontSize,24);
});

test('AI generation preserves unfamiliar root fields, custom sections and imported headings',()=>{
  const parsed=parseGeneration(JSON.stringify({resume:{name:'测试',customSections:[{id:'extra-2',title:'语言',items:['英语六级']},{title:'论文',content:'论文事实'}],patents:['专利事实'],design:{templateId:'technical',density:'compact'}},jobTitle:'工程师',report:{summary:'',requirements:[]}}),'[教育经历]\n真实大学\n2020 - 2024\n工程管理\n[航空执照]\n飞行执照事实\n[志愿服务]\n社区活动事实');
  assert.equal(parsed.resume.education[0].school,'真实大学');
  assert.ok(!parsed.resume.education[0].degree.includes('飞行执照'));
  assert.ok(parsed.resume.customSections.some(item=>item.items.includes('飞行执照事实')));
  assert.ok(parsed.resume.customSections.some(item=>item.items.includes('专利事实')));
  assert.equal(new Set(parsed.resume.customSections.map(item=>item.id)).size,parsed.resume.customSections.length);
  assert.equal(parsed.resume.design.templateId,'technical');
  assert.equal(parseGeneration(JSON.stringify(parsed),'','editorial').resume.design.templateId,'editorial');
  assert.match(JSON.stringify(buildGenerationMessages({config:{mode:'preset',presetId:'test'},profileText:'个人资料',jobText:'岗位',templateId:'modern'})),/customSections/);
});

test('source review preserves original facts, admits long text without clipping and supports local edits',()=>{
  const line='未识别的海外志愿活动事实';
  assert.ok(unmatchedSourceLines(`${initialResume.name}\n[志愿服务]\n${line}`,initialResume).includes(line));
  const next=appendCustomSection(initialResume,'志愿服务',[line,'A'.repeat(6200)]);
  assert.equal(next.customSections[0].items.slice(1).join('').length,6200);
  assert.deepEqual(unmatchedSourceLines(line,next),[]);
  const id=`custom-${next.customSections[0].id}-content`;
  assert.match(getNodeMeta(next,id).content,/志愿活动/);
  assert.equal(updateContent(next,id,'保留的新描述').customSections[0].items[0],'保留的新描述');
  assert.equal(resumeSchema.safeParse(next).success,true);
  const malicious=appendCustomSection(initialResume,'<script>',['<img src=x onerror=alert(1)>']);
  const html=renderToStaticMarkup(createElement(ResumePreview,{resume:malicious,interactive:false}));
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.match(html,/&lt;script&gt;/);
});
