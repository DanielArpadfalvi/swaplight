import { expect, test, type Page } from '@playwright/test';
import type { SaveData } from '../../src/game/save';
import type { SwaplightStateSummary } from '../../src/game/testApi';
import type { VersusTestState } from '../../src/game/versusMode';
import { canSwap, cloneSim, step as simStep } from '../../src/core/sim';
import type { SimState } from '../../src/core/types';
import { findMatchingSwap } from './support/solver';

/**
 * Swaps (one, or two 6 ticks apart) whose match starts converting a garbage slab within
 * `horizon` ticks.
 */
function findConvertingSwaps(
  sim: SimState,
  horizon = 80,
): { swaps: { row: number; col: number }[]; ticks: number } | null {
  const { rows, cols } = sim.config;
  const legal = (s: SimState) => {
    const out: { row: number; col: number }[] = [];
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = 0; col < cols - 1; col++)
        if (canSwap(s, row, col) === null) out.push({ row, col });
    }
    return out;
  };
  const converts = (s: SimState, from: number) => {
    for (let i = from; i <= horizon && !s.gameOver; i++) {
      simStep(s, [], undefined, null);
      if (s.garbage.some((g) => g.state === 'converting')) return i;
    }
    return -1;
  };
  for (const a of legal(sim)) {
    const s = cloneSim(sim);
    simStep(s, [{ type: 'swap', ...a }], undefined, null);
    const t = converts(s, 1);
    if (t > 0) return { swaps: [a], ticks: t };
  }
  for (const a of legal(sim)) {
    const s1 = cloneSim(sim);
    simStep(s1, [{ type: 'swap', ...a }], undefined, null);
    for (let i = 0; i < 5; i++) simStep(s1, [], undefined, null);
    for (const b of legal(s1)) {
      const s2 = cloneSim(s1);
      simStep(s2, [{ type: 'swap', ...b }], undefined, null);
      const t = converts(s2, 7);
      if (t > 0) return { swaps: [a, b], ticks: t };
    }
  }
  return null;
}

// Software WebGL is slow at mobile DPR; render at 1x, freeze the ticker before screenshots and
// drive the sim through the test hooks (deterministic stepping).
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

async function boot(page: Page, query = '?test&seed=vs-conv-2'): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    window.__swaplight?.stopRendering();
    window.__swaplight?.pause();
  });
}

const state = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getState()) as Promise<SwaplightStateSummary>;
const vs = (page: Page) =>
  page.evaluate(() => window.__swaplight!.versus!.state()) as Promise<VersusTestState>;
const saveData = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getSave()) as Promise<SaveData>;
const step = (page: Page, n: number) => page.evaluate((k) => window.__swaplight!.stepTicks(k), n);

