import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelListUrl, checkConfiguredModel } from '../server/modelCheck.mjs';
const environment={CF_API_BASE_URL:'https://relay.example/v1',CF_API_MODEL:'gpt-6.1-sol',CF_API_KEY:'fake-check-key'};

test('model check normalizes both API paths to model list URL without double suffix or query credentials',()=>{
  assert.equal(modelListUrl('https://relay.example/v1/chat/completions?token=private').toString(),'https://relay.example/v1/models');
  assert.equal(modelListUrl('https://relay.example/v1/responses').toString(),'https://relay.example/v1/models');
});
test('check issues only one authenticated GET with no prompt or user payload',async()=>{
  let calls=0;
  const result=await checkConfiguredModel(environment,async(url:string,init:RequestInit)=>{
    calls++;assert.equal(url,'https://relay.example/v1/models');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.body,undefined);
    assert.equal((init.headers as Record<string,string>).Authorization,'Bearer fake-check-key');
    return new Response(JSON.stringify({data:[{id:'gpt-6.1-sol'},{id:'gpt-test'},{id:'fake-check-key'},{id:'sk-do-not-print'}]}),{status:200});
  });
  assert.equal(calls,1);assert.equal(result.status,'listed');assert.equal(result.modelListed,true);assert.deepEqual(result.modelIds,['gpt-6.1-sol','gpt-test']);
  assert.ok(!JSON.stringify(result).includes(environment.CF_API_KEY));assert.ok(!JSON.stringify(result).includes('sk-do-not-print'));
});
test('missing exact id does not automatically change model or assert the model does not exist everywhere',async()=>{
  const result=await checkConfiguredModel(environment,async()=>new Response(JSON.stringify({data:[{id:'gpt-another-id'}]}),{status:200}));
  assert.equal(result.modelListed,false);assert.equal(result.status,'not_listed');assert.equal(result.configuredModel,'gpt-6.1-sol');assert.match(result.note,/不能自动判定或切换/);
});
test('unsupported model list or auth rejection is reported as unknown availability without leaking upstream errors',async()=>{
  for(const status of [401,403,404]){
    const result=await checkConfiguredModel(environment,async()=>new Response(JSON.stringify({error:{message:'secret '+environment.CF_API_KEY}}),{status}));
    assert.equal(result.status,'list_unavailable');assert.equal(result.modelListed,null);assert.equal(result.httpStatus,status);assert.ok(!JSON.stringify(result).includes(environment.CF_API_KEY));
  }
});
test('invalid configuration never calls the model service',async()=>{
  let calls=0;const transport=async()=>{calls++;return new Response('{}');};
  const result=await checkConfiguredModel({...environment,CF_API_KEY:''},transport);assert.equal(result.status,'configuration_error');assert.equal(calls,0);
});
