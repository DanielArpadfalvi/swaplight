import { parseAscii, COLOR_CHARS } from '../ascii';
import { newBlock } from '../board';
import type { SimConfig } from '../config';
import { cloneSim, createSim, step } from '../sim';
import type { SimInput, SimState } from '../types';
import type { PuzzleGoal } from './types';

/**
 * Compact color grids of *settled* puzzle boards (solver / generator).
 *
 * A settled board is fully described by its colors: no block is moving, no group
 * is clearing, every chain flag is off. Moves are resolved with the real engine
 * (`step` in static mode) unless a swap provably neither matches nor drops a
 * block, in which case the swapped grid is the result (exactly what the engine
 * would produce, ~1000× cheaper).
 */

export const PUZZLE_ROWS = 12;
export const PUZZLE_COLS = 6;
export const PUZZLE_COLORS = 6;
export const PUZZLE_CONFIG: Readonly<Partial<SimConfig>> = Object.freeze({
  rows: PUZZLE_ROWS,
  cols: PUZZLE_COLS,
  colors: PUZZLE_COLORS,
});
export const PUZZLE_MODE = 'static' as const;

/** `-1` = empty, otherwise a color index. Row-major, row 0 = top. */
export type Grid = Int8Array;
export const EMPTY = -1;
const CELLS = PUZZLE_ROWS * PUZZLE_COLS;

export function gridFromAscii(text: string): Grid {
  const parsed = parseAscii(text, PUZZLE_COLS);
  if (parsed.rows.length > PUZZLE_ROWS) throw new Error(`puzzle: more than ${PUZZLE_ROWS} rows`);
  const g = new Int8Array(CELLS).fill(EMPTY);
  const offset = PUZZLE_ROWS - parsed.rows.length;
  parsed.rows.forEach((line, r) => {
    line.forEach((cell, c) => {
      if (cell) g[(offset + r) * PUZZLE_COLS + c] = cell.color;
    });
  });
  return g;
}

/** Board string (top empty rows trimmed), the inverse of `gridFromAscii`. */
export function gridToAscii(g: Grid): string {
  const lines: string[] = [];
  for (let r = 0; r < PUZZLE_ROWS; r++) {
    let line = '';
    for (let c = 0; c < PUZZLE_COLS; c++) {
      const v = g[r * PUZZLE_COLS + c] as number;
      line += v < 0 ? '.' : COLOR_CHARS[v];
    }
    if (lines.length > 0 || line !== '.'.repeat(PUZZLE_COLS)) lines.push(line);
  }
  return lines.join('\n');
}

/** Hash key of a grid (one char per cell). */
export function gridKey(g: Grid): string {
  let s = '';
  for (let i = 0; i < g.length; i++) s += String.fromCharCode(66 + (g[i] as number));
  return s;
}

export function gridFromKey(key: string): Grid {
  const g = new Int8Array(key.length);
  for (let i = 0; i < key.length; i++) g[i] = key.charCodeAt(i) - 66;
  return g;
}

/** Colors of every block on the board (any state). */
export function gridFromSim(sim: SimState): Grid {
  const g = new Int8Array(CELLS).fill(EMPTY);
  for (let i = 0; i < CELLS; i++) {
    const b = sim.cells[i];
    if (b) g[i] = b.color;
  }
  return g;
}

export function blockCount(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.length; i++) if ((g[i] as number) >= 0) n++;
  return n;
}

export function colorCounts(g: Grid): number[] {
  const counts = new Array<number>(PUZZLE_COLORS).fill(0);
  for (let i = 0; i < g.length; i++) {
    const v = g[i] as number;
    if (v >= 0) counts[v] = (counts[v] as number) + 1;
  }
  return counts;
}

/** Number of non-empty rows (stack height). */
export function gridHeight(g: Grid): number {
  for (let r = 0; r < PUZZLE_ROWS; r++) {
    for (let c = 0; c < PUZZLE_COLS; c++) {
      if ((g[r * PUZZLE_COLS + c] as number) >= 0) return PUZZLE_ROWS - r;
    }
  }
  return 0;
}

/** Number of columns holding at least one block. */
export function gridWidth(g: Grid): number {
  let n = 0;
  for (let c = 0; c < PUZZLE_COLS; c++) {
    if ((g[(PUZZLE_ROWS - 1) * PUZZLE_COLS + c] as number) >= 0) n++;
  }
  return n;
}

