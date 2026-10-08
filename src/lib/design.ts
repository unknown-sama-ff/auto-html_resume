import { templateDesign, type TemplateId } from '../../shared/design';
import type { NodeStyle, ResumeData } from '../types';

export function applyTemplate(resume: ResumeData, id: TemplateId): ResumeData {
  return { ...structuredClone(resume), design: { ...templateDesign(id), avatarShape: resume.design.avatarShape } };
}

export function getBaseNodeStyle(resume: ResumeData, id: string): Required<NodeStyle> {
  const design = resume.design;
  const heading = id.endsWith('-section-title') || /^custom-.*-title$/.test(id);
  const nameSize = { minimal: 38, technical: 34, editorial: 48, academic: 34, timeline: 38, modern: 42 }[design.templateId];
  return {
    color: heading || id === 'profile-role' ? design.accentColor : design.inkColor,
    fontSize: id === 'page' ? 14 : id === 'profile-name' ? nameSize : id === 'profile-role' ? 14 : id === 'profile-contact' ? 10 : heading ? 13 : /^project-\d+-title$/.test(id) ? 16 : design.density === 'compact' ? 12 : 13,
    fontWeight: id === 'profile-name' ? 800 : heading || /^project-\d+-title$/.test(id) ? 700 : 400,
    marginBottom: id === 'page' || id === 'summary' ? design.sectionGap : heading ? 10 : id === 'profile-role' ? 12 : 6,
    accent: heading && design.headingStyle === 'accent',
  };
}
