import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VOICE_CONSENT_STORAGE_KEY,
  VOICE_CONSENT_VERSION,
  hasVoiceConsent,
  mapVoiceRecognitionError,
  replaceTextSelection,
  saveVoiceConsent,
  transcriptFromResults,
} from '../src/lib/voiceInput';

test('voice text replacement inserts at the caret and replaces a selection', () => {
  assert.equal(replaceTextSelection('姓名：张雨', 3, 3, '李明'), '姓名：李明张雨');
  assert.equal(replaceTextSelection('岗位：数据分析师', 3, 8, '产品经理'), '岗位：产品经理');
  assert.equal(replaceTextSelection('abc', -4, 99, 'x'), 'x');
});

test('voice transcript separates final and interim results', () => {
  const results = [
    { isFinal: true, 0: { transcript: '第一句' } },
    { isFinal: false, 0: { transcript: '第二句' } },
  ];
  assert.deepEqual(transcriptFromResults(results), { final: '第一句', interim: '第二句' });
});

test('voice errors remain actionable and localized', () => {
  assert.match(mapVoiceRecognitionError('not-allowed'), /麦克风/);
  assert.match(mapVoiceRecognitionError('no-speech'), /没有听到/);
  assert.match(mapVoiceRecognitionError('audio-capture'), /找不到麦克风/);
  assert.match(mapVoiceRecognitionError('unsupported'), /不支持/);
});

test('voice consent uses a versioned storage marker', () => {
  const values = new Map<string, string>();
  const storage: Storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => { values.clear(); },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  assert.equal(hasVoiceConsent(storage), false);
  assert.equal(saveVoiceConsent(storage), true);
  assert.equal(values.get(VOICE_CONSENT_STORAGE_KEY), VOICE_CONSENT_VERSION);
  assert.equal(hasVoiceConsent(storage), true);
});
