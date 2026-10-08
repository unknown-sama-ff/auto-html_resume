import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AI_TIMEOUT_MS, parseAiTimeoutMs } from '../shared/requestTimeout';
import { formatApiFailure } from '../shared/errorDiagnostics';

test('AI request waits four minutes by default and accepts bounded explicit millisecond configuration',()=>{
  assert.equal(DEFAULT_AI_TIMEOUT_MS,240000);assert.equal(parseAiTimeoutMs(undefined),240000);assert.equal(parseAiTimeoutMs('240000'),240000);assert.equal(parseAiTimeoutMs('270000'),270000);assert.equal(parseAiTimeoutMs(1000),1000);
  for(const value of ['abc','300000',0,500,'1.5',Infinity])assert.throws(()=>parseAiTimeoutMs(value),/AI_REQUEST_TIMEOUT_MS/);
});
test('timeout feedback distinguishes configured deadline, elapsed time and waiting stage',()=>{
  const result=formatApiFailure({error:'已达到等待上限',diagnostic:'request_timeout',diagnostics:{protocol:'chat_completions',model:'gpt-6.1-sol',reasoningEffort:'high',timeoutMs:240000,elapsedMs:240123,phase:'waiting_response',hasImages:false}},504,'fallback');
  assert.match(result,/应用 HTTP 504/);assert.match(result,/request_timeout/);assert.match(result,/等待上限 240秒/);assert.match(result,/耗时 240.1秒/);assert.match(result,/等待通道响应/);assert.match(result,/high/);
});
test('unsafe duration or stage metadata is never displayed',()=>{
  const result=formatApiFailure({error:'timeout',diagnostics:{timeoutMs:-1,elapsedMs:Infinity,phase:'private-body'}},504,'fallback');assert.ok(!result.includes('private-body'));assert.ok(!result.includes('Infinity'));assert.ok(!result.includes('-1'));
});
