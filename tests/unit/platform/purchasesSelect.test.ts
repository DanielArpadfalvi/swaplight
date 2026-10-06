import { describe, expect, it } from 'vitest';
import {
  createMemoryStorage,
  MockPurchases,
  RC_ENTITLEMENT_CACHE_KEY,
  RevenueCatPurchases,
  selectPurchases,
  STORE_UNAVAILABLE_ERROR,
  UnavailablePurchases,
} from '../../../src/platform';
import { createPaywall } from '../../../src/game/paywall';
import { INITIAL_UI_STATE, type GameUiState } from '../../../src/game/state';
import { createStore } from '../../../src/game/store';

describe('selectPurchases', () => {
  it('uses the persisted mock on web (with or without a key)', () => {
    const storage = createMemoryStorage();
    expect(selectPurchases({ native: false, storage })).toBeInstanceOf(MockPurchases);
    expect(selectPurchases({ native: false, apiKey: 'appl_x', storage })).toBeInstanceOf(
      MockPurchases,
    );
  });

  it('uses RevenueCat on native with a key', () => {
    const p = selectPurchases({ native: true, apiKey: 'goog_abc', storage: createMemoryStorage() });
    expect(p).toBeInstanceOf(RevenueCatPurchases);
  });

  it('never falls back to the mock on native without a key', () => {
    for (const apiKey of [undefined, '', '   ']) {
      const p = selectPurchases({ native: true, apiKey, storage: createMemoryStorage() });
      expect(p).toBeInstanceOf(UnavailablePurchases);
      expect(p).not.toBeInstanceOf(MockPurchases);
    }
  });
});

describe('UnavailablePurchases', () => {
  it('does not unlock: no products, purchase fails, restore finds nothing', async () => {
    const storage = createMemoryStorage();
    // A leftover mock flag must not count on native.
    await storage.set('purchases.mock.fullVersion', true);
    const p = new UnavailablePurchases(storage);
    await p.init();
    expect(p.isFullVersion()).toBe(false);
    expect(await p.getProducts()).toEqual([]);
    expect(await p.purchaseFullVersion()).toEqual({
      outcome: 'failed',
      fullVersion: false,
      error: STORE_UNAVAILABLE_ERROR,
    });
    expect(await p.restore()).toBe(false);
    expect(p.isFullVersion()).toBe(false);
  });

  it('keeps an entitlement cached by an earlier real store connection', async () => {
    const storage = createMemoryStorage();
    await storage.set(RC_ENTITLEMENT_CACHE_KEY, true);
    const p = new UnavailablePurchases(storage);
    const seen: boolean[] = [];
    p.onEntitlementChange((v) => seen.push(v));
    await p.init();
    expect(p.isFullVersion()).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('makes the paywall show the store-unavailable state and fail the purchase', async () => {
    const purchases = new UnavailablePurchases(createMemoryStorage());
    const store = createStore<GameUiState>({ ...INITIAL_UI_STATE });
    let full = false;
    const paywall = createPaywall({
      store,
      purchases,
      ready: purchases.init(),
      setFullVersion: (v) => {
        full = v;
      },
      show: () => store.set({ overlays: [...store.get().overlays, 'paywall'] }),
      feedback: { tap() {}, celebrate() {}, warn() {} },
    });
    paywall.open('puzzles');
    await paywall.buy();
    expect(store.get().paywall.product).toBe('unavailable');
    expect(store.get().paywall.status).toBe('failed');
    expect(full).toBe(false);
  });
});
