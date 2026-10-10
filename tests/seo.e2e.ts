import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/presets', route => route.fulfill({ json: [] }));
});

test('home provides consistent search metadata and one interactive introduction after loading', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '生成我的岗位简历' })).toBeVisible();
  await expect(page).toHaveTitle(/easy 简历.*免费.*AI简历.*生成简历/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /岗位匹配.*可视化编辑/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://esjl.asia/');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://esjl.asia/');
  const structured = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}');
  expect(structured['@graph'].map((item: { url: string }) => item.url)).toEqual(['https://esjl.asia/', 'https://esjl.asia/']);
  await expect(page.locator('.landing-static')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('.landing-hero > p')).toContainText('「easy 简历」');
  await expect(page.locator('.landing-guide')).toContainText('自定义AI模型可能按服务商规则计费');
  expect(errors).toEqual([]);
});

test('public discovery files are served as text and XML and only list the canonical home', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toMatch(/text\/plain/);
  expect(await robots.text()).toContain('Disallow: /api/');
  expect(await robots.text()).toContain('Sitemap: https://esjl.asia/sitemap.xml');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toMatch(/(?:application|text)\/xml/);
  const xml = await sitemap.text();
  expect(xml.match(/<loc>/g)).toHaveLength(1);
  expect(xml).toContain('<loc>https://esjl.asia/</loc>');
});

test('author icons use the requested destinations and reveal descriptions on hover and keyboard focus', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('navigation', { name: '作者与项目链接' });
  await expect(links.getByRole('link')).toHaveCount(2);
  const bilibili = links.getByRole('link', { name: /作者 Bilibili 主页/ });
  const github = links.getByRole('link', { name: /GitHub 项目主页/ });
  await expect(bilibili).toHaveAttribute('href', 'https://space.bilibili.com/661830801');
  await expect(github).toHaveAttribute('href', 'https://github.com/unknown-sama-ff/auto-html_resume');
  for (const link of [bilibili, github]) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const tooltip = link.getByRole('tooltip');
    await expect(tooltip).toBeHidden();
    await link.hover();
    await expect(tooltip).toBeVisible();
    await page.locator('.landing-hero h1').hover();
    await expect(tooltip).toBeHidden();
    await link.focus();
    await expect(tooltip).toBeVisible();
    await page.getByRole('button', { name: 'AI 模型', exact: true }).focus();
    await expect(tooltip).toBeHidden();
  }
});

test.describe('HTML discovery without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('public introduction and author links remain readable before the app runs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('一份经历');
    const introduction = page.getByRole('main');
    for (const phrase of ['免费简历', '一键简历', 'AI简历', '生成简历']) await expect(introduction).toContainText(phrase);
    await expect(introduction).toContainText('请启用浏览器的JavaScript');
    await expect(page.locator('.landing-hero > p')).toContainText('「easy 简历」');
    await expect(page.getByRole('link', { name: '作者 Bilibili 主页' })).toHaveAttribute('href', 'https://space.bilibili.com/661830801');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://esjl.asia/');
  });
});

test.describe('phone author links', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('touch opens each destination in a separate tab and the header stays within the viewport', async ({ page, context }) => {
    await context.route('https://space.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Bilibili test</title>' }));
    await context.route('https://github.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>GitHub test</title>' }));
    await page.goto('/');
    for (const name of [/作者 Bilibili 主页/, /GitHub 项目主页/]) {
      const link = page.getByRole('link', { name });
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      const popupPromise = page.waitForEvent('popup');
      await link.tap();
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      await popup.close();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  });
});
