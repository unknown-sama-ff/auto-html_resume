import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { designSchema, normalizeGenerationPayload, resumeSchema } from '../shared/contracts';
import { FONT_IDS, FONT_OPTIONS, FONT_STACKS } from '../shared/design';
import { initialResume } from '../src/data';
import { ResumePreview } from '../src/components/ResumePreview';
import { applyPatch, getNodeContent, getNodeMeta, getNodeStyle, updateContent } from '../src/lib/ai';
import { contentField } from '../src/lib/contentFields';
import { applyTemplate, getBaseNodeStyle } from '../src/lib/design';
import { hideSection, moveSection, orderedSections, restoreSection, sectionColumn, sectionTitle } from '../src/lib/sections';
import { emptyWorkspace, makeVersion, migrateWorkspace, workspaceReducer } from '../src/lib/workspace';
import type { ResumeData } from '../src/types';

function document(): ResumeData {
  return resumeSchema.parse({
    ...structuredClone(initialResume),
    design: { ...initialResume.design, templateId: 'technical' },
    experience: [
      ...initialResume.experience,
      { company: '第二家公司', role: '分析实习生', period: '2025 — 2026', bullets: ['第二份工作描述', '相邻描述应保留'] },
    ],
    education: [...initialResume.education, { school: '第二所学校', degree: '硕士', period: '2022 — 2025' }],
    customSections: [{ id: 'language', title: '语言能力', items: ['英语 C1', '日语 N2'] }],
  });
}

function markup(resume: ResumeData) {
  return renderToStaticMarkup(createElement(ResumePreview, { resume, interactive: false }));
}

test('moving a section between columns changes reading order without mutating content or duplicating sections', () => {
  const original = document();
  const before = structuredClone(original);
  assert.equal(sectionColumn(original, 'skills'), 'side');
  assert.equal(sectionColumn(original, 'projects'), 'main');

  const moved = moveSection(original, 'skills', 'projects', 'main');
  const main = orderedSections(moved).filter(id => sectionColumn(moved, id) === 'main');
  assert.ok(main.indexOf('skills') < main.indexOf('projects'));
  assert.equal(sectionColumn(moved, 'skills'), 'main');
  assert.equal(orderedSections(moved).filter(id => id === 'skills').length, 1);
  assert.deepEqual(moved.skills, before.skills);
  assert.deepEqual(moved.projects, before.projects);
  assert.deepEqual(original, before);

  const reverse = moveSection(moved, 'projects', 'education', 'side', true);
  const side = orderedSections(reverse).filter(id => sectionColumn(reverse, id) === 'side');
  assert.ok(side.indexOf('education') < side.indexOf('projects'));
  assert.equal(sectionColumn(reverse, 'projects'), 'side');
  assert.deepEqual(moved.projects, before.projects);
  assert.equal(resumeSchema.safeParse(reverse).success, true);

  const singleColumn = applyTemplate(reverse, 'minimal');
  assert.equal(sectionColumn(singleColumn, 'projects'), 'main');
  assert.equal(sectionColumn(singleColumn, 'skills'), 'main');
  assert.ok(markup(singleColumn).indexOf('data-section="skills"') < markup(singleColumn).indexOf('data-section="projects"'));
});

test('dropping into an empty column appends once and invalid move targets leave the document intact', () => {
  const original = document();
  const moved = moveSection(original, 'custom-language', null, 'full');
  assert.equal(orderedSections(moved).at(-1), 'custom-language');
  assert.equal(sectionColumn(moved, 'custom-language'), 'full');
  assert.deepEqual(moved.customSections, original.customSections);
  assert.equal(moveSection(original, 'not-a-section', 'projects', 'main'), original);
  assert.equal(moveSection(original, 'projects', 'projects', 'side'), original);
});

