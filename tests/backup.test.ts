import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialResume } from '../src/data';
import { emptyWorkspace, makeVersion, workspaceReducer } from '../src/lib/workspace';
import { assertBackupFileSize, BackupTooLargeError, createBackupBlob, MAX_BACKUP_FILE_BYTES, MAX_WORKSPACE_VERSIONS, mergeBackupImport, prepareBackupImport } from '../src/lib/backup';
import type { WorkspaceState } from '../src/types';

function workspace(count = 1): WorkspaceState {
  const versions = Array.from({ length: count }, (_, index) => {
    const version = makeVersion({ resume: initialResume, jobTitle: `岗位 ${index + 1}`, report: { summary: '岗位分析', requirements: [] }, warnings: ['核对真实经历'] }, { profileText: '姓名：张雨\n项目：整理周报', jobText: '岗位：分析师', profileFileName: 'resume.txt', jobFileName: 'job.txt' });
    version.messages = [{ id: 'message', role: 'user', content: '请保留真实事实。', meta: '项目' }];
    return version;
  });
  return { schemaVersion: 2, versions, activeVersionId: versions.at(-1)?.id ?? null };
}

function workspaceWithHistory(count = 1): WorkspaceState {
  let original = workspace(count);
  for (const [index, id] of original.versions.map(version => version.id).entries()) {
    const version = original.versions.find(candidate => candidate.id === id)!;
    original = workspaceReducer(original, {
      type: 'commit', id,
      resume: { ...version.resume, name: `岗位姓名 ${index + 1}`, avatarDataUrl: 'data:image/png;base64,AA==', design: { ...version.resume.design, accentColor: '#445566', avatarScale: 1.5 } },
      label: '更新姓名、照片与设计', source: 'manual',
    });
    const current = original.versions.find(candidate => candidate.id === id)!;
    original = workspaceReducer(original, { type: 'commit', id, resume: { ...current.resume, name: '撤销的姓名' }, label: '修改姓名', source: 'manual' });
    original = workspaceReducer(original, { type: 'undo', id });
  }
  return original;
}

test('full exported Blob roundtrips every version and its material, design, photo and history', async () => {
  const original = workspaceWithHistory(2);
  const snapshot = structuredClone(original);
  const blob = createBackupBlob(original);
  assert.equal(blob.type, 'application/json');
  assert.equal(blob.size, Buffer.byteLength(JSON.stringify(original)));
  assert.deepEqual(prepareBackupImport(await blob.text()), JSON.parse(JSON.stringify(original)));
  assert.deepEqual(original, snapshot);
});

test('compact export removes all snapshots and dialogue while preserving every current field without mutation', async () => {
  const original = workspaceWithHistory(2);
  const snapshot = structuredClone(original);
  for (const version of original.versions) {
    for (const field of ['past', 'future', 'history', 'messages'] as const) assert.ok(version[field].length > 0);
  }
  const blob = createBackupBlob(original, false);
  const restored = prepareBackupImport(await blob.text());
  const expected = {
    ...snapshot,
    versions: snapshot.versions.map(version => ({ ...version, past: [], future: [], history: [], messages: [] })),
  };
  assert.deepEqual(restored, JSON.parse(JSON.stringify(expected)));
  assert.equal(restored.activeVersionId, original.activeVersionId);
  assert.ok(blob.size < createBackupBlob(original).size);
  assert.deepEqual(original, snapshot);
});

