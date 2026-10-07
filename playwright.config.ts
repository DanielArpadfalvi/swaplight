import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 4173);

/**
 * The cloud dev container ships a preinstalled Chromium under PLAYWRIGHT_BROWSERS_PATH
 * (/opt/pw-browsers) whose build may not match the installed @playwright/test version.
 * If Playwright's expected binary is missing, fall back to the preinstalled one.
 * In CI, `npx playwright install` provides the matching build, so this is a no-op there.
 */
function resolveChromiumExecutable(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const candidate = join(root, 'chromium');
  return existsSync(candidate) ? candidate : undefined;
}

const executablePath = resolveChromiumExecutable();

export default defineConfig({
  testDir: 'tests/e2e',
  // Store screenshots run separately (`npm run store:screens`, playwright.store.config.ts).
  testIgnore: 'store-screens.spec.ts',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: process.env.CI ? undefined : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
