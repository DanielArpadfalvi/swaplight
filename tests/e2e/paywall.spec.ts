import { expect, test, type Page } from '@playwright/test';
import type { SaveData } from '../../src/game/save';
import type { SwaplightStateSummary } from '../../src/game/testApi';

// Software WebGL is slow at mobile DPR; render at 1x, freeze the ticker before screenshots.
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

async function boot(page: Page, query = '?test&seed=paywall-e2e'): Promise<void> {
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

async function shot(page: Page, name: string, settleMs = 700): Promise<void> {
  await page.evaluate(() => window.__swaplight?.renderFrames(2));
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

async function openRunSetup(page: Page): Promise<void> {
  await page.getByTestId('mode-run').click();
  await expect(page.getByTestId('run-setup')).toBeVisible();
}

test('locked deck → paywall → buy → unlocked and persisted after reload', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);

  // Free version: the menu shows the Full Version banner with the store price.
  await expect(page.getByTestId('paywall-banner')).toBeVisible();
  await expect(page.getByTestId('paywall-banner')).toContainText('$4.99');

  await openRunSetup(page);
  await expect(page.getByTestId('deck-prism')).toHaveClass(/is-locked/);
  await page.getByTestId('deck-prism').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('paywall-reason')).toContainText('deck');
  await expect(page.getByTestId('paywall-buy')).toContainText('$4.99');
  await expect(page.getByTestId('paywall')).toContainText('No ads. No energy. Ever.');
  expect((await state(page)).overlays).toEqual(['paywall']);
  await shot(page, 'paywall-en');

  // Back closes the sheet (Android back / Escape).
  await page.evaluate(() => window.__swaplight!.back());
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByTestId('run-setup')).toBeVisible();

  // Brightness 2 is gated too.
  await page.getByTestId('brightness-2').click();
  await expect(page.getByTestId('paywall-reason')).toContainText('Brightness');

  // Buy with a little store latency: busy state, then the celebration.
  await page.evaluate(() => window.__swaplight!.purchases!.setLatency(600));
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall-buy')).toBeDisabled();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'buying');
  await expect(page.getByTestId('paywall-success')).toBeVisible();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'success');
  await shot(page, 'paywall-success', 450);
  await page.getByTestId('paywall-done').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);

  // Reactive gating: the deck is open now and can be picked.
  await expect(page.getByTestId('deck-prism')).not.toHaveClass(/is-locked/);
  await page.getByTestId('deck-prism').click();
  await expect(page.getByTestId('deck-prism')).toHaveAttribute('aria-pressed', 'true');
  expect((await saveData(page)).fullVersion).toBe(true);
  await page.evaluate(() => window.__swaplight!.flushSave());

  // Persisted: after a reload the game starts unlocked.
  await boot(page);
  expect((await saveData(page)).fullVersion).toBe(true);
  await expect(page.getByTestId('paywall-banner')).toHaveCount(0);
  await openRunSetup(page);
  await expect(page.getByTestId('deck-prism')).not.toHaveClass(/is-locked/);
  expect(errors).toEqual([]);
});

test('purchase cancelled / pending / failed states, restore from the sheet', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await boot(page);

  await page.getByTestId('paywall-banner').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('paywall-reason')).toHaveCount(0);

  await page.evaluate(() => window.__swaplight!.purchases!.setNextOutcome('cancelled'));
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'cancelled');
  await expect(page.getByTestId('paywall-note')).toContainText('cancelled');

  await page.evaluate(() => window.__swaplight!.purchases!.setNextOutcome('failed'));
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'failed');
  await expect(page.getByTestId('paywall-buy')).toContainText('Try again');

  await page.evaluate(() => window.__swaplight!.purchases!.setNextOutcome('pending'));
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'pending');
  await expect(page.getByTestId('paywall-note')).toContainText('pending');
  expect((await saveData(page)).fullVersion).toBe(false);

  // Restore with nothing to restore, then with a purchase made on another device.
  await page.getByTestId('paywall-restore').click();
  await expect(page.getByTestId('paywall-note')).toContainText('No previous purchases');
  await page.evaluate(() => window.__swaplight!.purchases!.ownedElsewhere());
  await page.getByTestId('paywall-restore').click();
  await expect(page.getByTestId('paywall-success')).toBeVisible();
  await expect(page.getByTestId('paywall-success')).toContainText('restored');
  expect((await saveData(page)).fullVersion).toBe(true);
  await page.getByTestId('paywall-done').click();
  await expect(page.getByTestId('paywall-banner')).toHaveCount(0);

  // Opening the sheet again (from settings it is gone; from a run summary link etc.) shows "owned".
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-unlock')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('settings entry, Hungarian paywall', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await page.getByTestId('settings-unlock').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('paywall')).toContainText('Nincs reklám. Nincs energia. Soha.');
  await expect(page.getByTestId('paywall-buy')).toContainText('$4.99');
  await shot(page, 'paywall-hu');
  // Closing returns to settings.
  await page.getByTestId('paywall-close').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByTestId('settings')).toBeVisible();
  expect(errors).toEqual([]);
});