test('deleting and restoring built-in or custom sections keeps all content and the saved layout', () => {
  const original = moveSection(document(), 'custom-language', 'skills', 'side');
  const before = structuredClone(original);
  const hidden = hideSection(hideSection(hideSection(original, 'projects'), 'custom-language'), 'projects');
  assert.deepEqual(hidden.hiddenSections, ['projects', 'custom-language']);
  assert.ok(!orderedSections(hidden).includes('projects'));
  assert.ok(!orderedSections(hidden).includes('custom-language'));
  assert.ok(orderedSections(hidden, true).includes('projects'));
  assert.ok(!markup(hidden).includes(original.projects[0].title));
  assert.ok(!markup(hidden).includes('日语 N2'));
  assert.deepEqual(hidden.projects, original.projects);
  assert.deepEqual(hidden.customSections, original.customSections);
  assert.deepEqual(original, before);

  const restored = restoreSection(restoreSection(hidden, 'projects'), 'custom-language');
  assert.deepEqual(restored, original);
  assert.equal(sectionColumn(restored, 'custom-language'), 'side');
  assert.ok(markup(restored).includes('日语 N2'));
});

test('section deletion is undoable and survives workspace backup without removing source facts', () => {
  const original = document();
  const version = makeVersion({ resume: original, jobTitle: '工程师', report: { summary: '', requirements: [] }, warnings: [] });
  let state = workspaceReducer(emptyWorkspace, { type: 'add', version });
  state = workspaceReducer(state, { type: 'commit', id: version.id, resume: hideSection(original, 'experience'), label: '删除工作经历栏目', source: 'manual' });
  assert.ok(!orderedSections(state.versions[0].resume).includes('experience'));
  state = workspaceReducer(state, { type: 'undo', id: version.id });
  assert.deepEqual(state.versions[0].resume, original);
  state = workspaceReducer(state, { type: 'redo', id: version.id });
  const restored = migrateWorkspace(JSON.parse(JSON.stringify(state))).versions[0];
  assert.deepEqual(restored.resume.experience, original.experience);
  assert.deepEqual(restored.resume.hiddenSections, ['experience']);
  assert.equal(restored.history[0].label, '删除工作经历栏目');
  assert.deepEqual(restored.past[0].experience, original.experience);
});

test('new child nodes update only the selected contact, project, experience, education, skill or award field', () => {
  const original = document();
  const before = structuredClone(original);
  const cases: { id: string; value: string; expected: (resume: ResumeData, value: string) => void }[] = [
    { id: 'profile-location', value: '杭州', expected: (r, v) => { r.location = v; } },
    { id: 'profile-email', value: 'new@example.com', expected: (r, v) => { r.email = v; } },
    { id: 'profile-phone', value: '13900000000', expected: (r, v) => { r.phone = v; } },
    { id: 'profile-website', value: 'portfolio.example', expected: (r, v) => { r.website = v; } },
    { id: 'project-2-meta', value: '2025 · 开发者', expected: (r, v) => { r.projects[1].meta = v; } },
    { id: 'experience-2-company', value: '真实团队', expected: (r, v) => { r.experience[1].company = v; } },
    { id: 'experience-2-role', value: '研究助理', expected: (r, v) => { r.experience[1].role = v; } },
    { id: 'experience-2-period', value: '2026.01 — 2026.09', expected: (r, v) => { r.experience[1].period = v; } },
    { id: 'experience-2-bullet-1', value: '核对真实项目材料', expected: (r, v) => { r.experience[1].bullets[0] = v; } },
    { id: 'education-2-school', value: '真实大学', expected: (r, v) => { r.education[1].school = v; } },
    { id: 'education-2-degree', value: '工程管理 · 硕士', expected: (r, v) => { r.education[1].degree = v; } },
    { id: 'education-2-period', value: '2023 — 2026', expected: (r, v) => { r.education[1].period = v; } },
    { id: 'skill-2-label', value: '数据分析', expected: (r, v) => { r.skills[1].label = v; } },
    { id: 'skill-2-level', value: '熟练', expected: (r, v) => { r.skills[1].level = v; } },
    { id: 'award-2', value: '2026 · 真实奖项', expected: (r, v) => { r.awards[1] = v; } },
  ];
  for (const { id, value, expected } of cases) {
    assert.ok(contentField(original, id), id);
    assert.equal(getNodeMeta(original, id).kind, 'text', id);
    const changed = updateContent(original, id, value);
    const expectedDocument = structuredClone(original);
    expected(expectedDocument, value);
    assert.deepEqual(changed, expectedDocument, id);
    assert.equal(getNodeContent(changed, id), value, id);
    assert.equal(getNodeMeta(changed, id).content, value, id);
    assert.equal(resumeSchema.safeParse(changed).success, true, id);
  }
  const tags = updateContent(original, 'project-2-stack', ' TypeScript \n\n React \n');
  assert.deepEqual(tags.projects[1].stack, ['TypeScript', 'React']);
  assert.deepEqual(tags.projects[0], original.projects[0]);
  assert.equal(getNodeMeta(tags, 'project-2-stack').content, 'TypeScript\nReact');
  assert.deepEqual(original, before);
});

