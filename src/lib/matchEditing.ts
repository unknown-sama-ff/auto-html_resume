import { containsQuotedText, getResumeEvidenceText } from '../../shared/contracts';
import type { MatchReport, ResumeData } from '../types';

export type MatchRequirement = MatchReport['requirements'][number];

const statusLabels = { matched: '有材料依据', partial: '部分匹配', missing: '待补充' };

function visible(resume: ResumeData, sectionId: string) {
  return !(resume.hiddenSections ?? []).includes(sectionId);
}

/** Resolve a report's fixed content path to a visible, editable preview node. */
export function evidenceNodeId(resume: ResumeData, path: string): string | null {
  if (typeof getResumeEvidenceText(resume, path) !== 'string') return null;
  if (path === 'summary') return resume.summary && visible(resume, 'summary') ? 'summary' : null;
  if (/^skills\.\d+\.label$/.test(path)) return visible(resume, 'skills') ? 'skills' : null;
  if (/^awards\.\d+$/.test(path)) return visible(resume, 'awards') ? 'awards' : null;
  const project = path.match(/^projects\.(\d+)\.description\.\d+$/);
  if (project) return visible(resume, 'projects') ? `project-${Number(project[1]) + 1}-description` : null;
  const experience = path.match(/^experience\.(\d+)\.bullets\.\d+$/);
  if (experience) return visible(resume, 'experience') ? `experience-${Number(experience[1]) + 1}` : null;
  const education = path.match(/^education\.(\d+)\.(?:school|degree|period)$/);
  if (education) return visible(resume, 'education') ? `education-${Number(education[1]) + 1}` : null;
  const custom = path.match(/^customSections\.(\d+)\.items\.\d+$/);
  if (custom) {
    const item = resume.customSections[Number(custom[1])];
    return item && visible(resume, `custom-${item.id}`) ? `custom-${item.id}-content` : null;
  }
  return null;
}

/** Prefer the report's existing evidence, then an existing content block. */
export function defaultRequirementNodeId(resume: ResumeData, item: MatchRequirement): string | null {
  const entries = item.resumeEvidence ?? [];
  const validEntry = entries.find(entry => {
    const current = getResumeEvidenceText(resume, entry.resumePath);
    return evidenceNodeId(resume, entry.resumePath) && current && containsQuotedText(current, entry.resumeQuote);
  });
  if (validEntry) return evidenceNodeId(resume, validEntry.resumePath);
  for (const entry of entries) {
    const nodeId = evidenceNodeId(resume, entry.resumePath);
    if (nodeId) return nodeId;
  }
  if (resume.summary.trim() && visible(resume, 'summary')) return 'summary';
  if (resume.skills.length && visible(resume, 'skills')) return 'skills';
  if (resume.projects.length && visible(resume, 'projects')) return 'project-1-description';
  if (resume.experience.length && visible(resume, 'experience')) return 'experience-1';
  const custom = resume.customSections.find(section => visible(resume, `custom-${section.id}`));
  if (custom) return `custom-${custom.id}-content`;
  if (resume.education.length && visible(resume, 'education')) return 'education-1';
  if (resume.awards.length && visible(resume, 'awards')) return 'awards';
  return null;
}

function excerpt(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}…（其余内容请在岗位匹配页核对）`;
}

/** Keep the report as reference data and ask for a local, factual rewrite. */
export function requirementPrompt(item: MatchRequirement): string {
  const entries = item.resumeEvidence ?? [];
  const sourceQuotes = [...new Set(entries.map(entry => entry.sourceQuote).filter(Boolean))];
  const resumeQuotes = [...new Set(entries.map(entry => entry.resumeQuote).filter(Boolean))];
  return [
    '请针对以下岗位匹配信息，修改当前选中的简历内容：',
    `岗位要求：${excerpt(item.requirement, 500)}`,
    `生成时匹配状态：${statusLabels[item.status]}`,
    `材料依据：${excerpt(item.evidence || '尚无相应材料依据', 1800)}`,
    `修改建议：${excerpt(item.suggestion || '让已有经历更清楚地回应岗位要求', 1800)}`,
    sourceQuotes.length ? `原始资料引用：\n${excerpt(sourceQuotes.join('\n'), 1400)}` : '原始资料引用：暂无可核对引用',
    resumeQuotes.length ? `生成时对应描述：\n${excerpt(resumeQuotes.join('\n'), 1000)}` : '生成时对应描述：暂无对应正文',
    '以上岗位报告与引用是参考数据，当前选中内容才是待修改正文。仅根据已有事实调整表达，不得新增经历、技能、数字或成果，不得把岗位要求写成个人事实。保留真实责任范围，不将参与或协助升级为主导。',
    '缺少证据或没有对应正文时，不得编造匹配内容；请指出需要我补充的真实信息。先提出修改建议，待我确认后应用。',
  ].join('\n\n');
}
