import { expect, test, type Page } from '@playwright/test';
import type { RunTestState } from '../../src/game/runMode';
import type { SaveData } from '../../src/game/save';
import type { SwaplightStateSummary } from '../../src/game/testApi';
import { findMatchingSwap } from './support/solver';

// Software WebGL is slow at mobile DPR; render at 1x, freeze the ticker before screenshots.
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

async function boot(page: Page, query = '?test&seed=run-e2e'): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    window.__swaplight?.stopRendering();
    window.__swaplight?.pause();
  });
}

const state = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getState()) as Promise<SwaplightStateSummary>;
const run = (page: Page) =>
  page.evaluate(() => window.__swaplight!.run!.state()) as Promise<RunTestState>;
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

/** Play one matching swap so the HUD shows a base × mult breakdown. */
async function scoreOnce(page: Page): Promise<void> {
  const sim = await page.evaluate(() => window.__swaplight!.getSim());
  const swap = findMatchingSwap(sim, 40);
  expect(swap).not.toBeNull();
  await page.evaluate(({ row, col }) => window.__swaplight!.swap(row, col), swap!);
  await page.evaluate(() => window.__swaplight!.stepTicks(90));
}

test('run: deck select → map → intro → play → reward → shop → next stage → charms → abandon', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await boot(page);

  // The Run card is playable; tapping it opens the deck select.
  await expect(page.getByTestId('mode-run')).toHaveClass(/mode-playable/);
  await page.getByTestId('mode-run').click();
  await expect(page.getByTestId('run-setup')).toBeVisible();
  await expect(page.getByTestId('deck-neon')).toHaveAttribute('aria-pressed', 'true');
  // Locked deck (free version) explains itself and stays unselected.
  await page.getByTestId('deck-prism').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect(page.getByTestId('deck-neon')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'run-setup');

  await page.getByTestId('run-start').click();
  await expect(page.getByTestId('run-map')).toBeVisible();
  let r = await run(page);
  expect(r).toMatchObject({ active: true, phase: 'stage', act: 1, stage: 0, szikra: 4 });
  expect(r.charms).toEqual(['hourglass']);
  expect(r.saved).toBe(true);
  await shot(page, 'run-map');

  // Stage intro over the (paused) board.
  await page.getByTestId('run-play-stage').click();
  await expect(page.getByTestId('stage-intro')).toBeVisible();
  expect((await state(page)).screen).toBe('stageIntro');
  expect((await page.evaluate(() => window.__swaplight!.getRenderInfo())).boardVisible).toBe(true);
  await shot(page, 'run-intro');

  await page.getByTestId('stage-start').click();
  await expect(page.getByTestId('run-hud')).toBeVisible();
  expect(await state(page)).toMatchObject({ screen: 'playing', mode: 'run' });
  await scoreOnce(page);
  await expect(page.getByTestId('score-chips')).toBeVisible();
  r = await run(page);
  expect(r.goal).toBe('scoreInTime');
  expect(r.value).toBeGreaterThan(0);
  await shot(page, 'run-hud', 200);

  // Relic tooltip.
  await page.evaluate(() => window.__swaplight!.run!.grantRelic('spark_plug'));
  await page.getByTestId('hud-relic-0').click();
  await expect(page.getByTestId('relic-tip')).toContainText('Spark Plug');

  // Force the win: fanfare, then the reward breakdown.
  await page.evaluate(() => window.__swaplight!.run!.forceWin());
  await expect(page.getByTestId('stage-result')).toBeVisible();
  await expect(page.getByTestId('reward-lines').locator('li')).not.toHaveCount(0);
  await page.waitForTimeout(2200);
  r = await run(page);
  expect(r.phase).toBe('shop');
  expect(r.szikra).toBeGreaterThan(4);
  await expect(page.getByTestId('reward-total')).toHaveText(String(r.szikra - 4));
  await shot(page, 'run-result', 100);

  // Shop: buy the first relic.
  await page.getByTestId('result-continue').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await page.evaluate(() => window.__swaplight!.run!.grantSzikra(20));
  r = await run(page);
  expect(r.shopRelics).toHaveLength(3);
  expect(r.shopCharms).toHaveLength(2);
  await shot(page, 'run-shop', 900);
  const before = r.szikra;
  const price = r.shopRelics[0]!.price;
  await page.getByTestId('buy-relic-0').click();
  r = await run(page);
  expect(r.relics).toHaveLength(2);
  expect(r.szikra).toBe(before - price);
  await expect(page.getByTestId('buy-relic-0')).toBeDisabled();
  // Sell flow: tap an owned relic → sell bar.
  await page.getByTestId('owned-relic-0').click();
  await expect(page.getByTestId('sell-bar')).toBeVisible();
  await shot(page, 'run-shop-sell', 300);
  await page.getByTestId('sell-relic').click();
  expect((await run(page)).relics).toHaveLength(1);
  // Reroll costs 2, then 3.
  const sz = (await run(page)).szikra;
  await page.getByTestId('shop-reroll').click();
  expect((await run(page)).szikra).toBe(sz - 2);

  // Next stage.
  await page.getByTestId('shop-next').click();
  await expect(page.getByTestId('run-map')).toBeVisible();
  r = await run(page);
  expect(r).toMatchObject({ phase: 'stage', act: 1, stage: 1 });
  await page.getByTestId('run-play-stage').click();
  await page.getByTestId('stage-start').click();
  await page.evaluate(() => window.__swaplight!.stepTicks(30));

  // Back (Escape) with the charm card open closes the card – it does not pause.
  await page.getByTestId('hud-charm-0').click();
  await expect(page.getByTestId('charm-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('charm-card')).toBeHidden();
  expect((await page.evaluate(() => window.__swaplight!.getState())).screen).toBe('playing');

  // Untargeted charm: open its card, use it.
  await page.getByTestId('hud-charm-0').click();
  await expect(page.getByTestId('charm-card')).toBeVisible();
  await expect(page.getByTestId('charm-card')).toContainText('Hourglass');
  await shot(page, 'run-charm', 300);
  await page.getByTestId('charm-use').click();
  await expect(page.getByTestId('charm-card')).toBeHidden();
  r = await run(page);
  expect(r.charms).toEqual([]);
  expect((await page.evaluate(() => window.__swaplight!.getSim())).stopTicks).toBeGreaterThan(400);

  // Targeted charm (Purge): tap a column on the board.
  await page.evaluate(() => window.__swaplight!.run!.grantCharm('purge'));
  await page.getByTestId('hud-charm-0').click();
  await page.getByTestId('charm-use').click();
  await expect(page.getByTestId('targeting')).toBeVisible();
  const sim = await page.evaluate(() => window.__swaplight!.getSim());
  const { rows, cols } = sim.config;
  const col = 2;
  const blocksBefore = sim.cells.filter((b, i) => b && i % cols === col).length;
  expect(blocksBefore).toBeGreaterThan(0);
  const p = await page.evaluate(({ r, c }) => window.__swaplight!.cellCenter(r, c), {
    r: rows - 1,
    c: col,
  });
  await page.mouse.move(p.x, p.y);
  await shot(page, 'run-targeting', 300);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('targeting')).toBeHidden();
  const after = await page.evaluate(() => window.__swaplight!.getSim());
  expect(after.cells.filter((b, i) => b && i % cols === col).length).toBe(0);
  expect((await run(page)).charms).toEqual([]);

  // Abandon from the pause panel.
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('pause-panel')).toBeVisible();
  await page.getByTestId('pause-abandon').click();
  await expect(page.getByTestId('abandon-confirm')).toBeVisible();
  await shot(page, 'run-abandon', 300);
  await page.getByTestId('abandon-yes').click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
  expect((await run(page)).active).toBe(false);
  expect((await saveData(page)).runInProgress).toBeNull();
  await expect(page.getByTestId('run-continue')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('run: a mid-stage run survives a reload and continues from the menu', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => window.__swaplight!.run!.start({ seed: 'persist-1' }));
  await page.evaluate(() => {
    const r = window.__swaplight!.run!;
    r.playStage();
    r.beginStage();
  });
  await scoreOnce(page);
  const s1 = await state(page);
  const r1 = await run(page);
  expect(s1.tick).toBeGreaterThan(0);

  // App pause (back → pause panel) saves the stage mid-play.
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('pause-panel')).toBeVisible();
  await page.evaluate(() => window.__swaplight!.flushSave());
  expect((await saveData(page)).runInProgress).not.toBeNull();

  await page.reload();
  await boot(page);
  await expect(page.getByTestId('run-continue')).toBeVisible();
  await shot(page, 'run-menu-continue');
  await page.getByTestId('run-continue').click();
  await expect(page.getByTestId('pause-panel')).toBeVisible();
  const s2 = await state(page);
  const r2 = await run(page);
  expect(s2).toMatchObject({ mode: 'run', screen: 'paused', tick: s1.tick, score: s1.score });
  expect(r2).toMatchObject({ act: r1.act, stage: r1.stage, szikra: r1.szikra, value: r1.value });
  await page.getByTestId('resume').click();
  expect((await state(page)).screen).toBe('playing');
  await page.evaluate(() => window.__swaplight!.stepTicks(30));
  expect((await state(page)).tick).toBe(s1.tick + 30);

  // Quit to menu keeps the run; the shop is also a resume point.
  await page.evaluate(() => {
    window.__swaplight!.run!.forceWin();
  });
  await expect(page.getByTestId('stage-result')).toBeVisible();
  await page.evaluate(() => window.__swaplight!.flushSave());
  await page.reload();
  await boot(page);
  await page.getByTestId('run-continue').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  expect((await run(page)).phase).toBe('shop');
  expect(errors).toEqual([]);
});

