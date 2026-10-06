import { expect, test } from '@playwright/test';

// Software WebGL (CI runners, cloud containers) is very slow at mobile DPR; render at 1x.
test.use({ deviceScaleFactor: 1 });

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

  // Stop the render loop before screenshots so the page is idle (a continuously
  // redrawing software-WebGL canvas can starve page.screenshot on slow runners).
  type PixiWin = { __PIXI_APP__: { ticker: { stop(): void; start(): void }; render(): void } };
  const freeze = (): Promise<void> =>
    page.evaluate(() => {
      const app = (window as unknown as PixiWin).__PIXI_APP__;
      app.ticker.stop();
      app.render();
    });
  const resume = (): Promise<void> =>
    page.evaluate(() => (window as unknown as PixiWin).__PIXI_APP__.ticker.start());

  // Buttons are wired up…
  await page.locator('#gallery-controls button[data-fx="flash"]').dispatchEvent('click');
  // …and every effect runs without throwing (palette twice = back to neon).
  for (const fx of ['pop', 'chain', 'shake', 'danger', 'danger', 'palette', 'palette'] as const) {
    await trigger(fx);
  }
  await page.waitForTimeout(1600);
  await freeze();
  await page.screenshot({ path: 'tests/e2e/__screenshots__/gallery.png' });

  // A mid-effect frame is useful for reviewing particles / popups.
  await resume();
  await trigger('chain');
  await trigger('pop');
  await page.waitForTimeout(250);
  await freeze();
  await page.screenshot({ path: 'tests/e2e/__screenshots__/gallery-effects.png' });

  expect(errors).toEqual([]);
});
