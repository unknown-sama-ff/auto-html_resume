import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/presets', route => route.fulfill({ json: [] }));
});

test('home sponsor button is immediately left of the privacy notice and hover shows the reference QR', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: '赞助', exact: true });
  await expect(button).toBeVisible();
  const beforeNotice = await page.locator('.landing-topnote').evaluate(notice => notice.previousElementSibling?.classList.contains('sponsor-control'));
  expect(beforeNotice).toBe(true);
  const popup = page.getByRole('tooltip', { name: '支付宝赞助二维码' });
  await expect(popup).toBeHidden();
  await button.hover();
  await expect(popup).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const image = popup.getByRole('img', { name: '支付宝个人收款二维码' });
  await expect(image).toHaveAttribute('src', '/alipay-sponsor-qr.jpg');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await popup.hover();
  await expect(popup).toBeVisible();
  await page.locator('.landing-hero h1').hover();
  await expect(popup).toBeHidden();
});

test('sponsor click can pin and close the popup; outside click and Escape dismiss it', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: '赞助', exact: true });
  const popup = page.getByRole('tooltip', { name: '支付宝赞助二维码' });
  await button.click();
  await expect(popup).toBeVisible();
  await button.click();
  await expect(popup).toBeHidden();
  await button.click();
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await button.click();
  await expect(popup).toBeVisible();
  await page.locator('.landing-hero h1').click();
  await expect(popup).toBeHidden();
});

test('sponsor keyboard focus reveals the QR and leaving focus closes it', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: '赞助', exact: true });
  const popup = page.getByRole('tooltip', { name: '支付宝赞助二维码' });
  await button.focus();
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(button).toBeFocused();
  await page.getByRole('button', { name: 'AI 模型', exact: true }).focus();
  await button.focus();
  await expect(popup).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(popup).toBeHidden();
});

test.describe('touch sponsor interaction', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('touch tap shows a viewport-safe QR without payment requests', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto('/');
    const button = page.getByRole('button', { name: '赞助', exact: true });
    const popup = page.getByRole('tooltip', { name: '支付宝赞助二维码' });
    await button.tap();
    await expect(popup).toBeVisible();
    const box = await popup.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(10);
    expect(box!.x + box!.width).toBeLessThanOrEqual(380);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await page.locator('.landing-hero h1').tap();
    await expect(popup).toBeHidden();
    expect(requests.some(url => /\/api\/(payment|sponsor)/.test(url))).toBe(false);
  });
});
