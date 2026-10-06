import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, defineConfig, devices } from '@playwright/test';

/**
 * Perf pass (`npm run test:perf`): frame-time budgets under CPU throttling
 * (`tests/e2e/perf.spec.ts`, method and numbers in `docs/PERF.md`). Kept out of the default e2e run
 * (`playwright.config.ts` ignores `perf.spec.ts`): timings are only meaningful with one worker and
 * nothing else competing for the CPU.
 */
const PORT = 4173;

function resolveChromiumExecutable(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const candidate = join(root, 'chromium');
  return existsSync(candidate) ? candidate : undefined;
}

const executablePath = resolveChromiumExecutable();

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'perf.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
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
