// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createPlatform, MockPurchases } from '../../../src/platform';

describe('createPlatform', () => {
  it('detects the web platform by default', () => {
    const p = createPlatform();
    expect(p.native).toBe(false);
    expect(p.purchases).toBeInstanceOf(MockPurchases);
    expect(p.haptics.isEnabled()).toBe(true);
  });

  it('web system UI calls resolve as no-ops', async () => {
    const { systemUi } = createPlatform({ native: false });
    await expect(systemUi.setStatusBarStyle('dark')).resolves.toBeUndefined();
    await expect(systemUi.hideStatusBar()).resolves.toBeUndefined();
    await expect(systemUi.showStatusBar()).resolves.toBeUndefined();
    await expect(systemUi.hideSplash()).resolves.toBeUndefined();
  });

  it('accepts injected services and wires purchases to the injected storage', async () => {
    const storage = createMemoryStorage();
    const p = createPlatform({ native: false, overrides: { storage } });
    expect(p.storage).toBe(storage);
    await (p.purchases as MockPurchases).setFullVersion(true);
    const again = createPlatform({ native: false, overrides: { storage } });
    await again.purchases.init();
    expect(again.purchases.isFullVersion()).toBe(true);
  });
});
