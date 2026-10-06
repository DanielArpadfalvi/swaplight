import { describe, expect, it } from 'vitest';
import { createSim, step } from '../../../src/core/sim';
import { hashState } from '../../../src/core/replay';
import { EndlessSession } from '../../../src/game/session';
import { formatClock } from '../../../src/game/state';
import { createStore } from '../../../src/game/store';

describe('EndlessSession', () => {
  it('ticks the sim deterministically like a bare step loop', () => {
    const s = new EndlessSession('abc', () => null);
    const ref = createSim('abc', {}, 'endless');
    for (let i = 0; i < 300; i++) {
      s.tick(i * 16);
      step(ref, []);
    }
    expect(hashState(s.sim)).toBe(hashState(ref));
  });

  it('applies queued swaps on the next tick and counts events', () => {
    const s = new EndlessSession('abc', () => null);
    const { cols, rows } = s.sim.config;
    let col = 0;
    while (!s.sim.cells[(rows - 1) * cols + col]) col++;
    s.queue({ type: 'swap', row: rows - 1, col: Math.min(col, cols - 2) });
    const events = s.tick(0);
    expect(events.some((e) => e.type === 'swapped')).toBe(true);
    expect(s.eventCounts.swapped).toBe(1);
  });

  it('merges keyboard and touch raise into one held state', () => {
    const s = new EndlessSession('abc', () => null);
    s.keyboard.keyDown('Shift');
    s.tick(0);
    expect(s.sim.raiseHeld).toBe(true);
    s.keyboard.keyUp('Shift');
    s.tick(16);
    expect(s.sim.raiseHeld).toBe(false);
    expect(s.keyboardActive).toBe(true);
  });

  it('restart replaces the sim and clears counters', () => {
    const s = new EndlessSession('abc', () => null);
    for (let i = 0; i < 10; i++) s.tick(i);
    s.restart('xyz');
    expect(s.sim.tick).toBe(0);
    expect(s.seed).toBe('xyz');
    expect(s.eventCounts).toEqual({});
    expect(s.keyboardActive).toBe(false);
  });
});

describe('store', () => {
  it('notifies only on change', () => {
    const store = createStore({ a: 1, b: 'x' });
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.a));
    store.set({ a: 1 });
    store.set({ a: 2 });
    store.set({ b: 'x' });
    expect(seen).toEqual([2]);
    expect(store.get()).toEqual({ a: 2, b: 'x' });
  });
});

describe('formatClock', () => {
  it('formats m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
  });
});
