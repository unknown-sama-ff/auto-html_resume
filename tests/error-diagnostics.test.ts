import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatApiFailure, safeModelLabel, safeBuildVersion } from '../shared/errorDiagnostics';
import { describeBadRequest, parseReasoningEffort } from '../shared/modelProtocol';

test('unknown400 metadata remains visible on frontend without exposing arbitrary diagnostic fields',()=>{
  const detail=formatApiFailure({error:'模型请求被拒绝',upstreamStatus:400,diagnostic:'unknown',requestId:'11111111-2222-4333-8444-555555555555',diagnostics:{protocol:'chat_completions',model:'gpt-6.1-sol',reasoningEffort:'medium',version:'abcdef123456',hasImages:false,apiKey:'not-to-display',rawBody:'private text'},upstreamCode:'a-private-key',upstreamParam:'private text'},502,'fallback');
  assert.match(detail,/应用 HTTP 502/);assert.match(detail,/上游 HTTP 400/);assert.match(detail,/chat_completions/);assert.match(detail,/medium/);assert.match(detail,/纯文本/);assert.match(detail,/abcdef1/);assert.match(detail,/11111111-2222-4333-8444-555555555555/);
  for(const text of ['not-to-display','private text','a-private-key'])assert.ok(!detail.includes(text));
});

test('parameter errors retain known safe code and parameter in the displayed feedback',()=>{
  const detail=formatApiFailure({error:'参数不支持',upstreamStatus:400,diagnostic:'reasoning_parameter',upstreamCode:'unsupported_parameter',upstreamParam:'reasoning_effort'},502,'fallback');
  assert.match(detail,/unsupported_parameter/);assert.match(detail,/reasoning_effort/);
});

test('invalid model output is shown as a safe, actionable diagnostic category',()=>{
  const detail=formatApiFailure({error:'模型返回的简历结构不完整或含非法样式，请重试。',diagnostic:'invalid_model_output',requestId:'11111111-2222-4333-8444-555555555555'},502,'fallback');
  assert.match(detail,/类别 invalid_model_output/);
  assert.ok(!detail.includes('resume') && !detail.includes('apiKey'));
});

test('incomplete tailoring shows its trusted category and the failed generation stage',()=>{
  const detail=formatApiFailure({error:'模型尚未完成岗位正文改写，原资料已保留。',diagnostic:'insufficient_tailoring',diagnostics:{generationStage:'tailoring',phase:'parsing_response'}},502,'fallback');
  assert.match(detail,/类别 insufficient_tailoring/);
  assert.match(detail,/生成阶段 正文改写/);
  assert.match(detail,/阶段 解析结果/);
  assert.ok(!detail.includes('generationStage') && !detail.includes('parsing_response'));
});

test('analysis is translated while arbitrary generation stage metadata is hidden',()=>{
  const analysis=formatApiFailure({error:'无法分析材料',diagnostics:{generationStage:'analysis'}},502,'fallback');
  assert.match(analysis,/生成阶段 岗位分析/);
  for(const value of ['private-profile-text','Analysis','tailoring: private-profile-text',{value:'analysis'},['tailoring']]){
    const detail=formatApiFailure({error:'生成失败',diagnostics:{generationStage:value}},502,'fallback');
    assert.ok(!detail.includes('生成阶段'));
    assert.ok(!detail.includes('private-profile-text'));
  }
});

test('reasoning rejection is not mislabeled as model unavailable',()=>{
  const parsed=describeBadRequest({error:{code:'unsupported_parameter',param:'reasoning_effort',message:'The model does not support reasoning_effort'}});
  assert.equal(parsed.diagnostic,'reasoning_parameter');assert.equal(parsed.upstreamParam,'reasoning_effort');assert.match(parsed.hint,/不等于模型不存在/);
  assert.equal(describeBadRequest({error:{code:'model_not_found',param:'model'}}).diagnostic,'model_unavailable');
});

test('invalid reasoning environment value is caught locally and metadata does not expose a Key-shaped model',()=>{
  assert.throws(()=>parseReasoningEffort('typo'),/CF_API_REASONING_EFFORT/);assert.equal(parseReasoningEffort('none'),'none');
  assert.equal(safeModelLabel('sk-do-not-display'),undefined);assert.equal(safeModelLabel('same-secret','same-secret'),undefined);
  assert.equal(safeBuildVersion('not a revision'),'unknown');
});
