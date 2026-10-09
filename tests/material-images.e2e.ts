import { test, expect, type Page } from '@playwright/test';
import { generationRequestSchema } from '../shared/contracts';
import { initialResume } from '../src/data';
import type { ParsedMaterial } from '../src/lib/materials';
import type { GenerationResult, MaterialImage } from '../src/types';

type ImageFile = { name: string; mimeType: string; buffer: Buffer };

test.beforeEach(async ({ page }) => {
  await Promise.all([
    page.route('https://fonts.googleapis.com/**', route => route.abort()),
    page.route('https://fonts.gstatic.com/**', route => route.abort()),
    page.route('**/api/ai/presets', route => route.fulfill({ json: [{ id: 'cf-api-fan', label: 'Relay', provider: 'OpenAI-compatible', model: 'test-model', baseUrl: 'https://cf.api.fan/v1', description: '测试通道' }] })),
  ]);
});

function generationResult(): GenerationResult {
  const resume = structuredClone(initialResume);
  resume.name = '资料图片测试'; resume.role = '数据分析师';
  return { resume, jobTitle: resume.role, warnings: [], report: { summary: '图片材料', requirements: [] } };
}

// Encode real pixels in the browser, so large fixtures exercise image decoding
// and compression rather than a small picture with trailing padding.
async function imageFile(page: Page, options: { kind?: 'small' | 'noise' | 'text'; mimeType?: string; name?: string } = {}): Promise<ImageFile> {
  const mimeType = options.mimeType ?? 'image/png';
  const base64 = await page.evaluate(({ kind, mimeType }) => {
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'noise' ? 1800 : kind === 'text' ? 4000 : 240;
    canvas.height = kind === 'noise' ? 1200 : kind === 'text' ? 2400 : 160;
    const context = canvas.getContext('2d')!;
    if (kind === 'noise') {
      const pixels = context.createImageData(canvas.width, canvas.height);
      let seed = 0x12345678;
      for (let index = 0; index < pixels.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          pixels.data[index + channel] = seed & 255;
        }
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
    } else {
      context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#26435B'; context.fillRect(0, 0, canvas.width, kind === 'text' ? 70 : 40);
      context.fillStyle = '#17212B'; context.font = kind === 'text' ? '30px monospace' : '16px monospace';
      if (kind === 'text') {
        for (let row = 0; row < 50; row++) {
          context.fillText(`${String(row + 1).padStart(2, '0')} Python SQL - Data analysis: project evidence, skills and job requirements.`, 60, 140 + row * 43);
        }
      } else context.fillText('Python SQL 2026', 12, 90);
    }
    return canvas.toDataURL(mimeType, 0.95).split(',')[1];
  }, { kind: options.kind ?? 'small', mimeType });
  return { name: options.name ?? `material.${mimeType.split('/')[1]}`, mimeType, buffer: Buffer.from(base64, 'base64') };
}

async function processMaterial(page: Page, file: ImageFile): Promise<ParsedMaterial> {
  return page.evaluate(async ({ name, mimeType, base64 }) => {
    const modulePath = '/src/lib/materials.ts';
    const { readMaterial } = await import(/* @vite-ignore */ modulePath);
    return readMaterial(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], name, { type: mimeType }));
  }, { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') });
}

function materialImage(material: ParsedMaterial): MaterialImage {
  expect(material.format).toBe('image'); expect(material.text).toBe(''); expect(material.image).toBeDefined();
  return material.image!;
}

async function imageInfo(page: Page, image: MaterialImage) {
  return page.evaluate(async source => {
    const blob = await (await fetch(source)).blob();
    const decoded = new Image(); decoded.src = source; await decoded.decode();
    const canvas = document.createElement('canvas'); canvas.width = decoded.naturalWidth; canvas.height = decoded.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(decoded, 0, 0);
    return { width: canvas.width, height: canvas.height, size: blob.size, mimeType: blob.type, corner: Array.from(context.getImageData(0, 0, 1, 1).data) };
  }, image.dataUrl);
}

async function expectSafeImage(page: Page, image: MaterialImage) {
  const info = await imageInfo(page, image);
  expect(info.size).toBeLessThanOrEqual(2_000_000);
  expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(3200);
  expect(image.mimeType).toBe(info.mimeType); expect(image.dataUrl.startsWith(`data:${image.mimeType};base64,`)).toBe(true);
  return info;
}

