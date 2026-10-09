import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialResume } from '../src/data';
import type { GenerationResult } from '../src/types';

type PhotoFile = { name: string; mimeType: string; buffer: Buffer };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/presets', route => route.fulfill({ json: [{ id: 'cf-api-fan', label: 'Relay', provider: 'OpenAI-compatible', model: 'test-model', baseUrl: 'https://cf.api.fan/v1', description: '测试通道' }] }));
});

function generationResult(): GenerationResult {
  const resume = structuredClone(initialResume);
  resume.name = '照片测试'; resume.role = '数据分析师';
  return { resume, jobTitle: resume.role, warnings: [], report: { summary: '测试资料', requirements: [] } };
}

async function generate(page: Page, onRequest?: (payload: Record<string, unknown>) => void) {
  await page.route('**/api/ai/generate', route => {
    onRequest?.(route.request().postDataJSON());
    return route.fulfill({ json: generationResult() });
  });
  await page.locator('.intake-card textarea').first().fill('姓名：照片测试\n技能：Python');
  await page.locator('.intake-card textarea').nth(1).fill('岗位：数据分析师');
  await page.locator('.consent-line input').check();
  await page.getByRole('button', { name: '生成我的岗位简历' }).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('照片测试');
}

// Real browser encoding creates valid high-detail images without appended padding.
async function photoFile(page: Page, options: { large?: boolean; type?: string; transparent?: boolean; color?: string } = {}): Promise<PhotoFile> {
  const type = options.type ?? 'image/png';
  const base64 = await page.evaluate(({ large, type, transparent, color }) => {
    const canvas = document.createElement('canvas');
    canvas.width = large ? 1800 : 120; canvas.height = large ? 1200 : 80;
    const context = canvas.getContext('2d')!;
    if (large) {
      const pixels = context.createImageData(canvas.width, canvas.height);
      let seed = 0x12345678;
      for (let i = 0; i < pixels.data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          pixels.data[i + channel] = seed & 255;
        }
        pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
    } else {
      if (!transparent) { context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.fillStyle = color ?? '#BF3040'; context.fillRect(20, 20, 80, 40);
    }
    return canvas.toDataURL(type, 0.9).split(',')[1];
  }, { ...options, type });
  return { name: 'portrait.' + type.split('/')[1], mimeType: type, buffer: Buffer.from(base64, 'base64') };
}

async function photoInfo(page: Page, dataUrl: string) {
  return page.evaluate(async source => {
    const blob = await (await fetch(source)).blob();
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, size: blob.size, type: blob.type, corner: Array.from(context.getImageData(0, 0, 1, 1).data) };
  }, dataUrl);
}

async function processPhoto(page: Page, file: PhotoFile) {
  return page.evaluate(async ({ name, mimeType, base64 }) => {
    const modulePath = '/src/lib/photos.ts';
    const { readAvatarPhoto } = await import(/* @vite-ignore */ modulePath);
    return readAvatarPhoto(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], name, { type: mimeType }));
  }, { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') });
}

async function holdPhotoEncoding(page: Page) {
  await page.evaluate(() => {
    const native = HTMLCanvasElement.prototype.toBlob;
    const callbacks: (() => void)[] = [];
    const gate = { calls: 0, pending: 0, release: () => { HTMLCanvasElement.prototype.toBlob = native; callbacks.splice(0).forEach(callback => callback()); } };
    Object.assign(window, { photoEncodingGate: gate });
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      gate.calls++;
      native.call(this, blob => { callbacks.push(() => callback(blob)); gate.pending = callbacks.length; }, type, quality);
    };
  });
}
async function waitForHeldPhoto(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { photoEncodingGate: { pending: number } }).photoEncodingGate.pending)).toBe(1);
}
async function releasePhotoEncoding(page: Page) {
  await page.evaluate(() => (window as unknown as { photoEncodingGate: { release: () => void } }).photoEncodingGate.release());
}

