import { randInt } from '../rng';
import type { Block, BlockKind, SimState } from '../types';
import { STAGE_CHARM_CLEARED } from './keys';

/**
 * Deterministic board edits for charms and relics. Only "free" blocks are touched:
 * not part of a match group and not mid-swap (so group/swap bookkeeping stays valid).
 * Every edit sets `matchScanPending`, so the next step re-scans the board.
 */

export function isFree(block: Block | null | undefined): block is Block {
  return !!block && block.group === 0 && block.state !== 'swapping';
}

/** Free *resting* block (idle/landing): safe to recolor or convert. */
export function isRestingFree(block: Block | null | undefined): block is Block {
  return isFree(block) && (block.state === 'idle' || block.state === 'landing');
}

export function countBlocks(sim: Readonly<SimState>): number {
  let n = 0;
  for (const b of sim.cells) if (b) n++;
  return n;
}

/** Height of every column (0 = empty). */
export function columnHeights(sim: Readonly<SimState>): number[] {
  const { rows, cols } = sim.config;
  const heights: number[] = [];
  for (let c = 0; c < cols; c++) {
    let h = 0;
    for (let r = 0; r < rows; r++) {
      if (sim.cells[r * cols + c]) {
        h = rows - r;
        break;
      }
    }
    heights.push(h);
  }
  return heights;
}

/** Leftmost tallest column. */
export function tallestColumn(sim: Readonly<SimState>): number {
  const h = columnHeights(sim);
  let best = 0;
  for (let c = 1; c < h.length; c++) if ((h[c] as number) > (h[best] as number)) best = c;
  return best;
}

/** Topmost occupied row (rows if the board is empty). */
export function topRow(sim: Readonly<SimState>): number {
  const { rows, cols } = sim.config;
  for (let i = 0; i < sim.cells.length; i++) if (sim.cells[i]) return Math.floor(i / cols);
  return rows;
}

/** Remove free blocks at the given cell indices. Returns how many were removed. */
export function removeBlocks(sim: SimState, indices: readonly number[]): number {
  let removed = 0;
  for (const i of indices) {
    if (isFree(sim.cells[i])) {
      sim.cells[i] = null;
      removed++;
    }
  }
  if (removed > 0) {
    sim.modifiers[STAGE_CHARM_CLEARED] = (sim.modifiers[STAGE_CHARM_CLEARED] ?? 0) + removed;
    sim.matchScanPending = true;
  }
  return removed;
}

/** Indices of resting free blocks matching `filter`, in reading order. */
export function restingIndices(
  sim: Readonly<SimState>,
  filter: (b: Block, row: number, col: number) => boolean = () => true,
): number[] {
  const { cols } = sim.config;
  const out: number[] = [];
  sim.cells.forEach((b, i) => {
    if (isRestingFree(b) && filter(b, Math.floor(i / cols), i % cols)) out.push(i);
  });
  return out;
}

/** Convert up to `count` random resting normal blocks (sim RNG) to `kind`. Returns converted. */
export function convertRandom(sim: SimState, kind: BlockKind, count: number): number {
  let done = 0;
  for (let k = 0; k < count; k++) {
    const pool = restingIndices(sim, (b) => b.kind === 'normal');
    if (pool.length === 0) break;
    const i = pool[randInt(sim.rng, pool.length)] as number;
    (sim.cells[i] as Block).kind = kind;
    done++;
  }
  if (done > 0) sim.matchScanPending = true;
  return done;
}

/** Most frequent color among the given blocks (lowest index on ties), or -1. */
export function dominantColor(blocks: readonly Block[], colors: number): number {
  const counts = new Array<number>(colors).fill(0);
  for (const b of blocks) counts[b.color] = (counts[b.color] ?? 0) + 1;
  let best = -1;
  let bestCount = 0;
  counts.forEach((n, c) => {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  });
  return best;
}