test('full export rejects measured Blob sizes above 128 MB and compact export can fit exactly at the limit', async () => {
  const original = workspaceWithHistory();
  const snapshot = structuredClone(original);
  const NativeBlob = globalThis.Blob;
  class MeasuredBlob extends NativeBlob {
    readonly measuredSize: number;
    constructor(parts: BlobPart[] = [], options: BlobPropertyBag = {}) {
      super(parts, options);
      const content = JSON.parse(String(parts[0])) as WorkspaceState;
      this.measuredSize = content.versions.some(version => version.history.length > 0)
        ? MAX_BACKUP_FILE_BYTES + 1
        : MAX_BACKUP_FILE_BYTES;
    }
    override get size(): number { return this.measuredSize; }
  }
  let compact: Blob;
  globalThis.Blob = MeasuredBlob;
  try {
    assert.throws(() => createBackupBlob(original), error => {
      assert.ok(error instanceof BackupTooLargeError);
      assert.equal(error.includeHistory, true);
      assert.match(error.message, /128 MB.*照片.*编辑历史/);
      return true;
    });
    compact = createBackupBlob(original, false);
    assert.equal(compact.size, MAX_BACKUP_FILE_BYTES);
  } finally {
    globalThis.Blob = NativeBlob;
  }
  assert.deepEqual(prepareBackupImport(await compact.text()).versions[0].resume, original.versions[0].resume);
  assert.deepEqual(original, snapshot);
});

test('compact export also rejects excessive measured size and explains that history and dialogue are already removed', () => {
  const original = workspaceWithHistory(2);
  const snapshot = structuredClone(original);
  const NativeBlob = globalThis.Blob;
  class OversizedBlob extends NativeBlob {
    override get size(): number { return MAX_BACKUP_FILE_BYTES + 1; }
  }
  globalThis.Blob = OversizedBlob;
  try {
    assert.throws(() => createBackupBlob(original, false), error => {
      assert.ok(error instanceof BackupTooLargeError);
      assert.equal(error.includeHistory, false);
      assert.match(error.message, /已移除编辑历史和对话，仍超过 128 MB/);
      return true;
    });
  } finally {
    globalThis.Blob = NativeBlob;
  }
  assert.deepEqual(original, snapshot);
});

test('ordinary export serialization failures are not reported as backup size failures', () => {
  const original = workspace();
  Object.defineProperty(original, 'circular', { value: original, enumerable: true });
  assert.throws(() => createBackupBlob(original), error => error instanceof TypeError && !(error instanceof BackupTooLargeError));
});

test('backup validation roundtrip preserves personal material, photo, edits and independent snapshots', () => {
  let original = workspace(2);
  const id = original.versions[1].id;
  original = workspaceReducer(original, { type: 'commit', id, resume: { ...original.versions[1].resume, name: '已编辑姓名', avatarDataUrl: 'data:image/png;base64,AA==' }, label: '更新姓名和头像', source: 'manual' });
  original = workspaceReducer(original, { type: 'undo', id });
  const restored = prepareBackupImport(JSON.stringify(original));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(original)));
  restored.versions[1].messages[0].content = '导入后的对话';
  restored.versions[1].history[0].after.name = '导入后的姓名';
  restored.versions[1].future[0].design.accentColor = '#112233';
  assert.equal(original.versions[1].messages[0].content, '请保留真实事实。');
  assert.equal(original.versions[1].history[0].after.name, '已编辑姓名');
  assert.notEqual(original.versions[1].future[0].design.accentColor, '#112233');
});

test('older schema 2 fields receive current defaults in documents and history without losing versions', () => {
  const original = workspace();
  const version = original.versions[0];
  const edited = workspaceReducer(original, { type: 'commit', id: version.id, resume: { ...version.resume, name: '另一姓名' }, label: '修改姓名', source: 'manual' });
  const raw = JSON.parse(JSON.stringify(edited));
  delete raw.versions[0].profileText;
  for (const resume of [raw.versions[0].resume, raw.versions[0].past[0], raw.versions[0].history[0].before, raw.versions[0].history[0].after]) {
    delete resume.customSections;
    delete resume.design.templateId;
    delete resume.design.avatarScale;
  }
  const restored = prepareBackupImport(raw);
  assert.equal(restored.versions.length, 1);
  assert.equal(restored.versions[0].profileText, '');
  assert.deepEqual(restored.versions[0].resume.customSections, []);
  assert.equal(restored.versions[0].history[0].after.name, '另一姓名');
  assert.equal(restored.versions[0].history[0].after.design.templateId, 'minimal');
  assert.equal(restored.versions[0].past[0].design.avatarScale, 1);
});

