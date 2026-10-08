import { z } from 'zod';
const shortText = z.string().max(3000);
const lines = z.array(shortText).max(30);
export const nodeStyleSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  fontSize: z.number().min(8).max(48).optional(),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
  marginBottom: z.number().min(0).max(40).optional(), accent: z.boolean().optional(),
});
export const designSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#D96945'),
  inkColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#263633'),
  paperColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#FBF8F1'),
  sectionGap: z.number().min(12).max(36).default(24),
  avatarShape: z.enum(['circle', 'square']).default('circle'),
});
export const resumeSchema = z.object({
  name: z.string().min(1).max(120), role: z.string().max(200),
  location: z.string().max(200).default(''), email: z.string().max(200).default(''),
  phone: z.string().max(100).default(''), website: z.string().max(500).default(''),
  avatarDataUrl: z.string().max(3000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
  summary: z.string().max(6000).default(''),
  skills: z.array(z.object({ label: z.string().max(200), level: z.string().max(40).default('') })).max(30).default([]),
  projects: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9-]+$/).max(80), title: shortText, meta: shortText.default(''), description: lines, stack: z.array(z.string().max(100)).max(15).default([]) })).max(12).default([]),
  experience: z.array(z.object({ company: shortText, role: shortText, period: z.string().max(100), bullets: lines })).max(12).default([]),
  education: z.array(z.object({ school: shortText, degree: shortText, period: z.string().max(100) })).max(8).default([]),
  awards: lines.default([]), design: designSchema.default(() => designSchema.parse({})),
  nodeStyles: z.record(z.string().regex(/^[a-zA-Z0-9-]+$/).max(100), nodeStyleSchema).default({}),
});
export const reportSchema = z.object({
  summary: z.string().max(4000),
  requirements: z.array(z.object({ requirement: z.string().max(500), status: z.enum(['matched', 'partial', 'missing']), evidence: z.string().max(2000), suggestion: z.string().max(2000).default('') })).max(20),
});
export const generationSchema = z.object({ resume: resumeSchema, jobTitle: z.string().min(1).max(200), report: reportSchema, warnings: z.array(z.string().max(1000)).max(20).default([]) });
export const materialSchema = z.object({ name: z.string().max(200), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']), dataUrl: z.string().max(2800000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/) });
export const modelConfigSchema = z.object({ mode: z.enum(['preset', 'custom']), presetId: z.string().max(100), url: z.string().max(2000).default(''), model: z.string().max(200).default(''), apiKey: z.string().max(2000).optional() });
export const generationRequestSchema = z.object({ profileText: z.string().max(50000), jobText: z.string().max(50000), profileImages: z.array(materialSchema).max(1).default([]), jobImages: z.array(materialSchema).max(1).default([]), config: modelConfigSchema }).refine(v => Boolean(v.profileText.trim() || v.profileImages.length) && Boolean(v.jobText.trim() || v.jobImages.length), '请提供个人资料和岗位要求');
export function parseModelJson(content: string): unknown {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(text); } catch {
    // Compatible gateways sometimes add a sentence before/after an otherwise
    // valid JSON response. Extract one complete object without evaluating any
    // returned code or HTML.
    const start = text.indexOf('{');
    if (start < 0) throw new Error('模型没有返回JSON对象');
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return JSON.parse(text.slice(start, index + 1));
      }
    }
    throw new Error('模型返回的JSON不完整');
  }
}

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n+/) : []; }
function textValue(value: unknown, max: number, fallback = '') {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return fallback;
  return String(value).trim().slice(0, max);
}
function linesValue(value: unknown, maxItems = 30) {
  return asArray(value).map(item => textValue(item, 3000)).filter(Boolean).slice(0, maxItems);
}
function colorValue(value: unknown) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined; }
function numberValue(value: unknown, min: number, max: number) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined; }

function normalizeDesign(value: unknown) {
  const source = asObject(value);
  return {
    ...(colorValue(source.accentColor) ? { accentColor: source.accentColor } : {}),
    ...(colorValue(source.inkColor) ? { inkColor: source.inkColor } : {}),
    ...(colorValue(source.paperColor) ? { paperColor: source.paperColor } : {}),
    ...(numberValue(source.sectionGap, 12, 36) !== undefined ? { sectionGap: source.sectionGap } : {}),
    ...(source.avatarShape === 'circle' || source.avatarShape === 'square' ? { avatarShape: source.avatarShape } : {}),
  };
}

