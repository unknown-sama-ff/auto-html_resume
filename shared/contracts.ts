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
  return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
}
export const editPatchSchema = z.object({
  id: z.string().max(100), targetNodeId: z.string().max(100), operation: z.enum(['setStyle','rewriteText','setTheme']), path: z.string().max(100),
  value: z.union([z.string().max(6000),z.number(),z.boolean()]), reason: z.string().max(2000), requiresConfirmation: z.boolean(), preview: z.string().max(2000),
});