/** No floating block (every block rests on the floor or on another block). */
export function isStable(g: Grid): boolean {
  for (let r = 0; r < PUZZLE_ROWS - 1; r++) {
    for (let c = 0; c < PUZZLE_COLS; c++) {
      const i = r * PUZZLE_COLS + c;
      if ((g[i] as number) >= 0 && (g[i + PUZZLE_COLS] as number) < 0) return false;
    }
  }
  return true;
}

function runLength(g: Grid, r: number, c: number, dr: number, dc: number): number {
  const color = g[r * PUZZLE_COLS + c] as number;
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (rr >= 0 && rr < PUZZLE_ROWS && cc >= 0 && cc < PUZZLE_COLS) {
    if (g[rr * PUZZLE_COLS + cc] !== color) break;
    n++;
    rr += dr;
    cc += dc;
  }
  return n;
}

/** Does the block at (r, c) belong to a horizontal or vertical line of ≥ 3? */
export function matchesAt(g: Grid, r: number, c: number): boolean {
  if ((g[r * PUZZLE_COLS + c] as number) < 0) return false;
  if (1 + runLength(g, r, c, 0, -1) + runLength(g, r, c, 0, 1) >= 3) return true;
  return 1 + runLength(g, r, c, -1, 0) + runLength(g, r, c, 1, 0) >= 3;
}

