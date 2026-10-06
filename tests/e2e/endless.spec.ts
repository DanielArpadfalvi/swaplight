import { expect, test, type Page } from '@playwright/test';
import type { SimState } from '../../src/core/types';
import type { SwaplightStateSummary } from '../../src/game/testApi';
import { findChainSwap, findDraggableSwap } from './support/solver';

// Software WebGL is slow at mobile DPR; render at 1x and drive the sim through the test hooks
// (manual deterministic stepping), never wall-clock.
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

/** Seed with a known single-swap chain (found with `findChainSwap`). */
const SEED = 'e2e-1';
const SHOTS = 'tests/e2e/__screenshots__';

type Api = NonNullable<Window['__swaplight']>;

const hook = <R>(page: Page, fn: (api: Api, arg: number[]) => R, arg: number[] = []) =>
  page.evaluate(
    ([src, a]) => {
      const api = window.__swaplight as Api;
      return new Function('api', 'arg', `return (${src})(api, arg);`)(api, a) as R;
    },
    [fn.toString(), arg] as const,
  );

const getState = (page: Page) =>
  hook(page, (api) => api.getState()) as Promise<SwaplightStateSummary>;
const getSim = (page: Page) => hook(page, (api) => api.getSim()) as Promise<SimState>;
const stepTicks = (page: Page, n: number) => hook(page, (api, [k]) => api.stepTicks(k ?? 0), [n]);
/** Draw a few frames (advancing effects) with the ticker stopped, then screenshot. */
async function shot(page: Page, name: string, frames = 1): Promise<void> {
  await hook(page, (api, [n]) => api.renderFrames(n ?? 1), [frames]);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('endless: start, swap (hook + drag), score a chain, game over, retry', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(`/?test&seed=${SEED}`);
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await hook(page, (api) => {
    api.stopRendering();
    api.pause(); // manual stepping only
  });

  // Start screen.
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await shot(page, 'endless-start', 2);

  await page.getByTestId('play').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  let state = await getState(page);
  expect(state.screen).toBe('playing');
  expect(state.seed).toBe(SEED);
  expect(state.sprites).toBeGreaterThan(20);
  await stepTicks(page, 30);
  await shot(page, 'endless-midgame', 2);

  // Scripted swap via the hook that sets off a chain (searched with the pure core in Node).
  const chain = findChainSwap(await getSim(page));
  expect(chain).not.toBeNull();
  await hook(page, (api, [r, c]) => api.swap(r ?? 0, c ?? 0), [chain!.row, chain!.col]);
  await stepTicks(page, 1);
  state = await getState(page);
  expect(state.eventCounts.swapped).toBe(1);
  // Step to just after the chain link is detected, then let effects play for a few frames.
  await stepTicks(page, chain!.ticks + 12);
  state = await getState(page);
  expect(state.score).toBeGreaterThan(0);
  expect(state.stats.maxChain).toBeGreaterThanOrEqual(2);
  await shot(page, 'endless-chain', 6);
  await expect(page.getByTestId('score-chips')).toBeVisible();

  // Let the board settle, then swap with a synthesized pointer drag on the canvas.
  await stepTicks(page, 240);
  const drag = findDraggableSwap(await getSim(page));
  expect(drag).not.toBeNull();
  const from = await hook(page, (api, [r, c]) => api.cellCenter(r ?? 0, c ?? 0), [
    drag!.row,
    drag!.col,
  ]);
  const to = await hook(page, (api, [r, c]) => api.cellCenter(r ?? 0, c ?? 0), [
    drag!.row,
    drag!.col + 1,
  ]);
  const swapsBefore = (await getState(page)).eventCounts.swapped ?? 0;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
  await stepTicks(page, 2);
  state = await getState(page);
  expect(state.eventCounts.swapped ?? 0).toBe(swapsBefore + 1);

  // No input: the stack rises until it tops out.
  for (let i = 0; i < 30 && !(await getState(page)).gameOver; i++) await stepTicks(page, 1500);
  state = await getState(page);
  expect(state.gameOver).toBe(true);
  await expect(page.getByTestId('game-over')).toBeVisible();
  await expect(page.getByTestId('final-score')).toHaveText(/\d/);
  await page.waitForTimeout(500); // panel entrance animation
  await shot(page, 'endless-gameover', 2);

  await page.getByTestId('retry').click();
  await expect(page.getByTestId('game-over')).toBeHidden();
  state = await getState(page);
  expect(state.screen).toBe('playing');
  expect(state.score).toBe(0);
  expect(state.tick).toBe(0);
  await stepTicks(page, 5);
  expect((await getState(page)).tick).toBe(5);

  expect(errors).toEqual([]);
});
