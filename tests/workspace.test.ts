import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialResume } from '../src/data';
import { makeVersion, workspaceReducer, emptyWorkspace, migrateWorkspace } from '../src/lib/workspace';
import { generationSchema, resumeSchema } from '../shared/contracts';
import { buildGenerationMessages, parseGeneration } from '../server/generation.mjs';
import { applyPatch, getNodeMeta } from '../src/lib/ai';
const result={resume:initialResume,jobTitle:'设计师',report:{summary:'测试分析',requirements:[]},warnings:[]};
test('per-version edit, undo and redo do not leak into other versions',()=>{
  const a=makeVersion(result),b=makeVersion(result);let state=workspaceReducer(emptyWorkspace,{type:'add',version:a});state=workspaceReducer(state,{type:'add',version:b});
  state=workspaceReducer(state,{type:'commit',id:a.id,resume:{...a.resume,name:'独立A'},label:'姓名',source:'manual'});
  assert.equal(state.versions.find(v=>v.id===b.id)?.resume.name,initialResume.name);
  state=workspaceReducer(state,{type:'undo',id:a.id});assert.equal(state.versions.find(v=>v.id===a.id)?.resume.name,initialResume.name);
  state=workspaceReducer(state,{type:'redo',id:a.id});assert.equal(state.versions.find(v=>v.id===a.id)?.resume.name,'独立A');
  assert.equal(state.versions.find(v=>v.id===a.id)?.history.length,1);assert.equal(state.versions.find(v=>v.id===b.id)?.history.length,0);
});
test('fresh storage has no samples; legacy migration only retains actual stored documents',()=>{
  assert.equal(migrateWorkspace(null).versions.length,0);
  const legacy=migrateWorkspace({resume:{...initialResume,name:'旧版真实内容'},activeVersionId:'one',versions:[{id:'one'},{id:'fake-two'}]});
  assert.equal(legacy.versions.length,1);assert.equal(legacy.versions[0].resume.name,'旧版真实内容');
});
test('backup roundtrip retains active version and history',()=>{
  const version=makeVersion(result);const state=workspaceReducer(emptyWorkspace,{type:'add',version});const reloaded=migrateWorkspace(JSON.parse(JSON.stringify(state)));assert.equal(reloaded.activeVersionId,version.id);assert.deepEqual(reloaded.versions[0].resume,JSON.parse(JSON.stringify(version.resume)));
});
test('AI generation requires both materials and safe data structures',()=>{
  const messages=buildGenerationMessages({profileText:'姓名：王五',jobText:'岗位：工程师',profileImages:[],jobImages:[],config:{mode:'preset',presetId:'test'}});assert.match(JSON.stringify(messages),/王五/);
  assert.throws(()=>buildGenerationMessages({profileText:'',jobText:'',config:{mode:'preset',presetId:'test'}}));
  assert.deepEqual(parseGeneration(JSON.stringify(result)).resume.name,initialResume.name);assert.equal(generationSchema.safeParse({resume:{name:'X'}}).success,false);
  assert.equal(resumeSchema.safeParse({...initialResume,nodeStyles:{x:{color:'url(javascript:evil)'}}}).success,false);
});
test('generation tolerates fenced or partial model JSON while dropping illegal style values',()=>{
  const content = `Here is the resume:\n\`\`\`json\n${JSON.stringify({
    jobTitle: '产品经理',
    resume: { name: '李四', role: '产品经理', projects: [{ title: '项目A', description: '负责需求分析\n推动上线', style: { color: 'url(javascript:evil)' } }], design: { accentColor: 'javascript:evil', sectionGap: 999 }, nodeStyles: { 'project-1': { color: 'url(https://evil)', fontSize: 100 } } },
    report: { summary: '基于材料', requirements: [] },
  })}\n\`\`\``;
  const parsed = parseGeneration(content);
  assert.equal(parsed.jobTitle, '产品经理');
  assert.equal(parsed.resume.name, '李四');
  assert.equal(parsed.resume.projects[0].id, 'project-1');
  assert.deepEqual(parsed.resume.projects[0].description, ['负责需求分析', '推动上线']);
  assert.deepEqual(parsed.resume.nodeStyles, {});
  assert.equal(parsed.resume.design.accentColor, '#D96945');
  assert.equal(parsed.resume.design.sectionGap, 24);
});

