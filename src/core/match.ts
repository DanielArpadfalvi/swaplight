import type { Block, SimState } from './types';

/** Only resting blocks take part in matches. */
export function isMatchable(block: Block | null | undefined): block is Block {
  return !!block && (block.state === 'idle' || block.state === 'landing');
}

/** Reused scratch buffer (findMatches is called every tick in AI rollouts). */
let marks = new Uint8Array(0);

/**
 * Find all cells belonging to a horizontal or vertical run of >= 3 matchable
 * blocks of the same color. Overlapping runs (L/T/+ shapes) count each block once.
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

/** Color of a matchable block, or -1. */
function colorOf(block: Block | null | undefined, extra: readonly Block[] | null): number {
  if (!block) return -1;
  if (block.state === 'idle' || block.state === 'landing') return block.color;
  if (extra !== null && extra.includes(block)) return block.color;
  return -1;
}
