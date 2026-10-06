import { randInt } from './rng';
import type { Block, BlockState, SimState } from './types';

/** Grid helpers. Row 0 is the TOP row; row rows-1 is the bottom active row. */

export function inBounds(sim: SimState, row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    col >= 0 &&
    row < sim.config.rows &&
    col < sim.config.cols
  );
}

export function cellAt(sim: SimState, row: number, col: number): Block | null {
  if (!inBounds(sim, row, col)) return null;
  return sim.cells[row * sim.config.cols + col] ?? null;
}

export function setCell(sim: SimState, row: number, col: number, block: Block | null): void {
  sim.cells[row * sim.config.cols + col] = block;
}

export function emptyCells(rows: number, cols: number): (Block | null)[] {
  return new Array<Block | null>(rows * cols).fill(null);
}

export function newBlock(sim: SimState, color: number, state: BlockState = 'idle'): Block {
  return {
    id: sim.nextBlockId++,
    color,
    state,
    timer: 0,
    fall: 0,
    swapDir: 0,
    chain: false,
    group: 0,
    popIndex: 0,
  };
}

/** Iterate all on-board blocks with their positions (top-left → bottom-right). */
export function forEachBlock(
  sim: SimState,
  fn: (block: Block, row: number, col: number) => void,
): void {
  const { rows, cols } = sim.config;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = sim.cells[r * cols + c];
      if (b) fn(b, r, c);
    }
  }
}

/** Pick a color uniformly among those not in `forbidden`. */
export function chooseColor(sim: SimState, forbidden: readonly number[]): number {
  const allowed: number[] = [];
  for (let k = 0; k < sim.config.colors; k++) if (!forbidden.includes(k)) allowed.push(k);
  if (allowed.length === 0) return randInt(sim.rng, sim.config.colors);
  return allowed[randInt(sim.rng, allowed.length)] as number;
}

/** Color that would complete a run of 3 with the two given cells, or -1. */
function runColor(a: Block | null | undefined, b: Block | null | undefined): number {
  return a && b && a.color === b.color ? a.color : -1;
}

/**
 * Fill the board with uneven columns (heights in [initialMinHeight, initialMaxHeight])
 * containing no horizontal/vertical run of 3. Columns are filled bottom-up,
 * left-to-right, so checking two cells left and two cells below suffices.
 */
export function generateInitialBoard(sim: SimState): void {
  const { rows, cols, initialMinHeight, initialMaxHeight } = sim.config;
  sim.cells = emptyCells(rows, cols);
  for (let c = 0; c < cols; c++) {
    const height = initialMinHeight + randInt(sim.rng, initialMaxHeight - initialMinHeight + 1);
    for (let r = rows - 1; r >= rows - height; r--) {
      const forbidden = [
        runColor(cellAt(sim, r, c - 1), cellAt(sim, r, c - 2)),
        runColor(cellAt(sim, r + 1, c), cellAt(sim, r + 2, c)),
      ];
      setCell(sim, r, c, newBlock(sim, chooseColor(sim, forbidden)));
    }
  }
}

/**
 * Generate the next preview row: no horizontal run of 3 inside the row and no
 * vertical run of 3 together with the current two bottom rows.
 */
export function generatePreviewRow(sim: SimState): Block[] {
  const { rows, cols } = sim.config;
  const row: Block[] = [];
  for (let c = 0; c < cols; c++) {
    const forbidden = [
      runColor(row[c - 1], row[c - 2]),
      runColor(cellAt(sim, rows - 1, c), cellAt(sim, rows - 2, c)),
    ];
    row.push(newBlock(sim, chooseColor(sim, forbidden)));
  }
  return row;
}

/** True if any cell of the top row holds a block. */
export function topRowOccupied(sim: SimState): boolean {
  for (let c = 0; c < sim.config.cols; c++) if (sim.cells[c]) return true;
  return false;
}

/** True if the top row holds a block that is resting (not hovering/falling). */
export function topRowResting(sim: SimState): boolean {
  for (let c = 0; c < sim.config.cols; c++) {
    const b = sim.cells[c];
    if (b && b.state !== 'hovering' && b.state !== 'falling') return true;
  }
  return false;
}

/**
 * Shift every row up by one; the preview row becomes the bottom row and a new
 * preview row is generated. Caller must ensure the top row is empty.
 */
export function pushRow(sim: SimState): void {
  const { cols } = sim.config;
  sim.cells.splice(0, cols);
  for (const b of sim.preview) sim.cells.push(b);
  sim.preview = generatePreviewRow(sim);
}

/** Highest occupied row per column (rows if empty). Handy for render/AI. */
export function columnTops(sim: SimState): number[] {
  const { rows, cols } = sim.config;
  const tops: number[] = [];
  for (let c = 0; c < cols; c++) {
    let top = rows;
    for (let r = 0; r < rows; r++) {
      if (sim.cells[r * cols + c]) {
        top = r;
        break;
      }
    }
    tops.push(top);
  }
  return tops;
}
