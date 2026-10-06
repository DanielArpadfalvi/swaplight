/// <reference types="vite/client" />
import type {
  CustomerInfo,
  PRODUCT_CATEGORY,
  PurchasesPackage,
  PurchasesPlugin,
  PurchasesStoreProduct,
} from '@revenuecat/purchases-capacitor';
import { ListenerSet } from './listeners';
import {
  FULL_VERSION_PRODUCT_ID,
  type Product,
  type PurchaseResult,
  type Purchases,
} from './purchases';
import type { Storage, Unsubscribe } from './types';

/** RevenueCat entitlement that the one-time "Full Version" product grants. */
export const FULL_VERSION_ENTITLEMENT_ID = 'full_version';

/** Storage key of the last known entitlement state (offline unlock at the next launch). */
export const RC_ENTITLEMENT_CACHE_KEY = 'purchases.rc.fullVersion';

/**
 * The part of `@revenuecat/purchases-capacitor` this adapter uses. Unit tests inject a fake; on
 * native the SDK is loaded with a dynamic import (it never reaches the web bundle's startup path).
 */
export type RevenueCatPlugin = Pick<
  PurchasesPlugin,
  | 'configure'
  | 'getOfferings'
  | 'getProducts'
  | 'purchasePackage'
  | 'purchaseStoreProduct'
  | 'restorePurchases'
  | 'getCustomerInfo'
  | 'addCustomerInfoUpdateListener'
>;

export interface RevenueCatOptions {
  /** Public SDK key of the current platform (`appl_…` / `goog_…`). */
  apiKey: string;
  storage: Storage;
  /** Loads the plugin (defaults to a dynamic import of `@revenuecat/purchases-capacitor`). */
  loadPlugin?: () => Promise<RevenueCatPlugin>;
  entitlementId?: string;
  productId?: string;
}

/** `PRODUCT_CATEGORY.NON_SUBSCRIPTION` (a string enum; inlined to keep the SDK out of this chunk). */
const PRODUCT_CATEGORY_NON_SUBSCRIPTION = 'NON_SUBSCRIPTION' as PRODUCT_CATEGORY;

/** RevenueCat error codes we branch on (`PURCHASES_ERROR_CODE`). */
const RC_ERROR = {
  cancelled: '1',
  alreadyPurchased: '6',
  pending: '20',
} as const;

interface RcErrorLike {
  code?: unknown;
  message?: unknown;
  userCancelled?: unknown;
  data?: { userCancelled?: unknown; code?: unknown; readableErrorCode?: unknown } | null;
}

/** Classifies a rejected purchase call (Capacitor puts RevenueCat's info into `data`). */
export function classifyPurchaseError(err: unknown): 'cancelled' | 'pending' | 'owned' | 'failed' {
  const e = (err ?? {}) as RcErrorLike;
  const code = String(e.code ?? e.data?.code ?? '');
  if (e.userCancelled === true || e.data?.userCancelled === true || code === RC_ERROR.cancelled) {
    return 'cancelled';
  }
  if (code === RC_ERROR.pending || e.data?.readableErrorCode === 'PAYMENT_PENDING_ERROR') {
    return 'pending';
  }
  if (code === RC_ERROR.alreadyPurchased) return 'owned';
  return 'failed';
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message);
  return String(err);
}

async function defaultLoadPlugin(): Promise<RevenueCatPlugin> {
  const mod = await import('@revenuecat/purchases-capacitor');
  return mod.Purchases;
}

/**
 * Real store purchases through RevenueCat (StoreKit / Play Billing). Anonymous app user id; the
 * Full Version is the `full_version` entitlement granted by the non-consumable
 * `swaplight_full_version` product.
 *
 * Offline behaviour: the last known entitlement is cached in {@link Storage}. A cached `true` is
 * trusted until RevenueCat answers with customer info that says otherwise, so a paying player keeps
 * the unlock on a plane.
 */
export class RevenueCatPurchases implements Purchases {
  private full = false;
  private plugin: RevenueCatPlugin | null = null;
  private initPromise: Promise<void> | null = null;
  private pkg: PurchasesPackage | null = null;
  private product: PurchasesStoreProduct | null = null;
  private readonly listeners = new ListenerSet<[boolean]>();
  private readonly entitlementId: string;
  private readonly productId: string;

  constructor(private readonly options: RevenueCatOptions) {
    this.entitlementId = options.entitlementId ?? FULL_VERSION_ENTITLEMENT_ID;
    this.productId = options.productId ?? FULL_VERSION_PRODUCT_ID;
  }