test('built-in and custom section titles are directly editable without changing their content', () => {
  const original = document();
  for (const section of ['summary', 'projects', 'experience', 'education', 'skills', 'awards']) {
    const id = section + '-section-title';
    const changed = updateContent(original, id, '新的栏目名称');
    assert.equal(sectionTitle(changed, section), '新的栏目名称');
    assert.equal(getNodeMeta(changed, id).content, '新的栏目名称');
    assert.deepEqual(changed.projects, original.projects);
    assert.deepEqual(original.sectionTitles, {});
  }
  const changed = updateContent(original, 'custom-language-title', '语言与沟通');
  assert.equal(sectionTitle(changed, 'custom-language'), '语言与沟通');
  assert.deepEqual(changed.customSections[0].items, original.customSections[0].items);
  assert.equal(original.customSections[0].title, '语言能力');
});

test('unknown, out-of-range and injected node IDs cannot produce edit metadata or apply AI patches', () => {
  const original = document();
  const before = structuredClone(original);
  for (const id of ['unregistered-node', '__proto__', 'profile-password', 'project-99-meta', 'experience-0-company', 'experience-2-bullet-99', 'education-99-school', 'skill-99-label', 'award-99', 'projects[0].title']) {
    assert.equal(contentField(original, id), null, id);
    assert.throws(() => getNodeMeta(original, id), undefined, id);
    assert.throws(() => applyPatch(original, { id: 'unsafe', targetNodeId: id, operation: 'rewriteText', path: 'content.text', value: '不应应用', reason: '', requiresConfirmation: true, preview: '' }), undefined, id);
  }
  assert.deepEqual(original, before);
});

test('old workspace documents receive editor defaults in the current document and every history snapshot', () => {
  const version = makeVersion({ resume: document(), jobTitle: '工程师', report: { summary: '', requirements: [] }, warnings: [] });
  let state = workspaceReducer(emptyWorkspace, { type: 'add', version });
  for (const name of ['第一次修改', '第二次修改']) {
    state = workspaceReducer(state, { type: 'commit', id: version.id, resume: { ...state.versions[0].resume, name }, label: '修改姓名', source: 'manual' });
  }
  state = workspaceReducer(state, { type: 'undo', id: version.id });
  const raw = JSON.parse(JSON.stringify(state));
  const legacy = raw.versions[0];
  const snapshots = [legacy.resume, ...legacy.past, ...legacy.future, ...legacy.history.flatMap((operation: { before: unknown; after: unknown }) => [operation.before, operation.after])];
  for (const resume of snapshots) {
    for (const key of ['sectionTitles', 'sectionOrder', 'sectionColumns', 'hiddenSections']) delete resume[key];
    delete resume.design.avatarScale;
  }
  const restored = migrateWorkspace(raw).versions[0];
  assert.equal(restored.resume.name, '第一次修改');
  assert.equal(restored.future[0].name, '第二次修改');
  assert.equal(restored.history.length, 2);
  for (const resume of [restored.resume, ...restored.past, ...restored.future, ...restored.history.flatMap(operation => [operation.before, operation.after])]) {
    assert.deepEqual(resume.sectionTitles, {});
    assert.deepEqual(resume.sectionOrder, []);
    assert.deepEqual(resume.sectionColumns, {});
    assert.deepEqual(resume.hiddenSections, []);
    assert.equal(resume.design.avatarScale, 1);
    assert.deepEqual(resume.projects, version.resume.projects);
  }
});

