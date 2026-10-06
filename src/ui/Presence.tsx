import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * Keeps its children mounted for `ms` after `when` turns false, so CSS can play an exit transition
 * (`leaving` is true during that time).
 */
export function Presence({
  when,
  ms = 220,
  children,
}: {
  when: boolean;
  ms?: number;
  children: (leaving: boolean) => ComponentChildren;
}) {
  const [mounted, setMounted] = useState(when);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (when) {
      setMounted(true);
    } else if (mounted) {
      if (ms <= 0) setMounted(false);
      else timer.current = window.setTimeout(() => setMounted(false), ms);
    }
    return () => window.clearTimeout(timer.current);
  }, [when, ms]);
  if (!when && !mounted) return null;
  return <>{children(!when)}</>;
}
