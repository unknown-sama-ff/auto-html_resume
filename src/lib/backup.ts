import { z } from 'zod';
import { versionSchema } from './workspace';
import type { WorkspaceState } from '../types';

export const MAX_BACKUP_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_WORKSPACE_VERSIONS = 50;

export class BackupTooLargeError extends Error {
  readonly includeHistory: boolean;

  constructor(includeHistory = true) {
    super(includeHistory
      ? '完整备份超过 128 MB 限制，较大的照片和编辑历史可能占用过多空间。可尝试下载不含历史和对话的精简备份。'
      : '精简备份已移除编辑历史和对话，仍超过 128 MB 限制。请缩小照片或减少简历版本后重试。');
    this.name = 'BackupTooLargeError';
    this.includeHistory = includeHistory;
  }
}

export function createBackupBlob(workspace: WorkspaceState, includeHistory = true): Blob {
  const content = includeHistory ? workspace : {
    ...workspace,
    versions: workspace.versions.map(version => ({
      ...version,
      past: [],
      future: [],
      history: [],
      messages: [],
    })),
  };
  const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
  if (blob.size > MAX_BACKUP_FILE_BYTES) throw new BackupTooLargeError(includeHistory);
  return blob;
}

const backupVersionSchema = versionSchema.extend({
  id: z.string().min(1).refine(value => Boolean(value.trim())),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  updatedAt: z.string().refine(value => Number.isFinite(Date.parse(value))),
  jobText: z.string().max(50000),
}).strict();
const backupSchema = z.object({
  schemaVersion: z.literal(2),
  activeVersionId: z.string().min(1).nullable(),
  versions: z.array(backupVersionSchema).min(1).max(MAX_WORKSPACE_VERSIONS),
}).strict();

export type BackupImportResult = {
  workspace: WorkspaceState;
  importedCount: number;
  renamedCount: number;
};

export function assertBackupFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('备份文件为空或大小无效，请选择本站下载的 JSON 备份。');
  if (size > MAX_BACKUP_FILE_BYTES) throw new Error('备份文件超过 128 MB 限制，请选择较小的备份。');
}

function assertBackupTextSize(text: string): void {
  // Count UTF-8 bytes without allocating another copy of a potentially large backup.
  if (text.length > MAX_BACKUP_FILE_BYTES) assertBackupFileSize(text.length);
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes > MAX_BACKUP_FILE_BYTES) assertBackupFileSize(bytes);
  }
  assertBackupFileSize(bytes);
}

function assertKnownFields(source: unknown, parsed: unknown): void {
  if (!source || typeof source !== 'object' || !parsed || typeof parsed !== 'object') return;
  for (const key of Object.keys(source)) {
    if (!Object.hasOwn(parsed, key)) throw new Error('备份包含不支持的数据字段，未恢复任何版本。');
    assertKnownFields((source as Record<string, unknown>)[key], (parsed as Record<string, unknown>)[key]);
  }
}

export function prepareBackupImport(raw: unknown): WorkspaceState {
  let value = raw;
  if (typeof raw === 'string') {
    assertBackupTextSize(raw);
    try { value = JSON.parse(raw); }
    catch { throw new Error('备份不是有效的 JSON 文件，请选择本站下载的版本备份。'); }
  }
  if (value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 2) {
    throw new Error('暂不支持此版本的备份文件，请选择在本站下载的简历备份。');
  }
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) throw new Error('备份格式无效、没有简历或数据超出限制，未恢复任何版本。');
  const workspace = parsed.data;
  // Contract schemas add compatibility defaults; reject unknown nested fields rather than silently dropping them.
  assertKnownFields(value, workspace);
  const ids = new Set(workspace.versions.map(version => version.id));
  if (ids.size !== workspace.versions.length) throw new Error('备份包含重复的版本 ID，未恢复任何版本。');
  if (workspace.activeVersionId !== null && !ids.has(workspace.activeVersionId)) {
    throw new Error('备份的当前版本不存在，未恢复任何版本。');
  }
  if (typeof raw !== 'string') assertBackupTextSize(JSON.stringify(workspace));
  return workspace;
}

export function mergeBackupImport(current: WorkspaceState, imported: WorkspaceState): BackupImportResult {
  const backup = prepareBackupImport(imported);
  if (current.versions.length + backup.versions.length > MAX_WORKSPACE_VERSIONS) {
    throw new Error(`本地最多保存 ${MAX_WORKSPACE_VERSIONS} 份简历，剩余 ${Math.max(0, MAX_WORKSPACE_VERSIONS - current.versions.length)} 个位置，备份包含 ${backup.versions.length} 份；未恢复任何版本。`);
  }
  const occupiedIds = new Set(current.versions.map(version => version.id));
  const occupiedTitles = new Set(current.versions.map(version => version.title));
  const importedIds = new Map<string, string>();
  let renamedCount = 0;
  const versions = backup.versions.map(version => {
    let id = version.id;
    let title = version.title;
    if (occupiedIds.has(id)) {
      do { id = crypto.randomUUID(); } while (occupiedIds.has(id));
      const base = `${title} · 恢复副本`;
      title = base;
      let copy = 2;
      while (occupiedTitles.has(title)) title = `${base} ${copy++}`;
      renamedCount += 1;
    }
    importedIds.set(version.id, id);
    occupiedIds.add(id);
    occupiedTitles.add(title);
    return { ...version, id, title };
  });
  const activeVersionId = backup.activeVersionId !== null
    ? importedIds.get(backup.activeVersionId)!
    : current.activeVersionId ?? versions[0].id;
  return {
    workspace: { ...current, activeVersionId, versions: [...current.versions, ...versions] },
    importedCount: versions.length,
    renamedCount,
  };
}