test('generation keeps education, experience and awards when a gateway uses common aliases or string records',()=>{
  const parsed = parseGeneration(JSON.stringify({
    jobTitle: '工程管理实习生',
    resume: {
      name: '方昱',
      role: '工程管理实习生',
      education: [{ schoolName: '嘉兴南湖学院', major: '工程管理专业 | 本科', time: '2023.09 - 2027.06' }],
      experience: [{ organization: '校团委', position: '办公室干事', date: '2023.09 - 2023.11 | 嘉兴', description: '参与活动筹备与资料整理' }],
      awards: [{ name: '蓝桥杯Python程序设计大赛 | 省级三等奖' }],
    },
    report: { summary: '基于资料', requirements: [] },
  }));
  assert.deepEqual(parsed.resume.education, [{ school: '嘉兴南湖学院', degree: '工程管理专业 | 本科', period: '2023.09 - 2027.06' }]);
  assert.deepEqual(parsed.resume.experience, [{ company: '校团委', role: '办公室干事', period: '2023.09 - 2023.11 | 嘉兴', bullets: ['参与活动筹备与资料整理'] }]);
  assert.deepEqual(parsed.resume.awards, ['蓝桥杯Python程序设计大赛 | 省级三等奖']);
});

test('generation drops empty placeholder records so blank sections are not rendered',()=>{
  const parsed = parseGeneration(JSON.stringify({
    jobTitle: '工程管理实习生',
    resume: { name: '方昱', education: [{}, { school: '嘉兴南湖学院', degree: '工程管理专业', period: '2023.09 - 2027.06' }], experience: [{}] },
    report: { summary: '', requirements: [] },
  }));
  assert.deepEqual(parsed.resume.education, [{ school: '嘉兴南湖学院', degree: '工程管理专业', period: '2023.09 - 2027.06' }]);
  assert.deepEqual(parsed.resume.experience, []);
});

test('generation repairs omitted sections from tagged imported profile text',()=>{
  const parsed = parseGeneration(JSON.stringify({
    jobTitle: '工程管理实习生',
    resume: { name: '方昱', education: [{}], experience: [{}], awards: [] },
    report: { summary: '', requirements: [] },
  }), `[教育背景]\n嘉兴南湖学院\n2023.09 - 2027.06\n工程管理专业 | 本科\n\n[组织与协调实践]\n校团委 | 办公室干事\n2023.09 - 2023.11 | 嘉兴\n参与活动筹备与资料整理\n\n[获奖与证书]\n全国计算机等级考试二级Python（优秀）；蓝桥杯Python程序设计大赛 | 省级三等奖`);
  assert.equal(parsed.resume.education[0]?.school, '嘉兴南湖学院');
  assert.equal(parsed.resume.experience[0]?.company, '校团委');
  assert.deepEqual(parsed.resume.awards, ['全国计算机等级考试二级Python（优秀）', '蓝桥杯Python程序设计大赛 | 省级三等奖']);
});
test('patches reject wrong target, style injection and font overflow',()=>{
  const meta=getNodeMeta(initialResume,'project-1-title');const patch={id:'p',targetNodeId:meta.id,operation:'setStyle' as const,path:'style.color',value:'#315A64',preview:'改色',reason:'要求',requiresConfirmation:false};
  assert.equal(applyPatch(initialResume,patch).nodeStyles[meta.id].color,'#315A64');
  assert.throws(()=>applyPatch(initialResume,{...patch,value:'url(https://evil)'}));
  assert.throws(()=>applyPatch(initialResume,{...patch,path:'style.fontSize',value:9999}));
});

test('deleting a non-active version preserves the active document and its history',()=>{
  const a=makeVersion(result),b=makeVersion(result);
  let state=workspaceReducer(emptyWorkspace,{type:'add',version:a});state=workspaceReducer(state,{type:'add',version:b});
  state=workspaceReducer(state,{type:'commit',id:b.id,resume:{...b.resume,name:'保留内容'},label:'姓名',source:'manual'});
  const survivor=state.versions.find(v=>v.id===b.id)!;
  state=workspaceReducer(state,{type:'delete',id:a.id});
  assert.equal(state.versions.length,1);assert.equal(state.activeVersionId,b.id);assert.equal(state.versions[0],survivor);
  assert.equal(state.versions[0].history.length,1);assert.equal(state.versions[0].resume.name,'保留内容');
  const reloaded=migrateWorkspace(JSON.parse(JSON.stringify(state)));assert.equal(reloaded.versions.length,1);assert.equal(reloaded.activeVersionId,b.id);
});

test('deleting active version chooses a surviving version and deleting all empties the workspace',()=>{
  const a=makeVersion(result),b=makeVersion(result);
  let state=workspaceReducer(emptyWorkspace,{type:'add',version:a});state=workspaceReducer(state,{type:'add',version:b});
  state=workspaceReducer(state,{type:'delete',id:b.id});assert.equal(state.activeVersionId,a.id);
  state=workspaceReducer(state,{type:'delete',id:a.id});assert.deepEqual(state,emptyWorkspace);
  assert.deepEqual(migrateWorkspace(JSON.parse(JSON.stringify(state))),emptyWorkspace);
  assert.equal(workspaceReducer(state,{type:'delete',id:'unknown'}),state);
});
