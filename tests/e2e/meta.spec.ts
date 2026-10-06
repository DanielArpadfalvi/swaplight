import { expect, test, type Page } from '@playwright/test';
import type { SaveData } from '../../src/game/save';
import type { SwaplightStateSummary } from '../../src/game/testApi';

// Software WebGL is slow at mobile DPR; render at 1x, freeze the ticker before screenshots.
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

async function boot(page: Page, query = '?test&seed=meta-1'): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    window.__swaplight?.stopRendering();
    window.__swaplight?.pause();
  });
}

const state = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getState()) as Promise<SwaplightStateSummary>;
const saveData = (page: Page) =>
  page.evaluate(() => window.__swaplight!.getSave()) as Promise<SaveData>;

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.__swaplight?.renderFrames(2));
  await page.waitForTimeout(450); // CSS entrance animations
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

test('menu → settings persist across reload → endless → pause → quit to menu', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);

  // Main menu: every mode is listed and implemented; Daily (Full Version) carries the lock badge.
  await expect(page.getByTestId('start-screen')).toBeVisible();
  for (const id of ['run', 'endless', 'versus', 'daily', 'puzzles', 'tutorial']) {
    await expect(page.getByTestId(`mode-${id}`)).toBeVisible();
  }
  for (const id of ['run', 'endless', 'versus', 'puzzles', 'tutorial']) {
    await expect(page.getByTestId(`mode-${id}`)).toHaveClass(/mode-playable/);
  }
  await expect(page.locator('.mode-soon')).toHaveCount(0);
  await expect(page.getByTestId('mode-daily').getByTestId('lock-badge')).toBeVisible();
  expect((await page.evaluate(() => window.__swaplight!.getRenderInfo())).boardVisible).toBe(false);
  await shot(page, 'menu');

  // A locked mode opens the Full Version sheet instead of starting.
  await page.getByTestId('mode-daily').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('paywall-reason')).toContainText('Daily Challenge');
  expect((await state(page)).screen).toBe('menu');
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('paywall')).toHaveCount(0);

  // Settings: change a few values.
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('toggle-reduced-motion').click();
  await page.getByTestId('toggle-high-contrast').click();
  await page.getByTestId('toggle-breakdown').click();
  await page.getByTestId('toggle-large-text').click();
  await expect(page.locator('.ui-root')).toHaveClass(/large-text/);
  await page.getByTestId('volume-music').fill('25');
  await expect(page.getByTestId('toggle-reduced-motion')).toHaveAttribute('aria-checked', 'true');
  const render = await page.evaluate(() => window.__swaplight!.getRenderInfo());
  expect(render.reducedMotion).toBe(true);
  expect(render.palette).toBe('high-contrast');
  await shot(page, 'settings');

  // Stats sheet, then back (Escape = Android back) closes the overlay.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings')).toBeHidden();
  await page.getByTestId('open-stats').click();
  await expect(page.getByTestId('stats')).toBeVisible();
  await page.getByTestId('sheet-back').click();
  await expect(page.getByTestId('stats')).toBeHidden();

  // Reload: the debounced save is flushed on pagehide and restored on boot.
  await page.reload();
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    window.__swaplight?.stopRendering();
    window.__swaplight?.pause();
  });
  const saved = await saveData(page);
  expect(saved.settings.reducedMotion).toBe(true);
  expect(saved.settings.highContrast).toBe(true);
  expect(saved.settings.showBreakdown).toBe(false);
  expect(saved.settings.largeText).toBe(true);
  expect(saved.settings.musicVolume).toBeCloseTo(0.25);
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('toggle-reduced-motion')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toggle-high-contrast')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('volume-music')).toHaveValue('25');
  await expect(page.getByTestId('toggle-large-text')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('toggle-large-text').click();
  await expect(page.locator('.ui-root')).not.toHaveClass(/large-text/);
  expect((await page.evaluate(() => window.__swaplight!.getRenderInfo())).palette).toBe(
    'high-contrast',
  );
  await page.getByTestId('sheet-back').click();
  await expect(page.getByTestId('settings')).toBeHidden();

  // Endless → pause → settings from pause → quit to menu.
  await page.getByTestId('mode-endless').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  expect((await state(page)).screen).toBe('playing');
  expect((await page.evaluate(() => window.__swaplight!.getRenderInfo())).boardVisible).toBe(true);
  // First Endless start shows the one-time controls hint.
  await expect(page.getByTestId('toast')).toContainText('Hold ▲ to raise');
  expect((await saveData(page)).hintsSeen).toContain('endless.controls');
  // During play the toast sits above the board (never over its rows or the RAISE button).
  const toastBox = (await page.getByTestId('toast').boundingBox())!;
  const boardTop = (await state(page)).layout.originY;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(boardTop);

  // Press-and-hold RAISE lifts the stack much faster than the idle rise.
  const risenBefore = (await state(page)).stats.rowsRisen;
  const raise = page.getByTestId('raise');
  await expect(raise).toBeVisible();
  const box = (await raise.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(56);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await state(page)).raiseButton).toBe(true);
  await page.evaluate(() => window.__swaplight!.stepTicks(30));
  await page.mouse.up();
  let s = await state(page);
  expect(s.raiseButton).toBe(false);
  expect(s.stats.rowsRisen).toBeGreaterThan(risenBefore);
  await shot(page, 'endless-raise');

  await page.evaluate(() => window.__swaplight!.stepTicks(280));
  s = await state(page);
  expect(s.gameOver).toBe(false);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause-panel')).toBeVisible();
  // A screen change clears the toast (it never covers the pause panel / game over buttons).
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await page.getByTestId('pause-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('settings')).toBeHidden();
  expect((await state(page)).screen).toBe('paused');
  await shot(page, 'pause');
  await page.getByTestId('quit-to-menu').click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
  expect((await state(page)).screen).toBe('menu');
  // The quit game (≥ 5 s) counts in the stats.
  expect((await saveData(page)).modes.endless?.played).toBe(1);

  // Back on the main menu asks before leaving.
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('exit-confirm')).toBeVisible();
  await page.getByTestId('exit-stay').click();
  await expect(page.getByTestId('exit-confirm')).toBeHidden();

  expect(errors).toEqual([]);
});

