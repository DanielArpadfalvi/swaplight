import { expect, test } from '@playwright/test';

test('app boots with canvas and UI overlay, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  const canvas = page.locator('#stage canvas');
  await expect(canvas).toHaveCount(1);
  await expect(page.locator('#ui')).toBeAttached();
  await expect(page.locator('#ui .ui-label')).toContainText('Swaplight');

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeCloseTo(390, 0);
  expect(box?.height ?? 0).toBeCloseTo(844, 0);

  // Give Pixi a couple of frames to render before the screenshot.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  await page.screenshot({ path: 'tests/e2e/__screenshots__/smoke.png' });

  expect(errors).toEqual([]);
});