test('all font choices validate and local font overrides inherit the page font while avatar scaling survives template changes', () => {
  assert.deepEqual(FONT_OPTIONS.map(option => option.id), [...FONT_IDS]);
  for (const id of FONT_IDS) {
    assert.ok(FONT_STACKS[id], id);
    const resume = resumeSchema.parse({ ...document(), design: { ...document().design, fontFamily: id, avatarScale: 1.5 } });
    assert.equal(getBaseNodeStyle(resume, 'profile-name').fontFamily, id);
    assert.equal(applyTemplate(resume, 'modern').design.avatarScale, 1.5);
  }
  const original = document();
  original.design.fontFamily = 'yahei';
  original.design.avatarScale = 0.75;
  original.nodeStyles = { page: { fontFamily: 'heiti' }, 'project-1-title': { fontFamily: 'kaiti' } };
  const before = structuredClone(original);
  assert.equal(getNodeStyle(original, 'profile-name').fontFamily, 'heiti');
  assert.equal(getNodeStyle(original, 'project-1-title').fontFamily, 'kaiti');
  const changed = applyTemplate(original, 'academic');
  assert.equal(changed.design.avatarScale, 0.75);
  assert.deepEqual(changed.nodeStyles, original.nodeStyles);
  assert.deepEqual(original, before);
  for (const avatarScale of [0.74, 1.51, NaN]) assert.equal(designSchema.safeParse({ ...original.design, avatarScale }).success, false);
  assert.equal(resumeSchema.safeParse({ ...original, nodeStyles: { page: { fontFamily: 'remote-font' } } }).success, false);
});

test('generation normalization preserves editor metadata without turning it into extra resume sections', () => {
  const source = {
    ...document(),
    sectionTitles: { projects: '研究与项目', 'invalid id': '忽略', skills: 42 },
    sectionOrder: ['skills', 'projects', 'invalid id'],
    sectionColumns: { skills: 'main', projects: 'side', awards: 'invalid-column' },
    hiddenSections: ['awards', 'invalid id'],
    patents: ['真实专利事实'],
    design: { ...document().design, fontFamily: 'fangsong', avatarScale: 1.25 },
    nodeStyles: { 'project-1-title': { fontFamily: 'kaiti' } },
  };
  const normalized = normalizeGenerationPayload({ resume: source, jobTitle: '工程师', report: { summary: '', requirements: [] }, warnings: [] });
  const resume = resumeSchema.parse(normalized.resume);
  assert.deepEqual(resume.sectionTitles, { projects: '研究与项目' });
  assert.deepEqual(resume.sectionOrder, ['skills', 'projects']);
  assert.deepEqual(resume.sectionColumns, { skills: 'main', projects: 'side' });
  assert.deepEqual(resume.hiddenSections, ['awards']);
  assert.equal(resume.design.fontFamily, 'fangsong');
  assert.equal(resume.design.avatarScale, 1.25);
  assert.equal(resume.nodeStyles['project-1-title'].fontFamily, 'kaiti');
  assert.ok(resume.customSections.some(section => section.items.includes('真实专利事实')));
  assert.ok(!resume.customSections.some(section => ['sectionTitles', 'sectionOrder', 'sectionColumns', 'hiddenSections', 'nodeStyles'].includes(section.title)));
});

test('standalone resume rendering retains new selectable node IDs and layout while excluding editor controls', () => {
  const original = document();
  original.avatarDataUrl = 'data:image/png;base64,AQ==';
  original.design.avatarScale = 1.25;
  const moved = moveSection(original, 'skills', 'projects', 'main');
  const html = markup(moved);
  for (const id of ['profile-location', 'profile-email', 'profile-phone', 'profile-website', 'project-2-meta', 'project-2-stack', 'experience-2-company', 'experience-2-role', 'experience-2-period', 'experience-2-bullet-1', 'education-2-school', 'education-2-degree', 'education-2-period', 'skill-2-label', 'skill-2-level', 'award-2']) {
    assert.ok(html.includes('data-node-id="' + id + '"'), id);
  }
  assert.ok(html.indexOf('data-section="skills"') < html.indexOf('data-section="projects"'));
  assert.ok(html.includes('zoom:1.25'));
  assert.ok(!/contenteditable|section-edit-tools|section-drag-handle|page-selection-control|role="textbox"|<script/i.test(html));
});
