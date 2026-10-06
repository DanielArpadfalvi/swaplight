import { ListenerSet } from './listeners';
import { MockPurchases, type Product, type PurchaseResult, type Purchases } from './purchases';
import { RC_ENTITLEMENT_CACHE_KEY, RevenueCatPurchases } from './purchasesRevenueCat';
import type { Storage, Unsubscribe } from './types';

/** Error of every purchase attempt when no store is configured. */
export const STORE_UNAVAILABLE_ERROR = 'store-unavailable';

/**
 * Native build without a RevenueCat key (misconfigured CI / local build): no store to talk to.
 * Never unlocks anything by itself — the entitlement comes only from the cache a real store
 * connection left behind; products are unknown (the paywall shows "store unavailable") and every
 * purchase fails.
 */
export class UnavailablePurchases implements Purchases {
  private full = false;
  private readonly listeners = new ListenerSet<[boolean]>();

  constructor(private readonly storage: Storage) {}

  async init(): Promise<void> {
    const cached = await this.storage
      .get<boolean>(RC_ENTITLEMENT_CACHE_KEY)
      .then((v) => v === true)
      .catch(() => false);
    if (cached !== this.full) {
      this.full = cached;
      this.listeners.emit(cached);
    }
  }

  async getProducts(): Promise<Product[]> {
    return [];
  }

  async purchaseFullVersion(): Promise<PurchaseResult> {
    return { outcome: 'failed', fullVersion: this.full, error: STORE_UNAVAILABLE_ERROR };
  }

  async restore(): Promise<boolean> {
    return false;
  }

  isFullVersion(): boolean {
    return this.full;
  }

  onEntitlementChange(listener: (fullVersion: boolean) => void): Unsubscribe {
    return this.listeners.add(listener);
  }
}

export interface SelectPurchasesOptions {
  native: boolean;
  /** RevenueCat public SDK key of the current native platform (ignored on web). */
  apiKey?: string;
  storage: Storage;
}

/**
 * Picks the purchases implementation: RevenueCat on native with a key; the "unavailable" store on
 * native without one (never the mock — it would unlock for free); the persisted mock on web / dev /
 * tests.
 */
export function selectPurchases({ native, apiKey, storage }: SelectPurchasesOptions): Purchases {
  if (!native) return new MockPurchases(storage);
  const key = apiKey?.trim();
  if (key) return new RevenueCatPurchases({ apiKey: key, storage });
  return new UnavailablePurchases(storage);
}
