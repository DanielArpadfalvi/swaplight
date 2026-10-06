import { useMemo } from 'preact/hooks';
import { getLanguage, t } from '../i18n';

/** Locale-aware integer formatter for the current UI language. */
export function useFormat(): (n: number) => string {
  const lang = getLanguage();
  return useMemo(() => {
    const fmt = new Intl.NumberFormat(lang);
    return (n: number) => fmt.format(n);
  }, [lang]);
}

/** "2 h 14 min" / "3 min 05 s" style play-time total. */
export function formatPlayTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return t('stats.durationHours', { h: String(h), m: String(m) });
  const sec = s % 60;
  return t('stats.durationMinutes', { m: String(m), s: (sec < 10 ? '0' : '') + sec });
}

/**
 * Like {@link useFormat}, but values of a million and more are shortened ("1.2M" / "1,2 M"), for
 * tight HUD stats.
 */
export function useCompactFormat(): (n: number) => string {
  const lang = getLanguage();
  return useMemo(() => formatCompact(lang), [lang]);
}

export function formatCompact(lang: string): (n: number) => string {
  const full = new Intl.NumberFormat(lang);
  const compact = new Intl.NumberFormat(lang, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return (n: number) => (Math.abs(n) >= 1_000_000 ? compact.format(n) : full.format(n));
}
