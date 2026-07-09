import { defineConfig } from '@playwright/test';

/**
 * Extension E2E config (#31): loads the real `.output/chrome-mv3` build into a headed
 * Chromium (MV3 extensions need a real, non-headless-shell browser to load unpacked, and
 * `chrome.debugger` needs a real window) via `e2e/extension-context.ts`. Serial, since
 * each test drives one real browser + one real CDP-attached tab.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  reporter: [['list']],
});
