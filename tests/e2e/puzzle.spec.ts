import { expect, test, type Page } from '@playwright/test';
import type { PuzzleTestState } from '../../src/game/puzzleMode';
import type { SaveData } from '../../src/game/save';
import type { SwaplightStateSummary } from '../../src/game/testApi';

// Software WebGL is slow at mobile DPR; render at 1x, freeze the ticker before screenshots.
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

async function boot(page: Page, query = '?test&seed=puzzle-e2e'): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    window.__swaplight?.stopRendering();
    window.__swaplight?.pause();
  });
}

const state = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getState()) as Promise<SwaplightStateSummary>;
const puzzle = (page: Page) =>
  page.evaluate(() => window.__swaplight!.puzzle!.state()) as Promise<PuzzleTestState>;
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

/** Play the stored solution move by move with real swaps (queued through the gesture path). */
async function playSolution(page: Page): Promise<void> {
  const { solution } = await puzzle(page);
  expect(solution.length).toBeGreaterThan(0);
  for (const m of solution) {
    await page.evaluate(() => window.__swaplight!.puzzle!.settle());
    await page.evaluate(({ row, col }) => window.__swaplight!.puzzle!.swap(row, col), m);
    await page.evaluate(() => window.__swaplight!.stepTicks(1));
  }
  await page.evaluate(() => window.__swaplight!.puzzle!.settle());
}

