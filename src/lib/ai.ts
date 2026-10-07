import { DEFAULT_NODE_STYLE } from '../data';
import type { EditPatch, ModelConfig, ResumeData, SelectionMeta } from '../types';

export function cloneResume(resume: ResumeData): ResumeData {
  return structuredClone(resume);
}

export function getNodeStyle(resume: ResumeData, id: string) {
  return { ...DEFAULT_NODE_STYLE, ...resume.nodeStyles[id] };
}

export function getNodeContent(resume: ResumeData, nodeId: string): string {
  if (nodeId === 'profile-name') return resume.name;
  if (nodeId === 'profile-role') return resume.role;
  if (nodeId === 'summary') return resume.summary;
  if (nodeId === 'project-1-title') return resume.projects[0]?.title ?? '';
  if (nodeId === 'project-2-title') return resume.projects[1]?.title ?? '';
  if (nodeId === 'project-1-description') return resume.projects[0]?.description.join('\n') ?? '';
  if (nodeId === 'project-2-description') return resume.projects[1]?.description.join('\n') ?? '';
  if (nodeId === 'experience-1') return resume.experience[0]?.bullets.join('\n') ?? '';
  if (nodeId === 'education-1') return `${resume.education[0]?.school ?? ''}\n${resume.education[0]?.degree ?? ''}`;
  if (nodeId === 'skills') return resume.skills.map((skill) => skill.label).join(' · ');
  if (nodeId === 'awards') return resume.awards.join('\n');
  return '';
}

export function getNodeMeta(resume: ResumeData, nodeId: string): SelectionMeta {
  const kindMap: Record<string, SelectionMeta['kind']> = {
    page: 'page',
    'profile-name': 'name',
    'profile-role': 'role',
    'profile-contact': 'contact',
    'profile-avatar': 'avatar',
    summary: 'summary',
    'projects-section-title': 'section-title',
    'project-1-title': 'project-title',
    'project-1-description': 'project-description',
    'project-2-title': 'project-title',
    'project-2-description': 'project-description',
    'experience-section-title': 'section-title',
    'experience-1': 'experience',
    'education-section-title': 'section-title',
    'education-1': 'education',
    'skills-section-title': 'section-title',
    skills: 'skills',
    'awards-section-title': 'section-title',
    awards: 'awards',
  };
  const labels: Record<string, { label: string; breadcrumb: string; path: string }> = {
    page: { label: '整张简历', breadcrumb: '页面 > 全局设计', path: 'design' },
    'profile-name': { label: '姓名标题', breadcrumb: '页首 > 姓名标题', path: 'name' },
    'profile-role': { label: '职业定位', breadcrumb: '页首 > 职业定位', path: 'role' },
    'profile-contact': { label: '联系方式', breadcrumb: '页首 > 联系方式', path: 'contact' },
    'profile-avatar': { label: '证件照', breadcrumb: '页首 > 证件照', path: 'avatar' },
    summary: { label: '个人简介', breadcrumb: '个人简介 > 正文', path: 'summary' },
    'projects-section-title': { label: '项目经历标题', breadcrumb: '项目经历 > 区块标题', path: 'projects.title' },
    'project-1-title': { label: '智能简历工作台标题', breadcrumb: '项目经历 > 智能简历工作台 > 标题', path: 'projects[0].title' },
    'project-1-description': { label: '智能简历工作台描述', breadcrumb: '项目经历 > 智能简历工作台 > 描述', path: 'projects[0].description' },
    'project-2-title': { label: '商家增长驾驶舱标题', breadcrumb: '项目经历 > 商家增长驾驶舱 > 标题', path: 'projects[1].title' },
    'project-2-description': { label: '商家增长驾驶舱描述', breadcrumb: '项目经历 > 商家增长驾驶舱 > 描述', path: 'projects[1].description' },
    'experience-section-title': { label: '工作经历标题', breadcrumb: '工作经历 > 区块标题', path: 'experience.title' },
    'experience-1': { label: '星河科技经历', breadcrumb: '工作经历 > 星河科技 > 内容', path: 'experience[0]', },
    'education-section-title': { label: '教育经历标题', breadcrumb: '教育经历 > 区块标题', path: 'education.title' },
    'education-1': { label: '同济大学经历', breadcrumb: '教育经历 > 同济大学', path: 'education[0]' },
    'skills-section-title': { label: '技能标题', breadcrumb: '技能 > 区块标题', path: 'skills.title' },
    skills: { label: '技能标签', breadcrumb: '技能 > 标签集合', path: 'skills' },
    'awards-section-title': { label: '荣誉标题', breadcrumb: '荣誉 > 区块标题', path: 'awards.title' },
    awards: { label: '获奖情况', breadcrumb: '荣誉 > 内容', path: 'awards' },
  };
  const label = labels[nodeId] ?? labels.page;
  const style = getNodeStyle(resume, nodeId);
  const code = `.${nodeId} {\n  color: ${style.color};\n  font-size: ${style.fontSize}px;\n  font-weight: ${style.fontWeight};\n  margin-bottom: ${style.marginBottom}px;\n}`;
  return { id: nodeId, label: label.label, breadcrumb: label.breadcrumb, kind: kindMap[nodeId] ?? 'page', path: label.path, content: getNodeContent(resume, nodeId), style, code };
}

