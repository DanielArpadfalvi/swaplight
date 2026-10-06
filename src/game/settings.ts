/** Player settings (persisted inside the save, see `save.ts`). */

export type LanguageSetting = 'auto' | 'en' | 'hu';

export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['auto', 'en', 'hu'];

export interface Settings {
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
  haptics: boolean;
  /** No screen shake, fewer particles, minimal UI animation. */
  reducedMotion: boolean;
  /** High-contrast (colorblind-friendly) block palette. */
  highContrast: boolean;
  language: LanguageSetting;
  /** Show the "base × mult" chips under the score. */
  showBreakdown: boolean;
  /** Larger UI text (menus, sheets, panels; applied by the UI as a font scale). */
  largeText: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  musicVolume: 0.6,
  sfxVolume: 0.9,
  haptics: true,
  reducedMotion: false,
  highContrast: false,
  language: 'auto',
  showBreakdown: true,
  largeText: false,
};

function volume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function isLanguageSetting(v: unknown): v is LanguageSetting {
  return typeof v === 'string' && (LANGUAGE_SETTINGS as readonly string[]).includes(v);
}

/** Coerce stored settings; every invalid or missing field falls back to its default. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    musicVolume: volume(r.musicVolume, d.musicVolume),
    sfxVolume: volume(r.sfxVolume, d.sfxVolume),
    haptics: bool(r.haptics, d.haptics),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    highContrast: bool(r.highContrast, d.highContrast),
    language: isLanguageSetting(r.language) ? r.language : d.language,
    showBreakdown: bool(r.showBreakdown, d.showBreakdown),
    largeText: bool(r.largeText, d.largeText),
  };
}

/** Everything a settings change can touch; implemented by the app controller (mocked in tests). */
export interface SettingsTargets {
  setVolume(channel: 'music' | 'sfx', volume: number): void;
  setHaptics(enabled: boolean): void;
  setReducedMotion(on: boolean): void;
  setHighContrast(on: boolean): void;
  setLanguage(language: 'en' | 'hu' | null): void;
}

/**
 * Push `next` to the targets. With `prev`, only changed fields are applied (a language or palette
 * switch is not free); without it everything is applied (boot).
 */
export function applySettings(
  next: Settings,
  targets: SettingsTargets,
  prev: Settings | null = null,
): void {
  const changed = <K extends keyof Settings>(k: K): boolean => !prev || prev[k] !== next[k];
  if (changed('musicVolume')) targets.setVolume('music', next.musicVolume);
  if (changed('sfxVolume')) targets.setVolume('sfx', next.sfxVolume);
  if (changed('haptics')) targets.setHaptics(next.haptics);
  if (changed('reducedMotion')) targets.setReducedMotion(next.reducedMotion);
  if (changed('highContrast')) targets.setHighContrast(next.highContrast);
  if (changed('language')) targets.setLanguage(next.language === 'auto' ? null : next.language);
}
