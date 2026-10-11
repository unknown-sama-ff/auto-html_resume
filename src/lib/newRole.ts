import type { ResumeVersion } from '../types';

const MAX_PROFILE_LENGTH = 50000;

function present(value: string) {
  return Boolean(value.trim());
}

function field(label: string, value: string) {
  return present(value) ? `${label}：${value}` : '';
}

function section(title: string, entries: string[]) {
  const content = entries.filter(present).join('\n\n');
  return content ? `[${title}]\n${content}` : '';
}

function checkLength(text: string) {
  if (text.length > MAX_PROFILE_LENGTH) {
    throw new Error('个人资料超过 50,000 字，请先精简资料后再创建岗位简历。');
  }
  return text;
}

/** Reuse original materials when available; older versions can reuse their current personal facts. */
export function getNewRoleProfile(version: ResumeVersion): { text: string; kind: 'original' | 'resume'; fileName: string } {
  const original = version.profileText ?? '';
  if (present(original)) {
    return { text: checkLength(original), kind: 'original', fileName: version.profileFileName };
  }

  const resume = version.resume;
  const text = [
    section('个人信息', [
      field('姓名', resume.name),
      field('所在地', resume.location),
      field('邮箱', resume.email),
      field('电话', resume.phone),
      field('个人网站', resume.website),
    ]),
    section('个人简介', [resume.summary]),
    section('教育经历', resume.education.map(item => [
      field('学校', item.school),
      field('专业与学历', item.degree),
      field('就读时间', item.period),
    ].filter(present).join('\n'))),
    section('工作与实践经历', resume.experience.map(item => [
      field('单位', item.company),
      field('职务', item.role),
      field('任职时间', item.period),
      ...item.bullets.filter(present),
    ].filter(present).join('\n'))),
    section('项目经历', resume.projects.map(item => [
      field('项目名称', item.title),
      field('项目角色与说明', item.meta),
      ...item.description.filter(present),
      ...item.stack.map(tool => field('技术与工具', tool)),
    ].filter(present).join('\n'))),
    section('技能', resume.skills.map(item => [
      field('技能', item.label),
      field('掌握程度', item.level),
    ].filter(present).join('\n'))),
    section('奖项与证书', resume.awards),
    ...resume.customSections.map(item => section(item.title, item.items)),
  ].filter(present).join('\n\n');

  return { text: checkLength(text), kind: 'resume', fileName: '' };
}
