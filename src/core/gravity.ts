import { SUBUNITS_PER_CELL } from './config';
import type { Block, SimEvent, SimState } from './types';

/** Per-tick gravity bookkeeping shared with the caller (no allocation per tick). */
export interface GravityResult {
  /** At least one block landed this tick (it became matchable). */
  landed: boolean;
}

/** Cells vacated by a falling block during the current pass (scratch, reused). */
let vacated = new Uint8Array(0);

/**
 * Gravity pass, processed bottom-up so stacks move together:
 * - idle/landing block with an empty cell below → starts hovering (hoverTicks),
 *   unless that cell was just vacated by a falling block (the block falls along
 *   instead of being left behind to hover)
 * - idle/landing block on a hovering block → hovers in sync (copies its timer and chain flag)
 * - idle/landing block on a falling block → falls with it (copies its progress and chain flag)
 * - hovering: timer counts down, then the block falls
 * - falling: advances by fallSpeed sub-units; moves a cell per SUBUNITS_PER_CELL.
 *   The fall progress is clamped so a block never overlaps the block below and
 *   never moves up: on entering a cell whose neighbour below is solid it lands
 *   at once (leftover progress is dropped), above a hovering block it waits at
 *   fall = 0, above a falling block it keeps `fall <= below.fall`.
 * Swapping, matched, popping and popped blocks are fixed in place and count as solid.
 *
 * `events` may be null (silent mode).
 */
export function applyGravity(
  sim: SimState,
  events: SimEvent[] | null,
  result?: GravityResult,
): void {
  const { rows, cols, hoverTicks } = sim.config;
  const cells = sim.cells;
  const n = rows * cols;
  if (vacated.length < n) vacated = new Uint8Array(n);
  else vacated.fill(0, 0, n);
  let landed = false;
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const b = cells[r * cols + c];
      if (!b) continue;
      if (b.state === 'idle' || b.state === 'landing') {
        if (r === rows - 1) continue;
        const belowIndex = (r + 1) * cols + c;
        const below = cells[belowIndex] ?? null;
        if (below === null) {
          if (vacated[belowIndex]) {
            b.state = 'falling';
            b.timer = 0;
            b.fall = 0;
          } else {
            b.state = 'hovering';
            b.timer = hoverTicks;
          }
        } else if (below.state === 'hovering') {
          b.state = 'hovering';
          b.timer = below.timer;
          if (below.chain) b.chain = true;
          continue;
        } else if (below.state === 'falling') {
          b.state = 'falling';
          b.timer = 0;
          b.fall = below.fall;
          if (below.chain) b.chain = true;
          continue;
        } else {
          continue;
        }
        // A block that starts hovering with hoverTicks = 0 falls right away.
        if (b.state === 'hovering' && b.timer > 0) continue;
      }
      if (b.state === 'hovering') {
        b.timer--;
        if (b.timer > 0) continue;
        b.state = 'falling';
        b.timer = 0;
        b.fall = 0;
      }
      if (b.state === 'falling' && fallBlock(sim, r, c, b, events)) landed = true;
    }
  }
  if (result) result.landed = landed;
}

/** Advance a falling block. Returns true if it landed. */
function fallBlock(
  sim: SimState,
  row: number,
  col: number,
  b: Block,
  events: SimEvent[] | null,
): boolean {
  const { rows, cols, fallSpeed } = sim.config;
  const cells = sim.cells;
  b.fall += fallSpeed;
  for (;;) {
    if (row === rows - 1) return land(sim, b, row, col, events);
    const below = cells[(row + 1) * cols + col] ?? null;
    if (below !== null) {
      if (below.state === 'falling') {
        if (below.fall < b.fall) b.fall = below.fall;
        return false;
      }
      if (below.state === 'hovering') {
        b.fall = 0;
        return false;
      }
      return land(sim, b, row, col, events);
    }
    if (b.fall < SUBUNITS_PER_CELL) return false;
    cells[row * cols + col] = null;
    vacated[row * cols + col] = 1;
    row++;
    cells[row * cols + col] = b;
    b.fall -= SUBUNITS_PER_CELL;
    // Entering a cell whose neighbour below blocks the fall: rest exactly here
    // (the leftover progress would overlap the obstacle and snap back later).
    const next = row === rows - 1 ? null : (cells[(row + 1) * cols + col] ?? null);
    if (row === rows - 1 || (next !== null && next.state !== 'falling')) b.fall = 0;
  }
}

function land(
  sim: SimState,
  b: Block,
  row: number,
  col: number,
  events: SimEvent[] | null,
): boolean {
  b.fall = 0;
  const { landTicks } = sim.config;
  if (landTicks > 0) {
    b.state = 'landing';
    b.timer = landTicks;
  } else {
    b.state = 'idle';
    b.timer = 0;
  }
  if (events) events.push({ type: 'landed', id: b.id, row, col, chain: b.chain });
  return true;
}
