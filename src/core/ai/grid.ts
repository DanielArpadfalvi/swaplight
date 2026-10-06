import type { SimState } from '../types';
import { comboGarbage } from '../versus';

/**
 * Static color-grid model used by the CPU to pre-filter candidate moves cheaply
 * (instant gravity, no timing). Values: color ≥ 0, or one of the codes below.
 * Fixed cells (garbage, clearing, locked) never move and act as floors.
 */
export const EMPTY = -1;
export const GARBAGE = -2;
/** Part of a clearing match group (becomes EMPTY in the projection). */
export const CLEARING = -3;

export interface Grid {
  rows: number;
  cols: number;
  /** Cell values (see codes). */
  v: Int8Array;
  /** 1 = the block moved down because something under it cleared (chain flag). */
  fell: Uint8Array;
  /** 1 = cell can take part in a swap right now (empty or resting normal block). */
  movable: Uint8Array;
}

export function createGrid(rows: number, cols: number): Grid {
  const n = rows * cols;
  return { rows, cols, v: new Int8Array(n), fell: new Uint8Array(n), movable: new Uint8Array(n) };
}

export function copyGrid(src: Grid, dst: Grid): Grid {
  dst.v.set(src.v);
  dst.fell.set(src.fell);
  dst.movable.set(src.movable);
  return dst;
}

/**
 * Snapshot a sim into a grid. Blocks of a clearing group become CLEARING; hovering /
 * falling blocks keep their color (not movable) and their chain flag as `fell`.
 */
export function gridFromSim(sim: SimState, g: Grid): Grid {
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const b = cells[i];
    g.fell[i] = 0;
    if (!b) {
      g.v[i] = EMPTY;
      g.movable[i] = 1;
      continue;
    }
    g.movable[i] = 0;
    if (b.slab !== 0) {
      g.v[i] = GARBAGE;
    } else if (b.group !== 0) {
      g.v[i] = CLEARING;
    } else {
      g.v[i] = b.color;
      if (b.state === 'idle' || b.state === 'landing') g.movable[i] = 1;
      if (b.chain) g.fell[i] = 1;
    }
  }
  return g;
}

/** True if the grid holds a clearing group (a projection is needed). */
export function hasClearing(g: Grid): boolean {
  for (let i = 0; i < g.v.length; i++) if (g.v[i] === CLEARING) return true;
  return false;
}

/** Instant gravity; blocks that move get `fell = 1` when `flag` is set. Fixed cells stay. */
export function drop(g: Grid, flag: boolean): boolean {
  const { rows, cols, v, fell } = g;
  let moved = false;
  for (let c = 0; c < cols; c++) {
    let w = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const i = r * cols + c;
      const x = v[i] as number;
      if (x === EMPTY) continue;
      if (x < EMPTY) {
        w = r - 1;
        continue;
      }
      if (w !== r) {
        const j = w * cols + c;
        v[j] = x;
        v[i] = EMPTY;
        fell[j] = flag ? 1 : (fell[i] as number);
        fell[i] = 0;
        g.movable[j] = 1;
        g.movable[i] = 1;
        moved = true;
      }
      w--;
    }
  }
  return moved;
}

let marks = new Uint8Array(128);

/** Mark runs of ≥3 equal colors; returns the number of marked cells. */
export function markMatches(g: Grid): number {
  const { rows, cols, v } = g;
  const n = rows * cols;
  if (marks.length < n) marks = new Uint8Array(n);
  else marks.fill(0, 0, n);
  let count = 0;
  for (let r = 0; r < rows; r++) {
    let start = 0;
    for (let c = 1; c <= cols; c++) {
      const prev = v[r * cols + c - 1] as number;
      const cur = c < cols ? (v[r * cols + c] as number) : -9;
      if (cur === prev && cur >= 0) continue;
      if (prev >= 0 && c - start >= 3) {
        for (let m = start; m < c; m++) {
          const i = r * cols + m;
          if (!marks[i]) count++;
          marks[i] = 1;
        }
      }
      start = c;
    }
  }
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      const prev = v[(r - 1) * cols + c] as number;
      const cur = r < rows ? (v[r * cols + c] as number) : -9;
      if (cur === prev && cur >= 0) continue;
      if (prev >= 0 && r - start >= 3) {
        for (let m = start; m < r; m++) {
          const i = m * cols + c;
          if (!marks[i]) count++;
          marks[i] = 1;
        }
      }
      start = r;
    }
  }
  return count;
}

export interface Resolution {
  /** Highest chain level reached (starting from `chainStart`). */
  chain: number;
  /** Blocks cleared. */
  cleared: number;
  /** Garbage cells sent by combos. */
  comboCells: number;
  /** Garbage cells orthogonally adjacent to cleared blocks (they would convert). */
  garbageTouched: number;
  /** Number of match rounds. */
  rounds: number;
}

