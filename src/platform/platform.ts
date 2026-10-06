import { Capacitor } from '@capacitor/core';
import { createHaptics, createNativeHapticsDriver, createWebHapticsDriver } from './haptics';
import { createNativeLifecycle, createWebLifecycle } from './lifecycle';
import { MockPurchases, type Purchases } from './purchases';
import { RevenueCatPurchases, revenueCatApiKey } from './purchasesRevenueCat';
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
  // Real store purchases on iOS/Android when a RevenueCat key was baked into the build;
  // the persisted mock everywhere else (web, dev, CI builds without the secret).
  const rcKey = native
    ? (options.revenueCatApiKey ?? revenueCatApiKey(Capacitor.getPlatform()))
    : undefined;
  const purchases =
    o.purchases ??
    (rcKey ? new RevenueCatPurchases({ apiKey: rcKey, storage }) : new MockPurchases(storage));

  return { native, storage, haptics, lifecycle, systemUi, purchases };
}