test('valid small PNG, JPEG and WebP materials retain their original bytes, formats and dimensions', async ({ page }) => {
  await page.goto('/');
  for (const mimeType of ['image/png', 'image/jpeg', 'image/webp']) {
    const file = await imageFile(page, { mimeType });
    const parsed = await processMaterial(page, file); const image = materialImage(parsed);
    expect(parsed.name).toBe(file.name); expect(image.name).toBe(file.name); expect(image.mimeType).toBe(mimeType);
    expect(image.dataUrl).toBe(`data:${mimeType};base64,${file.buffer.toString('base64')}`);
    const info = await expectSafeImage(page, image);
    expect([info.width, info.height]).toEqual([240, 160]);
  }
});

test('a large text screenshot is scaled proportionally and remains a lossless PNG', async ({ page }) => {
  await page.goto('/');
  const file = await imageFile(page, { kind: 'text', name: 'job-text.png' });
  expect(file.buffer.length).toBeLessThanOrEqual(10_000_000);
  const image = materialImage(await processMaterial(page, file));
  const info = await expectSafeImage(page, image);
  expect(image.mimeType).toBe('image/png'); expect([info.width, info.height]).toEqual([3200, 1920]);
  expect(info.corner).toEqual([38, 67, 91, 255]);
  expect(image.dataUrl).not.toBe(`data:image/png;base64,${file.buffer.toString('base64')}`);
});

test('a real PNG over 2 MB is accepted and compressed without enlarging it', async ({ page }) => {
  await page.goto('/');
  const file = await imageFile(page, { kind: 'noise' });
  expect(file.buffer.length).toBeGreaterThan(2_000_000); expect(file.buffer.length).toBeLessThanOrEqual(10_000_000);
  const image = materialImage(await processMaterial(page, file));
  const info = await expectSafeImage(page, image);
  expect(image.mimeType).toBe('image/webp'); expect(info.width).toBeLessThanOrEqual(1800); expect(info.height).toBeLessThanOrEqual(1200);
  expect(info.width / info.height).toBeCloseTo(1.5, 2);
});

test('profile and job uploads send only compressed images within schema and backend body limits', async ({ page }) => {
  let submitted: Record<string, unknown> = {}; let requestBody = '';
  await page.route('**/api/ai/generate', route => {
    submitted = route.request().postDataJSON(); requestBody = route.request().postData() ?? '';
    return route.fulfill({ json: generationResult() });
  });
  await page.goto('/');
  const file = await imageFile(page, { kind: 'noise', name: 'profile-large.png' });
  expect(file.buffer.length).toBeGreaterThan(2_000_000);
  await page.getByLabel('上传个人资料文件').setInputFiles(file);
  await expect(page.locator('.intake-card').first().locator('.intake-upload b')).toHaveText(file.name);
  const jobFile = { ...file, name: 'job-large.png' };
  await page.getByLabel('上传岗位要求文件').setInputFiles(jobFile);
  await expect(page.locator('.job-intake .intake-upload b')).toHaveText(jobFile.name);
  await page.locator('.consent-line input').check(); await page.getByRole('button', { name: '生成我的岗位简历' }).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('资料图片测试');
  const profileImages = submitted.profileImages as MaterialImage[]; const jobImages = submitted.jobImages as MaterialImage[];
  expect(profileImages).toHaveLength(1); expect(jobImages).toHaveLength(1);
  expect(profileImages[0].name).toBe(file.name); expect(jobImages[0].name).toBe(jobFile.name);
  await expectSafeImage(page, profileImages[0]); await expectSafeImage(page, jobImages[0]);
  expect(generationRequestSchema.safeParse(submitted).success).toBe(true);
  expect(Buffer.byteLength(requestBody)).toBeLessThan(8 * 1024 * 1024);
  expect(requestBody).not.toContain(file.buffer.toString('base64'));
});

