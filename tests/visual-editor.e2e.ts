import { test, expect, type Page } from '@playwright/test';
import { initialResume } from '../src/data';
import { readFile } from 'node:fs/promises';

async function create(page: Page) {
  await page.route('**/api/ai/presets', route => route.fulfill({ json: [] }));
  await page.route('**/api/ai/generate', route => route.fulfill({ json: {
    resume: initialResume, jobTitle: '产品设计师', warnings: [],
    report: { summary: '岗位分析', requirements: [{
      requirement: '清楚描述已有产品设计经验', status: 'partial', evidence: initialResume.projects[0].description[0],
      suggestion: '精简项目表述，保留现有责任范围',
      resumeEvidence: [{ sourceQuote: initialResume.projects[0].description[0], resumeQuote: initialResume.projects[0].description[0], resumePath: 'projects.0.description.0' }],
    }] },
  } }));
  await page.goto('/');
  await page.locator('.intake-card textarea').first().fill(initialResume.projects[0].description[0]);
  await page.locator('.intake-card textarea').nth(1).fill('清楚描述已有产品设计经验');
  await page.locator('.consent-line input').check();
  await page.getByRole('button', { name: '生成我的岗位简历' }).click();
  await expect(page.locator('.resume-paper h1')).toHaveText(initialResume.name);
}
async function download(page: Page) {
  const result = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  return readFile((await (await result).path())!, 'utf8');
}

test('inline editing commits once, exposes child fields, supports undo shortcuts and preserves copying', async ({ page }) => {
  await create(page);
  const name = page.locator('[data-node-id="profile-name"]');
  await name.fill('视觉编辑姓名'); await name.press('Enter');
  await expect(name).toHaveText('视觉编辑姓名');
  await expect(page.locator('.preview-toolbar').getByRole('button', { name: '撤销', exact: true })).toBeEnabled();
  await page.keyboard.press('Control+z'); await expect(name).toHaveText(initialResume.name);
  await page.keyboard.press('Control+Shift+z'); await expect(name).toHaveText('视觉编辑姓名');
  await name.click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c');
  await expect(name).toHaveText('视觉编辑姓名');
  await page.locator('[data-node-id="project-1-meta"]').fill('2026 · 已有项目角色');
  await page.locator('[data-node-id="project-1-meta"]').press('Enter');
  await page.locator('[data-node-id="experience-1-company"]').click();
  await expect(page.locator('.selected-context-chip')).toContainText('公司');
  await page.locator('[data-node-id="experience-1-company"]').fill('视觉公司'); await page.locator('[data-node-id="experience-1-company"]').press('Enter');
  await page.locator('[data-node-id="profile-email"]').fill('new@example.com'); await page.locator('[data-node-id="profile-email"]').press('Enter');
  await page.getByLabel('选中元素字体').selectOption('kaiti');
  await expect(page.locator('[data-node-id="profile-email"]')).toHaveCSS('font-family', /KaiTi/);
  const html = await download(page);
  expect(html).toContain('视觉公司'); expect(html).toContain('new@example.com'); expect(html).toContain('2026 · 已有项目角色');
  expect(html).not.toContain('contenteditable='); expect(html).not.toContain('<button'); expect(html).not.toContain('role="textbox"');
});

test('custom sections are obvious, editable, reorderable, removable and recoverable with persistent order', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: '添加栏目', exact: true }).click();
  await page.getByLabel('新栏目名称').fill('语言能力');
  await page.getByLabel('新栏目内容').fill('英语 C1\n日语 N2');
  await page.getByRole('button', { name: '加入简历' }).click();
  const section = page.locator('.resume-section').filter({ has: page.locator('h2', { hasText: '语言能力' }) });
  await expect(section).toContainText('日语 N2');
  await section.locator('.custom-content').fill('英语 C1\n日语 N1'); await section.locator('.custom-content').press('Control+Enter');
  await section.hover();
  await page.getByRole('button', { name: '上移栏目 语言能力', exact: true }).click();
  const titles = await page.locator('.resume-main-sections > [data-section]').evaluateAll(elements => elements.map(element => element.getAttribute('data-section')));
  expect(titles.findIndex(id => id!.startsWith('custom-'))).toBeLessThan(titles.indexOf('projects'));
  await section.hover(); await page.getByRole('button', { name: '删除栏目 语言能力', exact: true }).click();
  await expect(page.locator('.resume-paper')).not.toContainText('日语 N1');
  await page.getByRole('button', { name: '添加栏目', exact: true }).click();
  await page.getByRole('button', { name: '恢复 语言能力', exact: true }).click();
  await expect(page.locator('.resume-paper')).toContainText('日语 N1');
  const version = await page.locator('.version-select').inputValue();
  await expect(page.locator('.save-state')).toContainText('已本地保存');
  await page.reload(); await page.getByRole('button', { name: '打开版本侧边栏', exact: true }).click();
  await page.locator('.version-item[data-version-id="' + version + '"]').click();
  await expect(page.locator('.resume-paper')).toContainText('日语 N1');
  const html = await download(page);
  expect(html.indexOf('日语 N1')).toBeLessThan(html.indexOf(initialResume.projects[0].title));
});