/**
 * Resolve matches + gravity until stable. A round whose match contains a `fell`
 * block is a chain link (Panel de Pon rule). Mutates the grid.
 */
export function resolve(g: Grid, chainStart: number, out: Resolution): Resolution {
  const { rows, cols, v, fell } = g;
  const n = rows * cols;
  out.chain = chainStart;
  out.cleared = 0;
  out.comboCells = 0;
  out.garbageTouched = 0;
  out.rounds = 0;
  for (let guard = 0; guard < 32; guard++) {
    const count = markMatches(g);
    if (count === 0) break;
    out.rounds++;
    let isChain = false;
    for (let i = 0; i < n; i++) if (marks[i] && fell[i]) isChain = true;
    if (isChain) out.chain++;
    for (const s of comboGarbage(count, cols)) out.comboCells += s.width * s.height;
    out.cleared += count;
    for (let i = 0; i < n; i++) {
      if (!marks[i]) continue;
      const r = Math.floor(i / cols);
      const c = i % cols;
      if (r > 0 && v[i - cols] === GARBAGE) out.garbageTouched++;
      if (r < rows - 1 && v[i + cols] === GARBAGE) out.garbageTouched++;
      if (c > 0 && v[i - 1] === GARBAGE) out.garbageTouched++;
      if (c < cols - 1 && v[i + 1] === GARBAGE) out.garbageTouched++;
    }
    for (let i = 0; i < n; i++) {
      fell[i] = 0;
      if (marks[i]) v[i] = EMPTY;
    }
    drop(g, true);
  }
  return out;
}

/**
 * Apply a single-block drag: the block at (row, col) is swapped `steps` times in
 * direction `dir`. Returns false if the drag is impossible or would be interrupted
 * (the block falls into a gap or a match forms before the last swap). Applies the
 * gravity that follows the drag (moved blocks do not get the chain flag).
 */
export function applyDrag(g: Grid, row: number, col: number, dir: -1 | 1, steps: number): boolean {
  const { cols, rows, v, movable } = g;
  let x = col;
  if ((v[row * cols + x] as number) < 0) return false;
  for (let s = 0; s < steps; s++) {
    const nx = x + dir;
    if (nx < 0 || nx >= cols) return false;
    const i = row * cols + x;
    const j = row * cols + nx;
    if (!movable[i] || !movable[j]) return false;
    // A hovering / falling block above either cell locks the swap.
    if (row > 0) {
      const ai = i - cols;
      const aj = j - cols;
      if ((v[ai] as number) >= 0 && !movable[ai]) return false;
      if ((v[aj] as number) >= 0 && !movable[aj]) return false;
    }
    const a = v[i] as number;
    v[i] = v[j] as number;
    v[j] = a;
    x = nx;
    if (s < steps - 1) {
      // The dragged block must stay supported to keep going.
      if (row < rows - 1 && v[j + cols] === EMPTY) return false;
      if (markMatches(g) > 0) return false;
    }
  }
  drop(g, false);
  return true;
}

export interface BoardMetrics {
  /** Height of the tallest column (blocks). */
  maxHeight: number;
  sumHeight: number;
  bumpiness: number;
  /** Empty cells under fixed cells. */
  holes: number;
  /** Same-color neighbour pairs (incl. one gap horizontally): match potential. */
  potential: number;
  garbage: number;
}

export function boardMetrics(g: Grid, out: BoardMetrics): BoardMetrics {
  const { rows, cols, v } = g;
  out.maxHeight = 0;
  out.sumHeight = 0;
  out.bumpiness = 0;
  out.holes = 0;
  out.potential = 0;
  out.garbage = 0;
  let prevH = -1;
  for (let c = 0; c < cols; c++) {
    let h = 0;
    let covered = false;
    for (let r = 0; r < rows; r++) {
      const x = v[r * cols + c] as number;
      if (x !== EMPTY) {
        if (h === 0) h = rows - r;
        covered = true;
        if (x === GARBAGE) out.garbage++;
      } else if (covered) {
        out.holes++;
      }
    }
    out.sumHeight += h;
    if (h > out.maxHeight) out.maxHeight = h;
    if (prevH >= 0) out.bumpiness += Math.abs(h - prevH);
    prevH = h;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = v[r * cols + c] as number;
      if (x < 0) continue;
      if (c + 1 < cols && v[r * cols + c + 1] === x) out.potential += 2;
      else if (c + 2 < cols && v[r * cols + c + 2] === x) out.potential += 1;
      if (r + 1 < rows && v[(r + 1) * cols + c] === x) out.potential += 2;
    }
  }
  return out;
}

/** Cheap 32-bit hash of the grid values (transpositions among candidates). */
export function gridHash(g: Grid): number {
  let h = 0x811c9dc5;
  const v = g.v;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ ((v[i] as number) + 8), 16777619);
  return h >>> 0;
}
