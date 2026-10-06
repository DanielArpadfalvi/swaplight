import { expect, test, type Page } from '@playwright/test';
import type { DailyTestState } from '../../src/game/dailyMode';
import type { SaveData } from '../../src/game/save';
import type { SwaplightStateSummary } from '../../src/game/testApi';
import { findMatchingSwap } from './support/solver';

// Software WebGL is slow at mobile DPR; render at 1x, freeze the ticker before screenshots and
// drive the sim through the test hooks (deterministic stepping).
test.use({
  deviceScaleFactor: 1,
  viewport: { width: 390, height: 844 },
  permissions: ['clipboard-read', 'clipboard-write'],
});

const SHOTS = 'tests/e2e/__screenshots__';
const DATE = '2026-10-06';

async function boot(page: Page): Promise<void> {
  // The Daily Challenge needs the Full Version (mock store entitlement).
  await page.addInitScript(() => {
    localStorage.setItem('swaplight:purchases.mock.fullVersion', 'true');
  });
  await page.goto('/?test&seed=daily-e2e');
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate((date) => {
    const api = window.__swaplight!;
    api.stopRendering();
    api.pause();
    api.setFullVersion!(true);
    api.daily!.setToday(date);
  }, DATE);
}

const state = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getState()) as Promise<SwaplightStateSummary>;
const daily = (page: Page) =>
  page.evaluate(() => window.__swaplight!.daily!.state()) as Promise<DailyTestState>;
const saveData = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getSave()) as Promise<SaveData>;
const step = (page: Page, n: number) => page.evaluate((k) => window.__swaplight!.stepTicks(k), n);

async function shot(page: Page, name: string, settleMs = 650, frames = 3): Promise<void> {
  await page.evaluate((n) => window.__swaplight?.renderFrames(n), frames);
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function scoreSome(page: Page): Promise<void> {
  for (let k = 0; k < 3; k++) {
    const sim = await page.evaluate(() => window.__swaplight!.getSim());
    const swap = findMatchingSwap(sim, 40);
    if (!swap) break;
    await page.evaluate(({ row, col }) => window.__swaplight!.swap(row, col), swap);
    await step(page, 80);
  }
}

test('daily: official attempt → result + share → practice only → next day streak', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await boot(page);

  // Menu card: playable, today's challenge + countdown.
  await expect(page.getByTestId('mode-daily')).toHaveClass(/mode-playable/);
  await expect(page.getByTestId('daily-countdown')).toContainText(/\d\d:\d\d:\d\d/);
  await shot(page, 'daily-menu');

  await page.getByTestId('mode-daily').click();
  await expect(page.getByTestId('daily-intro')).toBeVisible();
  await expect(page.getByTestId('daily-status')).toHaveAttribute('data-official', 'true');
  let d = await daily(page);
  expect(d).toMatchObject({ date: DATE, official: true, active: false, officialAvailable: true });
  expect(d.twists.length).toBeGreaterThanOrEqual(1);
  expect(d.twists.length).toBeLessThanOrEqual(2);
  await shot(page, 'daily-intro');

  await page.getByTestId('daily-start').click();
  await expect(page.getByTestId('daily-hud')).toBeVisible();
  expect(await state(page)).toMatchObject({ screen: 'playing', mode: 'daily' });
  // The official attempt is spent as soon as it starts.
  let save = await saveData(page);
  expect(save.daily[DATE]).toMatchObject({ official: true, attempts: 1 });
  expect(save.dailyStreak).toMatchObject({ current: 1, last: DATE });
  await step(page, 60);
  await scoreSome(page);
  d = await daily(page);
  expect(d.secondsLeft).toBeLessThan(120);
  await shot(page, 'daily-hud', 100);

  // Time's up → result.
  await page.evaluate(() => window.__swaplight!.daily!.finish());
  await expect(page.getByTestId('daily-result')).toBeVisible();
  await expect(page.getByTestId('daily-result-badge')).toHaveClass(/is-official/);
  const score = (await state(page)).score;
  save = await saveData(page);
  expect(save.daily[DATE]!.score).toBe(score);
  expect(save.modes.daily?.played).toBe(1);
  await expect(page.getByTestId('daily-streak')).toContainText('1');
  await shot(page, 'daily-result', 1300);

  // Share text → clipboard.
  await page.getByTestId('daily-share').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain(`Swaplight Daily ${DATE}`);
  expect(clip).toContain('streak 1');

  // Back on the menu the card shows today's score; the next attempt is practice only.
  await page.getByTestId('daily-menu').click();
  await expect(page.getByTestId('daily-card-info')).toContainText('Today');
  await page.getByTestId('mode-daily').click();
  await expect(page.getByTestId('daily-status')).toHaveAttribute('data-official', 'false');
  await shot(page, 'daily-intro-practice');
  await page.getByTestId('daily-start').click();
  d = await daily(page);
  expect(d).toMatchObject({ official: false, active: true, officialAvailable: false });
  await step(page, 30);
  await page.evaluate(() => window.__swaplight!.daily!.finish());
  await expect(page.getByTestId('daily-result')).toBeVisible();
  await expect(page.getByTestId('daily-result-badge')).not.toHaveClass(/is-official/);
  save = await saveData(page);
  expect(save.daily[DATE]).toMatchObject({ official: true, attempts: 2, score });
  expect(save.modes.daily?.played).toBe(1);

  // Practice again from the result screen stays unofficial.
  await page.getByTestId('daily-practice').click();
  await expect(page.getByTestId('daily-status')).toHaveAttribute('data-official', 'false');

  // A new day: a new official attempt, the streak grows.
  await page.evaluate(() => {
    window.__swaplight!.daily!.setToday('2026-10-07');
    window.__swaplight!.daily!.start();
  });
  d = await daily(page);
  expect(d).toMatchObject({ date: '2026-10-07', official: true, streak: 2 });
  await page.evaluate(() => window.__swaplight!.daily!.finish());
  await expect(page.getByTestId('daily-result')).toBeVisible();
  await expect(page.getByTestId('daily-streak')).toContainText('2');
  expect(errors).toEqual([]);
});

test('daily: Hungarian intro, HUD and result', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await page.keyboard.press('Escape');
  await shot(page, 'daily-menu-hu');
  await page.getByTestId('mode-daily').click();
  await expect(page.getByTestId('daily-intro')).toBeVisible();
  await expect(page.getByTestId('daily-intro')).toContainText('Napi kihívás');
  await shot(page, 'daily-intro-hu');
  await page.getByTestId('daily-start').click();
  await step(page, 120);
  await scoreSome(page);
  await shot(page, 'daily-hud-hu', 100);
  await page.evaluate(() => window.__swaplight!.daily!.finish());
  await expect(page.getByTestId('daily-result')).toBeVisible();
  await shot(page, 'daily-result-hu', 1300);
  expect(errors).toEqual([]);
});
