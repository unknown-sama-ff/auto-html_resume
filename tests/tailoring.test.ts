import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getResumeEvidenceText, resumeSchema } from '../shared/contracts';
import { buildGenerationMessages, parseGeneration } from '../shared/generation';
import { emptyWorkspace, makeVersion, migrateWorkspace, workspaceReducer } from '../src/lib/workspace';

const sourceFact = '使用 Python 清洗数据，制作报表。';
const rewrittenFact = '使用 Python 完成数据清洗和报表整理，形成可用于分析的数据资料。';
const profile = `姓名：王五\n[数字化工具开发项目]\n企业报表工具\n${sourceFact}`;
const baseResume = resumeSchema.parse({
  name: '王五', role: '数据分析师', summary: '具有数据清洗与报表整理实践。',
  skills: [{ label: 'Python', level: '' }],
  projects: [{ id: 'project-1', title: '企业报表工具', meta: '个人项目', description: [rewrittenFact], stack: ['Python'] }],
  experience: [{ company: '校团委', role: '办公室干事', period: '2023.09 - 2023.11', bullets: ['参与活动资料整理，支持筹备工作。'] }],
  education: [{ school: '真实大学', degree: '工程管理 | 本科', period: '2023.09 - 2027.06' }],
  awards: ['计算机等级考试二级 Python'],
  customSections: [{ id: 'extra-1', title: '语言能力', items: ['英语六级'] }],
});
type Evidence = { sourceQuote: string; resumePath: string; resumeQuote: string; sourceType?: 'text' | 'image' };
type Requirement = { requirement: string; status: 'matched' | 'partial' | 'missing'; evidence: string; suggestion: string; resumeEvidence?: Evidence[] };
function mapping(overrides: Partial<Evidence> = {}): Evidence {
  return { sourceQuote: sourceFact, resumePath: 'projects.0.description.0', resumeQuote: rewrittenFact, ...overrides };
}
function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return { requirement: '数据清洗与报表整理', status: 'matched', evidence: sourceFact, suggestion: '', resumeEvidence: [mapping()], ...overrides };
}
function result(requirements: Requirement[] = [requirement()], resume = baseResume) {
  return { jobTitle: '数据分析师', resume, report: { summary: '项目材料能够支持数据处理职责。', requirements }, warnings: [] };
}
function parse(requirements: Requirement[] = [requirement()], profileText = profile, resume = baseResume) {
  return parseGeneration(JSON.stringify(result(requirements, resume)), profileText);
}

test('resume evidence paths resolve only supported concrete content fields with zero-based indices', () => {
  const expected: Record<string, string> = {
    summary: baseResume.summary,
    'skills.0.label': baseResume.skills[0].label,
    'projects.0.description.0': baseResume.projects[0].description[0],
    'experience.0.bullets.0': baseResume.experience[0].bullets[0],
    'education.0.school': baseResume.education[0].school,
    'education.0.degree': baseResume.education[0].degree,
    'education.0.period': baseResume.education[0].period,
    'awards.0': baseResume.awards[0],
    'customSections.0.items.0': baseResume.customSections[0].items[0],
  };
  for (const [path, content] of Object.entries(expected)) assert.equal(getResumeEvidenceText(baseResume, path), content, path);
  for (const path of ['name', 'role', 'skills.0.level', 'projects.0.title', 'projects.0.stack.0', 'projects.1.description.0', 'projects.-1.description.0', 'education.0', '__proto__.polluted', 'summary.constructor', 'projects[0].description[0]']) {
    assert.equal(getResumeEvidenceText(baseResume, path), undefined, path);
  }
});

test('valid tailoring evidence binds an actual source quote to the actual generated description', () => {
  const parsed = parse();
  const item = parsed.report.requirements[0];
  assert.equal(item.status, 'matched');
  assert.equal(item.resumeEvidence?.length, 1);
  assert.equal(item.resumeEvidence?.[0].sourceQuote, sourceFact);
  assert.equal(item.resumeEvidence?.[0].resumePath, 'projects.0.description.0');
  assert.equal(item.resumeEvidence?.[0].resumeQuote, rewrittenFact);
  assert.equal(getResumeEvidenceText(parsed.resume, item.resumeEvidence![0].resumePath), rewrittenFact);
  assert.equal(parsed.resume.projects[0].description[0], rewrittenFact);
});

