import { expect, type Page } from '@playwright/test';

/**
 * 侧边栏折叠偏好写在 localStorage（`folio-sidebar`），刷新后会按上次的选择恢复，
 * 见 docs/superpowers/specs/2026-10-08-home-sidebar-and-deletion.md。
 * 因此「展开侧边栏」按钮在刷新之后不一定存在：先看当前 aria-label，再决定是否点击。
 */
export async function openVersionSidebar(page: Page) {
  const toggle = page.locator('.sidebar-toggle');
  await expect(toggle).toHaveAttribute('aria-label', /^(展开侧边栏|收起侧边栏)$/);
  if ((await toggle.getAttribute('aria-label')) === '展开侧边栏') await toggle.click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-collapsed/);
}