test('puzzles: packs → level grid → p1-01 solved with real swaps → stars → progress survives reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await boot(page);

  await expect(page.getByTestId('mode-puzzles')).toHaveClass(/mode-playable/);
  await page.getByTestId('mode-puzzles').click();
  await expect(page.getByTestId('puzzle-packs')).toBeVisible();
  expect((await state(page)).screen).toBe('puzzlePacks');
  // Free version: pack 1 open, packs 2–4 locked with a paywall message.
  await expect(page.getByTestId('puzzle-pack-1')).toHaveAttribute('data-locked', 'false');
  for (const p of [2, 3, 4]) {
    await expect(page.getByTestId(`puzzle-pack-${p}`)).toHaveAttribute('data-locked', 'true');
    await expect(
      page.getByTestId(`puzzle-pack-${p}`).getByTestId('puzzle-pack-lock'),
    ).toBeVisible();
  }
  await page.getByTestId('puzzle-pack-2').click();
  await expect(page.getByTestId('toast')).toContainText('Full Version');
  expect((await state(page)).screen).toBe('puzzlePacks');
  await shot(page, 'puzzle-packs');

  // Level grid: only level 1 is open.
  await page.getByTestId('puzzle-pack-1').click();
  await expect(page.getByTestId('puzzle-levels')).toBeVisible();
  await expect(page.getByTestId('puzzle-level-p1-01')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('puzzle-level-p1-02')).toHaveAttribute('data-state', 'locked');
  await page.getByTestId('puzzle-level-p1-02').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  expect((await state(page)).screen).toBe('puzzleLevels');
  await shot(page, 'puzzle-levels');

  // Play p1-01: static board, moves counter, goal, no RAISE button.
  await page.getByTestId('puzzle-level-p1-01').click();
  await expect(page.getByTestId('puzzle-hud')).toBeVisible();
  expect(await state(page)).toMatchObject({ screen: 'playing', mode: 'puzzle' });
  await expect(page.getByTestId('puzzle-moves-left')).toHaveText('1');
  await expect(page.getByTestId('puzzle-goal')).toHaveText('Clear every block');
  await expect(page.getByTestId('raise')).toHaveCount(0);
  await expect(page.getByTestId('puzzle-undo')).toBeDisabled();
  expect((await page.evaluate(() => window.__swaplight!.getRenderInfo())).boardVisible).toBe(true);
  await shot(page, 'puzzle-play', 300);

  // Handcrafted puzzle: Hint shows the teaching text (no star penalty).
  await page.getByTestId('puzzle-hint').click();
  await expect(page.getByTestId('puzzle-hint-text')).toContainText('swap');
  await shot(page, 'puzzle-hint-text', 400);
  await page.getByTestId('puzzle-hint-ok').click();
  await expect(page.getByTestId('puzzle-hint-card')).toHaveCount(0);
  // Back with the hint card open closes the card instead of pausing.
  await page.getByTestId('puzzle-hint').click();
  await expect(page.getByTestId('puzzle-hint-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('puzzle-hint-card')).toHaveCount(0);
  expect((await page.evaluate(() => window.__swaplight!.getState())).screen).toBe('playing');

  // A wrong swap uses the only move → fail screen → undo → solve.
  await page.evaluate(() => window.__swaplight!.puzzle!.swap(11, 0));
  await page.evaluate(() => window.__swaplight!.stepTicks(1));
  await page.evaluate(() => window.__swaplight!.puzzle!.settle());
  expect((await puzzle(page)).status).toBe('lost');
  await expect(page.getByTestId('puzzle-fail')).toBeVisible();
  await shot(page, 'puzzle-fail', 400);
  await page.getByTestId('puzzle-fail-undo').click();
  await expect(page.getByTestId('puzzle-fail')).toBeHidden();
  expect(await puzzle(page)).toMatchObject({ status: 'playing', movesUsed: 0 });

  await playSolution(page);
  const solved = await puzzle(page);
  expect(solved.status).toBe('won');
  await expect(page.getByTestId('puzzle-win')).toBeVisible();
  await expect(page.getByTestId('puzzle-stars')).toHaveAttribute('data-stars', '3');
  await shot(page, 'puzzle-win', 1100);
  expect((await saveData(page)).puzzles['p1-01']).toEqual({ stars: 3, moves: 1 });

  // Next puzzle opens p1-02.
  await page.getByTestId('puzzle-next').click();
  await expect(page.getByTestId('puzzle-hud')).toBeVisible();
  expect((await puzzle(page)).id).toBe('p1-02');

  // Progress survives a reload.
  await page.evaluate(() => window.__swaplight!.flushSave());
  await page.reload();
  await boot(page);
  expect((await saveData(page)).puzzles['p1-01']).toEqual({ stars: 3, moves: 1 });
  await page.getByTestId('mode-puzzles').click();
  await page.getByTestId('puzzle-pack-1').click();
  await expect(page.getByTestId('puzzle-level-p1-01')).toHaveAttribute('data-state', 'solved');
  await expect(page.getByTestId('puzzle-level-p1-02')).toHaveAttribute('data-state', 'open');
  await shot(page, 'puzzle-levels-progress');

  // Back: level grid → packs → menu.
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('puzzle-packs')).toBeVisible();
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('start-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('puzzles: solution hint highlights the move, costs a star; retry; real drag solves', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);
  // p1-08 is a generated puzzle (no teaching text): the hint reveals a solution move.
  await page.evaluate(() => window.__swaplight!.puzzle!.open('p1-08'));
  await expect(page.getByTestId('puzzle-hud')).toBeVisible();
  await page.getByTestId('puzzle-hint').click();
  await expect(page.getByTestId('puzzle-hint-confirm')).toBeVisible();
  await shot(page, 'puzzle-hint-confirm', 400);
  await page.getByTestId('puzzle-hint-confirm').click();
  await expect(page.getByTestId('puzzle-highlight')).toBeVisible();
  const p = await puzzle(page);
  expect(p.hintsUsed).toBe(1);
  expect(p.highlight).toEqual(p.solution[0]);
  await shot(page, 'puzzle-highlight', 500);

  await playSolution(page);
  await expect(page.getByTestId('puzzle-win')).toBeVisible();
  await expect(page.getByTestId('puzzle-stars')).toHaveAttribute('data-stars', '2');
  expect((await saveData(page)).puzzles['p1-08']?.stars).toBe(2);

  // Retry → restart from the win screen; undo after a move.
  await page.getByTestId('puzzle-retry').click();
  await expect(page.getByTestId('puzzle-hud')).toBeVisible();
  expect(await puzzle(page)).toMatchObject({ status: 'playing', movesUsed: 0 });

  // Pause / resume, then solve with a real pointer drag through the gesture controller.
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause-panel')).toBeVisible();
  await page.getByTestId('resume').click();
  // p1-08's move slides a block into the empty cell on its left: drag that block leftwards.
  const move = (await puzzle(page)).solution[0]!;
  const sim = await page.evaluate(() => window.__swaplight!.getSim());
  const leftEmpty = sim.cells[move.row * sim.config.cols + move.col] === null;
  const [fromCol, toCol] = leftEmpty ? [move.col + 1, move.col] : [move.col, move.col + 1];
  const from = await page.evaluate(({ row, col }) => window.__swaplight!.cellCenter(row, col), {
    row: move.row,
    col: fromCol,
  });
  const to = await page.evaluate(({ row, col }) => window.__swaplight!.cellCenter(row, col), {
    row: move.row,
    col: toCol,
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
  await page.evaluate(() => window.__swaplight!.stepTicks(2));
  expect((await puzzle(page)).movesUsed).toBe(1);
  await page.evaluate(() => window.__swaplight!.puzzle!.settle());
  await expect(page.getByTestId('puzzle-win')).toBeVisible();
  await page.getByTestId('puzzle-levels-btn').click();
  await expect(page.getByTestId('puzzle-levels')).toBeVisible();
  expect(errors).toEqual([]);
});

test('puzzles (HU): packs, play and win screens are translated', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await page.keyboard.press('Escape');

  await page.getByTestId('mode-puzzles').click();
  await expect(page.getByTestId('puzzle-packs')).toContainText('Első fény');
  await shot(page, 'puzzle-packs-hu');
  await page.getByTestId('puzzle-pack-1').click();
  await shot(page, 'puzzle-levels-hu');
  await page.evaluate(() => window.__swaplight!.puzzle!.open('p1-07'));
  await expect(page.getByTestId('puzzle-goal')).toHaveText('Csinálj ×2 láncot');
  await shot(page, 'puzzle-play-hu', 300);
  await page.getByTestId('puzzle-hint').click();
  await shot(page, 'puzzle-hint-hu', 400);
  await page.getByTestId('puzzle-hint-ok').click();
  await playSolution(page);
  await expect(page.getByTestId('puzzle-win')).toContainText('Megoldva');
  await shot(page, 'puzzle-win-hu', 1100);
  // Next → pause → "All puzzles" goes back to the level grid.
  await page.getByTestId('puzzle-next').click();
  await expect(page.getByTestId('puzzle-hud')).toBeVisible();
  await page.getByTestId('pause').click();
  await page.getByTestId('pause-puzzle-levels').click();
  await expect(page.getByTestId('puzzle-levels')).toBeVisible();
  expect(errors).toEqual([]);
});
