import { z } from 'zod';
import { resumeSchema, reportSchema } from '../../shared/contracts';
import type { WorkspaceState, ResumeVersion, ResumeData, GenerationResult } from '../types';
const messageSchema = z.object({ id: z.string(), role: z.enum(['assistant', 'user']), content: z.string(), meta: z.string().optional() });
const operationSchema = z.object({ id: z.string(), label: z.string(), source: z.enum(['manual', 'ai', 'restore']), createdAt: z.string(), before: resumeSchema, after: resumeSchema });
export const versionSchema = z.object({
  id: z.string(), title: z.string(), role: z.string(), updatedAt: z.string(), accent: z.string(), status: z.enum(['active', 'draft', 'archived']),
  resume: resumeSchema, messages: z.array(messageSchema).max(200), past: z.array(resumeSchema).max(40), future: z.array(resumeSchema).max(40), history: z.array(operationSchema).max(40),
  jobText: z.string(), profileFileName: z.string(), jobFileName: z.string(), report: reportSchema.nullable(), warnings: z.array(z.string()), isDemo: z.boolean(),
});
const workspaceSchema = z.object({ schemaVersion: z.literal(2), activeVersionId: z.string().nullable(), versions: z.array(versionSchema).max(50) });
export const emptyWorkspace: WorkspaceState = { schemaVersion: 2, activeVersionId: null, versions: [] };
export function makeVersion(result: GenerationResult, details: { jobText?: string; profileFileName?: string; jobFileName?: string; isDemo?: boolean } = {}): ResumeVersion {
  return {
    id: crypto.randomUUID(), title: `${result.resume.name} · ${result.jobTitle}`, role: result.jobTitle, updatedAt: new Date().toISOString(), accent: result.resume.design.accentColor, status: 'active',
    resume: structuredClone(result.resume), messages: [], past: [], future: [], history: [], jobText: details.jobText ?? '', profileFileName: details.profileFileName ?? '', jobFileName: details.jobFileName ?? '', report: result.report, warnings: result.warnings, isDemo: details.isDemo ?? false,
  };
}
export type WorkspaceAction =
  | { type: 'hydrate'; state: WorkspaceState }
  | { type: 'add'; version: ResumeVersion }
  | { type: 'switch'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'commit'; id: string; resume: ResumeData; label: string; source: 'manual' | 'ai' | 'restore' }
  | { type: 'undo' | 'redo'; id: string }
  | { type: 'message'; id: string; message: z.infer<typeof messageSchema> };
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (action.type === 'hydrate') return action.state;
  if (action.type === 'add') return { ...state, activeVersionId: action.version.id, versions: [action.version, ...state.versions] };
  if (action.type === 'switch') return state.versions.some(v => v.id === action.id) ? { ...state, activeVersionId: action.id } : state;
  if (action.type === 'delete') {
    if (!state.versions.some(version => version.id === action.id)) return state;
    const versions = state.versions.filter(version => version.id !== action.id);
    const activeVersionId = versions.some(version => version.id === state.activeVersionId) ? state.activeVersionId : versions[0]?.id ?? null;
    return { ...state, versions, activeVersionId };
  }
  return { ...state, versions: state.versions.map(version => {
    if (version.id !== action.id) return version;
    if (action.type === 'rename') return { ...version, title: action.title.trim() || version.title };
    if (action.type === 'message') return { ...version, messages: [...version.messages, action.message].slice(-200) };
    if (action.type === 'commit') {
      if (JSON.stringify(version.resume) === JSON.stringify(action.resume)) return version;
      const now = new Date().toISOString();
      return { ...version, resume: action.resume, updatedAt: now, past: [...version.past, version.resume].slice(-40), future: [], history: [...version.history, { id: crypto.randomUUID(), label: action.label, source: action.source, createdAt: now, before: version.resume, after: action.resume }].slice(-40) };
    }
    if (action.type === 'undo' && version.past.length) return { ...version, resume: version.past.at(-1)!, past: version.past.slice(0, -1), future: [version.resume, ...version.future].slice(0,40), updatedAt: new Date().toISOString() };
    if (action.type === 'redo' && version.future.length) return { ...version, resume: version.future[0], past: [...version.past, version.resume].slice(-40), future: version.future.slice(1), updatedAt: new Date().toISOString() };
    return version;
  }) };
}
export function migrateWorkspace(raw: unknown): WorkspaceState {
  const current = workspaceSchema.safeParse(raw);
  if (current.success) return { ...current.data, activeVersionId: current.data.versions.some(v => v.id === current.data.activeVersionId) ? current.data.activeVersionId : current.data.versions[0]?.id ?? null };
  // V1 stored only one document, or an optional per-version map. Never invent missing historical documents.
  if (!raw || typeof raw !== 'object' || !('resume' in raw)) return structuredClone(emptyWorkspace);
  const oldResume = resumeSchema.safeParse(raw.resume);
  if (!oldResume.success) return structuredClone(emptyWorkspace);
  const id = 'activeVersionId' in raw && typeof raw.activeVersionId === 'string' ? raw.activeVersionId : 'legacy';
  const docs: Record<string, unknown> = 'resumeByVersion' in raw && raw.resumeByVersion && typeof raw.resumeByVersion === 'object' ? { ...raw.resumeByVersion } : {};
  docs[id] = oldResume.data;
  const versions = Object.entries(docs).flatMap(([oldId, document]) => {
    const parsed = resumeSchema.safeParse(document);
    if (!parsed.success) return [];
    const restored = makeVersion({ resume: parsed.data, jobTitle: parsed.data.role || '旧版简历', report: { summary: '旧版未保存实际岗位分析，请用新资料重新生成。', requirements: [] }, warnings: [] });
    return [{ ...restored, id: oldId, title: `${parsed.data.name} · 旧版恢复`, report: null }];
  });
  return { schemaVersion: 2, versions, activeVersionId: id };
}
