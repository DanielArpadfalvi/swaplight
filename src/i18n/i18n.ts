import type { JsonValue, Storage, Unsubscribe } from '../platform';
import type { Dictionary, TranslationKey } from './dictionary';
import { en } from './en';
import { hu } from './hu';
import type { PluralForms, TranslationParams } from './types';

export const LANGUAGES = ['en', 'hu'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

/** Native names, for the language picker (not translated on purpose). */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', hu: 'Magyar' };

export const DICTIONARIES: Record<Language, Dictionary> = { en, hu };

/** Storage key of the persisted language override. */
export const LANGUAGE_STORAGE_KEY = 'settings.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Picks the first supported language from BCP 47 tags (e.g. `navigator.languages`). */
export function detectLanguage(preferred: readonly string[] | undefined): Language {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

function navigatorLanguages(): string[] {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav) return [];
  if (nav.languages && nav.languages.length > 0) return [...nav.languages];
  return nav.language ? [nav.language] : [];
}

function lookup(dict: Dictionary, key: string): string | PluralForms | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node !== null && 'other' in node) return node as PluralForms;
  return undefined;
}

export interface I18n {
  /** Translate `key`, interpolating `{name}` params; plural leaves select a form by `count`. */
  t(key: TranslationKey, params?: TranslationParams): string;
  getLanguage(): Language;
  /** The persisted override, or `null` when following the device language. */
  getLanguageOverride(): Language | null;
  /** Set (and persist) an override; `null` returns to device detection. */
  setLanguage(language: Language | null): Promise<void>;
  onLanguageChange(listener: (language: Language) => void): Unsubscribe;
  /** Load the persisted override; `storage` (if given) is also used for later `setLanguage` calls. */
  init(storage?: Storage): Promise<void>;
}

export interface CreateI18nOptions {
  storage?: Storage;
  /** Device language tags; defaults to `navigator.languages`. */
  deviceLanguages?: readonly string[];
  dictionaries?: Record<Language, Dictionary>;
}

export function createI18n(options: CreateI18nOptions = {}): I18n {
  const dictionaries = options.dictionaries ?? DICTIONARIES;
  const device = detectLanguage(options.deviceLanguages ?? navigatorLanguages());
  const listeners = new Set<(language: Language) => void>();
  let override: Language | null = null;
  let current: Language = device;
  let storage = options.storage;
  const pluralRules = new Map<Language, Intl.PluralRules>();
  const numberFormats = new Map<Language, Intl.NumberFormat>();

  const plural = (lang: Language, count: number): Intl.LDMLPluralRule => {
    let rules = pluralRules.get(lang);
    if (!rules) pluralRules.set(lang, (rules = new Intl.PluralRules(lang)));
    return rules.select(count);
  };
  const formatNumber = (lang: Language, n: number): string => {
    let fmt = numberFormats.get(lang);
    if (!fmt) numberFormats.set(lang, (fmt = new Intl.NumberFormat(lang)));
    return fmt.format(n);
  };

  const apply = (next: Language | null): void => {
    override = next;
    const lang = next ?? device;
    if (lang === current) return;
    current = lang;
    for (const l of [...listeners]) l(lang);
  };

  return {
    t(key, params) {
      const entry =
        lookup(dictionaries[current], key) ?? lookup(dictionaries[DEFAULT_LANGUAGE], key);
      if (entry === undefined) return key;
      let template: string;
      if (typeof entry === 'string') {
        template = entry;
      } else {
        const count = params?.count;
        const form = typeof count === 'number' ? plural(current, count) : 'other';
        template = (form === 'one' ? entry.one : undefined) ?? entry.other;
      }
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name];
        if (value === undefined) return match;
        return typeof value === 'number' ? formatNumber(current, value) : value;
      });
    },
    getLanguage: () => current,
    getLanguageOverride: () => override,
    async setLanguage(language) {
      apply(language);
      if (!storage) return;
      if (language === null) await storage.remove(LANGUAGE_STORAGE_KEY);
      else await storage.set(LANGUAGE_STORAGE_KEY, language);
    },
    onLanguageChange(listener) {
      const entry = (lang: Language): void => listener(lang);
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    async init(newStorage) {
      if (newStorage) storage = newStorage;
      if (!storage) return;
      const stored: JsonValue | undefined = await storage.get(LANGUAGE_STORAGE_KEY);
      apply(isLanguage(stored) ? stored : null);
    },
  };
}
