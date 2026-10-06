import { describe, expect, it, vi } from 'vitest';
import {
  createI18n,
  detectLanguage,
  en,
  hu,
  LANGUAGE_STORAGE_KEY,
  t,
  type Dictionary,
  type TranslationKey,
} from '../../../src/i18n';
import { createMemoryStorage } from '../../../src/platform';

function leafKeys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  const obj = node as Record<string, unknown>;
  if ('other' in obj) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

describe('dictionaries', () => {
  it('hu has exactly the same keys as en', () => {
    expect(leafKeys(hu).sort()).toEqual(leafKeys(en).sort());
  });

  it('has no empty strings and keeps placeholders consistent', () => {
    const i18nEn = createI18n({ deviceLanguages: ['en'] });
    const i18nHu = createI18n({ deviceLanguages: ['hu'] });
    const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of leafKeys(en) as TranslationKey[]) {
      const a = i18nEn.t(key);
      const b = i18nHu.t(key);
      expect(a, key).not.toBe('');
      expect(b, key).not.toBe('');
      expect(placeholders(b), key).toEqual(placeholders(a));
    }
  });

  it('Hungarian copy: "kombó" spelling, no orphaned ordinals, real privacy text', () => {
    const i18nHu = createI18n({ deviceLanguages: ['hu'] });
    for (const key of leafKeys(hu) as TranslationKey[]) {
      const text = i18nHu.t(key);
      expect(text, key).not.toMatch(/combo/i);
      // "{n}. felvonás": the ordinal is glued to its noun with a no-break space.
      expect(text, key).not.toMatch(/\{\w+\}\. /);
    }
    expect(i18nHu.t('puzzle.undo')).toBe('Visszavonás');
    expect(i18nHu.t('versus.needsFull')).toMatch(/a Teljes verzióban érhetők el\.$/);
    expect(i18nHu.t('run.stageTitle', { act: 1, stage: 1 })).toBe(
      '1.\u00a0felvonás · 1.\u00a0szakasz',
    );
    for (const dict of [en, hu]) {
      expect(dict.about.privacyBody3).not.toMatch(/will be published|lesz elérhető/);
    }
  });

  it('rejects dictionaries with missing or extra keys at compile time', () => {
    // @ts-expect-error – missing keys must not type-check
    const missing: Dictionary = { app: { title: 'x' } };
    const extra: Dictionary = {
      ...hu,
      // @ts-expect-error – unknown keys must not type-check
      bogus: 'x',
    };
    // @ts-expect-error – unknown translation keys must not type-check
    const bad: TranslationKey = 'menu.nope';
    expect([missing, extra, bad]).toHaveLength(3);
  });
});

describe('detectLanguage', () => {
  it('matches base language tags', () => {
    expect(detectLanguage(['hu-HU', 'en-US'])).toBe('hu');
    expect(detectLanguage(['de-DE', 'HU'])).toBe('hu');
    expect(detectLanguage(['en_GB'])).toBe('en');
    expect(detectLanguage(['fr-FR'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });
});

describe('t()', () => {
  it('translates nested keys', () => {
    expect(createI18n({ deviceLanguages: ['en'] }).t('menu.run')).toBe('Run');
    expect(createI18n({ deviceLanguages: ['hu'] }).t('menu.run')).toBe('Futam');
    expect(createI18n({ deviceLanguages: ['hu'] }).t('run.sparks')).toBe('Szikra');
  });

  it('interpolates params and leaves unknown placeholders intact', () => {
    const i = createI18n({ deviceLanguages: ['en'] });
    expect(i.t('paywall.buyFor', { price: '$4.99' })).toBe('Unlock for $4.99');
    expect(i.t('run.stageOf', { current: 2, total: 3 })).toBe('Stage 2/3');
    expect(i.t('run.stageOf', { current: 2 })).toBe('Stage 2/{total}');
    expect(i.t('paywall.buyFor')).toBe('Unlock for {price}');
  });

  it('selects English plural forms', () => {
    const i = createI18n({ deviceLanguages: ['en'] });
    expect(i.t('run.sparksAmount', { count: 1 })).toBe('1 Spark');
    expect(i.t('run.sparksAmount', { count: 0 })).toBe('0 Sparks');
    expect(i.t('run.sparksAmount', { count: 5 })).toBe('5 Sparks');
    expect(i.t('units.seconds')).toBe('{count} seconds');
  });

  it('uses the singular noun after any number in Hungarian', () => {
    const i = createI18n({ deviceLanguages: ['hu'] });
    expect(i.t('run.sparksAmount', { count: 1 })).toBe('1 szikra');
    expect(i.t('run.sparksAmount', { count: 7 })).toBe('7 szikra');
    expect(i.t('units.seconds', { count: 90 })).toBe('90 másodperc');
  });

  it('formats numbers for the active locale', () => {
    expect(createI18n({ deviceLanguages: ['en'] }).t('units.points', { count: 12500 })).toBe(
      '12,500 points',
    );
    expect(createI18n({ deviceLanguages: ['hu'] }).t('units.points', { count: 12500 })).toBe(
      '12\u00a0500 pont',
    );
  });

  it('returns the key for unknown keys at runtime', () => {
    const i = createI18n({ deviceLanguages: ['en'] });
    expect(i.t('nope.missing' as TranslationKey)).toBe('nope.missing');
    expect(i.t('menu' as TranslationKey)).toBe('menu');
  });

  it('module-level t() works without initialisation', () => {
    expect(t('app.title')).toBe('Swaplight');
  });
});

describe('language override', () => {
  it('setLanguage switches, persists and notifies', async () => {
    const storage = createMemoryStorage();
    const i = createI18n({ storage, deviceLanguages: ['en-US'] });
    const listener = vi.fn();
    const unsub = i.onLanguageChange(listener);

    await i.setLanguage('hu');
    expect(i.getLanguage()).toBe('hu');
    expect(i.getLanguageOverride()).toBe('hu');
    expect(i.t('common.back')).toBe('Vissza');
    expect(await storage.get(LANGUAGE_STORAGE_KEY)).toBe('hu');
    expect(listener).toHaveBeenCalledExactlyOnceWith('hu');

    await i.setLanguage('hu'); // unchanged: no event
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    await i.setLanguage(null);
    expect(i.getLanguage()).toBe('en');
    expect(i.getLanguageOverride()).toBeNull();
    expect(await storage.get(LANGUAGE_STORAGE_KEY)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('init loads a persisted override and ignores invalid values', async () => {
    const storage = createMemoryStorage();
    await storage.set(LANGUAGE_STORAGE_KEY, 'hu');
    const i = createI18n({ deviceLanguages: ['en'] });
    const listener = vi.fn();
    i.onLanguageChange(listener);
    await i.init(storage);
    expect(i.getLanguage()).toBe('hu');
    expect(listener).toHaveBeenCalledWith('hu');

    await storage.set(LANGUAGE_STORAGE_KEY, 'xx');
    const j = createI18n({ storage, deviceLanguages: ['en'] });
    await j.init();
    expect(j.getLanguage()).toBe('en');
    expect(j.getLanguageOverride()).toBeNull();
  });
});
