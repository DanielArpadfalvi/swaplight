export * from './types';
export { createMemoryStorage, createWebStorage, createNativeStorage } from './storage';
export type { WebStorageBackend } from './storage';
export {
  createHaptics,
  createWebHapticsDriver,
  createNativeHapticsDriver,
  WEB_VIBRATION_PATTERNS,
} from './haptics';
export type { HapticsDriver } from './haptics';
export { createWebLifecycle, createNativeLifecycle } from './lifecycle';
export { createWebSystemUI, createNativeSystemUI } from './systemUi';
export { FULL_VERSION_PRODUCT_ID, MOCK_PURCHASES_STORAGE_KEY, MockPurchases } from './purchases';
export type { Product, PurchaseOutcome, PurchaseResult, Purchases } from './purchases';
export {
  FULL_VERSION_ENTITLEMENT_ID,
  RC_ENTITLEMENT_CACHE_KEY,
  RevenueCatPurchases,
  classifyPurchaseError,
  revenueCatApiKey,
} from './purchasesRevenueCat';
export type { RevenueCatOptions, RevenueCatPlugin } from './purchasesRevenueCat';
export { createPlatform } from './platform';
export type { CreatePlatformOptions, Platform } from './platform';
