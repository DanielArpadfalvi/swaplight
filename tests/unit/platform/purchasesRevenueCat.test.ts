import { describe, expect, it, vi } from 'vitest';
import {
  classifyPurchaseError,
  createMemoryStorage,
  createPlatform,
  MockPurchases,
  RC_ENTITLEMENT_CACHE_KEY,
  revenueCatApiKey,
  RevenueCatPurchases,
  type RevenueCatPlugin,
  type Storage,
  UnavailablePurchases,
} from '../../../src/platform';

type Info = { entitlements: { active: Record<string, unknown> } };
const OWNED: Info = { entitlements: { active: { full_version: {} } } };
const FREE: Info = { entitlements: { active: {} } };

const PRODUCT = {
  identifier: 'swaplight_full_version',
  title: 'Full Version',
  description: 'Everything',
  priceString: '1 990 Ft',
};

/** Fake RevenueCat plugin: scripted responses, records calls, can push customer info. */
function fakePlugin(opts: { info?: Info; offline?: boolean; offerings?: 'package' | 'none' } = {}) {
  let listener: ((info: Info) => void) | null = null;
  const plugin = {
    configure: vi.fn(async () => undefined),
    addCustomerInfoUpdateListener: vi.fn(async (l: (info: Info) => void) => {
      listener = l;
      return 'cb1';
    }),
    getCustomerInfo: vi.fn(async () => {
      if (opts.offline) throw Object.assign(new Error('offline'), { code: '35' });
      return { customerInfo: opts.info ?? FREE };
    }),
    getOfferings: vi.fn(async () => ({
      current:
        opts.offerings === 'none'
          ? null
          : {
              availablePackages: [{ identifier: '$rc_lifetime', product: PRODUCT }],
              lifetime: null,
            },
    })),
    getProducts: vi.fn(async () => ({ products: [PRODUCT] })),
    purchasePackage: vi.fn(async () => ({ customerInfo: OWNED })),
    purchaseStoreProduct: vi.fn(async () => ({ customerInfo: OWNED })),
    restorePurchases: vi.fn(async () => ({ customerInfo: OWNED })),
  };
  return {
    plugin,
    asPlugin: plugin as unknown as RevenueCatPlugin,
    push: (info: Info) => listener?.(info),
  };
}

function make(storage: Storage, fake: ReturnType<typeof fakePlugin>) {
  return new RevenueCatPurchases({
    apiKey: 'goog_test',
    storage,
    loadPlugin: async () => fake.asPlugin,
  });
}

