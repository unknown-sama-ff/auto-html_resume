import { templateDesign, type TemplateId } from '../../shared/design';
import type { NodeStyle, ResumeData } from '../types';
import { parentNodeId } from './contentFields';

export function inheritedNodeStyle(resume: ResumeData, id: string): NodeStyle {
  const parentId = parentNodeId(id), parent = parentId ? resume.nodeStyles[parentId] : undefined;
  return { color: parent?.color, fontSize: parent?.fontSize, fontFamily: parent?.fontFamily, fontWeight: parent?.fontWeight };
}

export function applyTemplate(resume: ResumeData, id: TemplateId): ResumeData {
  return { ...structuredClone(resume), design: { ...templateDesign(id), avatarShape: resume.design.avatarShape, avatarScale: resume.design.avatarScale } };
}

export function getBaseNodeStyle(resume: ResumeData, id: string): Required<NodeStyle> {
  const design = resume.design;
  const heading = id.endsWith('-section-title') || /^custom-.*-title$/.test(id);
  const nameSize = { minimal: 38, technical: 34, editorial: 48, academic: 34, timeline: 38, modern: 42, executive: 40, compact: 30, portfolio: 42, campus: 38, classic: 42, cards: 36 }[design.templateId];
  const small = /^profile-(contact|location|email|phone|website)$/.test(id) || /^project-\d+-(meta|stack)$/.test(id) || /-(period|level)$/.test(id);
  const bold = /^experience-\d+-role$/.test(id) || /^education-\d+-school$/.test(id);
  return {
    color: heading || id === 'profile-role' || /^experience-\d+-company$/.test(id) ? design.accentColor : design.inkColor,
    fontSize: id === 'page' ? 14 : id === 'profile-name' ? nameSize : id === 'profile-role' ? 14 : small ? 10 : heading ? 13 : /^project-\d+-title$/.test(id) ? 16 : design.density === 'compact' ? 12 : 13,
    fontWeight: id === 'profile-name' ? 800 : heading || /^project-\d+-title$/.test(id) || bold ? 700 : 400,
    fontFamily: design.fontFamily,
    marginBottom: id === 'page' || id === 'summary' ? design.sectionGap : heading ? 10 : id === 'profile-role' ? 12 : 6,
    accent: heading && design.headingStyle === 'accent',
  };
}
