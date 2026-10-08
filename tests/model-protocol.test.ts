import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelEndpoint, buildModelRequest, extractModelText, describeBadRequest } from '../shared/modelProtocol';
import { buildGenerationMessages } from '../shared/generation';
import type { CompletionMessage } from '../shared/generation';
const messages:CompletionMessage[]=[{role:'system',content:'Return JSON only'},{role:'user',content:[{type:'text',text:'test text'}]}];

test('base URL, explicit chat path and explicit responses path select the proper route without double suffixes',()=>{
  assert.equal(resolveModelEndpoint('https://example.test/v1/').url.pathname,'/v1/chat/completions');
  assert.equal(resolveModelEndpoint('https://example.test/v1/chat/completions').url.pathname,'/v1/chat/completions');
  assert.equal(resolveModelEndpoint('https://example.test/v1/responses').protocol,'responses');
  assert.equal(resolveModelEndpoint('https://example.test/v1/responses').url.pathname,'/v1/responses');
  assert.equal(resolveModelEndpoint('https://example.test/v1','responses').url.pathname,'/v1/responses');
  assert.equal(resolveModelEndpoint('https://example.test/v1/chat/completions','responses').url.pathname,'/v1/responses');
  assert.throws(()=>resolveModelEndpoint('https://example.test/v1','typo'),/CF_API_PROTOCOL/);
});

test('text-only generation uses strings, images preserve multimodal content',()=>{
  const request={config:{mode:'preset',presetId:'cf-api-fan'},profileText:'test profile',jobText:'test job'};
  const text=buildGenerationMessages(request);assert.equal(typeof text[1].content,'string');
  const image={name:'test.png',mimeType:'image/png',dataUrl:'data:image/png;base64,dGVzdA=='};
  const vision=buildGenerationMessages({...request,profileImages:[image]});assert.ok(Array.isArray(vision[1].content));
  const chat=buildModelRequest('test',vision,'chat_completions');assert.ok('messages' in chat);assert.ok(!('temperature' in chat));assert.ok(!('max_tokens' in chat));
});

test('Responses requests use input and image/text parts, disable remote store and streaming',()=>{
  const request=buildModelRequest('own-model',[messages[0],{role:'user',content:[{type:'text',text:'only test'},{type:'image_url',image_url:{url:'data:image/png;base64,dGVzdA=='}}]}],'responses');
  assert.ok('input' in request);assert.equal(request.instructions,'Return JSON only');assert.equal(request.store,false);assert.equal(request.stream,false);
  assert.deepEqual(request.input[0].content,[{type:'input_text',text:'only test'},{type:'input_image',image_url:'data:image/png;base64,dGVzdA=='}]);
  assert.ok(!('messages' in request));
});

test('response extraction reads final text and ignores reasoning output',()=>{
  assert.equal(extractModelText({choices:[{message:{content:'chat answer'}}]},'chat_completions'),'chat answer');
  assert.equal(extractModelText({output:[{type:'reasoning',summary:[{text:'must not extract'}]},{type:'message',content:[{type:'output_text',text:'responses answer'}]}]},'responses'),'responses answer');
  assert.throws(()=>extractModelText({status:'incomplete',output_text:'unfinished'},'responses'),/未完成/);
});

test('400 diagnostics whitelist hints without returning upstream private content or credential-like metadata',()=>{
  const secret='not-a-real-key';
  const result=describeBadRequest({error:{code:secret,param:secret,message:'private submitted profile '+secret}});
  assert.equal(result.diagnostic,'unknown');assert.ok(!JSON.stringify(result).includes(secret));assert.ok(!JSON.stringify(result).includes('private submitted'));
  const string=describeBadRequest({error:{code:'invalid_type',param:'messages[1].content',message:'Invalid type for messages[1].content: expected a string. '+secret}});
  assert.equal(string.diagnostic,'content_type');assert.equal(string.upstreamParam,'messages[1].content');assert.equal(string.upstreamCode,'invalid_type');assert.ok(!JSON.stringify(string).includes(secret));
  assert.equal(describeBadRequest({error:{code:'model_not_found'}}).diagnostic,'model_unavailable');
  assert.equal(describeBadRequest({error:{message:'This model does not support image input'}}).diagnostic,'image_unsupported');
  assert.equal(describeBadRequest({error:{message:'Must set stream to true'}}).diagnostic,'streaming_required');
  assert.equal(describeBadRequest({error:{code:'context_length_exceeded'}}).diagnostic,'context_too_long');
});

test('reasoning effort is added only when configured and follows each protocol',()=>{
  const chat=buildModelRequest('gpt-6.1-sol',messages,'chat_completions','medium');assert.equal(chat.reasoning_effort,'medium');assert.equal(chat.stream,false);
  const none=buildModelRequest('gpt-6.1-sol',messages,'chat_completions','none');assert.ok(!('reasoning_effort' in none));
  const responses=buildModelRequest('gpt-6.1-sol',messages,'responses','medium');assert.deepEqual(responses.reasoning,{effort:'medium'});assert.equal(responses.store,false);
});

test('unsupported non-streaming feature is not mistaken for a missing model id',()=>{
  const result=describeBadRequest({error:{message:'Unsupported non-streaming requests for this model.'}});
  assert.equal(result.diagnostic,'streaming_required');
});

test('supported non-streaming is not treated as a streaming requirement',()=>{
  const result=describeBadRequest({error:{message:'This model only supports non-streaming requests.'}});
  assert.notEqual(result.diagnostic,'streaming_required');assert.notEqual(result.diagnostic,'model_unavailable');
});
