import type { Storage, Unsubscribe } from '../platform';
import type { TranslationKey } from './dictionary';
import { createI18n, type I18n, type Language } from './i18n';
import type { TranslationParams } from './types';

export {
  createI18n,
  detectLanguage,
  isLanguage,
  DEFAULT_LANGUAGE,
  DICTIONARIES,
  LANGUAGES,
  LANGUAGE_NAMES,
  LANGUAGE_STORAGE_KEY,
} from './i18n';
export type { CreateI18nOptions, I18n, Language } from './i18n';
export type { Dictionary, TranslationKey } from './dictionary';
export type { PluralForms, TranslationParams } from './types';
export { en } from './en';
export { hu } from './hu';

/** App-wide instance (device language until `initI18n` loads the persisted override). */
export const i18n: I18n = createI18n();

/** Load the persisted language override; call once at boot with the platform storage. */
export function initI18n(storage: Storage): Promise<void> {
  return i18n.init(storage);
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  return i18n.t(key, params);
}

export function getLanguage(): Language {
  return i18n.getLanguage();
}

export function setLanguage(language: Language | null): Promise<void> {
  return i18n.setLanguage(language);
}

export function onLanguageChange(listener: (language: Language) => void): Unsubscribe {
  return i18n.onLanguageChange(listener);
}