test('run: boss curses, a full run to victory and the summary (HU)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await boot(page, '?test&seed=boss-5');
  // Hungarian UI.
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.__swaplight!.run!.start({ seed: 'boss-5' }));
  await expect(page.getByTestId('run-map')).toBeVisible();
  await shot(page, 'run-map-hu');

  const clearStage = async () => {
    await page.evaluate(() => {
      const r = window.__swaplight!.run!;
      r.playStage();
      r.beginStage();
      r.forceWin();
    });
    await expect(page.getByTestId('stage-result')).toBeVisible();
  };
  // Act 1: three stages, shop in between.
  for (let i = 0; i < 3; i++) {
    await clearStage();
    await page.evaluate(() => {
      const r = window.__swaplight!.run!;
      r.continueFromResult();
      r.leaveShop();
    });
  }
  // Act-1 boss: The Veil hides a color.
  await page.getByTestId('run-play-stage').click();
  await expect(page.getByTestId('stage-intro')).toBeVisible();
  await shot(page, 'run-boss-intro-hu');
  await page.getByTestId('stage-start').click();
  const veiled = await run(page);
  expect(veiled.hiddenColor).not.toBeNull();
  await page.evaluate(() => window.__swaplight!.stepTicks(20));
  await shot(page, 'run-boss-veil-hu', 250);
  await page.evaluate(() => window.__swaplight!.run!.forceWin());
  await expect(page.getByTestId('stage-result')).toBeVisible();
  await page.waitForTimeout(2200);
  await shot(page, 'run-result-hu', 100);
  await page.getByTestId('result-continue').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await page.evaluate(() => window.__swaplight!.run!.grantSzikra(30));
  await shot(page, 'run-shop-hu', 900);
  await page.evaluate(() => {
    const r = window.__swaplight!.run!;
    r.buyRelic(0);
    r.buyRelic(1);
    r.leaveShop();
  });

  // Acts 2 and 3 (act 3 boss = The Lock).
  for (let i = 0; i < 7; i++) {
    await clearStage();
    await page.evaluate(() => {
      const r = window.__swaplight!.run!;
      r.continueFromResult();
      r.leaveShop();
    });
  }
  let r = await run(page);
  expect(r).toMatchObject({ act: 3, stage: 3 });
  await page.evaluate(() => {
    const api = window.__swaplight!.run!;
    api.playStage();
    api.beginStage();
  });
  await page.evaluate(() => window.__swaplight!.stepTicks(20));
  await shot(page, 'run-boss-lock-hu', 250);
  await page.evaluate(() => window.__swaplight!.run!.forceWin());
  await expect(page.getByTestId('stage-result')).toBeVisible();
  await page.getByTestId('result-continue').click();
  await expect(page.getByTestId('run-end')).toBeVisible();
  await expect(page.getByTestId('unlock-banner')).toBeVisible();
  await expect(page.getByTestId('end-stages')).toHaveText('12 / 12');
  await shot(page, 'run-victory-hu', 1200);
  const save = await saveData(page);
  expect(save.unlocks).toContain('brightness.2');
  expect(save.runInProgress).toBeNull();
  expect(save.modes.run?.played).toBe(1);
  r = await run(page);
  expect(r.active).toBe(false);
  await page.getByTestId('run-end-menu').click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('run: losing a stage ends the run with a summary', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const r = window.__swaplight!.run!;
    r.start({ seed: 'lose-1' });
    r.playStage();
    r.beginStage();
  });
  await page.evaluate(() => window.__swaplight!.stepTicks(200));
  await page.evaluate(() => window.__swaplight!.run!.forceLose());
  await expect(page.getByTestId('run-end')).toBeVisible();
  await shot(page, 'run-over', 900);
  expect((await saveData(page)).runInProgress).toBeNull();
  await page.getByTestId('run-again').click();
  await expect(page.getByTestId('run-setup')).toBeVisible();
  expect(errors).toEqual([]);
});
