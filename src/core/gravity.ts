import { SUBUNITS_PER_CELL } from './config';
import { findSlab, syncSlab } from './garbage';
import type { Block, GarbageSlab, SimEvent, SimState } from './types';

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
 * Garbage slabs follow the same rules as one unit (see `slabGravity`), processed
 * when the scan reaches their bottom-left cell.
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
      if (b.slab !== 0) {
        const s = findSlab(sim, b.slab);
        if (s && c === s.col && r === s.row + s.height - 1 && slabGravity(sim, s, events)) {
          landed = true;
        }
        continue;
      }
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

/** What lies under a slab's bottom row (scratch, reused). */
const below = {
  solid: false,
  hover: 0,
  hoverTimer: 0,
  fall: 0,
  minFall: 0,
  chain: false,
  vacated: false,
};

function scanBelow(sim: SimState, s: GarbageSlab): void {
  const { cols } = sim.config;
  const cells = sim.cells;
  const r = s.row + s.height;
  below.solid = false;
  below.hover = 0;
  below.hoverTimer = 0;
  below.fall = 0;
  below.minFall = SUBUNITS_PER_CELL;
  below.chain = false;
  below.vacated = false;
  for (let c = s.col; c < s.col + s.width; c++) {
    const i = r * cols + c;
    const b = cells[i];
    if (!b) {
      if (vacated[i]) below.vacated = true;
      continue;
    }
    if (b.state === 'hovering') {
      below.hover++;
      if (b.timer > below.hoverTimer) below.hoverTimer = b.timer;
      if (b.chain) below.chain = true;
    } else if (b.state === 'falling') {
      below.fall++;
      if (b.fall < below.minFall) below.minFall = b.fall;
      if (b.chain) below.chain = true;
    } else {
      below.solid = true;
    }
  }
}

/**
 * Gravity for one slab (same rules as a single block, applied to the whole unit):
 * supported if it is on the bottom row or any cell under it is solid; resting on
 * hovering/falling blocks only, it hovers/falls with them; with nothing under it,
 * it hovers (or falls at once into cells vacated this tick). Returns true if it landed.
 */
function slabGravity(sim: SimState, s: GarbageSlab, events: SimEvent[] | null): boolean {
  if (s.state === 'converting') return false;
  const { rows, hoverTicks } = sim.config;
  if (s.state === 'idle' || s.state === 'landing') {
    if (s.row + s.height >= rows) return clearSlabChain(sim, s);
    scanBelow(sim, s);
    if (below.solid) return clearSlabChain(sim, s);
    if (below.hover > 0) {
      s.state = 'hovering';
      s.timer = below.hoverTimer;
      if (below.chain) s.chain = true;
      syncSlab(sim, s);
      return false;
    }
    if (below.fall > 0) {
      s.state = 'falling';
      s.timer = 0;
      s.fall = below.minFall;
      if (below.chain) s.chain = true;
      syncSlab(sim, s);
      return false;
    }
    if (below.vacated || hoverTicks === 0) {
      s.state = 'falling';
      s.timer = 0;
      s.fall = 0;
    } else {
      s.state = 'hovering';
      s.timer = hoverTicks;
      syncSlab(sim, s);
      return false;
    }
  }
  if (s.state === 'hovering') {
    s.timer--;
    if (s.timer > 0) {
      syncSlab(sim, s);
      return false;
    }
    s.state = 'falling';
    s.timer = 0;
    s.fall = 0;
  }
  return fallSlab(sim, s, events);
}

function clearSlabChain(sim: SimState, s: GarbageSlab): false {
  if (s.chain) {
    s.chain = false;
    syncSlab(sim, s);
  }
  return false;
}

function fallSlab(sim: SimState, s: GarbageSlab, events: SimEvent[] | null): boolean {
  const { rows, cols, fallSpeed } = sim.config;
  const cells = sim.cells;
  s.fall += fallSpeed;
  for (;;) {
    if (s.row + s.height >= rows) return landSlab(sim, s, events);
    scanBelow(sim, s);
    if (below.solid) return landSlab(sim, s, events);
    if (below.hover > 0) {
      s.fall = 0;
      syncSlab(sim, s);
      return false;
    }
    if (below.fall > 0) {
      if (below.minFall < s.fall) s.fall = below.minFall;
      syncSlab(sim, s);
      return false;
    }
    if (s.fall < SUBUNITS_PER_CELL) {
      syncSlab(sim, s);
      return false;
    }
    // Move the whole slab down one row.
    const bottom = s.row + s.height - 1;
    for (let c = s.col; c < s.col + s.width; c++) {
      for (let r = bottom; r >= s.row; r--) cells[(r + 1) * cols + c] = cells[r * cols + c] ?? null;
      cells[s.row * cols + c] = null;
      vacated[s.row * cols + c] = 1;
    }
    s.row++;
    s.fall -= SUBUNITS_PER_CELL;
    if (s.row + s.height >= rows) {
      s.fall = 0;
    } else {
      scanBelow(sim, s);
      if (below.solid || below.hover > 0) s.fall = 0;
    }
  }
}

function landSlab(sim: SimState, s: GarbageSlab, events: SimEvent[] | null): boolean {
  const { landTicks } = sim.config;
  s.fall = 0;
  s.chain = false;
  if (landTicks > 0) {
    s.state = 'landing';
    s.timer = landTicks;
  } else {
    s.state = 'idle';
    s.timer = 0;
  }
  syncSlab(sim, s);
  if (events) {
    events.push({
      type: 'garbageLanded',
      slabId: s.id,
      row: s.row,
      col: s.col,
      width: s.width,
      height: s.height,
    });
  }
  return true;
}