  init(): Promise<void> {
    this.initPromise ??= this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const cached = await this.options.storage.get<boolean>(RC_ENTITLEMENT_CACHE_KEY);
    if (cached === true) this.setFull(true, false);
    try {
      const plugin = await (this.options.loadPlugin ?? defaultLoadPlugin)();
      await plugin.configure({ apiKey: this.options.apiKey });
      this.plugin = plugin;
      await plugin.addCustomerInfoUpdateListener((info) => this.apply(info));
      const { customerInfo } = await plugin.getCustomerInfo();
      this.apply(customerInfo);
    } catch {
      // Offline or store unavailable: keep the cached state.
    }
  }

  private async ready(): Promise<RevenueCatPlugin> {
    await this.init();
    if (!this.plugin) throw new Error('RevenueCat is not configured');
    return this.plugin;
  }

  async getProducts(): Promise<Product[]> {
    const plugin = await this.ready();
    if (!this.product) {
      try {
        const offerings = await plugin.getOfferings();
        const current = offerings.current;
        this.pkg =
          current?.availablePackages.find((p) => p.product.identifier === this.productId) ??
          current?.lifetime ??
          null;
        this.product = this.pkg?.product ?? null;
      } catch {
        // Fall through to a direct product lookup.
      }
    }
    if (!this.product) {
      const { products } = await plugin.getProducts({
        productIdentifiers: [this.productId],
        // Android: look among one-time products (ignored on iOS).
        type: PRODUCT_CATEGORY_NON_SUBSCRIPTION,
      });
      this.product = products.find((p) => p.identifier === this.productId) ?? products[0] ?? null;
    }
    if (!this.product) return [];
    const p = this.product;
    return [
      { id: p.identifier, title: p.title, description: p.description, priceString: p.priceString },
    ];
  }

  async purchaseFullVersion(): Promise<PurchaseResult> {
    try {
      const plugin = await this.ready();
      if (!this.product) await this.getProducts();
      let info: CustomerInfo;
      if (this.pkg) {
        ({ customerInfo: info } = await plugin.purchasePackage({ aPackage: this.pkg }));
      } else if (this.product) {
        ({ customerInfo: info } = await plugin.purchaseStoreProduct({
          product: this.product,
        }));
      } else {
        return { outcome: 'failed', fullVersion: this.full, error: 'Product unavailable' };
      }
      this.apply(info);
      // A completed transaction without the entitlement is waiting for the store / backend.
      return { outcome: this.full ? 'purchased' : 'pending', fullVersion: this.full };
    } catch (err) {
      const kind = classifyPurchaseError(err);
      if (kind === 'owned') {
        const full = await this.restore().catch(() => this.full);
        return full
          ? { outcome: 'purchased', fullVersion: true }
          : { outcome: 'failed', fullVersion: false, error: errorMessage(err) };
      }
      if (kind === 'failed') {
        return { outcome: 'failed', fullVersion: this.full, error: errorMessage(err) };
      }
      return { outcome: kind, fullVersion: this.full };
    }
  }

  async restore(): Promise<boolean> {
    const plugin = await this.ready();
    const { customerInfo } = await plugin.restorePurchases();
    this.apply(customerInfo);
    return this.full;
  }

  isFullVersion(): boolean {
    return this.full;
  }

  onEntitlementChange(listener: (fullVersion: boolean) => void): Unsubscribe {
    return this.listeners.add(listener);
  }

  /** Customer info from RevenueCat is authoritative (it carries its own offline cache). */
  private apply(info: CustomerInfo | null | undefined): void {
    if (!info) return;
    this.setFull(this.entitlementId in (info.entitlements?.active ?? {}), true);
  }

  private setFull(value: boolean, persist: boolean): void {
    if (persist) {
      const write = value
        ? this.options.storage.set(RC_ENTITLEMENT_CACHE_KEY, true)
        : this.options.storage.remove(RC_ENTITLEMENT_CACHE_KEY);
      void write.catch(() => undefined);
    }
    if (value === this.full) return;
    this.full = value;
    this.listeners.emit(value);
  }
}

/** Build-time RevenueCat key of a native platform (`VITE_RC_API_KEY_IOS` / `_ANDROID`). */
export function revenueCatApiKey(
  platform: string,
  // Spelled out so Vite inlines exactly these two keys at build time.
  env: Record<string, string | undefined> = {
    VITE_RC_API_KEY_IOS: import.meta.env.VITE_RC_API_KEY_IOS as string | undefined,
    VITE_RC_API_KEY_ANDROID: import.meta.env.VITE_RC_API_KEY_ANDROID as string | undefined,
  },
): string | undefined {
  const key =
    platform === 'ios'
      ? env.VITE_RC_API_KEY_IOS
      : platform === 'android'
        ? env.VITE_RC_API_KEY_ANDROID
        : undefined;
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
}