test('broken, empty and oversized uploads preserve both previously accepted materials', async ({ page }) => {
  let submitted: Record<string, unknown> = {};
  await page.route('**/api/ai/generate', route => { submitted = route.request().postDataJSON(); return route.fulfill({ json: generationResult() }); });
  await page.goto('/');
  const profile = await imageFile(page, { name: 'profile-original.png' });
  const job = { ...profile, name: 'job-original.png' };
  await page.getByLabel('上传个人资料文件').setInputFiles(profile);
  await expect(page.locator('.intake-card').first().locator('.intake-upload b')).toHaveText(profile.name);
  await page.getByLabel('上传岗位要求文件').setInputFiles(job);
  await expect(page.locator('.job-intake .intake-upload b')).toHaveText(job.name);
  const invalid = [
    { file: { name: 'broken.png', mimeType: 'image/png', buffer: profile.buffer.subarray(0, 24) }, message: /无法读取|图片读取失败/ },
    { file: { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) }, message: /文件为空/ },
    { file: { name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(10_000_001) }, message: /10 MB/ },
  ];
  for (const label of ['上传个人资料文件', '上传岗位要求文件']) {
    for (const { file, message } of invalid) {
      await page.getByLabel(label).setInputFiles(file); await expect(page.getByRole('alert')).toContainText(message);
      await expect(page.locator('.intake-card').first().locator('.intake-upload b')).toHaveText(profile.name);
      await expect(page.locator('.job-intake .intake-upload b')).toHaveText(job.name);
    }
  }
  await page.locator('.consent-line input').check(); await page.getByRole('button', { name: '生成我的岗位简历' }).click();
  await expect(page.locator('.resume-paper h1')).toHaveText('资料图片测试');
  expect(submitted.profileImages).toEqual([{ name: profile.name, mimeType: profile.mimeType, dataUrl: `data:${profile.mimeType};base64,${profile.buffer.toString('base64')}` }]);
  expect(submitted.jobImages).toEqual([{ name: job.name, mimeType: job.mimeType, dataUrl: `data:${job.mimeType};base64,${job.buffer.toString('base64')}` }]);
});

test('material processing prevents concurrent uploads and disables generation until completion', async ({ page }) => {
  await page.goto('/');
  const file = await imageFile(page, { name: 'accepted-profile.png' });
  await page.locator('.intake-card textarea').first().fill('个人资料'); await page.locator('.intake-card textarea').nth(1).fill('岗位要求');
  await page.locator('.consent-line input').check();
  await page.evaluate(() => {
    const native = FileReader.prototype.readAsDataURL;
    const pending: (() => void)[] = [];
    const gate = { calls: 0, release: () => { FileReader.prototype.readAsDataURL = native; pending.splice(0).forEach(read => read()); } };
    Object.assign(window, { materialReadGate: gate });
    FileReader.prototype.readAsDataURL = function (blob) { gate.calls++; pending.push(() => native.call(this, blob)); };
  });
  const profileInput = page.getByLabel('上传个人资料文件'); const jobInput = page.getByLabel('上传岗位要求文件');
  try {
    await profileInput.setInputFiles(file);
    await expect.poll(() => page.evaluate(() => (window as unknown as { materialReadGate: { calls: number } }).materialReadGate.calls)).toBe(1);
    await expect(profileInput).toBeDisabled(); await expect(jobInput).toBeDisabled(); await expect(page.getByLabel('上传证件照或职业头像')).toBeDisabled();
    await expect(page.getByRole('button', { name: '生成我的岗位简历' })).toBeDisabled();
    // Programmatic assignment can dispatch changes even on disabled controls.
    await jobInput.setInputFiles({ ...file, name: 'ignored-job.png' }); await profileInput.setInputFiles({ ...file, name: 'ignored-profile.png' });
    expect(await page.evaluate(() => (window as unknown as { materialReadGate: { calls: number } }).materialReadGate.calls)).toBe(1);
  } finally {
    await page.evaluate(() => (window as unknown as { materialReadGate: { release: () => void } }).materialReadGate.release());
  }
  await expect(page.locator('.intake-card').first().locator('.intake-upload b')).toHaveText(file.name);
  await expect(page.locator('.job-intake .intake-upload b')).toHaveText('上传岗位文件或截图');
  await expect(profileInput).toBeEnabled(); await expect(page.getByRole('button', { name: '生成我的岗位简历' })).toBeEnabled();
});
