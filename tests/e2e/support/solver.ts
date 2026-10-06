import { canSwap, cloneSim, step } from '../../../src/core/sim';
import type { SimState } from '../../../src/core/types';

/** Scripted-play helpers that run the pure core in the test runner (Node). */

export interface FoundSwap {
  row: number;
  col: number;
  /** Ticks after the swap until the result (match / chain) shows up. */
  ticks: number;
}

function simulate(sim: SimState, row: number, col: number, horizon: number) {
  const s = cloneSim(sim);
  step(s, [{ type: 'swap', row, col }], undefined, null);
  for (let i = 1; i <= horizon; i++) {
    step(s, [], undefined, null);
    if (s.gameOver) break;
  }
  return s;
}

/** First legal swap that produces a match within `horizon` ticks (and none without it). */
export function findMatchingSwap(sim: SimState, horizon = 20): FoundSwap | null {
  const base = cloneSim(sim);
  for (let i = 0; i < horizon; i++) step(base, [], undefined, null);
  const baseline = base.stats.matches;
  const { rows, cols } = sim.config;
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 0; col < cols - 1; col++) {
      if (canSwap(sim, row, col) !== null) continue;
      const s = simulate(sim, row, col, horizon);
      if (s.stats.matches > baseline) return { row, col, ticks: horizon };
    }
  }
  return null;
}

/** A legal swap after which a chain (×2 or more) happens within `horizon` ticks. */
export function findChainSwap(sim: SimState, horizon = 200): FoundSwap | null {
  const { rows, cols } = sim.config;
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 0; col < cols - 1; col++) {
      if (canSwap(sim, row, col) !== null) continue;
      const s = cloneSim(sim);
      step(s, [{ type: 'swap', row, col }], undefined, null);
      for (let i = 1; i <= horizon && !s.gameOver; i++) {
        step(s, [], undefined, null);
        if (s.stats.maxChain >= 2) return { row, col, ticks: i };
      }
    }
  }
  return null;
}

/** A legal swap of a non-empty pair (for drag tests); prefers the bottom row. */
export function findDraggableSwap(sim: SimState): { row: number; col: number } | null {
  const { rows, cols } = sim.config;
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 0; col < cols - 1; col++) {
      const a = sim.cells[row * cols + col];
      if (a && canSwap(sim, row, col) === null) return { row, col };
    }
  }
  return null;
}