/** Any line of ≥ 3 on the board? */
export function hasMatch(g: Grid): boolean {
  for (let r = 0; r < PUZZLE_ROWS; r++) {
    for (let c = 0; c < PUZZLE_COLS; c++) if (matchesAt(g, r, c)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Engine bridge

let baseSim: SimState | null = null;
let baseStats: SimState['stats'] | null = null;

function pristine(): SimState {
  if (!baseSim) {
    baseSim = createSim('puzzle', PUZZLE_CONFIG, PUZZLE_MODE);
    baseStats = { ...baseSim.stats };
  }
  return baseSim;
}

function fillFromGrid(sim: SimState, g: Grid): void {
  sim.nextBlockId = 1;
  const cells = new Array<SimState['cells'][number]>(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const v = g[i] as number;
    cells[i] = v >= 0 ? newBlock(sim, v) : null;
  }
  sim.cells = cells;
  sim.groups = [];
  sim.chain = 1;
  sim.stopTicks = 0;
  // A settled grid holds no match; floating blocks still fall via gravity.
  sim.matchScanPending = true;
}

/** Fresh static sim with all blocks idle. */
export function simFromGrid(g: Grid): SimState {
  const sim = cloneSim(pristine());
  fillFromGrid(sim, g);
  return sim;
}

/** Scratch sim reused by `applyMove` (reset to the pristine state per call). */
let scratch: SimState | null = null;

function scratchFromGrid(g: Grid): SimState {
  const base = pristine();
  if (!scratch) scratch = cloneSim(base);
  const sim = scratch;
  sim.tick = 0;
  sim.nextGroupId = 1;
  sim.score = 0;
  sim.gameOver = false;
  sim.stats = { ...(baseStats as SimState['stats']) };
  fillFromGrid(sim, g);
  return sim;
}

/**
 * The player may swap: no group is clearing, no block is swapping, hovering,
 * falling or matched (idle and the cosmetic `landing` are fine), no match scan or
 * chain is pending.
 */
export function isBoardSettled(sim: SimState): boolean {
  if (sim.groups.length > 0 || sim.chain !== 1 || sim.matchScanPending) return false;
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const b = cells[i];
    if (b && b.state !== 'idle' && b.state !== 'landing') return false;
  }
  return true;
}

/** Hard cap on the ticks a single move may take to resolve. */
export const MAX_SETTLE_TICKS = 20000;

/**
 * Step silently until the board is settled. Returns the number of steps taken.
 *
 * `skipWaits` (solver only): while nothing but clearing groups is in play
 * (every other block idle), the ticks until the next group clears change
 * nothing but the groups' age and their members' flash/pop state, so the ages
 * are advanced directly and only the clearing tick is stepped. The resulting
 * board equals plain stepping (checked by the puzzle tests); `sim.tick` and
 * stop time differ, which static mode never reads.
 */
export function settleSim(sim: SimState, skipWaits = false): number {
  let n = 0;
  while (!isBoardSettled(sim)) {
    if (sim.gameOver || n >= MAX_SETTLE_TICKS) throw new Error('puzzle: board did not settle');
    if (skipWaits) skipGroupWait(sim);
    step(sim, [], undefined, null);
    n++;
  }
  return n;
}

function skipGroupWait(sim: SimState): void {
  if (sim.groups.length === 0 || sim.matchScanPending) return;
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const b = cells[i];
    if (b && b.group === 0 && b.state !== 'idle') return;
  }
  const { flashTicks, popTicksPerBlock } = sim.config;
  let wait = Infinity;
  for (const g of sim.groups) {
    wait = Math.min(wait, flashTicks + g.size * popTicksPerBlock - g.age - 1);
  }
  if (wait <= 0 || !Number.isFinite(wait)) return;
  for (const g of sim.groups) g.age += wait;
}

/** Outcome of one move on a settled grid. */
export interface MoveResult {
  grid: Grid;
  /** Longest chain during the move (1 = none). */
  chain: number;
  /** Largest single match during the move (0 = nothing matched). */
  combo: number;
  /** Resolved by stepping the engine (false: no-match, no-fall fast path). */
  engine: boolean;
}

/** Is (row, col)↔(row, col+1) a useful move on a settled grid (not empty/empty, colors differ)? */
export function isCandidateMove(g: Grid, row: number, col: number): boolean {
  const i = row * PUZZLE_COLS + col;
  const a = g[i] as number;
  const b = g[i + 1] as number;
  return a !== b;
}

/**
 * Resolve the swap (row, col)↔(row, col+1) on a settled grid until the board is
 * settled again. The swap must be legal (`isCandidateMove`, in bounds).
 */
export function applyMove(g: Grid, row: number, col: number): MoveResult {
  const i = row * PUZZLE_COLS + col;
  const a = g[i] as number;
  const b = g[i + 1] as number;
  const next = g.slice();
  next[i] = b;
  next[i + 1] = a;
  const quiet = resolveWithoutMatch(next, row, col, a < 0 || b < 0);
  if (quiet) return { grid: quiet, chain: 1, combo: 0, engine: false };
  const sim = scratchFromGrid(g);
  sim.matchScanPending = false;
  const input: SimInput = { type: 'swap', row, col };
  step(sim, [input], undefined, null);
  settleSim(sim, true);
  return {
    grid: gridFromSim(sim),
    chain: sim.stats.maxChain,
    combo: sim.stats.maxCombo,
    engine: true,
  };
}

/**
 * The swapped grid after gravity, when the move provably matches nothing
 * (then the engine would produce exactly that), otherwise null.
 *
 * A swap ending over a gap is checked for lines in place (`matchAnyway`); after
 * that no block is matchable until it comes to rest at its final position, and
 * resting blocks never move again before the first clear, so if the compacted
 * grid holds no line nothing ever matches.
 */
function resolveWithoutMatch(next: Grid, row: number, col: number, withGap: boolean): Grid | null {
  if (matchesAt(next, row, col) || matchesAt(next, row, col + 1)) return null;
  if (!withGap) return next;
  let moved = false;
  for (const c of [col, col + 1]) {
    // Compact the column: blocks keep their order and drop to the floor / stack.
    let write = PUZZLE_ROWS - 1;
    for (let r = PUZZLE_ROWS - 1; r >= 0; r--) {
      const v = next[r * PUZZLE_COLS + c] as number;
      if (v < 0) continue;
      if (write !== r) {
        next[write * PUZZLE_COLS + c] = v;
        next[r * PUZZLE_COLS + c] = EMPTY;
        moved = true;
      }
      write--;
    }
  }
  if (!moved) return next;
  for (let r = 0; r < PUZZLE_ROWS; r++) {
    for (const c of [col, col + 1]) if (matchesAt(next, r, c)) return null;
  }
  return next;
}

/** Has a single move's outcome reached a chain / combo goal? (`clearAll` → board empty.) */
export function goalReached(goal: PuzzleGoal, result: MoveResult): boolean {
  if (goal === 'clearAll') return blockCount(result.grid) === 0;
  if (goal.type === 'chain') return result.chain >= goal.length;
  return result.combo >= goal.size;
}