test('forged profile quotes, non-content paths and mismatched generated quotes cannot claim coverage', () => {
  const invalid = [
    mapping({ sourceQuote: '熟练掌握 SQL，具有商业分析经验。' }),
    mapping({ resumePath: 'projects.9.description.0' }),
    mapping({ resumePath: '__proto__.polluted' }),
    mapping({ resumePath: 'projects.0.title', resumeQuote: '企业报表工具' }),
    mapping({ resumeQuote: '主导数据平台建设，使收入提升 30%。' }),
  ];
  const parsed = parse([requirement({ resumeEvidence: invalid })]);
  assert.deepEqual(parsed.report.requirements[0].resumeEvidence ?? [], []);
  assert.equal(parsed.report.requirements[0].status, 'partial');
  assert.ok(parsed.warnings.length > 0);
  assert.ok(parsed.resume.customSections.some(section => section.items.includes(sourceFact)), 'unverified mappings must not hide imported source facts');
});

test('a valid mapping remains usable when adjacent mappings are rejected', () => {
  const parsed = parse([requirement({ resumeEvidence: [mapping(), mapping({ sourceQuote: '未经提供的 SQL 经验' }), mapping({ resumeQuote: '正文没有的成果' })] })]);
  const items = parsed.report.requirements[0].resumeEvidence ?? [];
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceQuote, sourceFact);
  assert.equal(parsed.report.requirements[0].status, 'matched');
});

test('unsupported match claims are downgraded and missing requirements carry no resume mapping', () => {
  const parsed = parse([
    requirement({ requirement: '没有个人依据的职责', evidence: '', resumeEvidence: [] }),
    requirement({ requirement: '尚未落实到正文的职责', resumeEvidence: [] }),
    requirement({ requirement: 'SQL 技能', status: 'missing', evidence: '', resumeEvidence: [mapping()] }),
  ]);
  assert.equal(parsed.report.requirements[0].status, 'missing');
  assert.equal(parsed.report.requirements[1].status, 'partial');
  assert.equal(parsed.report.requirements[2].status, 'missing');
  assert.deepEqual(parsed.report.requirements[2].resumeEvidence ?? [], []);
  assert.ok(parsed.warnings.length > 0);
});

test('mixed text and image sources preserve each valid origin only when profile images exist', () => {
  const imageFact = '参加校园活动资料归档';
  const imageRewrite = baseResume.experience[0].bullets[0];
  const mixed = [mapping({ sourceType: 'text' }), mapping({ sourceQuote: imageFact, resumePath: 'experience.0.bullets.0', resumeQuote: imageRewrite, sourceType: 'image' })];
  const body = JSON.stringify(result([requirement({ resumeEvidence: mixed })]));
  const withImage = parseGeneration(body, profile, 'auto', { hasProfileImages: true });
  assert.equal(withImage.report.requirements[0].resumeEvidence?.length, 2);
  assert.ok(withImage.report.requirements[0].resumeEvidence?.some(item => item.sourceType === 'image'));
  const withoutImage = parseGeneration(body, profile);
  assert.equal(withoutImage.report.requirements[0].resumeEvidence?.length, 1);
  assert.equal(withoutImage.report.requirements[0].resumeEvidence?.[0].sourceQuote, sourceFact);
  assert.equal(withoutImage.report.requirements[0].status, 'matched');
  const imageOnly = JSON.stringify(result([requirement({ evidence: imageFact, resumeEvidence: [mixed[1]] })]));
  assert.equal(parseGeneration(imageOnly, '', 'auto', { hasProfileImages: true }).report.requirements[0].status, 'matched');
  const rejected = parseGeneration(imageOnly, profile);
  assert.equal(rejected.report.requirements[0].status, 'partial');
  assert.deepEqual(rejected.report.requirements[0].resumeEvidence ?? [], []);
});

test('an image flag does not permit forged text quotes or quotes absent from the resume body', () => {
  const body = JSON.stringify(result([requirement({ resumeEvidence: [
    mapping({ sourceType: 'text', sourceQuote: '未出现在个人文字材料中的句子' }),
    mapping({ sourceType: 'image', resumeQuote: '未出现在生成正文中的句子' }),
  ] })]));
  const parsed = parseGeneration(body, profile, 'auto', { hasProfileImages: true });
  assert.deepEqual(parsed.report.requirements[0].resumeEvidence ?? [], []);
  assert.equal(parsed.report.requirements[0].status, 'partial');
});

