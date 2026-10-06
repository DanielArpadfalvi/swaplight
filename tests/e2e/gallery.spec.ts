import { expect, test } from '@playwright/test';

type Fx = 'pop' | 'chain' | 'shake' | 'flash' | 'danger' | 'palette';

test('style gallery renders every block variant without console errors', async ({ page }) => {
  // Headless Chromium renders WebGL in software, which is slow at mobile DPR.
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/gallery.html');

  await expect(page.locator('#stage canvas')).toHaveCount(1);
  await page.waitForFunction(
    () => (window as unknown as { __gallery?: { ready: boolean } }).__gallery?.ready === true,
  );
  await expect(page.locator('#gallery-controls button')).toHaveCount(6);

  const trigger = (fx: Fx): Promise<void> =>
    page.evaluate((name) => {
      (window as unknown as { __gallery: { trigger(n: string): void } }).__gallery.trigger(name);
    }, fx);

  // Buttons are wired up…
  await page.locator('#gallery-controls button[data-fx="flash"]').dispatchEvent('click');
  // …and every effect runs without throwing (palette twice = back to neon).
  for (const fx of ['pop', 'chain', 'shake', 'danger', 'danger', 'palette', 'palette'] as const) {
    await trigger(fx);
  }
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/gallery.png' });

  // A mid-effect frame is useful for reviewing particles / popups.
  await trigger('chain');
  await trigger('pop');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/gallery-effects.png' });

  expect(errors).toEqual([]);
});