test('home accepts a real PNG over 2 MB, compresses locally, and excludes the avatar from AI requests', async ({ page }) => {
  await page.goto('/');
  const file = await photoFile(page, { large: true });
  expect(file.buffer.length).toBeGreaterThan(2 * 1024 * 1024); expect(file.buffer.length).toBeLessThanOrEqual(10_000_000);
  await page.locator('.photo-intake input[type="file"]').setInputFiles(file);
  const photo = page.getByAltText('待使用头像'); await expect(photo).toBeVisible();
  const source = (await photo.getAttribute('src'))!;
  const info = await photoInfo(page, source);
  expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(1600);
  expect(info.width / info.height).toBeCloseTo(1.5, 2); expect(info.size).toBeLessThanOrEqual(1_500_000);
  let generated: Record<string, unknown> = {};
  await generate(page, payload => { generated = payload; });
  await expect(page.getByAltText('个人头像')).toHaveAttribute('src', source);
  expect(generated.profileImages).toEqual([]); expect(generated.jobImages).toEqual([]);
  expect(JSON.stringify(generated)).not.toContain(source);
  let editPayload: Record<string, unknown> = {};
  await page.route('**/api/ai/edit', route => {
    editPayload = route.request().postDataJSON();
    return route.fulfill({ json: { patch: { id: 'photo-context', targetNodeId: 'profile-name', operation: 'setStyle', path: 'style.color', value: '#315A64', reason: '调整姓名颜色', preview: '姓名颜色建议', requiresConfirmation: false } } });
  });
  await page.locator('.resume-paper h1').click();
  await page.getByRole('textbox', { name: 'AI修改要求' }).fill('把姓名改为深蓝色');
  await page.getByRole('button', { name: '生成修改', exact: true }).click();
  await expect(page.locator('.patch-card')).toContainText('姓名颜色建议');
  expect(JSON.stringify(editPayload)).not.toContain(source); expect(editPayload).not.toHaveProperty('resume');
  await expect(page.locator('.save-state')).toContainText('已本地保存');
  const versionId = await page.locator('.version-select').inputValue();
  await page.reload(); await page.getByRole('button', { name: '打开版本侧边栏', exact: true }).click();
  await page.locator('.version-item[data-version-id="' + versionId + '"]').click();
  await expect(page.getByAltText('个人头像')).toHaveAttribute('src', source);
});

test('editor compresses a large photo and preserves undo, redo, history and standalone HTML export', async ({ page }) => {
  await page.goto('/');
  const original = await photoFile(page);
  await page.locator('.photo-intake input[type="file"]').setInputFiles(original);
  await expect(page.getByAltText('待使用头像')).toBeVisible(); await generate(page);
  const oldSource = (await page.getByAltText('个人头像').getAttribute('src'))!;
  const large = await photoFile(page, { large: true }); expect(large.buffer.length).toBeGreaterThan(2 * 1024 * 1024);
  await page.getByRole('button', { name: '头像设置', exact: true }).click();
  await page.getByLabel('更换头像').setInputFiles(large);
  await expect(page.getByAltText('个人头像')).not.toHaveAttribute('src', oldSource);
  const source = (await page.getByAltText('个人头像').getAttribute('src'))!;
  const info = await photoInfo(page, source);
  expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(1600); expect(info.size).toBeLessThanOrEqual(1_500_000);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByAltText('个人头像')).toHaveAttribute('src', oldSource);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByAltText('个人头像')).toHaveAttribute('src', source);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  const html = await readFile((await (await downloaded).path())!, 'utf8');
  expect(html).toContain(source); expect(html).toContain('alt="个人头像"'); expect(html).not.toContain('<script');
  await page.getByRole('button', { name: '修改历史', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('更换头像');
});

test('PNG, JPEG and WebP small photos are not enlarged, and transparent photos retain alpha', async ({ page }) => {
  await page.goto('/');
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    const file = await photoFile(page, { type, transparent: type !== 'image/jpeg' });
    const info = await photoInfo(page, await processPhoto(page, file));
    expect(info.width).toBe(120); expect(info.height).toBe(80); expect(info.type).toBe('image/webp');
    expect(info.size).toBeLessThanOrEqual(1_500_000);
    if (type !== 'image/jpeg') expect(info.corner[3]).toBe(0);
  }
});

test('EXIF orientation rotates a JPEG to its display dimensions before saving', async ({ page }) => {
  await page.goto('/');
  const jpeg = await photoFile(page, { type: 'image/jpeg' });
  // APP1 Exif, little-endian TIFF, one SHORT orientation entry with value 6.
  const exif = Buffer.from([69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
  const header = Buffer.from([0xFF, 0xE1, 0, exif.length + 2]);
  const file = { ...jpeg, buffer: Buffer.concat([jpeg.buffer.subarray(0, 2), header, exif, jpeg.buffer.subarray(2)]) };
  const info = await photoInfo(page, await processPhoto(page, file));
  expect([info.width, info.height]).toEqual([80, 120]);
});

test('unsupported WebP encoding falls back to white-backed JPEG and Image decoding releases its URL', async ({ page }) => {
  await page.goto('/');
  const file = await photoFile(page, { transparent: true });
  const result = await page.evaluate(async ({ name, base64 }) => {
    const nativeEncode = HTMLCanvasElement.prototype.toBlob;
    const bitmapDescriptor = Object.getOwnPropertyDescriptor(window, 'createImageBitmap');
    const nativeRevoke = URL.revokeObjectURL; let revoked = 0;
    Object.defineProperty(window, 'createImageBitmap', { configurable: true, value: undefined });
    URL.revokeObjectURL = url => { revoked++; nativeRevoke.call(URL, url); };
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) { nativeEncode.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality); };
    try {
      const modulePath = '/src/lib/photos.ts';
      const { readAvatarPhoto } = await import(/* @vite-ignore */ modulePath);
      const source = await readAvatarPhoto(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], name, { type: 'image/png' }));
      return { source, revoked };
    } finally {
      HTMLCanvasElement.prototype.toBlob = nativeEncode; URL.revokeObjectURL = nativeRevoke;
      if (bitmapDescriptor) Object.defineProperty(window, 'createImageBitmap', bitmapDescriptor); else Reflect.deleteProperty(window, 'createImageBitmap');
    }
  }, { name: file.name, base64: file.buffer.toString('base64') });
  const info = await photoInfo(page, result.source);
  expect(info.type).toBe('image/jpeg'); expect([info.width, info.height]).toEqual([120, 80]);
  expect(info.corner).toEqual([255, 255, 255, 255]); expect(result.revoked).toBe(1);
});