test('rewriting an imported project does not append the covered original description again', () => {
  const parsed = parse();
  assert.equal(parsed.resume.projects[0].description[0], rewrittenFact);
  assert.ok(!parsed.resume.customSections.some(section => section.items.includes(sourceFact)));
  assert.ok(!parsed.resume.customSections.some(section => section.title === '数字化工具开发项目'));
});

test('partially covered source sections restore only uncovered facts and retain unfamiliar sections', () => {
  const remaining = '使用 Excel 记录课程作业进度。';
  const unknown = '持有航空运动执照。';
  const parsed = parse([requirement()], `${profile}\n${remaining}\n[航空执照]\n${unknown}`);
  const projectSection = parsed.resume.customSections.find(section => section.title === '数字化工具开发项目');
  assert.ok(projectSection);
  assert.deepEqual(projectSection.items, [remaining]);
  assert.ok(!projectSection.items.includes(sourceFact));
  assert.ok(!projectSection.items.includes('企业报表工具'));
  assert.ok(parsed.resume.customSections.some(section => section.title === '航空执照' && section.items.includes(unknown)));
});

test('summary and skill mentions cannot suppress complete detailed source facts', () => {
  for (const [path, quote] of [['summary', baseResume.summary], ['skills.0.label', 'Python']]) {
    const parsed = parse([requirement({ resumeEvidence: [mapping({ resumePath: path, resumeQuote: quote })] })]);
    assert.equal(parsed.report.requirements[0].resumeEvidence?.length, 1);
    assert.ok(parsed.resume.customSections.some(section => section.items.includes(sourceFact)), path);
  }
});

test('old backups without resume evidence preserve versions, content and edit history', () => {
  const legacy = result([{ requirement: 'Python', status: 'matched', evidence: sourceFact, suggestion: '' }]);
  const version = makeVersion(legacy, { jobText: '数据分析师，负责清洗数据。', profileText: profile });
  let state = workspaceReducer(emptyWorkspace, { type: 'add', version });
  state = workspaceReducer(state, { type: 'commit', id: version.id, resume: { ...version.resume, summary: '手动保存的简介' }, label: '修改简介', source: 'manual' });
  const restored = migrateWorkspace(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.activeVersionId, version.id);
  assert.equal(restored.versions.length, 1);
  assert.equal(restored.versions[0].resume.summary, '手动保存的简介');
  assert.equal(restored.versions[0].history.length, 1);
  assert.equal(restored.versions[0].profileText, profile);
  assert.equal(restored.versions[0].report?.requirements[0].status, 'matched');
  assert.equal(restored.versions[0].report?.requirements[0].resumeEvidence, undefined);
});

test('verified tailoring evidence survives workspace backup roundtrips', () => {
  const parsed = parse();
  const version = makeVersion(parsed, { profileText: profile, jobText: '数据分析师，负责报表整理。' });
  const state = workspaceReducer(emptyWorkspace, { type: 'add', version });
  const restored = migrateWorkspace(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.versions[0].report?.requirements[0].resumeEvidence, parsed.report.requirements[0].resumeEvidence);
  assert.equal(restored.versions[0].resume.projects[0].description[0], rewrittenFact);
});

test('fact-analysis guidance uses two messages and preserves original profile and job inputs', () => {
  const jobText = '数据分析师：负责经营分析、数据清洗和周报；要求 Python 和 SQL。';
  const messages = buildGenerationMessages({ config: { mode: 'preset', presetId: 'test' }, profileText: profile, jobText });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.equal(typeof messages[1].content, 'string');
  const input = JSON.parse(messages[1].content as string);
  assert.equal(input.profileText, profile);
  assert.equal(input.jobText, jobText);
  const instructions = String(messages[0].content);
  assert.match(instructions, /职责/);
  assert.match(instructions, /resumeEvidence/);
  assert.match(instructions, /sourceQuote/);
  assert.match(instructions, /resumePath/);
  assert.match(instructions, /resumeQuote/);
  assert.match(instructions, /summary/);
  assert.match(instructions, /description/);
  assert.match(instructions, /bullets/);
  assert.match(instructions, /skills/);
  assert.match(instructions, /参与/);
  assert.match(instructions, /主导/);
});

