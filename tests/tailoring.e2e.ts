import { test, expect, type Page, type Download } from '@playwright/test';
import { initialResume } from '../src/data';

const sourceQuote = '使用 Python 清洗销售数据，按用户群体统计复购情况，制作每周经营汇报。';
const resumeQuote = '使用 Python 清洗销售数据并按用户群体分析复购，为每周经营汇报提供分析结果。';
const resumePath = 'projects.0.description.0';
const reportSummary = '针对经营分析岗位，突出已有销售数据清洗、用户复购分析和经营汇报实践。';
const gapSuggestion = '请补充真实 SQL 使用经历后再体现查询能力。';
const profileText = `姓名：周晨
[教育背景]
真实大学
本科 | 信息管理
2022.09 - 2026.06
[项目经历]
电商复购分析
${sourceQuote}
[工作 / 实习经历]
零售团队 | 数据实习生
2025.07 - 2025.09
整理门店日报并核对销售口径。
[专业技能]
Python、Excel`;
const jobText = '岗位：经营分析师。职责：清洗业务数据并分析用户复购，制作每周经营汇报。要求：熟悉 Python，掌握 SQL。';

function tailoredResult() {
  const resume = structuredClone(initialResume);
  Object.assign(resume, {
    name: '周晨', role: '经营分析师', location: '', email: '', phone: '', website: '',
    summary: '使用 Python 处理销售数据，具备用户复购分析与经营汇报实践。',
    skills: [{ label: 'Python', level: '' }, { label: 'Excel', level: '' }],
    projects: [{ id: 'repurchase-analysis', title: '电商复购分析', meta: '', description: [resumeQuote], stack: ['Python'] }],
    experience: [{ company: '零售团队', role: '数据实习生', period: '2025.07 - 2025.09', bullets: ['整理门店日报并核对销售口径。'] }],
    education: [{ school: '真实大学', degree: '本科 | 信息管理', period: '2022.09 - 2026.06' }],
    awards: [], customSections: [], nodeStyles: {},
  });
  return {
    resume, jobTitle: '经营分析师', warnings: [],
    report: {
      summary: reportSummary,
      requirements: [
        {
          requirement: '清洗业务数据并分析用户复购', status: 'matched', evidence: sourceQuote, suggestion: '',
          resumeEvidence: [{ sourceQuote, resumePath, resumeQuote, sourceType: 'text' }],
        },
        { requirement: '掌握 SQL', status: 'missing', evidence: '', suggestion: gapSuggestion, resumeEvidence: [] },
      ],
    },
  };
}

function sourceDraft() {
  const result = tailoredResult();
  result.resume.summary = '材料包括销售数据处理、经营报表和门店日报整理经历。';
  result.resume.projects[0].description = [sourceQuote];
  result.report.summary = '个人材料中的销售数据项目对应经营分析岗位。';
  result.report.requirements[0].resumeEvidence = [{ sourceQuote, sourceType: 'text', resumePath, resumeQuote: sourceQuote }];
  return result;
}

function targetedPatch() {
  const result = tailoredResult();
  return {
    summary: result.resume.summary,
    projects: result.resume.projects.map(({ id, description }) => ({ id, description })),
    experience: result.resume.experience.map(({ bullets }, index) => ({ index, bullets })),
    customSections: result.resume.customSections.map(({ id, items }) => ({ id, items })),
    skillsOrder: [0, 1],
    report: result.report,
    warnings: [],
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/presets', route => route.fulfill({ json: [] }));
});

async function submitInputs(page: Page) {
  await page.locator('.intake-card textarea').first().fill(profileText);
  await page.locator('.intake-card textarea').nth(1).fill(jobText);
  await page.locator('.consent-line input').check();
  await page.getByRole('button', { name: '生成我的岗位简历' }).click();
}

async function submitMaterials(page: Page) {
  await submitInputs(page);
  await expect(page.locator('.resume-paper h1')).toHaveText('周晨');
  await expect(page.locator('.resume-paper')).toContainText(resumeQuote);
  await expect(page.locator('.resume-paper')).not.toContainText('SQL');
}

async function configureCustomModel(page: Page, url = 'https://tailoring.example/v1') {
  await page.getByRole('button', { name: 'AI 模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 模型设置' });
  await dialog.getByRole('button', { name: '自定义URL', exact: true }).click();
  await dialog.getByLabel('完整 URL', { exact: false }).fill(url);
  await dialog.getByLabel('模型名称', { exact: true }).fill('tailoring-test-model');
  await dialog.getByLabel('API Key', { exact: false }).fill('fake-tailoring-test-key');
  await dialog.getByRole('button', { name: '保存模型选择' }).click();
}

async function assertVisibleMapping(page: Page) {
  await page.getByRole('button', { name: '岗位匹配', exact: true }).click();
  const matchPage = page.locator('.match-page');
  await expect(matchPage).toContainText('简历中的对应描述');
  await expect(matchPage).toContainText(sourceQuote);
  await expect(matchPage).toContainText(resumeQuote);
  await expect(matchPage).toContainText(gapSuggestion);
  await expect(matchPage).not.toContainText(resumePath);
  await expect(matchPage).not.toContainText('sourceType');
}

