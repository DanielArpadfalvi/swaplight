import { Capacitor } from '@capacitor/core';
import { createWebClipboard, type Clipboard } from './clipboard';
import { createHaptics, createNativeHapticsDriver, createWebHapticsDriver } from './haptics';
import { createNativeLifecycle, createWebLifecycle } from './lifecycle';
import type { Purchases } from './purchases';
import { revenueCatApiKey } from './purchasesRevenueCat';
import { selectPurchases } from './purchasesSelect';
import { createNativeStorage, createWebStorage } from './storage';
import { createNativeSystemUI, createWebSystemUI } from './systemUi';
import type { Haptics, Lifecycle, Storage, SystemUI } from './types';

export interface Platform {
  /** True when running inside the Capacitor iOS/Android shell. */
  readonly native: boolean;
  readonly storage: Storage;
  readonly haptics: Haptics;
  readonly lifecycle: Lifecycle;
  readonly systemUi: SystemUI;
  readonly purchases: Purchases;
  readonly clipboard: Clipboard;
}

export interface CreatePlatformOptions {
  /** Force native/web selection (defaults to `Capacitor.isNativePlatform()`). */
  native?: boolean;
  /** RevenueCat public SDK key (defaults to the build-time key of the native platform). */
  revenueCatApiKey?: string;
  /** Replace individual services, e.g. with mocks in tests. */
  overrides?: Partial<Omit<Platform, 'native'>>;
}

/** Builds every platform service, choosing native or web implementations at runtime. */
export function createPlatform(options: CreatePlatformOptions = {}): Platform {
  const native = options.native ?? Capacitor.isNativePlatform();
  const o = options.overrides ?? {};

  const storage = o.storage ?? (native ? createNativeStorage() : createWebStorage());
  const haptics =
    o.haptics ?? createHaptics(native ? createNativeHapticsDriver() : createWebHapticsDriver());
  const lifecycle = o.lifecycle ?? (native ? createNativeLifecycle() : createWebLifecycle());
  const systemUi = o.systemUi ?? (native ? createNativeSystemUI() : createWebSystemUI());
  // Real store purchases on iOS/Android when a RevenueCat key was baked into the build, an
  // "unavailable" store on native without one, and the persisted mock on web / dev / tests.
  const purchases =
    o.purchases ??
    selectPurchases({
      native,
      apiKey: native
        ? (options.revenueCatApiKey ?? revenueCatApiKey(Capacitor.getPlatform()))
        : undefined,
      storage,
    });
  const clipboard = o.clipboard ?? createWebClipboard();

  return { native, storage, haptics, lifecycle, systemUi, purchases, clipboard };
}