test('language switch to Hungarian translates the menu and persists', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await boot(page);
  await expect(page.getByTestId('mode-endless')).toContainText('Endless');

  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await expect(page.getByTestId('settings')).toContainText('Beállítások');
  await shot(page, 'settings-hu');
  await page.getByTestId('sheet-back').click();
  await expect(page.getByTestId('settings')).toBeHidden();

  await expect(page.getByTestId('mode-endless')).toContainText('Végtelen');
  await expect(page.getByTestId('mode-run')).toContainText('Futam');
  // The document language follows the UI (hyphenation, screen readers).
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('hu');
  await expect(page.getByTestId('open-settings')).toContainText('Beállítások');
  await shot(page, 'menu-hu');

  await page.getByTestId('open-stats').click();
  await expect(page.getByTestId('stats')).toContainText('Statisztika');
  await shot(page, 'stats-hu');
  await page.getByTestId('sheet-back').click();

  await page.reload();
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await expect(page.getByTestId('mode-endless')).toContainText('Végtelen');
  expect(errors).toEqual([]);
});

test('stats screen shows recorded games', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  // Seed a save with some history (as a previous session would have written it).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'swaplight:save',
      JSON.stringify({
        version: 1,
        modes: {
          endless: {
            played: 42,
            best: 128450,
            bestChain: 7,
            bestCombo: 11,
            blocksCleared: 9876,
            playTime: 15240,
          },
          tutorial: {
            played: 1,
            best: 0,
            bestChain: 1,
            bestCombo: 0,
            blocksCleared: 0,
            playTime: 0,
          },
        },
        puzzles: { 'p1-01': { stars: 3, moves: 2 }, 'p1-02': { stars: 2, moves: 3 } },
        collectionSeen: ['relic.spark_plug', 'relic.infinity_loop', 'charm.purge', 'boss.surge'],
        fullVersion: false,
      }),
    );
  });
  await boot(page);
  await expect(page.getByTestId('mode-endless')).toContainText('128,450');
  await page.getByTestId('open-stats').click();
  await expect(page.getByTestId('stat-games')).toHaveText('43'); // 42 Endless + 1 Tutorial
  await expect(page.getByTestId('stat-chain')).toHaveText('×7');
  await expect(page.getByTestId('stat-blocks')).toHaveText('9,876');
  await expect(page.getByTestId('best-endless')).toHaveText('128,450');
  await expect(page.getByTestId('best-run')).toHaveText('—');
  // No Tutorial row; Puzzles show the stars collected instead of a score.
  await expect(page.getByTestId('best-tutorial')).toHaveCount(0);
  await expect(page.getByTestId('best-puzzles')).toContainText('5 /');
  await shot(page, 'stats');
  await page.getByTestId('sheet-back').click();
  await page.getByTestId('open-collection').click();
  await expect(page.getByTestId('collection')).toBeVisible();
  // Real collection: discovered items in full, the rest as "???", counters per tab.
  await expect(page.getByTestId('collection-count-relics')).toHaveText(/^2\/\d+$/);
  await expect(page.getByTestId('collection-count-charms')).toHaveText(/^1\/\d+$/);
  await expect(page.getByTestId('collection-count-curses')).toHaveText(/^1\/\d+$/);
  await expect(page.getByTestId('collection-item-spark_plug')).toContainText('Spark Plug');
  await expect(page.getByTestId('collection-item-heavy_hand')).toContainText('???');
  await page.getByTestId('collection-item-spark_plug').click();
  await expect(page.getByTestId('collection-detail')).toContainText('+15 base');
  await page.getByTestId('collection-tab-curses').click();
  await expect(page.getByTestId('collection-item-surge')).toContainText('Surge');
  await shot(page, 'collection');
  expect(errors).toEqual([]);
});
