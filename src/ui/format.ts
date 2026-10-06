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