test('source and resume quotes must preserve meaningful punctuation and numeric separators', () => {
  const cases = [
    { actualSource: '使用 C++ 完成课程程序。', actualOutput: '使用 C++ 完成课程程序。', sourceQuote: '使用 C 完成课程程序。', resumeQuote: '使用 C++ 完成课程程序。' },
    { actualSource: '使用 C++ 完成课程程序。', actualOutput: '使用 C++ 完成课程程序。', sourceQuote: '使用 C++ 完成课程程序。', resumeQuote: '使用 C 完成课程程序。' },
    { actualSource: '通过优化节约 1.2 小时。', actualOutput: '通过优化节约 1.2 小时。', sourceQuote: '通过优化节约 12 小时。', resumeQuote: '通过优化节约 1.2 小时。' },
    { actualSource: '通过优化节约 1.2 小时。', actualOutput: '通过优化节约 1.2 小时。', sourceQuote: '通过优化节约 1.2 小时。', resumeQuote: '通过优化节约 12 小时。' },
  ];
  for (const item of cases) {
    const resume = { ...baseResume, projects: [{ ...baseResume.projects[0], description: [item.actualOutput] }] };
    const parsed = parse([requirement({ evidence: item.actualSource, resumeEvidence: [mapping({ sourceQuote: item.sourceQuote, resumeQuote: item.resumeQuote })] })], `姓名：王五\n${item.actualSource}`, resume);
    assert.deepEqual(parsed.report.requirements[0].resumeEvidence ?? [], [], JSON.stringify(item));
    assert.equal(parsed.report.requirements[0].status, 'partial');
    assert.ok(parsed.warnings.length > 0);
  }
});

test('short but real skill quotes such as R and Go are valid concrete evidence', () => {
  const resume = { ...baseResume, skills: [{ label: 'R', level: '' }, { label: 'Go', level: '' }] };
  const requirements = ['R', 'Go'].map((skill, index) => requirement({
    requirement: `${skill} 技能`, evidence: `使用 ${skill} 完成课程练习。`,
    resumeEvidence: [mapping({ sourceQuote: skill, resumePath: `skills.${index}.label`, resumeQuote: skill })],
  }));
  const parsed = parse(requirements, '姓名：王五\n使用 R 完成课程练习。\n使用 Go 完成课程练习。', resume);
  for (const [index, skill] of ['R', 'Go'].entries()) {
    assert.equal(parsed.report.requirements[index].status, 'matched');
    assert.equal(parsed.report.requirements[index].resumeEvidence?.[0].sourceQuote, skill);
    assert.equal(parsed.report.requirements[index].resumeEvidence?.[0].resumeQuote, skill);
  }
});

test('removing empty project placeholders preserves the valid source mapping at its final index', () => {
  const raw = result();
  const body = JSON.stringify({ ...raw, resume: { ...baseResume, projects: [{}, ...baseResume.projects] }, report: { ...raw.report, requirements: [requirement({ resumeEvidence: [mapping({ resumePath: 'projects.1.description.0' })] })] } });
  const parsed = parseGeneration(body, profile);
  assert.equal(parsed.resume.projects.length, 1);
  assert.equal(parsed.report.requirements[0].status, 'matched');
  assert.equal(parsed.report.requirements[0].resumeEvidence?.[0].resumePath, 'projects.0.description.0');
  assert.equal(getResumeEvidenceText(parsed.resume, parsed.report.requirements[0].resumeEvidence![0].resumePath), rewrittenFact);
  assert.ok(!parsed.resume.customSections.some(section => section.items.includes(sourceFact)));
});

test('removing empty experience placeholders preserves rewritten experience evidence without restoring its original', () => {
  const experienceSource = '参与活动筹备与资料整理。';
  const experienceOutput = baseResume.experience[0].bullets[0];
  const profileText = `姓名：王五\n[组织与协调实践]\n校团委 | 办公室干事\n2023.09 - 2023.11\n${experienceSource}`;
  const raw = result();
  const body = JSON.stringify({
    ...raw,
    resume: { ...baseResume, experience: [{}, ...baseResume.experience] },
    report: { ...raw.report, requirements: [requirement({ requirement: '资料整理与协同支持', evidence: experienceSource, resumeEvidence: [mapping({ sourceQuote: experienceSource, resumePath: 'experience.1.bullets.0', resumeQuote: experienceOutput })] })] },
  });
  const parsed = parseGeneration(body, profileText);
  assert.equal(parsed.resume.experience.length, 1);
  assert.equal(parsed.report.requirements[0].status, 'matched');
  assert.equal(parsed.report.requirements[0].resumeEvidence?.[0].resumePath, 'experience.0.bullets.0');
  assert.equal(getResumeEvidenceText(parsed.resume, parsed.report.requirements[0].resumeEvidence![0].resumePath), experienceOutput);
  assert.ok(!parsed.resume.customSections.some(section => section.items.includes(experienceSource)));
});

