export const TEMPLATE_IDS = ['minimal', 'technical', 'editorial', 'academic', 'timeline', 'modern'] as const;
export type TemplateId = typeof TEMPLATE_IDS[number];
export const FONT_IDS = ['sans', 'serif', 'mono'] as const;
export const DENSITY_IDS = ['compact', 'comfortable', 'spacious'] as const;
export const HEADING_IDS = ['line', 'accent', 'plain'] as const;

export const RESUME_TEMPLATES = [
  { id: 'minimal', label: '极简商务', description: '清晰单栏 · 重点一目了然', design: { accentColor: '#34444B', inkColor: '#29323B', paperColor: '#FFFFFF', sectionGap: 18, fontFamily: 'sans', density: 'compact', headingStyle: 'line' } },
  { id: 'technical', label: '工程技术', description: '技术信息栏 · 项目重点突出', design: { accentColor: '#225C76', inkColor: '#263847', paperColor: '#FFFFFF', sectionGap: 22, fontFamily: 'sans', density: 'comfortable', headingStyle: 'accent' } },
  { id: 'editorial', label: '编辑作品集', description: '大字姓名 · 作品分组展示', design: { accentColor: '#B95C36', inkColor: '#332D28', paperColor: '#FFFCF7', sectionGap: 24, fontFamily: 'serif', density: 'comfortable', headingStyle: 'line' } },
  { id: 'academic', label: '学术研究', description: '居中页眉 · 教育研究优先', design: { accentColor: '#304D64', inkColor: '#283543', paperColor: '#FFFFFF', sectionGap: 20, fontFamily: 'serif', density: 'compact', headingStyle: 'line' } },
  { id: 'timeline', label: '时间线叙事', description: '经历脉络 · 右侧能力面板', design: { accentColor: '#956847', inkColor: '#3C352D', paperColor: '#FFFCF6', sectionGap: 22, fontFamily: 'sans', density: 'comfortable', headingStyle: 'plain' } },
  { id: 'modern', label: '现代侧栏', description: '全高身份栏 · 独立项目模块', design: { accentColor: '#66568C', inkColor: '#322F43', paperColor: '#FFFFFF', sectionGap: 22, fontFamily: 'sans', density: 'comfortable', headingStyle: 'accent' } },
] as const;

export function templateById(id: TemplateId) { return RESUME_TEMPLATES.find(template => template.id === id)!; }
export function templateDesign(id: TemplateId) { return { ...templateById(id).design, templateId: id, avatarShape: 'circle' as const }; }
export const FONT_STACKS = {
  sans: '"Segoe UI", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Noto Serif CJK SC", "SimSun", serif',
  mono: 'Consolas, "Microsoft YaHei", monospace',
};

export function isDesignPatch(path: string, value: unknown) {
  if (path === 'design.templateId') return TEMPLATE_IDS.some(id => id === value);
  if (path === 'design.fontFamily') return FONT_IDS.some(id => id === value);
  if (path === 'design.density') return DENSITY_IDS.some(id => id === value);
  if (path === 'design.headingStyle') return HEADING_IDS.some(id => id === value);
  if (['design.accentColor', 'design.inkColor', 'design.paperColor'].includes(path)) return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (path === 'design.sectionGap') return typeof value === 'number' && Number.isFinite(value) && value >= 12 && value <= 36;
  return false;
}
