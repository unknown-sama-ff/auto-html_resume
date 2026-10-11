import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeSchema } from '../shared/contracts';
import { getNewRoleProfile } from '../src/lib/newRole';
import { makeVersion, workspaceReducer, migrateWorkspace } from '../src/lib/workspace';
import type { ResumeData, WorkspaceState } from '../src/types';

function makeResume(): ResumeData {
  return resumeSchema.parse({
    name: '林舟',
    role: '旧目标岗位应排除',
    location: '杭州',
    email: 'lin@example.com',
    phone: '13800138000',
    website: 'https://example.com/lin',
    summary: '熟悉跨部门协作。\n保持业务数据准确。',
    education: [
      { school: '第一大学', degree: '统计学本科', period: '2018 - 2022' },
      { school: '第二大学', degree: '数据科学硕士', period: '2022 - 2024' },
    ],
    experience: [
      { company: '前任公司', role: '真实历史职务', period: '2024 - 2025', bullets: ['分析库存。\n核对入库记录。', '完成每周汇总。'] },
      { company: '志愿组织', role: '活动协调员', period: '2023.07', bullets: ['安排志愿者排班。'] },
    ],
    projects: [
      { id: 'stock', title: '库存项目', meta: '团队项目｜负责清洗数据', description: ['建立核对流程。', '保留原始记录。\n追踪变更原因。'], stack: ['Python', 'SQL'] },
      { id: 'planning', title: '排班工具', meta: '独立实践', description: ['按岗位整理排班表。'], stack: ['Excel'] },
    ],
    skills: [{ label: '数据处理', level: '熟练' }, { label: '英语', level: 'C1' }],
    awards: ['统计竞赛一等奖', '职业资格证书'],
    customSections: [
      { id: 'research', title: '研究经历', items: ['整理公开数据集。', '发表研究报告。\n保留完整数据来源。'] },
      { id: 'volunteering', title: '志愿服务', items: ['帮助社区登记物资。'] },
    ],
    hiddenSections: ['education', 'experience', 'projects', 'skills', 'awards', 'custom-research', 'custom-volunteering'],
    avatarDataUrl: 'data:image/png;base64,QUFB',
    design: { templateId: 'cards', accentColor: '#123456' },
    nodeStyles: { 'profile-name': { fontSize: 29, color: '#654321' } },
    sectionTitles: { projects: '旧岗位定制栏目名' },
  });
}

function makeSavedVersion(resume = makeResume(), profileText = '') {
  return makeVersion({ resume, jobTitle: '旧版本岗位应排除', report: { summary: '旧岗位分析应排除', requirements: [] }, warnings: [] }, {
    profileText,
    profileFileName: '个人材料.pdf',
    jobText: '旧职位要求应排除',
    jobFileName: '旧职位.pdf',
  });
}

test('new role keeps original materials, including whitespace and line endings, when available', () => {
  const original = '  姓名：林舟\r\n[个人资料]\r\n第一行。\r\n\r\n第二行。  \n';
  const version = makeSavedVersion(makeResume(), original);
  assert.deepEqual(getNewRoleProfile(version), { text: original, kind: 'original', fileName: '个人材料.pdf' });
});

test('fallback uses latest edited facts and keeps all fields, including hidden sections and existing newlines', () => {
  const version = makeSavedVersion();
  const edited = structuredClone(version.resume);
  edited.name = '编辑后的姓名';
  edited.projects[1].description.push('最新编辑补充：完成项目交付。\n复盘流程。');
  edited.customSections[0].items.push('最新研究事实');
  const workspace: WorkspaceState = { schemaVersion: 2, activeVersionId: version.id, versions: [version] };
  const state = workspaceReducer(workspace, { type: 'commit', id: version.id, resume: edited, label: '补充事实', source: 'manual' });
  const result = getNewRoleProfile(state.versions[0]);

  assert.equal(result.kind, 'resume');
  assert.equal(result.fileName, '');
  assert.ok(!result.text.includes('姓名：林舟'));
  const facts = [
    edited.name, edited.location, edited.email, edited.phone, edited.website, edited.summary,
    ...edited.education.flatMap(item => [item.school, item.degree, item.period]),
    ...edited.experience.flatMap(item => [item.company, item.role, item.period, ...item.bullets]),
    ...edited.projects.flatMap(item => [item.title, item.meta, ...item.description, ...item.stack]),
    ...edited.skills.flatMap(item => [item.label, item.level]),
    ...edited.awards,
    ...edited.customSections.flatMap(item => [item.title, ...item.items]),
  ];
  for (const fact of facts) assert.ok(result.text.includes(fact), `missing fact: ${fact}`);
  for (const title of ['个人信息', '个人简介', '教育经历', '工作与实践经历', '项目经历', '技能', '奖项与证书', '研究经历', '志愿服务']) {
    assert.ok(result.text.includes(`[${title}]`));
  }
});

test('fallback excludes old target roles, job materials, reports, avatar data and styling metadata', () => {
  const version = makeSavedVersion();
  const snapshot = structuredClone(version);
  const { text } = getNewRoleProfile(version);
  for (const forbidden of [
    version.role, version.resume.role, version.jobText, version.jobFileName, version.profileFileName,
    version.report!.summary, version.resume.avatarDataUrl!, 'base64', 'nodeStyles', 'fontSize',
    '#123456', '#654321', '旧岗位定制栏目名', 'hiddenSections', 'custom-research',
  ]) assert.ok(!text.includes(forbidden), `unexpected metadata: ${forbidden}`);
  assert.ok(text.includes('真实历史职务'));
  assert.deepEqual(version, snapshot);
});

test('legacy versions without original materials receive readable fallback after migration', () => {
  const version = makeSavedVersion();
  const raw = JSON.parse(JSON.stringify({ schemaVersion: 2, activeVersionId: version.id, versions: [version] }));
  delete raw.versions[0].profileText;
  const restored = migrateWorkspace(raw).versions[0];
  const result = getNewRoleProfile(restored);
  assert.equal(result.kind, 'resume');
  assert.ok(result.text.includes('姓名：林舟'));
  assert.ok(result.text.includes('建立核对流程。'));
  assert.equal(result.fileName, '');
});

test('whitespace-only source materials use resume facts and empty sections add no blank headings', () => {
  const resume = resumeSchema.parse({ name: '只有姓名', role: '旧意向' });
  assert.deepEqual(getNewRoleProfile(makeSavedVersion(resume, ' \n\t ')), { text: '[个人信息]\n姓名：只有姓名', kind: 'resume', fileName: '' });
});

test('oversized original materials are rejected with a useful Chinese error instead of being clipped', () => {
  const version = makeSavedVersion(makeResume(), '原'.repeat(50001));
  assert.throws(() => getNewRoleProfile(version), /个人资料超过 50,000 字.*精简/);
  assert.equal(version.profileText.length, 50001);
  version.profileText = '原'.repeat(50000);
  assert.equal(getNewRoleProfile(version).text, version.profileText);
});

test('oversized fallback rejects all content without silently dropping facts', () => {
  const resume = makeResume();
  resume.customSections.push({ id: 'long-facts', title: '完整事实', items: Array.from({ length: 20 }, (_, index) => `${index}：${'事'.repeat(2600)}`) });
  const version = makeSavedVersion(resume);
  assert.throws(() => getNewRoleProfile(version), /个人资料超过 50,000 字.*精简/);
  assert.deepEqual(version.resume.customSections.at(-1), resume.customSections.at(-1));
});
