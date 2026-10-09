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

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/presets', route => route.fulfill({ json: [] }));
});

async function submitMaterials(page: Page) {
  await page.locator('.intake-card textarea').first().fill(profileText);
  await page.locator('.intake-card textarea').nth(1).fill(jobText);
  await page.locator('.consent-line input').check();
  await page.getByRole('button', { name: '生成我的岗位简历' }).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('周晨');
  await expect(page.locator('.resume-paper')).toContainText(resumeQuote);
  await expect(page.locator('.resume-paper')).not.toContainText('SQL');
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

test('custom direct generation sends the tailoring instructions and removes mappings that do not point to the returned resume', async ({ page }) => {
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
    expect(system).toMatch(/拆解|拆分|分解/);
    expect(system).toContain('岗位');
    expect(system).toContain('事实');
    expect(system).toContain('summary');
    expect(system).toContain('experience');
    expect(JSON.stringify(request.messages)).toContain(sourceQuote);
    const result = tailoredResult();
    result.report.requirements[0].resumeEvidence.push({ sourceQuote, resumePath: 'projects.9.description.0', resumeQuote: invalidQuote, sourceType: 'text' });
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(result)}\n\`\`\`` } }] },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI 模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 模型设置' });
  await dialog.getByRole('button', { name: '自定义URL', exact: true }).click();
  await dialog.getByLabel('完整 URL', { exact: false }).fill('https://tailoring.example/v1');
  await dialog.getByLabel('模型名称', { exact: true }).fill('tailoring-test-model');
  await dialog.getByLabel('API Key', { exact: false }).fill('fake-tailoring-test-key');
  await dialog.getByRole('button', { name: '保存模型选择' }).click();
  await submitMaterials(page);
  await assertVisibleMapping(page);
  await expect(page.locator('.match-page')).not.toContainText(invalidQuote);
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载全部版本备份', exact: true }).click();
  const backup = JSON.parse(await downloadedText(await downloaded));
  expect(backup.versions[0].report.requirements[0].resumeEvidence).toEqual([{ sourceQuote, sourceType: 'text', resumePath, resumeQuote }]);
  expect(directCalls).toBe(1);
  expect(backendCalls).toBe(0);
});
