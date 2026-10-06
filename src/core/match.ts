import type { Block, SimState } from './types';

/** Only resting blocks take part in matches. */
export function isMatchable(block: Block | null | undefined): block is Block {
  return !!block && (block.state === 'idle' || block.state === 'landing');
}

/**
 * Find all cells belonging to a horizontal or vertical run of >= 3 matchable
 * blocks of the same color. Overlapping runs (L/T/+ shapes) count each block once.
 * Returns sorted cell indices (reading order: top-left → bottom-right).
 */
export function findMatches(sim: SimState): number[] {
  const { rows, cols } = sim.config;
  const cells = sim.cells;
  const marked = new Array<boolean>(rows * cols).fill(false);

  const scan = (outer: number, inner: number, index: (o: number, i: number) => number) => {
    for (let o = 0; o < outer; o++) {
      let start = 0;
      for (let i = 1; i <= inner; i++) {
        const prev = cells[index(o, start)];
        const cur = i < inner ? cells[index(o, i)] : null;
        const continues = isMatchable(prev) && isMatchable(cur) && cur.color === prev.color;
        if (continues) continue;
        if (isMatchable(prev) && i - start >= 3) {
          for (let k = start; k < i; k++) marked[index(o, k)] = true;
        }
        start = i;
      }
    }
  };

  scan(rows, cols, (r, c) => r * cols + c);
  scan(cols, rows, (c, r) => r * cols + c);

  const result: number[] = [];
  for (let i = 0; i < marked.length; i++) if (marked[i]) result.push(i);
  return result;
}
