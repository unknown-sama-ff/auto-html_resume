export const TEMPLATE_IDS = ['minimal', 'technical', 'editorial', 'academic', 'timeline', 'modern', 'executive', 'compact', 'portfolio', 'campus', 'classic', 'cards'] as const;
export type TemplateId = typeof TEMPLATE_IDS[number];
export const FONT_IDS = ['sans', 'serif', 'mono', 'yahei', 'heiti', 'simsun', 'kaiti', 'fangsong', 'arial'] as const;
export type FontId = typeof FONT_IDS[number];
export const DENSITY_IDS = ['compact', 'comfortable', 'spacious'] as const;
export const HEADING_IDS = ['line', 'accent', 'plain'] as const;

export const RESUME_TEMPLATES = [
  { id: 'minimal', label: '极简商务', description: '清晰单栏 · 重点一目了然', design: { accentColor: '#34444B', inkColor: '#29323B', paperColor: '#FFFFFF', sectionGap: 18, fontFamily: 'sans', density: 'compact', headingStyle: 'line' } },
  { id: 'technical', label: '工程技术', description: '技术信息栏 · 项目重点突出', design: { accentColor: '#225C76', inkColor: '#263847', paperColor: '#FFFFFF', sectionGap: 22, fontFamily: 'sans', density: 'comfortable', headingStyle: 'accent' } },
  { id: 'editorial', label: '编辑作品集', description: '大字姓名 · 作品分组展示', design: { accentColor: '#B95C36', inkColor: '#332D28', paperColor: '#FFFCF7', sectionGap: 24, fontFamily: 'serif', density: 'comfortable', headingStyle: 'line' } },
  { id: 'academic', label: '学术研究', description: '居中页眉 · 教育研究优先', design: { accentColor: '#304D64', inkColor: '#283543', paperColor: '#FFFFFF', sectionGap: 20, fontFamily: 'serif', density: 'compact', headingStyle: 'line' } },
  { id: 'timeline', label: '时间线叙事', description: '经历脉络 · 右侧能力面板', design: { accentColor: '#956847', inkColor: '#3C352D', paperColor: '#FFFCF6', sectionGap: 22, fontFamily: 'sans', density: 'comfortable', headingStyle: 'plain' } },
  { id: 'modern', label: '现代侧栏', description: '全高身份栏 · 独立项目模块', design: { accentColor: '#66568C', inkColor: '#322F43', paperColor: '#FFFFFF', sectionGap: 22, fontFamily: 'sans', density: 'comfortable', headingStyle: 'accent' } },
  { id: 'executive', label: '商务专业', description: '经历优先 · 右侧资历索引', design: { accentColor: '#216654', inkColor: '#263A34', paperColor: '#FFFFFF', sectionGap: 20, fontFamily: 'sans', density: 'comfortable', headingStyle: 'line' } },
  { id: 'compact', label: '紧凑单栏', description: '栏目标签栏 · 高效呈现信息', design: { accentColor: '#535A62', inkColor: '#292D32', paperColor: '#FFFFFF', sectionGap: 12, fontFamily: 'sans', density: 'compact', headingStyle: 'plain' } },
  { id: 'portfolio', label: '作品展示', description: '双列项目 · 底部能力索引', design: { accentColor: '#B83659', inkColor: '#372C31', paperColor: '#FFFFFF', sectionGap: 24, fontFamily: 'sans', density: 'comfortable', headingStyle: 'accent' } },
  { id: 'campus', label: '校园新锐', description: '教育能力左栏 · 项目实践优先', design: { accentColor: '#3569B3', inkColor: '#243551', paperColor: '#FFFFFF', sectionGap: 20, fontFamily: 'sans', density: 'comfortable', headingStyle: 'accent' } },
  { id: 'classic', label: '经典履历', description: '衬线单栏 · 正式履历排版', design: { accentColor: '#4B4652', inkColor: '#2D2C31', paperColor: '#FFFFFF', sectionGap: 22, fontFamily: 'serif', density: 'comfortable', headingStyle: 'line' } },
  { id: 'cards', label: '信息卡片', description: '均衡双栏 · 分区快速阅读', design: { accentColor: '#147B82', inkColor: '#253B40', paperColor: '#FFFFFF', sectionGap: 18, fontFamily: 'sans', density: 'comfortable', headingStyle: 'plain' } },
] as const;

export function templateById(id: TemplateId) { return RESUME_TEMPLATES.find(template => template.id === id)!; }
export function templateDesign(id: TemplateId) { return { ...templateById(id).design, templateId: id, avatarShape: 'circle' as const, avatarScale: 1 }; }
export const FONT_STACKS = {
  sans: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Noto Serif CJK SC", "SimSun", serif',
  mono: 'Consolas, "Microsoft YaHei", monospace',
  yahei: '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif',
  heiti: '"SimHei", "黑体", "Heiti SC", "Microsoft YaHei", sans-serif',
  simsun: '"SimSun", "宋体", "Songti SC", serif',
  kaiti: '"KaiTi", "楷体", "Kaiti SC", "STKaiti", serif',
  fangsong: '"FangSong", "仿宋", "STFangsong", "SimSun", serif',
  arial: 'Arial, "Helvetica Neue", "Microsoft YaHei", sans-serif',
} satisfies Record<FontId, string>;
export const FONT_OPTIONS = [
  { id: 'sans', label: '系统无衬线（雅黑 / 苹方）' },
  { id: 'serif', label: '经典衬线（Georgia / 宋体）' },
  { id: 'mono', label: '技术等宽（Consolas）' },
  { id: 'yahei', label: '微软雅黑 · 清晰现代' },
  { id: 'heiti', label: '黑体 · 简洁有力' },
  { id: 'simsun', label: '宋体 · 正式传统' },
  { id: 'kaiti', label: '楷体 · 书写风格' },
  { id: 'fangsong', label: '仿宋 · 文雅规范' },
  { id: 'arial', label: 'Arial · 英文商务' },
] as const satisfies readonly { id: FontId; label: string }[];

export function isDesignPatch(path: string, value: unknown) {
  if (path === 'design.templateId') return TEMPLATE_IDS.some(id => id === value);
  if (path === 'design.fontFamily') return FONT_IDS.some(id => id === value);
  if (path === 'design.density') return DENSITY_IDS.some(id => id === value);
  if (path === 'design.headingStyle') return HEADING_IDS.some(id => id === value);
  if (['design.accentColor', 'design.inkColor', 'design.paperColor'].includes(path)) return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (path === 'design.sectionGap') return typeof value === 'number' && Number.isFinite(value) && value >= 12 && value <= 36;
  return false;
}
