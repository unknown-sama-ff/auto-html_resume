import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneration } from '../shared/generationPipeline';
import type { CompletionMessage } from '../shared/generation';
import { resumeSchema, getResumeEvidenceText } from '../shared/contracts';

const sourceProject = '使用 Python 清洗每日销售表，按品类汇总库存变化。';
const sourceExperience = '整理捐赠登记表并核对缺失记录。';
const profileText = [
  '姓名：林澈',
  '[项目经历]', '社区菜市场库存看板', sourceProject,
  '[工作 / 实习经历]', '青禾公益中心 | 数据助理', '2024.06 - 2024.08', sourceExperience,
  '[教育背景]', '东川大学', '信息管理 | 本科', '2022.09 - 2026.06',
  '[专业技能]', 'Python、Excel',
  '[语言能力]', '英语六级',
].join('\n');
const analystJob = '经营分析师：清洗销售数据，汇总品类库存变化，支持经营周报；要求 SQL。';
const operationsJob = '运营报表专员：维护报表明细，核对缺失记录，输出运营报表。';
const originalSummary = '有数据整理与表格核对实践。';
const draftResume = resumeSchema.parse({
  name: '林澈', role: '测试岗位', location: '东川', email: 'lin@example.test', phone: '13800000000', website: '',
  summary: originalSummary,
  skills: [{ label: 'Python', level: '' }, { label: 'Excel', level: '' }],
  projects: [{ id: 'market', title: '社区菜市场库存看板', meta: '课程项目', description: [sourceProject], stack: ['Python'] }],
  experience: [{ company: '青禾公益中心', role: '数据助理', period: '2024.06 - 2024.08', bullets: [sourceExperience] }],
  education: [{ school: '东川大学', degree: '信息管理 | 本科', period: '2022.09 - 2026.06' }],
  awards: [], customSections: [{ id: 'language', title: '语言能力', items: ['英语六级'] }],
});

