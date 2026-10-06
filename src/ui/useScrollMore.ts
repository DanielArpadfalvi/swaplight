import { useEffect, useState } from 'preact/hooks';

/**
 * Callback ref for a scroll container + whether more content waits below the fold (drives the
 * bottom fade and the "more" chevron). Re-checked on scroll, resize and content changes.
 */
export function useScrollMore<T extends HTMLElement>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!el) return;
    const check = (): void => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    ro?.observe(el);
    for (const child of Array.from(el.children)) ro?.observe(child);
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(check);
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', check);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [el]);
  return [setEl, more];
}