async function downloadedText(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('preset tailoring maps a requirement to its source and rewritten resume, persists on reload and exports only the resume', async ({ page }) => {
  await page.route('**/api/ai/generate', route => {
    const request = route.request().postDataJSON();
    expect(request.profileText).toBe(profileText);
    expect(request.jobText).toBe(jobText);
    return route.fulfill({ json: tailoredResult() });
  });
  await page.goto('/');
  await submitMaterials(page);
  const versionId = await page.locator('.version-select').inputValue();
  await assertVisibleMapping(page);
  await expect(page.locator('.save-state')).toContainText('已本地保存');
  await page.reload();
  await page.getByRole('button', { name: '打开版本侧边栏', exact: true }).click();
  await page.locator(`.version-item[data-version-id="${versionId}"]`).click();
  await assertVisibleMapping(page);

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  const html = await downloadedText(await downloaded);
  expect(html).toContain(resumeQuote);
  expect(html).not.toContain(sourceQuote);
  expect(html).not.toContain(reportSummary);
  expect(html).not.toContain(gapSuggestion);
  expect(html).not.toContain('简历中的对应描述');
  expect(html).not.toContain(resumePath);
});

test('custom direct generation rewrites source draft in a separate stage and preserves the factual fields', async ({ page }) => {
  let directCalls = 0;
  let backendCalls = 0;
  const invalidQuote = '不存在的正文描述：主导预算预测。';
  await page.route('**/api/ai/generate', route => {
    backendCalls++;
    return route.fulfill({ status: 400, json: { error: '自定义资料应直接发送到模型通道。' } });
  });
  await page.route('https://tailoring.example/v1/chat/completions', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' } });
    }
    directCalls++;
    const request = route.request().postDataJSON();
    expect(request.model).toBe('tailoring-test-model');
    const system = request.messages.find((message: { role: string }) => message.role === 'system').content;
    expect(system).toContain('岗位');
    expect(system).toContain('事实');
    expect(system).toContain('summary');
    expect(system).toContain('experience');
    expect(JSON.stringify(request.messages)).toContain(sourceQuote);
    let result: ReturnType<typeof sourceDraft> | ReturnType<typeof targetedPatch>;
    if (system.includes('岗位正文改写阶段')) {
      expect(directCalls).toBe(2);
      const user = request.messages.find((message: { role: string }) => message.role === 'user').content;
      const input = JSON.parse(user);
      expect(input.profileText).toBe(profileText);
      expect(input.jobText).toBe(jobText);
      expect(JSON.stringify(input.draft)).toContain(sourceQuote);
      expect(JSON.stringify(input.draft)).not.toContain(resumeQuote);
      result = targetedPatch();
      result.report.requirements[0].resumeEvidence.push({ sourceQuote, resumePath: 'projects.9.description.0', resumeQuote: invalidQuote, sourceType: 'text' });
    } else {
      expect(directCalls).toBe(1);
      expect(system).toMatch(/拆解|拆分|分解/);
      result = sourceDraft();
    }
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(result)}\n\`\`\`` } }] },
    });
  });
  await page.goto('/');
  await configureCustomModel(page);
  await submitMaterials(page);
  await expect(page.locator('.resume-paper')).toContainText(tailoredResult().resume.summary);
  await expect(page.locator('.resume-paper')).not.toContainText(sourceDraft().resume.summary);
  await expect(page.locator('.resume-paper')).not.toContainText(sourceQuote);
  await assertVisibleMapping(page);
  await expect(page.locator('.match-page')).not.toContainText(invalidQuote);
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载全部版本备份', exact: true }).click();
  const backup = JSON.parse(await downloadedText(await downloaded));
  expect(backup.versions[0].report.requirements[0].resumeEvidence).toEqual([{ sourceQuote, sourceType: 'text', resumePath, resumeQuote }]);
  const savedResume = backup.versions[0].resume;
  const original = sourceDraft().resume;
  expect(savedResume.summary).toBe(tailoredResult().resume.summary);
  expect(savedResume.projects[0]).toEqual({ ...original.projects[0], description: [resumeQuote] });
  expect(savedResume.name).toBe(original.name);
  expect(savedResume.email).toBe(original.email);
  expect(savedResume.skills).toEqual(original.skills);
  expect(savedResume.experience).toEqual(original.experience);
  expect(savedResume.education).toEqual(original.education);
  expect(savedResume.awards).toEqual(original.awards);
  expect(savedResume.design).toEqual(original.design);
  expect(directCalls).toBe(2);
  expect(backendCalls).toBe(0);
});

test('failure in the dedicated rewrite stage keeps both inputs and never saves the preliminary draft', async ({ page }) => {
  let directCalls = 0;
  let backendCalls = 0;
  await page.route('**/api/ai/generate', route => {
    backendCalls++;
    return route.fulfill({ status: 400, json: { error: '自定义资料应直接发送到模型通道。' } });
  });
  await page.route('https://tailoring.example/v1/chat/completions', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type' } });
    }
    directCalls++;
    const request = route.request().postDataJSON();
    const system = request.messages.find((message: { role: string }) => message.role === 'system').content;
    if (system.includes('岗位正文改写阶段')) {
      expect(directCalls).toBe(2);
      return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, json: { error: 'rewrite unavailable' } });
    }
    expect(directCalls).toBe(1);
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { choices: [{ message: { content: JSON.stringify(sourceDraft()) } }] } });
  });
  await page.goto('/');
  await configureCustomModel(page);
  await submitInputs(page);
  await expect(page.getByRole('alert')).toContainText('503');
  await expect(page.locator('.intake-card textarea').first()).toHaveValue(profileText);
  await expect(page.locator('.intake-card textarea').nth(1)).toHaveValue(jobText);
  await expect(page.locator('.resume-paper')).toHaveCount(0);
  await expect(page.locator('.version-item')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '打开版本侧边栏', exact: true }).click();
  await expect(page.locator('.version-item')).toHaveCount(0);
  expect(directCalls).toBe(2);
  expect(backendCalls).toBe(0);
});
