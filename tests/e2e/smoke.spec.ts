import { expect, test } from '@playwright/test';

// Software WebGL is slow at mobile DPR; render at 1x.
test.use({ deviceScaleFactor: 1 });

test('app boots with canvas and UI overlay, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?test');

  const canvas = page.locator('#stage canvas');
  await expect(canvas).toHaveCount(1);
  await expect(page.locator('#ui')).toBeAttached();
  await expect(page.locator('#ui .ui-label')).toContainText('Swaplight');
  await expect(page.getByTestId('play')).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeCloseTo(390, 0);
  expect(box?.height ?? 0).toBeCloseTo(844, 0);

  // Freeze the render loop before the screenshot (keeps software WebGL from starving it).
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    window.__swaplight?.stopRendering();
    window.__swaplight?.renderFrames(1);
  });
  await page.screenshot({ path: 'tests/e2e/__screenshots__/smoke.png' });

  expect(errors).toEqual([]);
});
