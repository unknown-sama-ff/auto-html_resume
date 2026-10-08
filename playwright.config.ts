import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.e2e.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', channel: process.platform === 'win32' ? 'msedge' : undefined, viewport: { width: 1600, height: 1000 } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