function request(jobText = analystJob) {
  return {
    config: { mode: 'preset', presetId: 'test' },
    profileText, jobText, templateId: 'auto',
    profileImages: [{ name: '个人图片.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }],
    jobImages: [{ name: '岗位图片.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQ==' }],
  };
}

function report(projectQuote: string, experienceQuote: string) {
  return {
    summary: '依据真实材料组织岗位相关描述。',
    requirements: [
      {
        requirement: '数据整理', status: 'matched', evidence: sourceProject, suggestion: '',
        resumeEvidence: [{ sourceQuote: sourceProject, sourceType: 'text', resumePath: 'projects.0.description.0', resumeQuote: projectQuote }],
      },
      {
        requirement: '表格核对', status: 'matched', evidence: sourceExperience, suggestion: '',
        resumeEvidence: [{ sourceQuote: sourceExperience, sourceType: 'text', resumePath: 'experience.0.bullets.0', resumeQuote: experienceQuote }],
      },
      { requirement: 'SQL', status: 'missing', evidence: '', suggestion: '请补充真实 SQL 使用经历。', resumeEvidence: [] },
    ],
  };
}

function draft() {
  return {
    jobTitle: '测试岗位', resume: structuredClone(draftResume),
    report: report(sourceProject, sourceExperience), warnings: [],
  };
}

function patch(
  summary = '使用 Python 清洗销售表并汇总库存变化，具备数据核对实践。',
  project = '使用 Python 清洗每日销售表并汇总品类库存变化，为经营周报整理数据。',
  experience = '核对捐赠登记表中的缺失记录，整理可供汇总的登记明细。',
) {
  return {
    summary,
    projects: [{ id: 'market', description: [project] }],
    experience: [{ index: 0, bullets: [experience] }],
    skillsOrder: [0, 1],
    customSections: [{ id: 'language', items: ['英语六级'] }],
    report: report(project, experience),
    warnings: [],
  };
}

type Call = { messages: CompletionMessage[]; stage: 'analysis' | 'tailoring' };

function runWithPatch(tailored: unknown, calls: Call[] = [], jobText = analystJob) {
  return runGeneration(request(jobText), async (messages, stage) => {
    calls.push({ messages, stage });
    return JSON.stringify(stage === 'analysis' ? draft() : tailored);
  });
}

function messageValues(messages: CompletionMessage[]) {
  return messages.flatMap(message => typeof message.content === 'string'
    ? [message.content]
    : message.content.map(part => part.type === 'text' ? part.text : part.image_url.url));
}

function hasDiagnostic(diagnostic: string) {
  return (error: unknown) => (error as { diagnostic?: string }).diagnostic === diagnostic;
}

test('the same profile goes through two stages and different jobs produce different resume body content', async () => {
  const analystCalls: Call[] = [];
  const operationsCalls: Call[] = [];
  const analystPatch = patch();
  const operationsPatch = patch(
    '具备销售表明细整理与缺失记录核对实践，支持运营报表制作。',
    '围绕运营报表整理每日销售明细，使用 Python 清洗数据并按品类汇总库存变化。',
    '整理捐赠登记明细并核对缺失记录，支持表格维护。',
  );
  operationsPatch.skillsOrder = [1, 0];
  const analyst = await runWithPatch(analystPatch, analystCalls);
  const operations = await runWithPatch(operationsPatch, operationsCalls, operationsJob);

  for (const calls of [analystCalls, operationsCalls]) {
    assert.deepEqual(calls.map(call => call.stage), ['analysis', 'tailoring']);
  }
  assert.equal(analyst.resume.summary, analystPatch.summary);
  assert.deepEqual(analyst.resume.projects[0].description, analystPatch.projects[0].description);
  assert.deepEqual(analyst.resume.experience[0].bullets, analystPatch.experience[0].bullets);
  assert.equal(operations.resume.summary, operationsPatch.summary);
  assert.notEqual(analyst.resume.summary, operations.resume.summary);
  assert.notDeepEqual(analyst.resume.projects[0].description, operations.resume.projects[0].description);
  assert.notDeepEqual(analyst.resume.experience[0].bullets, operations.resume.experience[0].bullets);
  assert.notEqual(analyst.resume.projects[0].description[0], sourceProject);
  assert.deepEqual(operations.resume.skills.map(skill => skill.label), ['Excel', 'Python']);
  assert.equal(JSON.stringify(analyst.resume).includes('SQL'), false);
  assert.equal(analyst.report.requirements[2].status, 'missing');

  for (const result of [analyst, operations]) {
    const current = result.resume;
    for (const field of ['name', 'location', 'email', 'phone', 'website', 'education', 'awards', 'design', 'nodeStyles'] as const) {
      assert.deepEqual(current[field], draftResume[field], field);
    }
    assert.equal(current.projects[0].id, draftResume.projects[0].id);
    assert.equal(current.projects[0].title, draftResume.projects[0].title);
    assert.equal(current.projects[0].meta, draftResume.projects[0].meta);
    assert.deepEqual(current.projects[0].stack, draftResume.projects[0].stack);
    for (const field of ['company', 'role', 'period'] as const) {
      assert.equal(current.experience[0][field], draftResume.experience[0][field], field);
    }
    assert.equal(current.customSections[0].title, draftResume.customSections[0].title);
    for (const requirement of result.report.requirements) {
      for (const mapping of requirement.resumeEvidence ?? []) {
        assert.equal(getResumeEvidenceText(current, mapping.resumePath), mapping.resumeQuote);
      }
    }
    assert.ok(!current.customSections.some(section => section.items.includes(sourceProject) || section.items.includes(sourceExperience)));
  }
});

test('tailoring receives the full original material, target job, images and fact draft', async () => {
  const calls: Call[] = [];
  await runWithPatch(patch(), calls);
  const values = messageValues(calls[1].messages);
  const encoded = values.join('\n');
  assert.ok(encoded.includes(JSON.stringify(profileText).slice(1, -1)));
  assert.ok(encoded.includes(analystJob));
  assert.ok(encoded.includes(originalSummary), 'the fact draft must reach the second stage');
  assert.ok(encoded.includes('社区菜市场库存看板'));
  assert.ok(values.includes('data:image/png;base64,AA=='));
  assert.ok(values.includes('data:image/png;base64,AQ=='));
});

test('a summary-only change cannot pass off copied project and experience prose as tailoring', async () => {
  await assert.rejects(
    runWithPatch(patch('仅更换面向经营分析师的个人简介。', sourceProject, sourceExperience)),
    hasDiagnostic('insufficient_tailoring'),
  );
});

test('an unchanged body needs a substantive retained reason instead of silent copy-and-paste', async () => {
  const unchanged = patch(originalSummary, sourceProject, sourceExperience);
  await assert.rejects(runWithPatch(unchanged), hasDiagnostic('insufficient_tailoring'));
  await assert.rejects(runWithPatch({ ...unchanged, retainedReason: '无需修改' }), hasDiagnostic('insufficient_tailoring'));
  const result = await runWithPatch({
    ...unchanged,
    retainedReason: '原描述已准确对应岗位的数据整理和记录核对职责，继续保留可以避免改变事实。',
  });
  assert.equal(result.resume.summary, originalSummary);
  assert.deepEqual(result.resume.projects[0].description, [sourceProject]);
});

test('a generic summary mapping cannot justify dropping complete custom-section facts', async () => {
  const activityFact = '协助登记校园活动 80 名参与者，记录 1200 元物料预算。';
  const first = draft();
  first.resume.customSections.push({ id: 'activity', title: '活动实践', items: [activityFact] });
  const tailored = patch('具有校园活动登记和材料整理实践。');
  tailored.customSections.push({ id: 'activity', items: [] });
  tailored.report.requirements.push({
    requirement: '活动支持', status: 'matched', evidence: activityFact, suggestion: '',
    resumeEvidence: [{ sourceQuote: activityFact, sourceType: 'text', resumePath: 'summary', resumeQuote: tailored.summary }],
  });
  await assert.rejects(
    runGeneration({ ...request(), profileText: profileText + '\n[活动实践]\n' + activityFact }, async (_messages, stage) =>
      JSON.stringify(stage === 'analysis' ? first : tailored)),
    hasDiagnostic('insufficient_tailoring'),
  );
});

test('an unchanged body with a generic retained reason needs valid concrete resume mappings', async () => {
  const unchanged = patch(originalSummary, sourceProject, sourceExperience);
  unchanged.report.requirements = unchanged.report.requirements.map(requirement => ({
    ...requirement,
    resumeEvidence: [],
  }));
  await assert.rejects(
    runWithPatch({
      ...unchanged,
      retainedReason: '原描述已经符合岗位要求，因此无需修改，继续保留所有原文即可。',
    }),
    hasDiagnostic('insufficient_tailoring'),
  );
});

test('a missing requirement report cannot be treated as a completed tailoring result', async () => {
  const valid = patch();
  await assert.rejects(
    runWithPatch({ ...valid, report: { summary: '只提供概述而未核对岗位要求。' } }),
    hasDiagnostic('insufficient_tailoring'),
  );
});

test('tailoring rejects unknown, duplicate and omitted references or incomplete skill permutations', async () => {
  const invalid: unknown[] = [
    { ...patch(), projects: [{ id: 'unknown', description: ['项目改写。'] }] },
    { ...patch(), projects: [...patch().projects, ...patch().projects] },
    { ...patch(), projects: [] },
    { ...patch(), experience: [{ index: 7, bullets: ['经历改写。'] }] },
    { ...patch(), experience: [...patch().experience, ...patch().experience] },
    { ...patch(), experience: [] },
    { ...patch(), customSections: [{ id: 'unknown', items: ['补充信息。'] }] },
    { ...patch(), customSections: [...patch().customSections, ...patch().customSections] },
    { ...patch(), customSections: [] },
    { ...patch(), skillsOrder: [0, 0] },
    { ...patch(), skillsOrder: [0] },
    { ...patch(), skillsOrder: [0, 2] },
  ];
  for (const input of invalid) {
    await assert.rejects(runWithPatch(input), 'invalid collection: ' + JSON.stringify(input));
  }
  const { skillsOrder: _omitted, ...withoutOrder } = patch();
  assert.deepEqual((await runWithPatch(withoutOrder)).resume.skills, draftResume.skills);
});

test('tailoring transport failure and invalid output never return the first-stage draft', async () => {
  let calls = 0;
  const failure = new Error('synthetic tailoring failure');
  await assert.rejects(
    runGeneration(request(), async (_messages, stage) => {
      calls += 1;
      if (stage === 'analysis') return JSON.stringify(draft());
      throw failure;
    }),
    error => error === failure,
  );
  assert.equal(calls, 2);

  let invalidCalls = 0;
  await assert.rejects(runGeneration(request(), async (_messages, stage) => {
    invalidCalls += 1;
    return stage === 'analysis' ? JSON.stringify(draft()) : 'invalid second-stage response';
  }));
  assert.equal(invalidCalls, 2);
});

test('analysis failure stops before requesting tailoring', async () => {
  let calls = 0;
  const failure = new Error('synthetic analysis failure');
  await assert.rejects(
    runGeneration(request(), async () => { calls += 1; throw failure; }),
    error => error === failure,
  );
  assert.equal(calls, 1);
});

test('cancellation between stages stops tailoring and cancellation during tailoring does not return a draft', async () => {
  const between = new AbortController();
  let betweenCalls = 0;
  await assert.rejects(runGeneration(request(), async () => {
    betweenCalls += 1;
    between.abort();
    return JSON.stringify(draft());
  }, between.signal));
  assert.equal(betweenCalls, 1);

  const during = new AbortController();
  let duringCalls = 0;
  await assert.rejects(runGeneration(request(), async (_messages, stage) => {
    duringCalls += 1;
    if (stage === 'analysis') return JSON.stringify(draft());
    during.abort();
    return JSON.stringify(patch());
  }, during.signal));
  assert.equal(duringCalls, 2);
});
