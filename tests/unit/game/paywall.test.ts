import { describe, expect, it, vi } from 'vitest';
import { createPaywall } from '../../../src/game/paywall';
import { INITIAL_UI_STATE, type GameUiState } from '../../../src/game/state';
import { createStore } from '../../../src/game/store';
import { createMemoryStorage, MockPurchases, type Purchases } from '../../../src/platform';

async function setup(purchases?: Purchases) {
  const p = purchases ?? new MockPurchases(createMemoryStorage());
  await p.init();
  const store = createStore<GameUiState>({ ...INITIAL_UI_STATE });
  const feedback = { tap: vi.fn(), celebrate: vi.fn(), warn: vi.fn() };
  const setFullVersion = vi.fn((v: boolean) => store.set({ fullVersion: v }));
  const paywall = createPaywall({
    store,
    purchases: p,
    ready: Promise.resolve(),
    setFullVersion,
    show: () => store.set({ overlays: [...store.get().overlays, 'paywall'] }),
    feedback,
  });
  p.onEntitlementChange((full) => paywall.entitlementChanged(full));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { p, store, feedback, setFullVersion, paywall, flush };
}

describe('paywall flow', () => {
  it('open shows the sheet with its reason and loads the store price', async () => {
    const { store, paywall, flush } = await setup();
    paywall.open('decks');
    expect(store.get().overlays).toContain('paywall');
    expect(store.get().paywall).toMatchObject({ reason: 'decks', status: 'idle' });
    await flush();
    expect(store.get().paywall).toMatchObject({ product: 'ready', price: '$4.99' });
  });

  it('buy → success unlocks, celebrates and records the entitlement', async () => {
    const { store, paywall, feedback, setFullVersion } = await setup();
    paywall.open('menu');
    await paywall.buy();
    expect(store.get().paywall).toMatchObject({ status: 'success', via: 'purchase', key: 1 });
    expect(store.get().fullVersion).toBe(true);
    expect(setFullVersion).toHaveBeenCalledWith(true);
    expect(feedback.celebrate).toHaveBeenCalledTimes(1);
  });

  it.each(['cancelled', 'pending', 'failed'] as const)('buy → %s', async (outcome) => {
    const { p, store, paywall, feedback } = await setup();
    (p as MockPurchases).setNextOutcome(outcome);
    paywall.open('menu');
    await paywall.buy();
    expect(store.get().paywall.status).toBe(outcome);
    expect(store.get().fullVersion).toBe(false);
    expect(feedback.celebrate).not.toHaveBeenCalled();
    expect(feedback.warn).toHaveBeenCalledTimes(outcome === 'pending' ? 0 : 1);
  });

  it('a pending purchase that clears later turns into success', async () => {
    const { p, store, paywall } = await setup();
    (p as MockPurchases).setNextOutcome('pending');
    paywall.open('menu');
    await paywall.buy();
    expect(store.get().paywall.status).toBe('pending');
    await (p as MockPurchases).setFullVersion(true);
    expect(store.get().paywall.status).toBe('success');
    expect(store.get().fullVersion).toBe(true);
  });

  it('store unavailable → failed without calling purchase', async () => {
    const purchases: Purchases = {
      init: async () => undefined,
      getProducts: async () => {
        throw new Error('offline');
      },
      purchaseFullVersion: vi.fn(),
      restore: async () => false,
      isFullVersion: () => false,
      onEntitlementChange: () => () => undefined,
    };
    const { store, paywall } = await setup(purchases);
    paywall.open('settings');
    await paywall.buy();
    expect(store.get().paywall).toMatchObject({ status: 'failed', product: 'unavailable' });
    expect(purchases.purchaseFullVersion).not.toHaveBeenCalled();
  });

  it('restore inside the sheet: nothing → message; owned elsewhere → success', async () => {
    const { p, store, paywall } = await setup();
    paywall.open('menu');
    await paywall.restore();
    expect(store.get().restoreStatus).toBe('nothing');
    expect(store.get().paywall.status).toBe('idle');

    await (p as MockPurchases).simulateOwnedElsewhere();
    await paywall.restore();
    expect(store.get().restoreStatus).toBe('restored');
    expect(store.get().paywall).toMatchObject({ status: 'success', via: 'restore' });
    expect(store.get().fullVersion).toBe(true);
  });

  it('restore from settings (sheet closed) does not celebrate', async () => {
    const { p, store, paywall, feedback } = await setup();
    await (p as MockPurchases).simulateOwnedElsewhere();
    await paywall.restore();
    expect(store.get().restoreStatus).toBe('restored');
    expect(store.get().paywall.status).toBe('idle');
    expect(feedback.celebrate).not.toHaveBeenCalled();
  });

  it('restore failure is reported', async () => {
    const { p, store, paywall } = await setup();
    vi.spyOn(p, 'restore').mockRejectedValueOnce(new Error('store down'));
    await paywall.restore();
    expect(store.get().restoreStatus).toBe('failed');
  });

  it('ignores a second buy while one is in flight', async () => {
    const { p, paywall } = await setup();
    const spy = vi.spyOn(p, 'purchaseFullVersion');
    paywall.open('menu');
    await Promise.all([paywall.buy(), paywall.buy()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
