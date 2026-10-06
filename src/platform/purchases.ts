import { ListenerSet } from './listeners';
import type { Storage, Unsubscribe } from './types';

/** Store product id of the one-time "Full Version" unlock (configure the same id in both stores). */
export const FULL_VERSION_PRODUCT_ID = 'swaplight_full_version';

export interface Product {
  id: string;
  title: string;
  description: string;
  /** Localised price as provided by the store, e.g. "$4.99" or "1 990 Ft". */
  priceString: string;
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending' | 'failed';

export interface PurchaseResult {
  outcome: PurchaseOutcome;
  /** Entitlement state after the attempt. */
  fullVersion: boolean;
  error?: string;
}

/**
 * In-app purchase abstraction (M8 adds the RevenueCat implementation).
 * Call `init()` once at startup before relying on `isFullVersion()`.
 */
export interface Purchases {
  init(): Promise<void>;
  getProducts(): Promise<Product[]>;
  purchaseFullVersion(): Promise<PurchaseResult>;
  /** Restores previous purchases; resolves to the resulting entitlement state. */
  restore(): Promise<boolean>;
  /** Cached entitlement state (false until `init()` resolves). */
  isFullVersion(): boolean;
  /** Fires whenever the entitlement state changes. */
  onEntitlementChange(listener: (fullVersion: boolean) => void): Unsubscribe;
}

export const MOCK_PURCHASES_STORAGE_KEY = 'purchases.mock.fullVersion';

/**
 * Dev/web mock. The "owned" flag is persisted in {@link Storage}, so a
 * purchase survives reloads and `restore()` brings it back after a reset of
 * the in-memory state. Use `setFullVersion()` as a dev toggle and
 * `setNextOutcome()` to simulate cancel/pending/failure flows.
 */
export class MockPurchases implements Purchases {
  private full = false;
  private nextOutcome: PurchaseOutcome = 'purchased';
  private readonly listeners = new ListenerSet<[boolean]>();

  constructor(
    private readonly storage: Storage,
    private readonly product: Product = {
      id: FULL_VERSION_PRODUCT_ID,
      title: 'Swaplight – Full Version',
      description: 'Unlock all decks, modes and puzzle packs.',
      priceString: '$4.99',
    },
  ) {}

  async init(): Promise<void> {
    this.update((await this.storage.get<boolean>(MOCK_PURCHASES_STORAGE_KEY)) === true);
  }

  async getProducts(): Promise<Product[]> {
    return [{ ...this.product }];
  }

  async purchaseFullVersion(): Promise<PurchaseResult> {
    const outcome = this.nextOutcome;
    this.nextOutcome = 'purchased';
    if (outcome === 'purchased') {
      await this.storage.set(MOCK_PURCHASES_STORAGE_KEY, true);
      this.update(true);
      return { outcome, fullVersion: true };
    }
    return {
      outcome,
      fullVersion: this.full,
      ...(outcome === 'failed' ? { error: 'Simulated purchase failure' } : {}),
    };
  }

  async restore(): Promise<boolean> {
    await this.init();
    return this.full;
  }

  isFullVersion(): boolean {
    return this.full;
  }

  onEntitlementChange(listener: (fullVersion: boolean) => void): Unsubscribe {
    return this.listeners.add(listener);
  }

  /** Dev toggle: grant or revoke the full version (persisted). */
  async setFullVersion(value: boolean): Promise<void> {
    if (value) await this.storage.set(MOCK_PURCHASES_STORAGE_KEY, true);
    else await this.storage.remove(MOCK_PURCHASES_STORAGE_KEY);
    this.update(value);
  }

  /** Outcome of the next `purchaseFullVersion()` call (then resets to `purchased`). */
  setNextOutcome(outcome: PurchaseOutcome): void {
    this.nextOutcome = outcome;
  }

  private update(value: boolean): void {
    if (value === this.full) return;
    this.full = value;
    this.listeners.emit(value);
  }
}