test('bad, oversized, empty and unsupported uploads preserve the previous home and editor photo', async ({ page }) => {
  await page.goto('/');
  const original = await photoFile(page);
  await page.locator('.photo-intake input[type="file"]').setInputFiles(original);
  await expect(page.getByAltText('待使用头像')).toBeVisible();
  const source = (await page.getByAltText('待使用头像').getAttribute('src'))!;
  const invalid = [
    { file: { name: 'broken.png', mimeType: 'image/png', buffer: original.buffer.subarray(0, 24) }, message: '无法读取照片' },
    { file: { name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(10_000_001) }, message: '10 MB' },
    { file: { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) }, message: '文件为空' },
    { file: { name: 'unsupported.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') }, message: 'PNG、JPEG 或 WebP' },
  ];
  for (const { file, message } of invalid) {
    await page.locator('.photo-intake input[type="file"]').setInputFiles(file);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByAltText('待使用头像')).toHaveAttribute('src', source);
  }
  await generate(page); await page.getByRole('button', { name: '头像设置', exact: true }).click();
  for (const { file, message } of invalid) {
    await page.getByLabel('更换头像').setInputFiles(file);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByAltText('个人头像')).toHaveAttribute('src', source);
  }
});

test('photo processing disables upload and generation and prevents duplicate processing', async ({ page }) => {
  await page.goto('/');
  const file = await photoFile(page);
  await page.locator('.intake-card textarea').first().fill('个人资料');
  await page.locator('.intake-card textarea').nth(1).fill('岗位要求'); await page.locator('.consent-line input').check();
  const photoInput = page.locator('.photo-intake input[type="file"]');
  await holdPhotoEncoding(page);
  try {
    await photoInput.setInputFiles(file); await waitForHeldPhoto(page);
    await expect(photoInput).toBeDisabled(); await expect(page.getByLabel('上传个人资料文件')).toBeDisabled();
    await expect(page.getByRole('button', { name: '生成我的岗位简历' })).toBeDisabled();
    // Native disabled controls can still receive programmatic file assignment.
    await photoInput.setInputFiles(file);
    expect(await page.evaluate(() => (window as unknown as { photoEncodingGate: { calls: number } }).photoEncodingGate.calls)).toBe(1);
  } finally { await releasePhotoEncoding(page); }
  await expect(page.getByAltText('待使用头像')).toBeVisible(); await expect(photoInput).toBeEnabled();
});

for (const change of ['switch', 'edit'] as const) {
  test('a photo finishing after a version ' + change + ' preserves the current avatar and content', async ({ page }) => {
    await page.goto('/');
    const original = await photoFile(page);
    await page.locator('.photo-intake input[type="file"]').setInputFiles(original);
    await expect(page.getByAltText('待使用头像')).toBeVisible(); await generate(page);
    const first = await page.locator('.version-select').inputValue();
    const source = (await page.getByAltText('个人头像').getAttribute('src'))!;
    await page.getByRole('button', { name: '复制当前版本', exact: true }).click();
    const second = await page.locator('.version-select').inputValue();
    const replacement = await photoFile(page, { color: '#315A64' });
    await page.getByRole('button', { name: '头像设置', exact: true }).click();
    await holdPhotoEncoding(page);
    try {
      await page.getByLabel('更换头像').setInputFiles(replacement); await waitForHeldPhoto(page);
      await expect(page.getByLabel('更换头像')).toBeDisabled();
      if (change === 'switch') await page.locator('.version-select').selectOption(first);
      else {
        await page.locator('.resume-paper h1').click();
        await page.getByRole('textbox', { name: '选中区块的内容' }).fill('处理期间更新的姓名');
        await page.getByRole('button', { name: '保存内容', exact: true }).click();
      }
    } finally { await releasePhotoEncoding(page); }
    await expect(page.getByRole('alert')).toContainText(/已切换|变动/);
    await expect(page.getByAltText('个人头像')).toHaveAttribute('src', source);
    await expect(page.locator('.resume-paper h1')).toHaveText(change === 'edit' ? '处理期间更新的姓名' : '照片测试');
    if (change === 'switch') {
      await page.locator('.version-select').selectOption(second);
      await expect(page.getByAltText('个人头像')).toHaveAttribute('src', source);
    }
  });
}
