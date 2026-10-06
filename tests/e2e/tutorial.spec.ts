import { expect, test, type Page } from '@playwright/test';
import type { SaveData } from '../../src/game/save';
import type { SwaplightStateSummary } from '../../src/game/testApi';

// Software WebGL is slow at mobile DPR; render at 1x, freeze the ticker before screenshots.
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

async function boot(page: Page, query = '?test&seed=tutorial-e2e'): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    window.__swaplight?.stopRendering();
    window.__swaplight?.pause();
  });
}

const state = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getState()) as Promise<SwaplightStateSummary>;
const tut = (page: Page) => page.evaluate(() => window.__swaplight!.tutorial!.state());
const saveData = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getSave()) as Promise<SaveData>;

async function shot(page: Page, name: string, settleMs = 650): Promise<void> {
  await page.evaluate(() => window.__swaplight?.renderFrames(3));
  await page.waitForTimeout(settleMs); // CSS entrance animations
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

const STEP_IDS = ['swap', 'match', 'drop', 'combo', 'chain', 'raise'];

test('tutorial: banner → every step completed with scripted swaps → done flag persists', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await boot(page);

  // First launch: the menu offers the tutorial.
  await expect(page.getByTestId('tutorial-banner')).toBeVisible();
  await expect(page.getByTestId('mode-tutorial')).toHaveClass(/mode-playable/);
  await shot(page, 'tutorial-banner');
  await page.getByTestId('tutorial-banner').click();
  await expect(page.getByTestId('tutorial-hud')).toBeVisible();
  expect(await state(page)).toMatchObject({ screen: 'playing', mode: 'tutorial' });

  for (const [i, id] of STEP_IDS.entries()) {
    expect(await tut(page)).toMatchObject({ step: i, id, success: false });
    await expect(page.getByTestId('tutorial-step')).toHaveText(`Step ${i + 1} of 7`);
    if (id === 'raise') {
      await expect(page.getByTestId('raise')).toBeVisible();
      await expect(page.getByTestId('tutorial-raise-coach')).toBeVisible();
    } else {
      // The coach mark points at the scripted block; no RAISE on static boards.
      await expect(page.getByTestId('tutorial-coach')).toBeVisible();
      await expect(page.getByTestId('raise')).toHaveCount(0);
    }
    await shot(page, `tutorial-${i + 1}-${id}`, 500);
    if (id === 'chain') {
      // Setup move first: the text switches to the trigger instruction.
      const ok = await page.evaluate(() => {
        const api = window.__swaplight!;
        api.tutorial!.settle();
        api.swap(10, 2);
        api.stepTicks(1);
        api.tutorial!.settle();
        return true;
      });
      expect(ok).toBe(true);
      await expect(page.getByTestId('tutorial-hud')).toContainText('trigger');
      expect((await tut(page)).success).toBe(false);
      await shot(page, 'tutorial-5-chain-trigger', 500);
    }
    expect(await page.evaluate(() => window.__swaplight!.tutorial!.playScript())).toBe(true);
    await expect(page.getByTestId('tutorial-success')).toBeVisible();
    if (i === 1) await shot(page, 'tutorial-success', 300);
    // Auto-advance after the success flash.
    await expect.poll(async () => (await tut(page)).step, { timeout: 5000 }).toBe(i + 1);
  }

  // Final card: the Run teaser.
  await expect(page.getByTestId('tutorial-card')).toBeVisible();
  await shot(page, 'tutorial-7-relics', 900);
  await page.getByTestId('tutorial-finish').click();
  // "Let's play!" leads straight into the Run setup; back returns to the menu.
  await expect(page.getByTestId('run-setup')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('tutorial-banner')).toHaveCount(0);
  expect((await saveData(page)).tutorialDone).toBe(true);

  await page.evaluate(() => window.__swaplight!.flushSave());
  await page.reload();
  await boot(page);
  expect((await saveData(page)).tutorialDone).toBe(true);
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('tutorial-banner')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tutorial: wrong move retries the step; skip advances; quit keeps the banner', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.getByTestId('mode-tutorial').click();
  await page.evaluate(() => window.__swaplight!.tutorial!.goTo(1));
  // A swap that does not match → "try again" and the board resets.
  await page.evaluate(() => {
    const api = window.__swaplight!;
    api.swap(11, 4);
    api.stepTicks(1);
    api.tutorial!.settle();
    api.stepTicks(1);
  });
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect.poll(async () => (await state(page)).stats.swaps, { timeout: 5000 }).toBe(0);
  expect((await tut(page)).step).toBe(1);

  await page.getByTestId('tutorial-skip').click();
  expect((await tut(page)).step).toBe(2);

  // Quit from the pause panel: not done, the banner stays.
  await page.getByTestId('pause').click();
  await page.getByTestId('quit-to-menu').click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('tutorial-banner')).toBeVisible();
  expect((await saveData(page)).tutorialDone).toBe(false);
  expect(errors).toEqual([]);
});

test('tutorial (HU): coach texts and the teaser are translated', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tutorial-banner')).toContainText('oktatást');
  await shot(page, 'tutorial-banner-hu');
  await page.getByTestId('tutorial-banner').click();
  await expect(page.getByTestId('tutorial-hud')).toContainText('Csere');
  await shot(page, 'tutorial-1-swap-hu', 500);
  await page.evaluate(() => window.__swaplight!.tutorial!.goTo(4));
  await expect(page.getByTestId('tutorial-hud')).toContainText('Lánc');
  await shot(page, 'tutorial-5-chain-hu', 500);
  await page.evaluate(() => window.__swaplight!.tutorial!.goTo(5));
  await expect(page.getByTestId('raise')).toContainText('Emelés');
  await shot(page, 'tutorial-6-raise-hu', 500);
  await page.evaluate(() => window.__swaplight!.tutorial!.goTo(6));
  await expect(page.getByTestId('tutorial-card')).toContainText('Futam');
  await shot(page, 'tutorial-7-relics-hu', 900);
  expect(errors).toEqual([]);
});
