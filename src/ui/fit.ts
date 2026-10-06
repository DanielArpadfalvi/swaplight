import { useLayoutEffect, useState } from 'preact/hooks';

/** Length of the longest word – a title may wrap between words but must not break inside one. */
export function longestWord(text: string): number {
  return text.split(/[\s\u00a0-]+/).reduce((m, w) => Math.max(m, [...w].length), 0);
}

/**
 * Callback ref that shrinks a one-line label's font (from `max` down to `min` px) until it fits
 * its box; re-measured whenever `text` changes.
 */
export function useFitText<T extends HTMLElement>(text: string, max: number, min: number) {
  const [el, setEl] = useState<T | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    el.style.fontSize = `${max}px`;
    const avail = el.clientWidth;
    const need = el.scrollWidth;
    if (avail > 0 && need > avail) {
      el.style.fontSize = `${Math.max(min, Math.floor((max * avail * 10) / need) / 10)}px`;
    }
  }, [el, text, max, min]);
  return setEl;
}

/**
 * Callback ref for a one-word label whose font size comes from CSS: when the word is wider than its
 * box, the font shrinks (down to `minRatio` of the CSS size) instead of breaking inside the word.
 * Re-measured on every render, so CSS changes (larger text setting, language) are picked up.
 */
export function useFitWord<T extends HTMLElement>(minRatio = 0.7) {
  const [el, setEl] = useState<T | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    el.style.fontSize = '';
    const base = parseFloat(getComputedStyle(el).fontSize) || 0;
    const avail = el.clientWidth;
    const need = el.scrollWidth;
    if (base > 0 && avail > 0 && need > avail) {
      const size = Math.max(base * minRatio, Math.floor((base * avail * 10) / need) / 10);
      el.style.fontSize = `${size}px`;
    }
  });
  return setEl;
}