async function shot(page: Page, name: string, settleMs = 650, frames = 3): Promise<void> {
  await page.evaluate((n) => window.__swaplight?.renderFrames(n), frames);
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

test('versus: select → play vs CPU → garbage both ways → win → rematch → lose', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await boot(page);

  await expect(page.getByTestId('mode-versus')).toHaveClass(/mode-playable/);
  await page.getByTestId('mode-versus').click();
  await expect(page.getByTestId('versus-setup')).toBeVisible();
  await expect(page.getByTestId('vs-level-1')).toHaveAttribute('aria-checked', 'true');
  // Hard needs the Full Version: the paywall opens, selection unchanged.
  await page.getByTestId('vs-level-3').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('paywall-reason')).toContainText('difficulty');
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByTestId('versus-setup')).toBeVisible();
  await expect(page.getByTestId('vs-level-1')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('vs-level-2').click();
  await expect(page.getByTestId('vs-level-2')).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'versus-setup');

  await page.getByTestId('vs-start').click();
  await expect(page.getByTestId('versus-hud')).toBeVisible();
  expect(await state(page)).toMatchObject({ screen: 'playing', mode: 'versus' });
  let v = await vs(page);
  expect(v).toMatchObject({ active: true, level: 2, round: 1, format: 'single' });
  expect((await page.evaluate(() => window.__swaplight!.getRenderInfo())).boardVisible).toBe(true);

  // Let the "FIGHT!" banner play out (effects only advance with rendered frames here).
  await page.evaluate(() => window.__swaplight!.renderFrames(90));
  // The CPU plays on its own (same fixed-step loop).
  await step(page, 240);
  v = await vs(page);
  expect(v.tick).toBe(240);
  expect(v.cpuSwaps).toBeGreaterThan(0);

  // Scripted attack on the player: preview first, then the slab drops onto the board.
  const before = v;
  await page.evaluate(() => window.__swaplight!.versus!.sendGarbage(6, 2, 'player'));
  await expect(page.getByTestId('vs-queue')).toHaveAttribute(
    'data-count',
    String(before.playerQueue + 1),
  );
  await page.evaluate(() => window.__swaplight!.versus!.sendGarbage(4, 1, 'cpu'));
  await expect(page.getByTestId('vs-opp-queue')).toHaveAttribute(
    'data-count',
    String(before.cpuQueue + 1),
  );
  await shot(page, 'versus-incoming', 100, 14);
  await step(page, 100);
  v = await vs(page);
  expect(v.playerSlabs).toBeGreaterThan(before.playerSlabs);
  expect(v.cpuSlabs + v.cpuQueue).toBeGreaterThan(0);
  await step(page, 40);
  await shot(page, 'versus-garbage', 100, 4);

  // Clear next to the slab: it flashes and turns into blocks.
  const landed = await page.evaluate(() => window.__swaplight!.getSim());
  // (Seed `vs-conv-2` has a single swap that reaches the slab after this exact script.)
  const conv = findConvertingSwaps(landed);
  expect(conv).not.toBeNull();
  if (conv) {
    const [first, second] = conv.swaps;
    await page.evaluate(({ row, col }) => window.__swaplight!.swap(row, col), first!);
    await step(page, 6);
    if (second) await page.evaluate(({ row, col }) => window.__swaplight!.swap(row, col), second);
    await step(page, conv.ticks);
    expect((await state(page)).eventCounts.garbageConverting ?? 0).toBeGreaterThan(0);
    await shot(page, 'versus-convert', 100, 2);
    let guard = 0;
    while (((await state(page)).eventCounts.garbageConverted ?? 0) === 0 && guard++ < 40) {
      await step(page, 5);
    }
    await step(page, 2);
    await shot(page, 'versus-converted', 100, 2);
  }

  // A real clear sends its own garbage when it is a combo; at least it must score.
  const sim = await page.evaluate(() => window.__swaplight!.getSim());
  const swap = findMatchingSwap(sim, 40);
  if (swap) {
    await page.evaluate(({ row, col }) => window.__swaplight!.swap(row, col), swap);
    await step(page, 90);
    expect((await state(page)).score).toBeGreaterThan(0);
  }

  // Force the win: result panel, record saved.
  await page.evaluate(() => window.__swaplight!.versus!.forceWin());
  await expect(page.getByTestId('versus-result')).toBeVisible();
  await expect(page.getByTestId('vs-result-title')).toHaveText(/victory/i);
  let save = await saveData(page);
  expect(save.versus['2']).toMatchObject({ played: 1, won: 1, lost: 0 });
  expect(save.modes.versus?.played).toBe(1);
  await shot(page, 'versus-win', 900);

  // Rematch: a fresh round 1 at the same level.
  await page.getByTestId('vs-rematch').click();
  await expect(page.getByTestId('versus-hud')).toBeVisible();
  v = await vs(page);
  expect(v).toMatchObject({ active: true, level: 2, round: 1, tick: 0, wins: [0, 0] });
  await step(page, 30);
  await page.evaluate(() => window.__swaplight!.versus!.forceLose());
  await expect(page.getByTestId('versus-result')).toBeVisible();
  await expect(page.getByTestId('vs-result-title')).toHaveText(/defeat/i);
  save = await saveData(page);
  expect(save.versus['2']).toMatchObject({ played: 2, won: 1, lost: 1 });
  await shot(page, 'versus-lose', 900);

  // Change opponent → difficulty select shows the record.
  await page.getByTestId('vs-change').click();
  await expect(page.getByTestId('versus-setup')).toBeVisible();
  await expect(page.getByTestId('vs-record-2')).toContainText('1 W · 1 L');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('versus: best of 3 rounds (HU), full version unlocks Hard+', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await boot(page, '?test&seed=vs-bo3');
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__swaplight!.setFullVersion!(true));

  await page.getByTestId('mode-versus').click();
  await expect(page.getByTestId('versus-setup')).toBeVisible();
  await page.getByTestId('vs-level-4').click();
  await expect(page.getByTestId('vs-level-4')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('vs-format-bo3').click();
  await shot(page, 'versus-setup-hu');
  await page.getByTestId('vs-start').click();
  await expect(page.getByTestId('versus-hud')).toBeVisible();
  expect(await vs(page)).toMatchObject({ level: 4, format: 'bo3', round: 1 });

  await step(page, 300);
  await page.evaluate(() => {
    window.__swaplight!.versus!.sendGarbage(6, 3, 'player');
    window.__swaplight!.versus!.sendGarbage(5, 1, 'player');
  });
  await step(page, 30);
  await shot(page, 'versus-hud-hu', 100, 12);

  // Round 1 to the player → "next round"; round 2 to the player → match won.
  await page.evaluate(() => window.__swaplight!.versus!.forceWin());
  await expect(page.getByTestId('vs-next-round')).toBeVisible();
  await shot(page, 'versus-round-hu', 900);
  // Leaving between rounds of an undecided match asks first (it would forfeit).
  await page.getByTestId('vs-menu').click();
  await expect(page.getByTestId('leave-confirm')).toBeVisible();
  await page.getByTestId('leave-stay').click();
  await expect(page.getByTestId('leave-confirm')).toBeHidden();
  expect((await state(page)).screen).toBe('versusResult');
  await page.getByTestId('vs-next-round').click();
  await expect(page.getByTestId('versus-hud')).toBeVisible();
  expect(await vs(page)).toMatchObject({ round: 2, wins: [1, 0], matchOver: false });
  // Pause → quit to menu mid-match: confirmation; back closes it and keeps the match paused.
  await page.keyboard.press('Escape');
  await page.getByTestId('quit-to-menu').click();
  await expect(page.getByTestId('leave-confirm')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('leave-confirm')).toBeHidden();
  expect((await state(page)).screen).toBe('paused');
  await page.keyboard.press('Escape');
  expect((await state(page)).screen).toBe('playing');
  await step(page, 20);
  await page.evaluate(() => window.__swaplight!.versus!.forceWin());
  await expect(page.getByTestId('vs-rematch')).toBeVisible();
  await expect(page.getByTestId('vs-scoreline')).toContainText('2');
  expect((await saveData(page)).versus['4']).toMatchObject({ played: 1, won: 1 });
  await shot(page, 'versus-win-hu', 900);
  expect(errors).toEqual([]);
});
