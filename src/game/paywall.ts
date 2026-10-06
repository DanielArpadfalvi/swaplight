import type { Purchases } from '../platform';
import type { GameUiState, PaywallReason, PaywallState } from './state';
import type { Store } from './store';
import { PRIVACY_URL, TERMS_URL } from './links';

/** Terms of Use / Privacy Policy links shown in the Full Version sheet (store requirement). */
export const LEGAL_URLS = {
  terms: TERMS_URL,
  privacy: PRIVACY_URL,
} as const;

/** Sound / haptic hooks of the purchase flow (the app wires these to audio + haptics). */
export interface PaywallFeedback {
  tap(): void;
  /** Purchase or restore succeeded: sparkle + success haptic. */
  celebrate(): void;
  /** Failure / cancel. */
  warn(): void;
}

export interface PaywallHost {
  store: Store<GameUiState>;
  purchases: Purchases;
  /** Resolves when `purchases.init()` has settled. */
  ready: Promise<unknown>;
  /** Write the entitlement to the save (and so to the UI store). */
  setFullVersion(value: boolean): void;
  /** Show the sheet (push the `paywall` overlay). */
  show(): void;
  feedback: PaywallFeedback;
}

export interface Paywall {
  open(reason: PaywallReason): void;
  buy(): Promise<void>;
  restore(): Promise<void>;
  /** Entitlement changed outside the sheet's own calls (store listener, deferred purchase). */
  entitlementChanged(full: boolean): void;
  /** Load the store price in the background (menu banner). */
  prefetch(): void;
}

/**
 * Full Version purchase flow: loads the store price, runs purchase / restore and publishes every
 * state (`buying`, `pending`, `failed`, `cancelled`, `success`) to `GameUiState.paywall`.
 */
export function createPaywall(host: PaywallHost): Paywall {
  const { store, purchases } = host;
  const patch = (p: Partial<PaywallState>): void =>
    store.set({ paywall: { ...store.get().paywall, ...p } });
  const isOpen = (): boolean => store.get().overlays.includes('paywall');

  let loading: Promise<void> | null = null;
  const loadProduct = (): Promise<void> => {
    if (store.get().paywall.product === 'ready') return Promise.resolve();
    loading ??= (async () => {
      patch({ product: 'loading' });
      try {
        await host.ready;
        const [product] = await purchases.getProducts();
        if (product) patch({ product: 'ready', price: product.priceString });
        else patch({ product: 'unavailable' });
      } catch {
        patch({ product: 'unavailable' });
      } finally {
        loading = null;
      }
    })();
    return loading;
  };

  const succeed = (via: 'purchase' | 'restore'): void => {
    host.setFullVersion(true);
    patch({ status: 'success', via, key: store.get().paywall.key + 1 });
    host.feedback.celebrate();
  };

  return {
    open(reason) {
      const busy = store.get().paywall.status === 'buying';
      patch({ reason, status: busy ? 'buying' : 'idle', via: null });
      store.set({ restoreStatus: 'idle' });
      host.show();
      void loadProduct();
    },

    async buy() {
      const s = store.get();
      if (s.paywall.status === 'buying' || s.restoreStatus === 'busy') return;
      host.feedback.tap();
      if (s.fullVersion) {
        succeed('restore');
        return;
      }
      patch({ status: 'buying' });
      await loadProduct();
      if (store.get().paywall.product !== 'ready') {
        patch({ status: 'failed' });
        host.feedback.warn();
        return;
      }
      let outcome: 'purchased' | 'cancelled' | 'pending' | 'failed';
      try {
        const result = await purchases.purchaseFullVersion();
        outcome =
          result.outcome === 'purchased' && !result.fullVersion ? 'pending' : result.outcome;
      } catch {
        outcome = 'failed';
      }
      if (outcome === 'purchased') {
        succeed('purchase');
      } else {
        // An entitlement listener may already have turned a pending purchase into a success.
        if (store.get().paywall.status === 'success') return;
        patch({ status: outcome });
        if (outcome !== 'pending') host.feedback.warn();
      }
    },

    async restore() {
      if (store.get().restoreStatus === 'busy' || store.get().paywall.status === 'buying') return;
      host.feedback.tap();
      store.set({ restoreStatus: 'busy' });
      // The restore result replaces an earlier purchase note in the sheet.
      if (store.get().paywall.status !== 'idle') patch({ status: 'idle' });
      try {
        await host.ready;
        const full = await purchases.restore();
        host.setFullVersion(full);
        store.set({ restoreStatus: full ? 'restored' : 'nothing' });
        if (full && isOpen()) succeed('restore');
      } catch {
        store.set({ restoreStatus: 'failed' });
        if (isOpen()) host.feedback.warn();
      }
    },

    prefetch() {
      void loadProduct();
    },

    entitlementChanged(full) {
      const status = store.get().paywall.status;
      if (full && isOpen() && (status === 'idle' || status === 'pending')) succeed('purchase');
    },
  };
}