export function buildLocalPatch(instruction: string, selection: SelectionMeta, resume: ResumeData): EditPatch {
  const text = instruction.toLowerCase();
  const isColorRequest = text.includes('颜色') || text.includes('色') || text.includes('蓝') || text.includes('橙') || text.includes('深灰');
  const isFontRequest = text.includes('字号') || text.includes('字体') || text.includes('大一点') || text.includes('小一点');
  const isSpacingRequest = text.includes('间距') || text.includes('留白') || text.includes('紧凑') || text.includes('松一点');
  const isAvatarRequest = selection.kind === 'avatar' || text.includes('头像') || text.includes('证件照');
  const wantsRewrite = selection.kind === 'summary' || selection.kind === 'project-description' || selection.kind === 'experience' || text.includes('改写') || text.includes('突出') || text.includes('压缩');

  if (isAvatarRequest && (text.includes('圆') || text.includes('头像') || text.includes('证件照'))) {
    return { id: `patch-${Date.now()}`, targetNodeId: selection.id, operation: 'setStyle', path: 'design.avatarShape', value: 'circle', reason: '将头像处理为更轻盈的圆形视觉，保持页首信息的呼吸感。', requiresConfirmation: false, preview: '头像将变为圆形，并保留当前尺寸。' };
  }
  if (wantsRewrite && !isColorRequest && !isFontRequest && !isSpacingRequest) {
    const current = selection.content;
    const replacement = selection.kind === 'summary'
      ? `${current} 重点强调跨团队协作与从问题到结果的闭环，让岗位匹配信息更快被阅读者捕捉。`
      : current.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).map((line) => `围绕${line.replace(/[。.]$/, '')}，进一步补充方法、结果与业务影响。`).join('\n');
    return { id: `patch-${Date.now()}`, targetNodeId: selection.id, operation: 'rewriteText', path: selection.path, value: replacement, reason: '保留原有事实基础，增加与目标岗位相关的行动和结果表达。', requiresConfirmation: true, preview: '将使用更岗位相关、结果导向的表达重写当前内容。' };
  }
  if (isSpacingRequest) {
    const nextSpacing = text.includes('减少') || text.includes('紧凑') ? Math.max(2, selection.style.marginBottom - 4) : selection.style.marginBottom + 4;
    return { id: `patch-${Date.now()}`, targetNodeId: selection.id, operation: 'setStyle', path: 'style.marginBottom', value: nextSpacing, reason: '按照你的描述调整局部留白，不影响其他区块。', requiresConfirmation: false, preview: `当前元素下方间距将调整为 ${nextSpacing}px。` };
  }
  if (isFontRequest) {
    const nextSize = text.includes('小') ? Math.max(10, selection.style.fontSize - 2) : selection.style.fontSize + 2;
    return { id: `patch-${Date.now()}`, targetNodeId: selection.id, operation: 'setStyle', path: 'style.fontSize', value: nextSize, reason: '调整当前选中元素的文字层级，同时保留整份简历的分页约束。', requiresConfirmation: false, preview: `当前元素字号将调整为 ${nextSize}px。` };
  }
  if (isColorRequest) {
    const nextColor = text.includes('蓝') ? '#315A64' : text.includes('深灰') ? '#394441' : resume.design.accentColor;
    return { id: `patch-${Date.now()}`, targetNodeId: selection.id, operation: 'setStyle', path: 'style.color', value: nextColor, reason: '把视觉强调收束到当前选中元素，避免整页颜色失控。', requiresConfirmation: false, preview: `当前元素颜色将更新为 ${nextColor}。` };
  }
  return { id: `patch-${Date.now()}`, targetNodeId: selection.id, operation: 'setStyle', path: 'style.accent', value: true, reason: '为当前元素增加更明确的视觉强调。', requiresConfirmation: false, preview: '将为当前元素增加铁锈橙强调线。' };
}

