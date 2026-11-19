import { expect, type Page } from '@playwright/test';

export type DragDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * 键盘拖拽一个栏目：空格拾起 → 方向键 → 空格落点。
 *
 * 两个必须等的状态，都是 CI 上真实翻车过的地方：
 * 1. 开始前等上一条拖拽的覆盖层卸载（DragOverlay 有落点动画，鼠标拖拽之后它还在 DOM 里）；
 * 2. 方向键之后等覆盖层真的移到新落点再落点，否则 dnd-kit 还没处理这次移动就落点，栏目留在原位。
 */
export async function keyboardMoveSection(page: Page, label: string, direction: DragDirection) {
  const handle = page.getByRole('button', { name: '拖动栏目 ' + label, exact: true });
  const overlay = page.locator('.section-drag-overlay');
  await expect(overlay).toHaveCount(0);
  await handle.scrollIntoViewIfNeeded(); await handle.hover(); await handle.focus();
  await page.keyboard.press('Space');
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toContainText(label);
  const start = await overlay.boundingBox();
  await page.keyboard.press(direction);
  await expect.poll(async () => {
    const box = await overlay.boundingBox();
    return box && start ? `${Math.round(box.x - start.x)},${Math.round(box.y - start.y)}` : '';
  }).not.toBe('0,0');
  await page.keyboard.press('Space');
  await expect(overlay).toHaveCount(0);
}