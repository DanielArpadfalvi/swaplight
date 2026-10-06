import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryStorage,
  FULL_VERSION_PRODUCT_ID,
  MOCK_PURCHASES_STORAGE_KEY,
  MockPurchases,
} from '../../../src/platform';

describe('MockPurchases', () => {
  it('starts locked and exposes the full version product', async () => {
    const p = new MockPurchases(createMemoryStorage());
    await p.init();
    expect(p.isFullVersion()).toBe(false);
    const products = await p.getProducts();
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe(FULL_VERSION_PRODUCT_ID);
    expect(products[0]?.priceString).toMatch(/\d/);
  });

  it('purchase unlocks, persists and notifies', async () => {
    const storage = createMemoryStorage();
    const p = new MockPurchases(storage);
    await p.init();
    const listener = vi.fn();
    p.onEntitlementChange(listener);

    const result = await p.purchaseFullVersion();
    expect(result).toEqual({ outcome: 'purchased', fullVersion: true });
    expect(p.isFullVersion()).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    expect(await storage.get(MOCK_PURCHASES_STORAGE_KEY)).toBe(true);

    const reloaded = new MockPurchases(storage);
    await reloaded.init();
    expect(reloaded.isFullVersion()).toBe(true);
  });

  it('simulates cancelled and failed purchases once', async () => {
    const p = new MockPurchases(createMemoryStorage());
    await p.init();
    p.setNextOutcome('cancelled');
    expect(await p.purchaseFullVersion()).toEqual({ outcome: 'cancelled', fullVersion: false });
    p.setNextOutcome('failed');
    const failed = await p.purchaseFullVersion();
    expect(failed.outcome).toBe('failed');
    expect(failed.error).toBeTruthy();
    expect(p.isFullVersion()).toBe(false);
    expect((await p.purchaseFullVersion()).outcome).toBe('purchased');
  });

  it('restore reflects the persisted purchase', async () => {
    const storage = createMemoryStorage();
    const p = new MockPurchases(storage);
    await p.init();
    expect(await p.restore()).toBe(false);
    await storage.set(MOCK_PURCHASES_STORAGE_KEY, true);
    const listener = vi.fn();
    p.onEntitlementChange(listener);
    expect(await p.restore()).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('dev toggle grants and revokes; listeners can unsubscribe', async () => {
    const storage = createMemoryStorage();
    const p = new MockPurchases(storage);
    await p.init();
    const listener = vi.fn();
    const unsub = p.onEntitlementChange(listener);
    await p.setFullVersion(true);
    await p.setFullVersion(true); // no duplicate event
    await p.setFullVersion(false);
    expect(listener.mock.calls).toEqual([[true], [false]]);
    expect(await storage.get(MOCK_PURCHASES_STORAGE_KEY)).toBeUndefined();
    unsub();
    await p.setFullVersion(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
