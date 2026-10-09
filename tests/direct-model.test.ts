import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirectUrl, requestDirectModel } from '../src/lib/directModel';
import { requestGeneration } from '../src/lib/generation';
import { initialResume } from '../src/data';
import { requestAIEdit, getNodeMeta } from '../src/lib/ai';
const config={mode:'custom' as const,presetId:'cf-api-fan',url:'https://provider.example/v1',model:'own-model',apiKey:'test-user-key'};
const generation={resume:initialResume,jobTitle:'测试岗位',warnings:[],report:{summary:'测试',requirements:[]}};
const tailoredSummary='根据测试岗位整理产品研究、设计和协作实践，突出真实项目中的职责与产出。';
const projectDescriptions=[
  ['搭建面向求职者的 AI 简历工作流，串联资料采集、岗位解析与版本化编辑。','设计结构化内容模型和受控视觉系统，支持证据追溯及打印排版。'],
  ['将多角色数据分析的 12 个常用指标整理为 3 个经营视图。','通过研究、设计与工程共创，支持试点商家将周报制作时间缩短约 40%。'],
];
const tailoringPatch={
  summary:tailoredSummary,
  projects:initialResume.projects.map((project,index)=>({id:project.id,description:projectDescriptions[index]})),
  experience:initialResume.experience.map((_,index)=>({index,bullets:['建立研究、定义、上线复盘的设计流程，负责增长与数据产品线。','与产品和工程协作建设覆盖 60+ 核心场景的组件库，减少重复设计和交付摩擦。']})),
  customSections:initialResume.customSections.map(section=>({id:section.id,items:section.items})),
  report:{summary:'按目标岗位重新组织已有实践；具体招聘要求尚需补充。',requirements:[{requirement:'测试岗位的具体职责与任职要求',status:'missing',evidence:'',suggestion:'请补充具体岗位职责和任职要求。',resumeEvidence:[]}]},
  warnings:[],
};

test('direct endpoint normalization preserves full endpoints and rejects unsafe/mixed-content URLs',()=>{
  assert.equal(normalizeDirectUrl('https://provider.example/v1/'),'https://provider.example/v1/chat/completions');
  assert.equal(normalizeDirectUrl('https://provider.example/v1/chat/completions'),'https://provider.example/v1/chat/completions');
  assert.throws(()=>normalizeDirectUrl('javascript:alert(1)'));
  assert.throws(()=>normalizeDirectUrl('https://user:pass@provider.example/v1'));
  assert.throws(()=>normalizeDirectUrl('http://provider.example/v1','https:'));
});

test('custom generation and editing bypass app APIs with no cookies or redirects',async t=>{
  const requests:{url:string;body:string}[]=[];
  t.mock.method(globalThis,'fetch',async (input:string,init:RequestInit)=>{
    assert.equal(input,'https://provider.example/v1/chat/completions');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.referrerPolicy,'no-referrer');
    assert.equal((init.headers as Record<string,string>).Authorization,'Bearer test-user-key');
    const body=String(init.body);requests.push({url:input,body});assert.equal(JSON.parse(body).model,'own-model');assert.ok(!body.includes('test-user-key'));
    if(requests.length===2){assert.match(JSON.parse(body).messages[0].content,/岗位正文改写阶段/);assert.match(body,/测试岗位/);}
    const content=requests.length===1?generation:requests.length===2?tailoringPatch:{id:'edit',targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',preview:'修改姓名颜色',reason:'用户要求',requiresConfirmation:false};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}),{status:200});
  });
  const result=await requestGeneration(config,'姓名：测试','测试岗位',[],[]);
  assert.equal(result.resume.name,initialResume.name);assert.equal(result.resume.summary,tailoredSummary);
  assert.deepEqual(result.resume.projects[0].description,tailoringPatch.projects[0].description);
  assert.deepEqual(result.resume.experience[0].bullets,tailoringPatch.experience[0].bullets);
  const patch=await requestAIEdit(config,'改颜色',getNodeMeta(initialResume,'profile-name'));
  assert.equal(patch.value,'#315A64');assert.equal(requests.length,3);
});

test('failed custom connection never falls back to an app backend request',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async(input:string)=>{count++;assert.match(input,/^https:\/\/provider\.example/);throw new TypeError('Failed to fetch');});
  await assert.rejects(requestDirectModel(config,[{role:'user',content:'test'}]),/CORS.*不会自动转发/);assert.equal(count,1);
});

test('custom generation stops after a failed first stage and never sends materials to the app backend',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async(input:string)=>{calls++;assert.equal(input,'https://provider.example/v1/chat/completions');throw new TypeError('Failed to fetch');});
  await assert.rejects(requestGeneration(config,'姓名：测试','测试岗位',[],[]),/CORS.*不会自动转发/);assert.equal(calls,1);
});

test('custom generation reports second-stage failure instead of returning its first-stage draft',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async(input:string,init:RequestInit)=>{
    calls++;assert.equal(input,'https://provider.example/v1/chat/completions');
    if(calls===1)return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(generation)}}]}),{status:200});
    assert.match(JSON.parse(String(init.body)).messages[0].content,/岗位正文改写阶段/);
    return new Response('{}',{status:429});
  });
  await assert.rejects(requestGeneration(config,'姓名：测试','测试岗位',[],[]),/限流|额度/);assert.equal(calls,2);
});

test('author requests send neither custom URL nor user Key to backend',async t=>{
  t.mock.method(globalThis,'fetch',async(input:string,init:RequestInit)=>{
    assert.equal(input,'/api/ai/generate');assert.deepEqual(JSON.parse(String(init.body)).config,{mode:'preset',presetId:'cf-api-fan'});
    return new Response(JSON.stringify(generation),{status:200});
  });
  await requestGeneration({...config,mode:'preset'},'姓名：测试','测试岗位',[],[]);
});

test('custom Responses URL goes directly to provider with input/store=false and extracts its final text',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async(input:string,init:RequestInit)=>{
    assert.equal(input,'https://provider.example/v1/responses');const request=JSON.parse(String(init.body));assert.equal(request.model,'own-model');assert.equal(request.store,false);assert.equal(request.stream,false);assert.ok(Array.isArray(request.input));assert.ok(!('messages' in request));count++;
    if(count===2)assert.match(String(request.instructions),/岗位正文改写阶段/);
    const content=count===1?generation:count===2?tailoringPatch:{targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',reason:'测试',preview:'改为深蓝色',requiresConfirmation:false};
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(content)}]}]}),{status:200});
  });
  const responsesConfig={...config,url:'https://provider.example/v1/responses'};
  const result=await requestGeneration(responsesConfig,'测试资料','测试岗位',[],[]);assert.equal(result.resume.name,initialResume.name);assert.equal(result.resume.summary,tailoredSummary);
  const edit=await requestAIEdit(responsesConfig,'改颜色',getNodeMeta(initialResume,'profile-name'));assert.equal(edit.value,'#315A64');assert.equal(count,3);
});

test('direct timeout uses the same budget, aborts once and never forwards to our backend',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async (input:string,init:RequestInit)=>{
    calls++;assert.equal(input,'https://provider.example/v1/chat/completions');
    return await new Promise<Response>((resolve,reject)=>{
      const safeguard=setTimeout(()=>resolve(new Response('{}')),2000);
      init.signal?.addEventListener('abort',()=>{clearTimeout(safeguard);reject(init.signal?.reason);},{once:true});
    });
  });
  await assert.rejects(requestDirectModel(config,[{role:'user',content:'test'}],undefined,{timeoutMs:1000}),/1 秒等待上限.*不会自动重试/);assert.equal(calls,1);
});
