import { z } from 'zod';
import { TEMPLATE_IDS, FONT_IDS, DENSITY_IDS, HEADING_IDS, templateDesign } from './design.ts';
const shortText = z.string().max(3000);
const lines = z.array(shortText).max(30);
export const nodeStyleSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  fontSize: z.number().min(8).max(48).optional(),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
  marginBottom: z.number().min(0).max(40).optional(), accent: z.boolean().optional(),
});
export const designSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS).default('minimal'),
  fontFamily: z.enum(FONT_IDS).default('sans'),
  density: z.enum(DENSITY_IDS).default('comfortable'),
  headingStyle: z.enum(HEADING_IDS).default('accent'),
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
  customSections: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9-]+$/).max(80), title: z.string().min(1).max(200), items: lines })).max(30).default([]),
  nodeStyles: z.record(z.string().regex(/^[a-zA-Z0-9-]+$/).max(100), nodeStyleSchema).default({}),
});
export const reportSchema = z.object({
  summary: z.string().max(4000),
  requirements: z.array(z.object({ requirement: z.string().max(500), status: z.enum(['matched', 'partial', 'missing']), evidence: z.string().max(2000), suggestion: z.string().max(2000).default('') })).max(20),
});
export const generationSchema = z.object({ resume: resumeSchema, jobTitle: z.string().min(1).max(200), report: reportSchema, warnings: z.array(z.string().max(1000)).max(20).default([]) });
export const materialSchema = z.object({ name: z.string().max(200), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']), dataUrl: z.string().max(2800000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/) });
export const modelConfigSchema = z.object({ mode: z.enum(['preset', 'custom']), presetId: z.string().max(100), url: z.string().max(2000).default(''), model: z.string().max(200).default(''), apiKey: z.string().max(2000).optional() });
export const generationRequestSchema = z.object({ profileText: z.string().max(50000), jobText: z.string().max(50000), templateId: z.enum(['auto', ...TEMPLATE_IDS]).default('auto'), profileImages: z.array(materialSchema).max(1).default([]), jobImages: z.array(materialSchema).max(1).default([]), config: modelConfigSchema }).refine(v => Boolean(v.profileText.trim() || v.profileImages.length) && Boolean(v.jobText.trim() || v.jobImages.length), '请提供个人资料和岗位要求');
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
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/\r?\n+/);
  return value && typeof value === 'object' ? [value] : [];
}
function textValue(value: unknown, max: number, fallback = '') {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return fallback;
  return String(value).trim().slice(0, max);
}
function firstValue(source: JsonObject, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}
function textField(source: JsonObject, keys: string[], max: number, fallback = '') {
  return textValue(firstValue(source, keys), max, fallback);
}
function linesValue(value: unknown, maxItems = 30) {
  return asArray(value).map(item => {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return textValue(item, 3000);
    const source = asObject(item);
    return textField(source, ['text', 'content', 'value', 'name', 'title', 'label', 'description', 'detail', 'item', '名称', '标题', '内容', '描述'], 3000);
  }).filter(Boolean).slice(0, maxItems);
}
function colorValue(value: unknown) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined; }
function numberValue(value: unknown, min: number, max: number) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined; }