describe('RevenueCatPurchases', () => {
  it('configures anonymously with the API key and reads the entitlement', async () => {
    const fake = fakePlugin({ info: OWNED });
    const p = make(createMemoryStorage(), fake);
    await p.init();
    expect(fake.plugin.configure).toHaveBeenCalledWith({ apiKey: 'goog_test' });
    expect(p.isFullVersion()).toBe(true);
    // init is idempotent
    await p.init();
    expect(fake.plugin.configure).toHaveBeenCalledTimes(1);
  });

  it('exposes the localized store price from the current offering', async () => {
    const fake = fakePlugin();
    const p = make(createMemoryStorage(), fake);
    const [product] = await p.getProducts();
    expect(product).toEqual({
      id: 'swaplight_full_version',
      title: 'Full Version',
      description: 'Everything',
      priceString: '1 990 Ft',
    });
    expect(fake.plugin.getProducts).not.toHaveBeenCalled();
  });

  it('falls back to a direct product lookup without an offering', async () => {
    const fake = fakePlugin({ offerings: 'none' });
    const p = make(createMemoryStorage(), fake);
    const [product] = await p.getProducts();
    expect(product?.priceString).toBe('1 990 Ft');
    expect(fake.plugin.getProducts).toHaveBeenCalledWith({
      productIdentifiers: ['swaplight_full_version'],
      type: 'NON_SUBSCRIPTION',
    });
    const result = await p.purchaseFullVersion();
    expect(result.outcome).toBe('purchased');
    expect(fake.plugin.purchaseStoreProduct).toHaveBeenCalled();
  });

  it('purchase → purchased, persisted and announced', async () => {
    const storage = createMemoryStorage();
    const fake = fakePlugin();
    const p = make(storage, fake);
    await p.init();
    const listener = vi.fn();
    p.onEntitlementChange(listener);
    const result = await p.purchaseFullVersion();
    expect(result).toEqual({ outcome: 'purchased', fullVersion: true });
    expect(fake.plugin.purchasePackage).toHaveBeenCalledWith({
      aPackage: expect.objectContaining({ identifier: '$rc_lifetime' }),
    });
    expect(listener).toHaveBeenCalledWith(true);
    expect(await storage.get(RC_ENTITLEMENT_CACHE_KEY)).toBe(true);
  });

  it.each([
    [{ code: '1', message: 'cancelled', data: { userCancelled: true } }, 'cancelled'],
    [{ code: 1, message: 'cancelled' }, 'cancelled'],
    [{ code: '20', message: 'pending' }, 'pending'],
    [{ code: '2', message: 'store problem' }, 'failed'],
    [new Error('boom'), 'failed'],
  ])('maps purchase error %o → %s', async (error, outcome) => {
    const fake = fakePlugin();
    fake.plugin.purchasePackage.mockRejectedValueOnce(error);
    const p = make(createMemoryStorage(), fake);
    const result = await p.purchaseFullVersion();
    expect(result.outcome).toBe(outcome);
    expect(result.fullVersion).toBe(false);
    if (outcome === 'failed') expect(result.error).toBeTruthy();
  });

  it('already-owned purchase error restores instead', async () => {
    const fake = fakePlugin();
    fake.plugin.purchasePackage.mockRejectedValueOnce({ code: '6', message: 'owned' });
    const p = make(createMemoryStorage(), fake);
    expect(await p.purchaseFullVersion()).toEqual({ outcome: 'purchased', fullVersion: true });
    expect(fake.plugin.restorePurchases).toHaveBeenCalled();
  });

  it('a completed transaction without the entitlement is pending', async () => {
    const fake = fakePlugin();
    fake.plugin.purchasePackage.mockResolvedValueOnce({ customerInfo: FREE });
    const p = make(createMemoryStorage(), fake);
    expect((await p.purchaseFullVersion()).outcome).toBe('pending');
  });

  it('restore reports the entitlement from the store', async () => {
    const fake = fakePlugin();
    const p = make(createMemoryStorage(), fake);
    await p.init();
    expect(p.isFullVersion()).toBe(false);
    expect(await p.restore()).toBe(true);
    fake.plugin.restorePurchases.mockResolvedValueOnce({ customerInfo: FREE });
    expect(await p.restore()).toBe(false);
  });

  it('customer info listener drives entitlement changes (deferred purchase, refund)', async () => {
    const storage = createMemoryStorage();
    const fake = fakePlugin();
    const p = make(storage, fake);
    await p.init();
    const listener = vi.fn();
    p.onEntitlementChange(listener);
    fake.push(OWNED);
    expect(p.isFullVersion()).toBe(true);
    fake.push(FREE);
    expect(p.isFullVersion()).toBe(false);
    expect(listener.mock.calls).toEqual([[true], [false]]);
    await Promise.resolve();
    expect(await storage.get(RC_ENTITLEMENT_CACHE_KEY)).toBeUndefined();
  });

  it('offline: a cached unlock is trusted until RevenueCat says otherwise', async () => {
    const storage = createMemoryStorage();
    await storage.set(RC_ENTITLEMENT_CACHE_KEY, true);
    const offline = make(storage, fakePlugin({ offline: true }));
    await offline.init();
    expect(offline.isFullVersion()).toBe(true);

    // Online again and the store has no entitlement (refund): revoked.
    const online = make(storage, fakePlugin({ info: FREE }));
    await online.init();
    expect(online.isFullVersion()).toBe(false);
    expect(await storage.get(RC_ENTITLEMENT_CACHE_KEY)).toBeUndefined();
  });

  it('plugin load failure keeps the cached state and rejects store calls', async () => {
    const storage = createMemoryStorage();
    await storage.set(RC_ENTITLEMENT_CACHE_KEY, true);
    const p = new RevenueCatPurchases({
      apiKey: 'appl_x',
      storage,
      loadPlugin: async () => {
        throw new Error('no plugin');
      },
    });
    await p.init();
    expect(p.isFullVersion()).toBe(true);
    await expect(p.restore()).rejects.toThrow();
    await expect(p.getProducts()).rejects.toThrow();
    expect((await p.purchaseFullVersion()).outcome).toBe('failed');
  });
});

describe('classifyPurchaseError', () => {
  it('reads RevenueCat info from Capacitor error data', () => {
    expect(classifyPurchaseError({ code: 'X', data: { userCancelled: true } })).toBe('cancelled');
    expect(classifyPurchaseError({ data: { readableErrorCode: 'PAYMENT_PENDING_ERROR' } })).toBe(
      'pending',
    );
    expect(classifyPurchaseError(null)).toBe('failed');
  });
});

describe('revenueCatApiKey / createPlatform selection', () => {
  const env = { VITE_RC_API_KEY_IOS: 'appl_1', VITE_RC_API_KEY_ANDROID: ' goog_2 ' };
  it('picks the key of the platform', () => {
    expect(revenueCatApiKey('ios', env)).toBe('appl_1');
    expect(revenueCatApiKey('android', env)).toBe('goog_2');
    expect(revenueCatApiKey('web', env)).toBeUndefined();
    expect(revenueCatApiKey('ios', { VITE_RC_API_KEY_IOS: '  ' })).toBeUndefined();
  });

  it('uses RevenueCat on native with a key, never the mock on native, the mock on web', () => {
    const storage = createMemoryStorage();
    const overrides = {
      storage,
      lifecycle: { onPause: vi.fn(), onResume: vi.fn(), onBackButton: vi.fn(), exitApp: vi.fn() },
      systemUi: {
        setStatusBarStyle: vi.fn(),
        hideStatusBar: vi.fn(),
        showStatusBar: vi.fn(),
        hideSplash: vi.fn(),
      },
    } as never;
    expect(
      createPlatform({ native: true, revenueCatApiKey: 'goog_x', overrides }).purchases,
    ).toBeInstanceOf(RevenueCatPurchases);
    const keyless = createPlatform({ native: true, overrides }).purchases;
    expect(keyless).toBeInstanceOf(UnavailablePurchases);
    expect(keyless).not.toBeInstanceOf(MockPurchases);
    expect(
      createPlatform({ native: false, revenueCatApiKey: 'goog_x', overrides }).purchases,
    ).toBeInstanceOf(MockPurchases);
  });
});
