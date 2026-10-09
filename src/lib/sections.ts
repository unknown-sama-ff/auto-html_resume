import type { ResumeData } from '../types';

export const SECTION_LABELS: Record<string, string> = {
  summary: '个人简介', projects: '项目经历', experience: '工作 / 实习经历',
  education: '教育经历', skills: '核心技能', awards: '获奖 / 证书',
};
export type SectionColumn = 'main' | 'side' | 'full';
export function sectionTitle(resume: ResumeData, id: string) {
  if (id.startsWith('custom-')) return resume.customSections.find(item => 'custom-' + item.id === id)?.title ?? '自定义栏目';
  return (Object.hasOwn(resume.sectionTitles,id) ? resume.sectionTitles[id] : undefined) ?? (Object.hasOwn(SECTION_LABELS,id) ? SECTION_LABELS[id] : '自定义栏目');
}
export function allSections(resume: ResumeData) {
  return [...Object.keys(SECTION_LABELS), ...resume.customSections.map(item => 'custom-' + item.id)];
}
export function hasSectionContent(resume: ResumeData, id: string) {
  if (id === 'summary') return Boolean(resume.summary);
  if (Object.hasOwn(SECTION_LABELS,id)) return (resume[id as 'projects' | 'experience' | 'education' | 'skills' | 'awards']?.length ?? 0) > 0;
  return resume.customSections.some(item => 'custom-' + item.id === id);
}
export function orderedSections(resume: ResumeData, includeHidden = false) {
  const custom = resume.customSections.map(item => 'custom-' + item.id);
  const template = resume.design.templateId;
  const defaults = template === 'minimal' ? ['summary', 'education', 'experience', 'projects', ...custom, 'skills', 'awards']
    : template === 'academic' ? ['summary', 'education', 'projects', 'experience', ...custom, 'skills', 'awards']
    : template === 'timeline' ? ['summary', 'experience', 'projects', ...custom, 'skills', 'education', 'awards']
    : ['summary', 'projects', 'experience', ...custom, 'skills', 'education', 'awards'];
  return [...new Set([...resume.sectionOrder, ...defaults])]
    .filter(id => hasSectionContent(resume, id) && (includeHidden || !resume.hiddenSections.includes(id)));
}
export function sectionColumn(resume: ResumeData, id: string): SectionColumn {
  const template = resume.design.templateId;
  if (template === 'minimal' || template === 'academic') {
    const saved = resume.sectionColumns[id];
    return saved ? saved === 'full' ? 'full' : 'main' : id === 'summary' ? 'full' : 'main';
  }
  const fallback = ['skills', 'education', 'awards'].includes(id) || id === 'summary' && ['modern', 'editorial'].includes(template) ? 'side' : id === 'summary' ? 'full' : 'main';
  return resume.sectionColumns[id] ?? fallback;
}
export function moveSection(resume: ResumeData, source: string, target: string | null, column: SectionColumn, after = false) {
  const order = orderedSections(resume, true);
  if (!order.includes(source) || target === source) return resume;
  const next = structuredClone(resume);
  next.sectionOrder = order.filter(id => id !== source);
  const index = target ? next.sectionOrder.indexOf(target) : -1;
  next.sectionOrder.splice(index < 0 ? next.sectionOrder.length : index + Number(after), 0, source);
  next.sectionColumns[source] = column;
  return next;
}
export function hideSection(resume: ResumeData, id: string) {
  return { ...resume, hiddenSections: [...new Set([...resume.hiddenSections, id])] };
}
export function restoreSection(resume: ResumeData, id: string) {
  return { ...resume, hiddenSections: resume.hiddenSections.filter(item => item !== id) };
}