function normalizeDesign(value: unknown) {
  const source = asObject(value);
  return {
    ...(TEMPLATE_IDS.includes(source.templateId as typeof TEMPLATE_IDS[number]) ? templateDesign(source.templateId as typeof TEMPLATE_IDS[number]) : {}),
    ...(TEMPLATE_IDS.includes(source.templateId as typeof TEMPLATE_IDS[number]) ? { templateId: source.templateId } : {}),
    ...(FONT_IDS.includes(source.fontFamily as typeof FONT_IDS[number]) ? { fontFamily: source.fontFamily } : {}),
    ...(DENSITY_IDS.includes(source.density as typeof DENSITY_IDS[number]) ? { density: source.density } : {}),
    ...(HEADING_IDS.includes(source.headingStyle as typeof HEADING_IDS[number]) ? { headingStyle: source.headingStyle } : {}),
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

function splitRecordText(value: string) {
  return value.split(/\r?\n+/).map(item => item.trim()).filter(Boolean);
}

function normalizeProject(raw: unknown, index: number, seen: Set<string>) {
  const source = asObject(raw);
  const parts = typeof raw === 'string' ? splitRecordText(raw) : [];
  let id = textField(source, ['id', 'key', '编号'], 80).replace(/[^a-zA-Z0-9-]/g, '-');
  if (!id || seen.has(id)) id = `project-${index + 1}`;
  let suffix = 1;
  while (seen.has(id)) id = `project-${index + 1}-${suffix++}`;
  seen.add(id);
  const title = textField(source, ['title', 'name', 'project', 'projectName', '项目', '项目名称'], 3000, parts[0] ?? '');
  const meta = textField(source, ['meta', 'role', 'type', 'category', '项目类型', '角色'], 3000, parts[1] ?? '');
  const description = linesValue(firstValue(source, ['description', 'descriptions', 'bullets', 'details', 'content', '项目描述', '项目内容']) ?? parts.slice(2));
  const stack = linesValue(firstValue(source, ['stack', 'skills', 'tools', 'technologies', '技术栈', '工具']) ?? []).slice(0, 15).map(value => value.slice(0, 100));
  if (!title && !meta && !description.length && !stack.length) return null;
  return { id, title: title || '未命名项目', meta, description, stack };
}

function normalizeExperience(raw: unknown) {
  const source = asObject(raw);
  const parts = typeof raw === 'string' ? splitRecordText(raw) : [];
  const header = parts[0] ?? '';
  const headerParts = header.split(/\s*[|｜]\s*/).filter(Boolean);
  const company = textField(source, ['company', 'organization', 'organisation', 'org', 'employer', 'unit', '单位', '组织', '机构', '公司'], 3000, headerParts[0] ?? header);
  const role = textField(source, ['role', 'position', 'jobTitle', 'title', 'department', '职务', '岗位', '职位', '部门'], 3000, headerParts[1] ?? '');
  const period = textField(source, ['period', 'time', 'date', 'duration', 'dates', '在职时间', '任职时间', '时间', '日期'], 100, parts.find(item => /(?:19|20)\d{2}/.test(item)) ?? '');
  const bullets = linesValue(firstValue(source, ['bullets', 'description', 'details', 'responsibilities', 'content', '工作内容', '职责', '经历']) ?? parts.slice(1).filter(item => item !== period));
  if (!company && !role && !period && !bullets.length) return null;
  return { company, role, period, bullets };
}

function normalizeEducation(raw: unknown) {
  const source = asObject(raw);
  const parts = typeof raw === 'string' ? splitRecordText(raw) : [];
  const period = textField(source, ['period', 'time', 'date', 'duration', 'dates', 'studyPeriod', '在校时间', '就读时间', '时间', '日期'], 100, parts.find(item => /(?:19|20)\d{2}/.test(item)) ?? '');
  const school = textField(source, ['school', 'schoolName', 'university', 'institution', 'college', 'academy', '学校', '学校名称', '院校', '大学'], 3000, parts[0] ?? '');
  const degree = textField(source, ['degree', 'major', 'field', 'education', 'majorAndDegree', '学历', '学位', '专业', '专业与学历'], 3000, parts.slice(1).filter(item => item !== period).join(' | '));
  if (!school && !degree && !period) return null;
  return { school, degree, period };
}

function normalizeResume(value: unknown) {
  const source = asObject(value); const rawProjects = asArray(firstValue(source, ['projects', 'projectExperience', '项目经历', '项目经验'])); const seen = new Set<string>();
  const projects = rawProjects.slice(0, 12).map((raw, index) => normalizeProject(raw, index, seen)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const skills = asArray(source.skills).slice(0, 30).map(raw => {
    const item = asObject(raw); return typeof raw === 'string' ? { label: textValue(raw, 200), level: '' } : { label: textField(item, ['label', 'name', 'skill', '技能', '技能名称'], 200), level: textField(item, ['level', 'proficiency', '熟练度', '掌握程度'], 40) };
  }).filter(item => item.label);
  const experience = asArray(firstValue(source, ['experience', 'workExperience', 'internships', 'employment', '工作经历', '实习经历'])).slice(0, 12).map(normalizeExperience).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const education = asArray(firstValue(source, ['education', 'educationExperience', 'academicBackground', '教育背景', '教育经历'])).slice(0, 8).map(normalizeEducation).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const customSeen = new Set<string>();
  const customSections = asArray(firstValue(source, ['customSections', 'extraSections', '自定义栏目', '其他栏目'])).map((raw, index) => {
    const item = asObject(raw);
    let id = textField(item, ['id'], 80).replace(/[^a-zA-Z0-9-]/g, '-');
    if (!id || customSeen.has(id)) id = `extra-${index + 1}`;
    let suffix = 1;
    while (customSeen.has(id)) id = `extra-${index + 1}-${suffix++}`;
    customSeen.add(id);
    return { id, title: textField(item, ['title', 'name', 'heading', '标题', '名称'], 200, '补充信息'), items: linesValue(firstValue(item, ['items', 'bullets', 'content', 'text', '内容'])) };
  }).filter(item => item.items.length);
  for (const [key, title] of Object.entries({ courses: '学校课程', languages: '语言能力', publications: '出版与发表', research: '研究经历', volunteering: '志愿服务', interests: '兴趣与特长', additionalInfo: '补充信息' })) {
    const items = linesValue(source[key]);
    if (items.length && !customSections.some(item => item.title === title)) customSections.push({ id: `extra-${key}`, title, items });
  }
  const knownFields = new Set(['name','fullName','姓名','role','targetRole','desiredPosition','求职意向','目标岗位','location','city','所在地','城市','email','邮箱','phone','mobile','telephone','电话','手机','website','github','portfolio','网址','作品链接','summary','profile','overview','个人简介','个人概述','skills','projects','projectExperience','项目经历','项目经验','experience','workExperience','internships','employment','工作经历','实习经历','education','educationExperience','academicBackground','教育背景','教育经历','awards','certificates','honors','achievements','获奖','获奖情况','证书','customSections','extraSections','自定义栏目','其他栏目','courses','languages','publications','research','volunteering','interests','additionalInfo','design','nodeStyles','avatarDataUrl','resume','report','jobTitle','warnings','html','css','script','style','styles','layout']);
  for (const [key,value] of Object.entries(source)) {
    if (knownFields.has(key) || value == null) continue;
    const items=asArray(typeof value==='object'&&!Array.isArray(value)?[value]:value).map(item=>typeof item==='object'?JSON.stringify(item):String(item)).filter(item=>item&&item!=='{}').map(item=>item.slice(0,3000)).slice(0,30);
    if(items.length)customSections.push({id:`extra-field-${customSections.length+1}`,title:key.slice(0,200),items});
  }
  return {
    name: textField(source, ['name', 'fullName', '姓名'], 120, '待补充') || '待补充', role: textField(source, ['role', 'targetRole', 'desiredPosition', '求职意向', '目标岗位'], 200), location: textField(source, ['location', 'city', '所在地', '城市'], 200), email: textField(source, ['email', '邮箱'], 200), phone: textField(source, ['phone', 'mobile', 'telephone', '电话', '手机'], 100), website: textField(source, ['website', 'github', 'portfolio', '网址', '作品链接'], 500),
    summary: textField(source, ['summary', 'profile', 'overview', '个人简介', '个人概述'], 6000), skills, projects, experience, education, awards: linesValue(firstValue(source, ['awards', 'certificates', 'honors', 'achievements', '获奖', '获奖情况', '证书'])), customSections: customSections.slice(0, 30), design: normalizeDesign(source.design), nodeStyles: normalizeNodeStyles(source.nodeStyles),
  };
}

function sectionFromProfileText(text: string, labels: string[]) {
  if (!text.trim()) return '';
  const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const nextLabels = ['个人概述', '教育背景', '教育经历', '专业技能', '专业课程实践', '项目经历', '数字化工具开发项目', '组织与协调实践', '工作 / 实习经历', '获奖与证书', '获奖 / 证书', '补充信息'];
  const next = nextLabels.filter(label => !labels.includes(label)).map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:\\[?(?:${escaped})\\]?)\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:\\[[^\\]\\n]+\\]|(?:${next || 'a^'}))\\s*(?:\\n|$)|$)`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function repairResumeFromProfileText(resume: ReturnType<typeof normalizeResume>, profileText: string) {
  const educationText = sectionFromProfileText(profileText, ['教育背景', '教育经历']);
  if (!resume.education.length && educationText) {
    const lines = splitRecordText(educationText);
    const period = lines.find(item => /(?:19|20)\d{2}/.test(item)) ?? '';
    const school = lines.find(item => item !== period) ?? '';
    const degree = lines.filter(item => item !== school && item !== period).join(' | ');
    if (school || degree || period) resume.education = [{ school, degree, period }];
  }
  const experienceText = sectionFromProfileText(profileText, ['组织与协调实践', '工作 / 实习经历']);
  if (!resume.experience.length && experienceText) {
    const lines = splitRecordText(experienceText); const items: Array<{ company: string; role: string; period: string; bullets: string[] }> = [];
    for (let index = 0; index < lines.length;) {
      const header = lines[index++]; const parts = header.split(/\s*[|｜]\s*/).filter(Boolean);
      const period = lines[index] && /(?:19|20)\d{2}/.test(lines[index]) ? lines[index++] : '';
      const bullets: string[] = [];
      while (index < lines.length && !lines[index].includes('|') && !/^(?:19|20)\d{2}/.test(lines[index])) bullets.push(lines[index++]);
      if (parts.length || period || bullets.length) items.push({ company: parts[0] ?? header, role: parts[1] ?? '', period, bullets });
    }
    resume.experience = items.slice(0, 12);
  }
  const awardsText = sectionFromProfileText(profileText, ['获奖与证书', '获奖 / 证书']);
  if (!resume.awards.length && awardsText) resume.awards = linesValue(awardsText.split(/[\r\n；;]+/));
  const standardHeadings = /^(个人概述|个人简介|教育背景|教育经历|专业技能|核心技能|项目经历|工作\s*[/／]?\s*实习经历|工作经历|实习经历|获奖与证书|获奖\s*[/／]\s*证书)$/;
  for (const match of profileText.matchAll(/(?:^|\n)\[([^\]\n]{1,200})\]\s*\n([\s\S]*?)(?=\n\[[^\]\n]+\]\s*(?:\n|$)|$)/g)) {
    const title = match[1].trim();
    if (standardHeadings.test(title) || resume.customSections.some(item => item.title === title)) continue;
    const items = linesValue(match[2]);
    const comparable=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const existing=comparable([resume.summary,...resume.projects.flatMap(item=>[item.title,item.meta,...item.description,...item.stack]),...resume.experience.flatMap(item=>[item.company,item.role,item.period,...item.bullets]),...resume.education.flatMap(item=>[item.school,item.degree,item.period]),...resume.skills.map(item=>item.label),...resume.awards,...resume.customSections.flatMap(item=>item.items)].join('\n'));
    if(items.length && items.every(item=>existing.includes(comparable(item))))continue;
    if (items.length && resume.customSections.length < 30) {
      let id=`imported-${resume.customSections.length+1}`,suffix=1;
      while(resume.customSections.some(item=>item.id===id))id=`imported-${resume.customSections.length+1}-${suffix++}`;
      resume.customSections.push({ id, title, items });
    }
  }
  return resume;
}

export function normalizeGenerationPayload(value: unknown, profileText = '') {
  const root = asObject(value); const source = asObject(root.resume);
  const reportSource = asObject(root.report); const requirements = asArray(reportSource.requirements).slice(0, 20).map(raw => { const item = asObject(raw); const status = item.status === 'matched' || item.status === 'partial' || item.status === 'missing' ? item.status : 'partial'; return { requirement: textValue(item.requirement, 500), status, evidence: textValue(item.evidence, 2000), suggestion: textValue(item.suggestion, 2000) }; }).filter(item => item.requirement);
  const resume = repairResumeFromProfileText(normalizeResume(Object.keys(source).length ? source : root), profileText);
  return {
    jobTitle: textValue(root.jobTitle, 200, textValue(source.role, 200, '目标岗位')) || '目标岗位',
    resume,
    report: { summary: textValue(reportSource.summary, 4000), requirements },
    warnings: linesValue(root.warnings, 20).map(value => value.slice(0, 1000)),
  };
}
export const editPatchSchema = z.object({
  id: z.string().max(100), targetNodeId: z.string().max(100), operation: z.enum(['setStyle','rewriteText','setTheme']), path: z.string().max(100),
  value: z.union([z.string().max(6000),z.number(),z.boolean()]), reason: z.string().max(2000), requiresConfirmation: z.boolean(), preview: z.string().max(2000),
});