test('mouse drag moves a module between template columns and keyboard drag reorders modules', async ({ page }) => {
  await create(page);
  await page.locator('.workspace-design').getByRole('button', { name: /工程技术/ }).click();
  await page.locator('[data-section="skills"]').hover();
  const handle = page.getByRole('button', { name: '拖动栏目 核心技能', exact: true });
  const target = page.locator('[data-section="projects"]');
  await target.scrollIntoViewIfNeeded(); await page.locator('[data-section="skills"]').hover();
  const start = await handle.boundingBox(), end = await target.boundingBox();
  expect(start).not.toBeNull(); expect(end).not.toBeNull();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down(); await page.mouse.move(start!.x + 12, start!.y + 10, { steps: 3 });
  await page.mouse.move(end!.x + end!.width / 2, end!.y + 8, { steps: 15 }); await page.mouse.up();
  await expect(page.locator('.resume-main-column [data-section="skills"]')).toHaveCount(1);
  const beforeOrder = await page.locator('.resume-main-column > [data-section]').evaluateAll(elements => elements.map(element => element.getAttribute('data-section')));
  await page.locator('[data-section="skills"]').hover(); await handle.focus();
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');
  await expect(page.locator('.resume-main-column [data-section="skills"]')).toHaveCount(1);
  const afterOrder = await page.locator('.resume-main-column > [data-section]').evaluateAll(elements => elements.map(element => element.getAttribute('data-section')));
  expect(afterOrder).not.toEqual(beforeOrder);
  await page.locator('.preview-toolbar').getByRole('button', { name: '撤销', exact: true }).click();
  await page.locator('.preview-toolbar').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.resume-side-column [data-section="skills"]')).toHaveCount(1);
});

test('match analysis brings context into AI editing and suggestion preview never duplicates rich content', async ({ page }) => {
  await create(page);
  let payload: Record<string, unknown> = {};
  const rewrite = '保留原始事实的精简项目描述';
  await page.route('**/api/ai/edit', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { patch: { id: 'visual-edit', targetNodeId: 'project-1-description', operation: 'rewriteText', path: 'content.text', value: rewrite, reason: '精简现有事实', preview: '精简项目描述', requiresConfirmation: true } } });
  });
  await page.locator('.match-editing-panel').getByRole('button', { name: '查看全部' }).click();
  await page.locator('.analysis-card').getByRole('button', { name: '编辑对应描述' }).click();
  await expect(page.locator('.selected-context-chip')).toContainText('智能简历工作台');
  await expect(page.getByLabel('AI修改要求')).toContainText('清楚描述已有产品设计经验');
  await page.getByRole('button', { name: '生成修改', exact: true }).click();
  await expect(page.locator('.patch-card')).toContainText('精简项目描述');
  expect(String(payload.prompt)).toContain('保留现有责任范围');
  await page.getByRole('button', { name: '预览建议', exact: true }).click();
  await expect(page.locator('[data-node-id="project-1-description"]')).toHaveText(rewrite);
  await page.getByRole('button', { name: '查看当前版本', exact: true }).click();
  await expect(page.locator('[data-node-id="project-1-description"]')).toContainText(initialResume.projects[0].description[0]);
  await page.getByRole('button', { name: '应用修改', exact: true }).click();
  await expect(page.locator('[data-node-id="project-1-description"]')).toHaveText(rewrite);
  await page.locator('[data-node-id="project-1-description"]').fill('应用后仍可直接编辑');
  await page.locator('[data-node-id="project-1-description"]').press('Control+Enter');
  await expect(page.locator('[data-node-id="project-1-description"]')).toHaveText('应用后仍可直接编辑');
});

test('font options and avatar size reach export and fullscreen undo stays available', async ({ page }) => {
  await create(page);
  await page.getByLabel('简历字体').selectOption('fangsong');
  await page.getByRole('button', { name: '头像设置', exact: true }).click();
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 80; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#618578'; ctx.fillRect(0, 0, 80, 80); return canvas.toDataURL('image/png').split(',')[1]; });
  await page.getByLabel('更换头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByAltText('个人头像')).toBeVisible();
  const avatar = page.locator('.resume-avatar'), initialSize = (await avatar.boundingBox())!.width;
  await page.getByLabel('头像缩放', { exact: true }).fill('1.5');
  expect((await avatar.boundingBox())!.width).toBeCloseTo(initialSize * 1.5, 0);
  const html = await download(page); expect(html).toContain('zoom:1.5'); expect(html).toContain('FangSong');
  await page.getByRole('button', { name: '全屏预览', exact: true }).click();
  await page.locator('.preview-toolbar').getByRole('button', { name: '撤销', exact: true }).focus(); await page.keyboard.press('Control+z');
  expect((await avatar.boundingBox())!.width).toBeCloseTo(initialSize, 0);
  await page.getByRole('button', { name: '退出全屏预览', exact: true }).click();
  await page.screenshot({ path: '.tmp/visual-editor-workspace.png', fullPage: true });
});
