import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeSchema } from '../shared/contracts';
import { initialResume } from '../src/data';
import { defaultRequirementNodeId, evidenceNodeId, requirementPrompt, type MatchRequirement } from '../src/lib/matchEditing';

function resume() {
  return resumeSchema.parse({
    ...structuredClone(initialResume),
    summary: '参与 Python 数据清洗并整理周报。',
    skills: [{ label: 'Python', level: '' }],
    projects: [{ id: 'analysis-project', title: '分析项目', meta: '', description: ['使用 Python 整理销售数据。'], stack: [] }],
    experience: [{ company: '真实团队', role: '实习生', period: '2025', bullets: ['协助整理周报。'] }],
    education: [{ school: '真实大学', degree: '本科', period: '2022 - 2026' }],
    awards: ['真实证书'],
    customSections: [{ id: 'volunteer', title: '志愿服务', items: ['参与真实志愿活动。'] }],
    hiddenSections: [],
  });
}

function requirement(overrides: Partial<MatchRequirement> = {}): MatchRequirement {
  return {
    requirement: 'Python 数据清洗与报告整理',
    status: 'partial',
    evidence: '原始资料记载参与数据整理。',
    suggestion: '说明真实的工具、职责与产出。',
    resumeEvidence: [{
      sourceQuote: '参与 Python 数据整理。',
      sourceType: 'text',
      resumePath: 'projects.0.description.0',
      resumeQuote: '使用 Python 整理销售数据。',
    }],
    ...overrides,
  };
}

test('evidence paths resolve only existing visible editable content nodes', () => {
  const document = resume();
  const paths = [
    ['summary', 'summary'],
    ['skills.0.label', 'skills'],
    ['projects.0.description.0', 'project-1-description'],
    ['experience.0.bullets.0', 'experience-1'],
    ['education.0.school', 'education-1'],
    ['education.0.degree', 'education-1'],
    ['education.0.period', 'education-1'],
    ['awards.0', 'awards'],
    ['customSections.0.items.0', 'custom-volunteer-content'],
  ];
  for (const [path, nodeId] of paths) assert.equal(evidenceNodeId(document, path), nodeId, path);
  for (const path of [
    'projects.9.description.0', 'projects.0.description.9', 'skills.9.label',
    'experience.0.company', 'projects.0.title', 'customSections.0.title',
    'design.fontFamily', '__proto__.name', 'projects.-1.description.0', 'projects[0].description[0]',
  ]) assert.equal(evidenceNodeId(document, path), null, path);
  document.hiddenSections = ['summary', 'projects', 'experience', 'education', 'skills', 'awards', 'custom-volunteer'];
  for (const [path] of paths) assert.equal(evidenceNodeId(document, path), null, path);
  document.hiddenSections = [];
  document.summary = '';
  assert.equal(evidenceNodeId(document, 'summary'), null);
});

test('default editing targets prefer current evidence and keep stale report data unchanged', () => {
  const document = resume();
  const item = requirement({
    resumeEvidence: [
      { sourceQuote: '参与 Python 数据整理。', resumePath: 'summary', resumeQuote: '生成时的旧简介。' },
      { sourceQuote: '参与 Python 数据整理。', resumePath: 'projects.0.description.0', resumeQuote: '使用 Python 整理销售数据。' },
    ],
  });
  const before = structuredClone({ document, item });
  assert.equal(defaultRequirementNodeId(document, item), 'project-1-description');
  assert.deepEqual({ document, item }, before);
  document.projects[0].description = ['正文已重新编辑。'];
  assert.equal(defaultRequirementNodeId(document, item), 'summary');
  document.hiddenSections = ['summary'];
  assert.equal(defaultRequirementNodeId(document, item), 'project-1-description');
  document.projects = [];
  assert.equal(defaultRequirementNodeId(document, item), 'skills');
});

test('missing evidence falls back to existing content and never targets a hidden or nonexistent block', () => {
  const document = resume();
  const item = requirement({ status: 'missing', evidence: '', resumeEvidence: [] });
  assert.equal(defaultRequirementNodeId(document, item), 'summary');
  document.summary = '';
  assert.equal(defaultRequirementNodeId(document, item), 'skills');
  document.skills = [];
  assert.equal(defaultRequirementNodeId(document, item), 'project-1-description');
  document.projects = [];
  assert.equal(defaultRequirementNodeId(document, item), 'experience-1');
  document.experience = [];
  assert.equal(defaultRequirementNodeId(document, item), 'custom-volunteer-content');
  document.customSections = [];
  assert.equal(defaultRequirementNodeId(document, item), 'education-1');
  document.education = [];
  assert.equal(defaultRequirementNodeId(document, item), 'awards');
  document.awards = [];
  assert.equal(defaultRequirementNodeId(document, item), null);
});

test('requirement prompt carries the selected requirement and source context with factual boundaries', () => {
  const item = requirement();
  const before = structuredClone(item);
  const prompt = requirementPrompt(item);
  for (const text of [item.requirement, '部分匹配', item.evidence, item.suggestion, item.resumeEvidence![0].sourceQuote, item.resumeEvidence![0].resumeQuote]) {
    assert.ok(prompt.includes(text), text);
  }
  assert.match(prompt, /当前选中内容才是待修改正文/);
  assert.match(prompt, /不得新增经历、技能、数字或成果/);
  assert.match(prompt, /不将参与或协助升级为主导/);
  assert.match(prompt, /缺少证据或没有对应正文时，不得编造/);
  assert.match(prompt, /补充的真实信息/);
  assert.match(prompt, /待我确认后应用/);
  assert.ok(prompt.includes('\n\n'));
  assert.deepEqual(item, before);

  const missing = requirementPrompt(requirement({ status: 'missing', evidence: '', suggestion: '请补充真实 SQL 使用经历。', resumeEvidence: [] }));
  assert.match(missing, /待补充/);
  assert.match(missing, /尚无相应材料依据/);
  assert.match(missing, /暂无对应正文/);
});

test('long report context stays within the edit request limit without dropping factual safeguards', () => {
  const item = requirement({
    requirement: '岗位要求'.repeat(125),
    evidence: '资料依据'.repeat(500),
    suggestion: '修改建议'.repeat(500),
    resumeEvidence: Array.from({ length: 6 }, (_, index) => ({
      sourceQuote: String(index) + '真实原文'.repeat(499),
      resumePath: 'projects.0.description.0',
      resumeQuote: String(index) + '生成描述'.repeat(749),
    })),
  });
  const prompt = requirementPrompt(item);
  assert.ok(prompt.length <= 8000, String(prompt.length));
  assert.match(prompt, /其余内容请在岗位匹配页核对/);
  assert.match(prompt, /不得把岗位要求写成个人事实/);
  assert.ok(prompt.endsWith('先提出修改建议，待我确认后应用。'));
});
