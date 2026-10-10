import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPresetDefinitions, publicPreset } from '../server/presets.mjs';
import { fallbackPresets } from '../src/data';
import { AUTHOR_PRESET_ID, AUTHOR_PRESET_LABEL, AUTHOR_REASONING_EFFORT, CUSTOM_URL_LABEL } from '../shared/modelOptions';

test('backend and frontend expose one author preset with the exact agreed labels',()=>{
  const definitions=getPresetDefinitions({});
  assert.equal(definitions.length,1);
  assert.equal(definitions[0].id,AUTHOR_PRESET_ID);
  assert.equal(definitions[0].label,'作者预设6.1-sol');
  assert.equal(definitions[0].model,'gpt-6.1-sol');
  assert.equal(definitions[0].baseUrl,'https://cf.api.fan/v1');
  assert.equal(definitions[0].reasoningEffort,'high');
  assert.equal(fallbackPresets.length,1);
  assert.equal(fallbackPresets[0].id,AUTHOR_PRESET_ID);
  assert.equal(fallbackPresets[0].label,AUTHOR_PRESET_LABEL);
  assert.equal(fallbackPresets[0].reasoningEffort,'high');
  assert.equal(CUSTOM_URL_LABEL,'自定义URL');
});

test('legacy provider variables and preset JSON cannot add choices or override the author route',()=>{
  const definitions=getPresetDefinitions({
    OPENAI_API_KEY:'obsolete-key', DEEPSEEK_API_KEY:'obsolete-key',
    AI_PRESETS_JSON:JSON.stringify([{id:'other',label:'Other provider',baseUrl:'https://old.example/v1',model:'old',keyEnv:'OPENAI_API_KEY'}]),
    CF_API_BASE_URL:'https://author.example/v1', CF_API_MODEL:'gpt-6.1-sol',CF_API_KEY:'author-secret-not-to-return',
    CF_API_REASONING_EFFORT:'none',
  });
  assert.equal(definitions.length,1);
  assert.equal(definitions[0].id,'cf-api-fan');
  assert.equal(definitions[0].baseUrl,'https://author.example/v1');
  assert.equal(definitions[0].keyEnv,'CF_API_KEY');
  const metadata=publicPreset(definitions[0]);
  assert.equal(metadata.label,'作者预设6.1-sol');
  assert.equal(metadata.reasoningEffort,'high');
  assert.ok(!('apiKey' in metadata));assert.ok(!('keyEnv' in metadata));
  assert.ok(!JSON.stringify(metadata).includes('author-secret-not-to-return'));
});

test('author reasoning stays high even when legacy environment values request another level',()=>{
  assert.equal(AUTHOR_REASONING_EFFORT,'high');
  for(const value of ['none','minimal','low','medium','xhigh','typo','']){
    const preset=getPresetDefinitions({CF_API_REASONING_EFFORT:value})[0];
    assert.equal(preset.reasoningEffort,'high');
    assert.equal(publicPreset(preset).reasoningEffort,'high');
  }
});