test('invalid JSON, unsupported schemas, empty and malformed backups throw instead of falling back', () => {
  for (const invalid of ['', 'not JSON', '```json\n{}\n```', null, {}, [], 42, { ...workspace(), schemaVersion: 1 }, { ...workspace(), schemaVersion: 3 }, emptyWorkspace]) {
    assert.throws(() => prepareBackupImport(invalid));
  }
  const wrongRoot = { ...workspace(), unexpected: 'not a workspace field' };
  assert.throws(() => prepareBackupImport(wrongRoot));
  const unknownNested = JSON.parse(JSON.stringify(workspace()));
  unknownNested.versions[0].resume.design.unsupportedLayout = 'external CSS';
  assert.throws(() => prepareBackupImport(unknownNested), /不支持的数据字段/);
  const partial = workspace();
  const raw = JSON.parse(JSON.stringify(partial));
  delete raw.versions[0].resume.name;
  assert.throws(() => prepareBackupImport(raw));
  raw.versions[0].resume.name = '张雨';
  raw.versions[0].resume.nodeStyles = { 'profile-name': { color: 'url(https://example.test/pixel)' } };
  assert.throws(() => prepareBackupImport(raw));
  raw.versions[0].resume.nodeStyles = {};
  raw.versions[0].accent = 'url(https://example.test/pixel)';
  assert.throws(() => prepareBackupImport(raw));
});

test('all imported documents and every history snapshot must validate', () => {
  const original = workspace(2);
  const id = original.versions[1].id;
  const edited = workspaceReducer(original, { type: 'commit', id, resume: { ...original.versions[1].resume, name: '修改后' }, label: '修改姓名', source: 'manual' });
  for (const change of [
    (raw: WorkspaceState) => { raw.versions[1].resume.name = ''; },
    (raw: WorkspaceState) => { raw.versions[1].past[0].name = ''; },
    (raw: WorkspaceState) => { raw.versions[1].history[0].after.design.sectionGap = 100; },
    (raw: WorkspaceState) => { raw.versions[1].updatedAt = 'not a date'; },
  ]) {
    const raw = structuredClone(edited);
    change(raw);
    assert.throws(() => prepareBackupImport(raw));
  }
});

test('duplicate backup IDs and dangling active versions are rejected before merge', () => {
  const duplicate = workspace(2);
  duplicate.versions[1].id = duplicate.versions[0].id;
  duplicate.activeVersionId = duplicate.versions[0].id;
  assert.throws(() => prepareBackupImport(duplicate), /重复/);
  const dangling = workspace();
  dangling.activeVersionId = 'missing-version';
  assert.throws(() => prepareBackupImport(dangling), /当前版本不存在/);
});

test('per-document and per-workspace limits reject the entire backup', () => {
  assert.throws(() => prepareBackupImport(workspace(MAX_WORKSPACE_VERSIONS + 1)));
  const original = workspace();
  const tooManyMessages = structuredClone(original);
  tooManyMessages.versions[0].messages = Array.from({ length: 201 }, () => original.versions[0].messages[0]);
  assert.throws(() => prepareBackupImport(tooManyMessages));
  const tooMuchHistory = structuredClone(original);
  tooMuchHistory.versions[0].past = Array.from({ length: 41 }, () => original.versions[0].resume);
  assert.throws(() => prepareBackupImport(tooMuchHistory));
  const excessiveMaterial = structuredClone(original);
  excessiveMaterial.versions[0].profileText = '字'.repeat(50001);
  assert.throws(() => prepareBackupImport(excessiveMaterial));
  excessiveMaterial.versions[0].profileText = '';
  excessiveMaterial.versions[0].jobText = '岗'.repeat(50001);
  assert.throws(() => prepareBackupImport(excessiveMaterial));
});

