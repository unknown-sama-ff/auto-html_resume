import type { ResumeData } from '../types';
type Field = { label: string; content: string; set: (value: string) => void };
export function parentNodeId(id: string): string | null {
  if (/^profile-(location|email|phone|website)$/.test(id)) return 'profile-contact';
  const experience = id.match(/^(experience-\d+)-.+$/); if (experience) return experience[1];
  const education = id.match(/^(education-\d+)-.+$/); if (education) return education[1];
  if (/^skill-\d+-(label|level)$/.test(id)) return 'skills';
  if (/^award-\d+$/.test(id)) return 'awards';
  return null;
}
export function contentField(resume: ResumeData, id: string): Field | null {
  const contact = id.match(/^profile-(location|email|phone|website)$/);
  if (contact) {
    const key = contact[1] as 'location' | 'email' | 'phone' | 'website';
    return { label: { location: '地点', email: '邮箱', phone: '电话', website: '网址' }[key], content: resume[key], set: value => { resume[key] = value; } };
  }
  const project = id.match(/^project-(\d+)-(meta|stack)$/);
  if (project) {
    const item = resume.projects[Number(project[1]) - 1];
    if (!item) return null;
    return project[2] === 'meta'
      ? { label: '项目时间 / 角色', content: item.meta, set: value => { item.meta = value; } }
      : { label: '技术标签（每行一项）', content: item.stack.join('\n'), set: value => { item.stack = value.split('\n').map(line => line.trim()).filter(Boolean); } };
  }
  const experience = id.match(/^experience-(\d+)-(company|role|period|bullet-(\d+))$/);
  if (experience) {
    const item = resume.experience[Number(experience[1]) - 1];
    if (!item) return null;
    if (experience[3]) {
      const index = Number(experience[3]) - 1;
      if (item.bullets[index] === undefined) return null;
      return { label: '工作经历描述', content: item.bullets[index], set: value => { item.bullets[index] = value; } };
    }
    const key = experience[2] as 'company' | 'role' | 'period';
    return { label: { company: '公司 / 单位', role: '职位', period: '任职时间' }[key], content: item[key], set: value => { item[key] = value; } };
  }
  const education = id.match(/^education-(\d+)-(school|degree|period)$/);
  if (education) {
    const item = resume.education[Number(education[1]) - 1];
    if (!item) return null;
    const key = education[2] as 'school' | 'degree' | 'period';
    return { label: { school: '学校', degree: '学位 / 专业', period: '就读时间' }[key], content: item[key], set: value => { item[key] = value; } };
  }
  const skill = id.match(/^skill-(\d+)-(label|level)$/);
  if (skill) {
    const item = resume.skills[Number(skill[1]) - 1];
    if (!item) return null;
    const key = skill[2] as 'label' | 'level';
    return { label: key === 'label' ? '技能' : '熟练程度', content: item[key], set: value => { item[key] = value; } };
  }
  const award = id.match(/^award-(\d+)$/);
  if (award) {
    const index = Number(award[1]) - 1;
    if (resume.awards[index] === undefined) return null;
    return { label: '获奖 / 证书', content: resume.awards[index], set: value => { resume.awards[index] = value; } };
  }
  const heading = id.match(/^(summary|projects|experience|education|skills|awards)-section-title$/);
  if (heading) {
    const section = heading[1];
    const labels: Record<string, string> = { summary: '个人简介', projects: '项目经历', experience: '工作 / 实习经历', education: '教育经历', skills: '核心技能', awards: '获奖 / 证书' };
    return { label: '栏目标题', content: resume.sectionTitles[section] ?? labels[section], set: value => { resume.sectionTitles[section] = value; } };
  }
  return null;
}