export function applyPatch(resume: ResumeData, patch: EditPatch): ResumeData {
  const next = cloneResume(resume);
  if (patch.path === 'design.avatarShape') {
    next.design.avatarShape = patch.value === 'circle' ? 'circle' : 'square';
    return next;
  }
  if (patch.operation === 'setStyle') {
    const current = next.nodeStyles[patch.targetNodeId] ?? {};
    if (patch.path === 'style.color' && typeof patch.value === 'string') next.nodeStyles[patch.targetNodeId] = { ...current, color: patch.value };
    if (patch.path === 'style.fontSize' && typeof patch.value === 'number') next.nodeStyles[patch.targetNodeId] = { ...current, fontSize: patch.value };
    if (patch.path === 'style.marginBottom' && typeof patch.value === 'number') next.nodeStyles[patch.targetNodeId] = { ...current, marginBottom: patch.value };
    if (patch.path === 'style.accent' && typeof patch.value === 'boolean') next.nodeStyles[patch.targetNodeId] = { ...current, accent: patch.value };
    return next;
  }
  if (patch.operation === 'rewriteText' && typeof patch.value === 'string') {
    if (patch.targetNodeId === 'summary') next.summary = patch.value;
    if (patch.targetNodeId === 'project-1-description') next.projects[0].description = patch.value.split('\n').filter(Boolean);
    if (patch.targetNodeId === 'project-2-description') next.projects[1].description = patch.value.split('\n').filter(Boolean);
    if (patch.targetNodeId === 'experience-1') next.experience[0].bullets = patch.value.split('\n').filter(Boolean);
  }
  return next;
}

export async function requestAIEdit(config: ModelConfig, instruction: string, selection: SelectionMeta, resume: ResumeData): Promise<EditPatch> {
  const response = await fetch('/api/ai/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: instruction,
      selection,
      resume: {
        name: resume.name,
        role: resume.role,
        summary: resume.summary,
        projects: resume.projects,
        experience: resume.experience,
        design: resume.design,
      },
      config: {
        mode: config.mode,
        presetId: config.presetId,
        url: config.url,
        model: config.model,
        apiKey: config.mode === 'custom' ? config.apiKey : undefined,
      },
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = isObject(payload) && typeof payload.error === 'string' ? payload.error : 'AI 服务暂时不可用';
    throw new Error(message);
  }
  if (!isObject(payload) || !isObject(payload.patch)) throw new Error('AI 返回的数据格式不正确');
  return normalizePatch(payload.patch, selection.id);
}

function normalizePatch(value: Record<string, unknown>, fallbackNodeId: string): EditPatch {
  const operation = value.operation === 'rewriteText' || value.operation === 'setTheme' ? value.operation : 'setStyle';
  const patchValue = typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean' ? value.value : '';
  return {
    id: typeof value.id === 'string' ? value.id : `patch-${Date.now()}`,
    targetNodeId: typeof value.targetNodeId === 'string' ? value.targetNodeId : fallbackNodeId,
    operation,
    path: typeof value.path === 'string' ? value.path : 'style.color',
    value: patchValue,
    reason: typeof value.reason === 'string' ? value.reason : 'AI 根据当前选择给出了局部修改建议。',
    requiresConfirmation: value.requiresConfirmation === true || operation === 'rewriteText',
    preview: typeof value.preview === 'string' ? value.preview : '已生成一个局部修改建议。',
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
