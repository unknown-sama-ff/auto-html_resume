import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirectUrl, requestDirectModel } from '../src/lib/directModel';
import { requestGeneration } from '../src/lib/generation';
import { initialResume } from '../src/data';
import { requestAIEdit, getNodeMeta } from '../src/lib/ai';
const config={mode:'custom' as const,presetId:'cf-api-fan',url:'https://provider.example/v1',model:'own-model',apiKey:'test-user-key'};
const generation={resume:initialResume,jobTitle:'测试岗位',warnings:[],report:{summary:'测试',requirements:[]}};

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
    const content=requests.length===1?generation:{id:'edit',targetNodeId:'profile-name',operation:'setStyle',path:'style.color',value:'#315A64',preview:'修改姓名颜色',reason:'用户要求',requiresConfirmation:false};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}),{status:200});
  });
  assert.equal((await requestGeneration(config,'姓名：测试','测试岗位',[],[])).resume.name,initialResume.name);
  const patch=await requestAIEdit(config,'改颜色',getNodeMeta(initialResume,'profile-name'));
  assert.equal(patch.value,'#315A64');assert.equal(requests.length,2);
});

test('failed custom connection never falls back to an app backend request',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async(input:string)=>{count++;assert.match(input,/^https:\/\/provider\.example/);throw new TypeError('Failed to fetch');});
  await assert.rejects(requestDirectModel(config,[{role:'user',content:'test'}]),/CORS.*不会自动转发/);assert.equal(count,1);
});

test('author requests send neither custom URL nor user Key to backend',async t=>{
  t.mock.method(globalThis,'fetch',async(input:string,init:RequestInit)=>{
    assert.equal(input,'/api/ai/generate');assert.deepEqual(JSON.parse(String(init.body)).config,{mode:'preset',presetId:'cf-api-fan'});
    return new Response(JSON.stringify(generation),{status:200});
  });
  await requestGeneration({...config,mode:'preset'},'姓名：测试','测试岗位',[],[]);
});