function normalizeNodeStyles(value: unknown) {
  const source = asObject(value); const result: JsonObject = {};
  for (const [id, raw] of Object.entries(source)) {
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) continue;
    const style = asObject(raw); const safe: JsonObject = {};
    const color = colorValue(style.color); if (color) safe.color = color;
    const fontSize = numberValue(style.fontSize, 8, 48); if (fontSize !== undefined) safe.fontSize = fontSize;
    if ([400, 500, 600, 700, 800].includes(style.fontWeight as number)) safe.fontWeight = style.fontWeight;
    const marginBottom = numberValue(style.marginBottom, 0, 40); if (marginBottom !== undefined) safe.marginBottom = marginBottom;
    if (typeof style.accent === 'boolean') safe.accent = style.accent;
    if (Object.keys(safe).length) result[id] = safe;
  }
  return result;
}

function normalizeResume(value: unknown) {
  const source = asObject(value); const rawProjects = asArray(source.projects); const seen = new Set<string>();
  const projects = rawProjects.slice(0, 12).map((raw, index) => {
    const item = asObject(raw); let id = textValue(item.id, 80).replace(/[^a-zA-Z0-9-]/g, '-');
    if (!id || seen.has(id)) id = `project-${index + 1}`; seen.add(id);
    return { id, title: textValue(item.title, 3000, '未命名项目'), meta: textValue(item.meta, 3000), description: linesValue(item.description), stack: linesValue(item.stack, 15).map(value => value.slice(0, 100)) };
  });
  const skills = asArray(source.skills).slice(0, 30).map(raw => {
    const item = asObject(raw); return typeof raw === 'string' ? { label: textValue(raw, 200), level: '' } : { label: textValue(item.label, 200), level: textValue(item.level, 40) };
  }).filter(item => item.label);
  const experience = asArray(source.experience).slice(0, 12).map(raw => { const item = asObject(raw); return { company: textValue(item.company, 3000), role: textValue(item.role, 3000), period: textValue(item.period, 100), bullets: linesValue(item.bullets) }; });
  const education = asArray(source.education).slice(0, 8).map(raw => { const item = asObject(raw); return { school: textValue(item.school, 3000), degree: textValue(item.degree, 3000), period: textValue(item.period, 100) }; });
  return {
    name: textValue(source.name, 120, '待补充') || '待补充', role: textValue(source.role, 200), location: textValue(source.location, 200), email: textValue(source.email, 200), phone: textValue(source.phone, 100), website: textValue(source.website, 500),
    summary: textValue(source.summary, 6000), skills, projects, experience, education, awards: linesValue(source.awards), design: normalizeDesign(source.design), nodeStyles: normalizeNodeStyles(source.nodeStyles),
  };
}

export function normalizeGenerationPayload(value: unknown) {
  const root = asObject(value); const source = asObject(root.resume);
  const reportSource = asObject(root.report); const requirements = asArray(reportSource.requirements).slice(0, 20).map(raw => { const item = asObject(raw); const status = item.status === 'matched' || item.status === 'partial' || item.status === 'missing' ? item.status : 'partial'; return { requirement: textValue(item.requirement, 500), status, evidence: textValue(item.evidence, 2000), suggestion: textValue(item.suggestion, 2000) }; }).filter(item => item.requirement);
  return {
    jobTitle: textValue(root.jobTitle, 200, textValue(source.role, 200, '目标岗位')) || '目标岗位',
    resume: normalizeResume(Object.keys(source).length ? source : root),
    report: { summary: textValue(reportSource.summary, 4000), requirements },
    warnings: linesValue(root.warnings, 20).map(value => value.slice(0, 1000)),
  };
}
export const editPatchSchema = z.object({
  id: z.string().max(100), targetNodeId: z.string().max(100), operation: z.enum(['setStyle','rewriteText','setTheme']), path: z.string().max(100),
  value: z.union([z.string().max(6000),z.number(),z.boolean()]), reason: z.string().max(2000), requiresConfirmation: z.boolean(), preview: z.string().max(2000),
});