test('technical skill quotes use complete tokens and cannot extract Go from Google', () => {
  const resume = { ...baseResume, skills: [{ label: 'Go', level: '' }] };
  const quotedSkill = requirement({ requirement: 'Go 开发', evidence: '使用 Google Workspace 整理资料。', resumeEvidence: [mapping({ sourceQuote: 'Go', resumePath: 'skills.0.label', resumeQuote: 'Go' })] });
  const forged = parse([quotedSkill], '姓名：王五\n使用 Google Workspace 整理资料。', resume);
  assert.equal(forged.report.requirements[0].status, 'partial');
  assert.deepEqual(forged.report.requirements[0].resumeEvidence ?? [], []);
  const real = parse([{ ...quotedSkill, evidence: '使用 Go 完成课程练习。' }], '姓名：王五\n使用\tGo\n完成课程练习。', resume);
  assert.equal(real.report.requirements[0].status, 'matched');
  assert.equal(real.report.requirements[0].resumeEvidence?.[0].sourceQuote, 'Go');
});

test('nested empty lines preserve project, experience and custom item mappings at their final indices', () => {
  const experienceSource = '参与活动筹备与资料整理。';
  const cases = [
    {
      path: 'projects.0.description.1', finalPath: 'projects.0.description.0', source: sourceFact, output: rewrittenFact,
      resume: { ...baseResume, projects: [{ ...baseResume.projects[0], description: ['', rewrittenFact] }] },
    },
    {
      path: 'experience.0.bullets.1', finalPath: 'experience.0.bullets.0', source: experienceSource, output: baseResume.experience[0].bullets[0],
      resume: { ...baseResume, experience: [{ ...baseResume.experience[0], bullets: ['', baseResume.experience[0].bullets[0]] }] },
    },
    {
      path: 'customSections.0.items.1', finalPath: 'customSections.0.items.0', source: sourceFact, output: rewrittenFact,
      resume: { ...baseResume, projects: [], customSections: [{ id: 'extra-1', title: '数字化工具开发项目', items: ['', rewrittenFact] }] },
    },
  ];
  for (const item of cases) {
    const profileText = `姓名：王五\n[数字化工具开发项目]\n${item.source}`;
    const parsed = parse([requirement({ evidence: item.source, resumeEvidence: [mapping({ sourceQuote: item.source, resumePath: item.path, resumeQuote: item.output })] })], profileText, item.resume);
    assert.equal(parsed.report.requirements[0].status, 'matched', item.path);
    assert.equal(parsed.report.requirements[0].resumeEvidence?.[0].resumePath, item.finalPath, item.path);
    assert.equal(getResumeEvidenceText(parsed.resume, item.finalPath), item.output, item.path);
    assert.ok(!parsed.resume.customSections.some(section => section.items.includes(item.source)), item.path);
  }
});

test('source restoration preserves the real decimal figure when an invalid generated quote changes 1.2 to 12', () => {
  const original = '通过课程程序优化节约 1.2 小时。';
  const altered = '通过课程程序优化节约 12 小时。';
  const resume = { ...baseResume, projects: [{ ...baseResume.projects[0], title: '课程程序', description: [altered] }] };
  const parsed = parse([requirement({ evidence: original, resumeEvidence: [mapping({ sourceQuote: original, resumeQuote: original })] })], `姓名：王五\n[课程实践]\n课程程序\n${original}`, resume);
  assert.equal(parsed.report.requirements[0].status, 'partial');
  assert.deepEqual(parsed.report.requirements[0].resumeEvidence ?? [], []);
  const restored = parsed.resume.customSections.find(section => section.title === '课程实践');
  assert.ok(restored);
  assert.deepEqual(restored.items, [original]);
});
