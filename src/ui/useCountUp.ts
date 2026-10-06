import { useEffect, useRef, useState } from 'preact/hooks';

/** Animated count-up toward `target` (ease-out, ~0.45 s per change). */
export function useCountUp(target: number, durationMs = 450): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const shownRef = useRef(target);
  useEffect(() => {
    if (target < shownRef.current) {
      // Reset (new game): jump down immediately.
      shownRef.current = target;
      setShown(target);
      return;
    }
    from.current = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / durationMs);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from.current + (target - from.current) * e);
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return shown;
}