test('128 MB file limit is checked before reading and oversized JSON text cannot be parsed', () => {
  assert.equal(MAX_BACKUP_FILE_BYTES, 128 * 1024 * 1024);
  assert.doesNotThrow(() => assertBackupFileSize(MAX_BACKUP_FILE_BYTES));
  for (const size of [0, -1, 0.5, NaN, Infinity, MAX_BACKUP_FILE_BYTES + 1]) assert.throws(() => assertBackupFileSize(size));
  assert.throws(() => prepareBackupImport(' '.repeat(MAX_BACKUP_FILE_BYTES + 1)), /128 MB/);
  assert.throws(() => prepareBackupImport('字'.repeat(Math.floor(MAX_BACKUP_FILE_BYTES / 3) + 1)), /128 MB/);
});

test('merging appends imported versions, restores their active document and preserves existing histories', () => {
  let current = workspace();
  const currentId = current.versions[0].id;
  current = workspaceReducer(current, { type: 'commit', id: currentId, resume: { ...current.versions[0].resume, name: '当前保留的简历' }, label: '保留的修改', source: 'manual' });
  const imported = workspace(2);
  const snapshot = structuredClone(current);
  const result = mergeBackupImport(current, imported);
  assert.equal(result.importedCount, 2);
  assert.equal(result.renamedCount, 0);
  assert.equal(result.workspace.activeVersionId, imported.activeVersionId);
  assert.equal(result.workspace.versions[0], current.versions[0]);
  assert.deepEqual(result.workspace.versions.slice(1), imported.versions);
  assert.deepEqual(current, snapshot);
  result.workspace.versions[1].messages[0].content = '恢复后修改';
  assert.equal(imported.versions[0].messages[0].content, '请保留真实事实。');
});

test('ID collisions create named copies, remap imported active version, and support repeated restoration', () => {
  const original = workspace(2);
  const snapshot = structuredClone(original);
  const first = mergeBackupImport(original, original);
  assert.equal(first.renamedCount, 2);
  assert.equal(new Set(first.workspace.versions.map(version => version.id)).size, 4);
  assert.equal(first.workspace.activeVersionId, first.workspace.versions[3].id);
  for (let index = 0; index < 2; index += 1) {
    const restored = first.workspace.versions[index + 2];
    assert.notEqual(restored.id, original.versions[index].id);
    assert.equal(restored.title, `${original.versions[index].title} · 恢复副本`);
    assert.deepEqual({ ...restored, id: original.versions[index].id, title: original.versions[index].title }, original.versions[index]);
  }
  const second = mergeBackupImport(first.workspace, original);
  assert.equal(second.importedCount, 2);
  assert.equal(second.renamedCount, 2);
  assert.equal(second.workspace.versions[4].title, `${original.versions[0].title} · 恢复副本 2`);
  assert.equal(new Set(second.workspace.versions.map(version => version.id)).size, 6);
  assert.deepEqual(original, snapshot);
});

test('insufficient capacity rejects every imported version and leaves current state unchanged', () => {
  const current = workspace(MAX_WORKSPACE_VERSIONS - 1);
  const snapshot = structuredClone(current);
  assert.throws(() => mergeBackupImport(current, workspace(2)), /剩余 1 个位置.*备份包含 2 份/);
  assert.deepEqual(current, snapshot);
  const exact = mergeBackupImport(current, workspace());
  assert.equal(exact.workspace.versions.length, MAX_WORKSPACE_VERSIONS);
});

test('a backup with no active selection preserves the current selection or selects its first imported version', () => {
  const current = workspace();
  const imported = workspace(2);
  imported.activeVersionId = null;
  assert.equal(mergeBackupImport(current, imported).workspace.activeVersionId, current.activeVersionId);
  const restored = mergeBackupImport(emptyWorkspace, imported);
  assert.equal(restored.workspace.activeVersionId, restored.workspace.versions[0].id);
});
