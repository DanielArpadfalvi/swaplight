import type { Block, SimState } from './types';

/** Only resting blocks take part in matches. */
export function isMatchable(block: Block | null | undefined): block is Block {
  return !!block && (block.state === 'idle' || block.state === 'landing');
}

/** Reused scratch buffer (findMatches is called every tick in AI rollouts). */
let marks = new Uint8Array(0);

/**
 * Find all cells belonging to a horizontal or vertical run of >= 3 matchable
 * blocks of the same color (wild blocks match any color, matched bombs blast
 * their 3×3 neighbourhood – see `findMatchesSpecial`). Overlapping runs (L/T/+ shapes) count each block once.
 * Returns sorted cell indices (reading order: top-left → bottom-right).
 *
 * `matchAnyway` lists blocks that are matchable this tick regardless of their
 * state (a block whose swap just ended over a gap is checked once before it
 * hovers – Panel Attack's `matchAnyway`).
 */
export function findMatches(sim: SimState, matchAnyway?: readonly Block[]): number[] {
  const { rows, cols } = sim.config;
  const cells = sim.cells;
  const n = rows * cols;
  if (marks.length < n) marks = new Uint8Array(n);
  else marks.fill(0, 0, n);
  const extra = matchAnyway && matchAnyway.length > 0 ? matchAnyway : null;
  for (let i = 0; i < n; i++) {
    const b = cells[i];
    if (b && (b.kind === 'wild' || b.kind === 'bomb')) return findMatchesSpecial(sim, extra);
  }
  let any = false;

  // Horizontal runs.
  for (let r = 0; r < rows; r++) {
    const rowStart = r * cols;
    let start = 0;
    let color = -1;
    for (let c = 0; c <= cols; c++) {
      const k = c < cols ? colorOf(cells[rowStart + c], extra) : -1;
      if (k >= 0 && k === color) continue;
      if (color >= 0 && c - start >= 3) {
        for (let m = start; m < c; m++) marks[rowStart + m] = 1;
        any = true;
      }
      start = c;
      color = k;
    }
  }
  // Vertical runs.
  for (let c = 0; c < cols; c++) {
    let start = 0;
    let color = -1;
    for (let r = 0; r <= rows; r++) {
      const k = r < rows ? colorOf(cells[r * cols + c], extra) : -1;
      if (k >= 0 && k === color) continue;
      if (color >= 0 && r - start >= 3) {
        for (let m = start; m < r; m++) marks[m * cols + c] = 1;
        any = true;
      }
      start = r;
      color = k;
    }
  }

  const result: number[] = [];
  if (!any) return result;
  for (let i = 0; i < n; i++) if (marks[i]) result.push(i);
  return result;
}

/** Wild blocks report this pseudo color while scanning special boards. */
const WILD = -2;

/**
 * Slow path when wild or bomb blocks are on the board:
 * - `wild` acts as a joker: a run is a maximal line of matchable blocks whose
 *   non-wild members all share one color (three wilds also match);
 * - a matched `bomb` also pulls every matchable block of its 3×3 neighbourhood
 *   into the match (bombs caught in a blast detonate as well).
 */
function findMatchesSpecial(sim: SimState, extra: readonly Block[] | null): number[] {
  const { rows, cols } = sim.config;
  const cells = sim.cells;
  const n = rows * cols;
  const kindColor = (i: number): number => {
    const b = cells[i];
    const k = colorOf(b, extra);
    if (k < 0 || !b) return -1;
    return b.kind === 'wild' ? WILD : k;
  };
  const scanLine = (start: number, stride: number, length: number) => {
    for (let s = 0; s < length; s++) {
      let color = -1;
      let e = s;
      for (; e < length; e++) {
        const k = kindColor(start + e * stride);
        if (k === -1) break;
        if (k === WILD) continue;
        if (color === -1) color = k;
        else if (k !== color) break;
      }
      if (e - s >= 3) for (let m = s; m < e; m++) marks[start + m * stride] = 1;
    }
  };
  for (let r = 0; r < rows; r++) scanLine(r * cols, 1, cols);
  for (let c = 0; c < cols; c++) scanLine(c, cols, rows);

  // Bomb blasts (iterate so bombs caught in a blast detonate too).
  const detonated = new Uint8Array(n);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      const b = cells[i];
      if (!marks[i] || detonated[i] || !b || b.kind !== 'bomb') continue;
      detonated[i] = 1;
      const r0 = Math.floor(i / cols);
      const c0 = i % cols;
      for (let r = Math.max(0, r0 - 1); r <= Math.min(rows - 1, r0 + 1); r++) {
        for (let c = Math.max(0, c0 - 1); c <= Math.min(cols - 1, c0 + 1); c++) {
          const j = r * cols + c;
          if (!marks[j] && colorOf(cells[j], extra) >= 0) {
            marks[j] = 1;
            changed = true;
          }
        }
      }
    }
  }
  const result: number[] = [];
  for (let i = 0; i < n; i++) if (marks[i]) result.push(i);
  return result;
}

/** Color of a matchable block, or -1. */
function colorOf(block: Block | null | undefined, extra: readonly Block[] | null): number {
  if (!block) return -1;
  if (block.state === 'idle' || block.state === 'landing') return block.color;
  if (extra !== null && extra.includes(block)) return block.color;
  return -1;
}
