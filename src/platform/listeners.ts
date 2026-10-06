import type { Unsubscribe } from './types';

/** Tiny ordered listener set used by platform services. */
export class ListenerSet<A extends unknown[] = []> {
  private readonly listeners: Array<(...args: A) => void> = [];

  get size(): number {
    return this.listeners.length;
  }

  add(listener: (...args: A) => void): Unsubscribe {
    // Wrap so the same function can be registered twice and removed independently.
    const entry = (...args: A): void => listener(...args);
    this.listeners.push(entry);
    return () => {
      const i = this.listeners.indexOf(entry);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  emit(...args: A): void {
    for (const listener of [...this.listeners]) listener(...args);
  }

  /** Invokes only the most recently added listener. Returns false if there is none. */
  emitLast(...args: A): boolean {
    const last = this.listeners[this.listeners.length - 1];
    if (!last) return false;
    last(...args);
    return true;
  }
}
