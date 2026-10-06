import { randInt } from './rng';
import type {
  Block,
  GarbageSlab,
  MatchedBlockInfo,
  QueuedGarbage,
  SimEvent,
  SimState,
} from './types';

/**
 * Garbage slabs (Panel de Pon style). A slab is a `width × height` rectangle of
 * `kind: 'garbage'` cell blocks that moves as one unit. The slab record in
 * `sim.garbage` is authoritative; `syncSlab` mirrors its state into the cells so
 * blocks resting on it (and the renderer) see a consistent per-cell state.
 *
 * - Incoming garbage waits in `sim.garbageQueue` (`queueGarbage`). The front entry
 *   drops once its delay ran out, no chain is in progress and no group is clearing,
 *   and the top rows over its columns are free. Narrow slabs alternate right/left.
 *   A slab taller than the free space drops in parts (the rest stays queued).
 * - Gravity: see `applyGravity` (gravity.ts) – supported if any cell under its
 *   bottom row is (or it is on the bottom row).
 * - A match orthogonally adjacent to a resting slab triggers it; every resting slab
 *   touching a triggered slab is triggered too. Triggered slabs flash (`converting`,
 *   cells `matched` with group 0) for `flashTicks + garbagePopTicks × cells` (capped),
 *   then their bottom row turns into random normal blocks with the chain flag and the
 *   slab shrinks by one row. Rise is frozen and the chain stays open meanwhile.
 */

export const MIN_GARBAGE_WIDTH = 1;

export function findSlab(sim: SimState, id: number): GarbageSlab | undefined {
  const list = sim.garbage;
  for (let i = 0; i < list.length; i++) {
    const s = list[i] as GarbageSlab;
    if (s.id === id) return s;
  }
  return undefined;
}

/** True while any slab is converting (rise frozen, chain kept open). */
export function garbageConverting(sim: SimState): boolean {
  const list = sim.garbage;
  for (let i = 0; i < list.length; i++)
    if ((list[i] as GarbageSlab).state === 'converting') return true;
  return false;
}

/** Mirror a slab's state into its cell blocks. */
export function syncSlab(sim: SimState, s: GarbageSlab): void {
  const { cols } = sim.config;
  const cells = sim.cells;
  const state = s.state === 'converting' ? 'matched' : s.state;
  const timer = s.state === 'converting' ? 0 : s.timer;
  for (let r = s.row; r < s.row + s.height; r++) {
    for (let c = s.col; c < s.col + s.width; c++) {
      const b = cells[r * cols + c] as Block;
      b.state = state;
      b.timer = timer;
      b.fall = s.fall;
      b.chain = s.chain;
    }
  }
}

export interface QueueGarbageOptions {
  /** Ticks before it may drop (default 0). */
  delay?: number;
  fromChain?: boolean;
}

/** Add incoming garbage to the queue. Width is clamped to [1, cols], height to ≥ 1. */
export function queueGarbage(
  sim: SimState,
  width: number,
  height: number,
  options: QueueGarbageOptions = {},
  events?: SimEvent[] | null,
): QueuedGarbage {
  const w = Math.max(MIN_GARBAGE_WIDTH, Math.min(sim.config.cols, Math.floor(width)));
  const h = Math.max(1, Math.floor(height));
  const entry: QueuedGarbage = {
    id: sim.nextSlabId++,
    width: w,
    height: h,
    delay: Math.max(0, Math.floor(options.delay ?? 0)),
    fromChain: options.fromChain ?? false,
  };
  sim.garbageQueue.push(entry);
  if (events)
    events.push({ type: 'garbageQueued', id: entry.id, width: w, height: h, delay: entry.delay });
  return entry;
}

/** Total queued garbage cells (incoming meter). */
export function queuedGarbageCells(sim: SimState): number {
  let n = 0;
  for (const q of sim.garbageQueue) n += q.width * q.height;
  return n;
}

function makeGarbageBlock(sim: SimState, slab: number): Block {
  return {
    id: sim.nextBlockId++,
    kind: 'garbage',
    color: 0,
    state: 'idle',
    timer: 0,
    fall: 0,
    swapDir: 0,
    chain: false,
    group: 0,
    popIndex: 0,
    slab,
  };
}

/**
 * Put a slab directly onto the board (tests, puzzles, bosses). The area must be
 * empty and inside the board. It starts idle; gravity makes it fall if unsupported.
 */
export function placeGarbage(
  sim: SimState,
  row: number,
  col: number,
  width: number,
  height: number,
): GarbageSlab {
  const { rows, cols } = sim.config;
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    row < 0 ||
    col < 0 ||
    row + height > rows ||
    col + width > cols
  ) {
    throw new RangeError(`placeGarbage: slab ${width}x${height} at ${row},${col} out of bounds`);
  }
  for (let r = row; r < row + height; r++) {
    for (let c = col; c < col + width; c++) {
      if (sim.cells[r * cols + c]) throw new Error(`placeGarbage: cell ${r},${c} is occupied`);
    }
  }
  return addSlab(sim, row, col, width, height);
}

function addSlab(
  sim: SimState,
  row: number,
  col: number,
  width: number,
  height: number,
): GarbageSlab {
  const { cols } = sim.config;
  const slab: GarbageSlab = {
    id: sim.nextSlabId++,
    row,
    col,
    width,
    height,
    state: 'idle',
    timer: 0,
    convertTicks: 0,
    fall: 0,
    chain: false,
  };
  for (let r = row; r < row + height; r++) {
    for (let c = col; c < col + width; c++)
      sim.cells[r * cols + c] = makeGarbageBlock(sim, slab.id);
  }
  sim.garbage.push(slab);
  return slab;
}

/** Called when a cleared group frees the cell under a slab: flag it for chains. */
export function flagSlabChain(sim: SimState, id: number): void {
  const s = findSlab(sim, id);
  if (!s || s.chain || s.state === 'converting') return;
  s.chain = true;
  syncSlab(sim, s);
}

function resting(s: GarbageSlab): boolean {
  return s.state === 'idle' || s.state === 'landing';
}

/** Scratch list of slabs triggered in one detection pass. */
const TRIGGERED: GarbageSlab[] = [];

/**
 * Trigger every resting slab orthogonally adjacent to a matched cell, plus every
 * resting slab touching a triggered one (transitively).
 */
export function triggerGarbage(
  sim: SimState,
  matched: readonly number[],
  events: SimEvent[] | null,
): void {
  if (sim.garbage.length === 0) return;
  const { rows, cols, flashTicks, garbagePopTicks, garbageMaxConvertTicks } = sim.config;
  const cells = sim.cells;
  const found = TRIGGERED;
  found.length = 0;
  const consider = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    const b = cells[r * cols + c];
    if (!b || b.slab === 0) return;
    for (let k = 0; k < found.length; k++) if ((found[k] as GarbageSlab).id === b.slab) return;
    const s = findSlab(sim, b.slab);
    if (s && resting(s)) found.push(s);
  };
  for (let k = 0; k < matched.length; k++) {
    const i = matched[k] as number;
    const r = Math.floor(i / cols);
    const c = i % cols;
    consider(r - 1, c);
    consider(r + 1, c);
    consider(r, c - 1);
    consider(r, c + 1);
  }
  if (found.length === 0) return;
  for (let k = 0; k < found.length; k++) {
    const s = found[k] as GarbageSlab;
    for (let c = s.col; c < s.col + s.width; c++) {
      consider(s.row - 1, c);
      consider(s.row + s.height, c);
    }
    for (let r = s.row; r < s.row + s.height; r++) {
      consider(r, s.col - 1);
      consider(r, s.col + s.width);
    }
  }
  let total = 0;
  for (const s of found) total += s.width * s.height;
  const ticks = Math.max(1, Math.min(garbageMaxConvertTicks, flashTicks + total * garbagePopTicks));
  const ids: number[] = [];
  for (const s of found) {
    s.state = 'converting';
    s.timer = ticks;
    s.convertTicks = ticks;
    s.fall = 0;
    s.chain = false;
    syncSlab(sim, s);
    ids.push(s.id);
  }
  found.length = 0;
  if (events) events.push({ type: 'garbageConverting', slabIds: ids, ticks });
}

/** Turn the bottom row of a slab into normal chain-flagged blocks. Returns true if the slab is gone. */
function convertBottomRow(sim: SimState, s: GarbageSlab, events: SimEvent[] | null): boolean {
  const { rows, cols, colors, hoverTicks } = sim.config;
  const cells = sim.cells;
  const r = s.row + s.height - 1;
  const infos: MatchedBlockInfo[] | null = events ? [] : null;
  for (let c = s.col; c < s.col + s.width; c++) {
    const b = cells[r * cols + c] as Block;
    b.kind = 'normal';
    b.slab = 0;
    b.color = randInt(sim.rng, colors);
    b.state = 'idle';
    b.timer = 0;
    b.fall = 0;
    b.chain = true;
    if (r < rows - 1 && hoverTicks > 0 && !cells[(r + 1) * cols + c]) {
      // Unsupported: hover right away so nothing can be swapped under it this tick.
      b.state = 'hovering';
      b.timer = hoverTicks;
    }
    if (infos) infos.push({ id: b.id, color: b.color, row: r, col: c });
  }
  s.height--;
  sim.matchScanPending = true;
  if (s.height > 0) {
    s.state = 'idle';
    s.timer = 0;
    s.convertTicks = 0;
    s.fall = 0;
    s.chain = false;
    syncSlab(sim, s);
  }
  if (events && infos) {
    events.push({ type: 'garbageConverted', slabId: s.id, blocks: infos, remaining: s.height });
  }
  return s.height === 0;
}

/**
 * Per-tick garbage bookkeeping (step phase 2b, after match groups): landing and
 * conversion timers, then queue delays and dropping the front entry.
 */
export function updateGarbage(sim: SimState, events: SimEvent[] | null): void {
  const list = sim.garbage;
  if (list.length > 0) {
    let kept = 0;
    for (let k = 0; k < list.length; k++) {
      const s = list[k] as GarbageSlab;
      let gone = false;
      if (s.state === 'landing') {
        if (--s.timer <= 0) {
          s.timer = 0;
          s.state = 'idle';
          syncSlab(sim, s);
        }
      } else if (s.state === 'converting') {
        if (--s.timer <= 0) gone = convertBottomRow(sim, s, events);
      }
      if (!gone) list[kept++] = s;
    }
    list.length = kept;
  }
  const queue = sim.garbageQueue;
  if (queue.length === 0) return;
  for (let k = 0; k < queue.length; k++) {
    const q = queue[k] as QueuedGarbage;
    if (q.delay > 0) q.delay--;
  }
  const front = queue[0] as QueuedGarbage;
  if (front.delay > 0 || sim.chain > 1 || sim.groups.length > 0) return;
  dropGarbage(sim, front, events);
}

function dropGarbage(sim: SimState, q: QueuedGarbage, events: SimEvent[] | null): void {
  const { rows, cols } = sim.config;
  const cells = sim.cells;
  const width = Math.min(q.width, cols);
  const col = width >= cols ? 0 : sim.garbageDrops % 2 === 0 ? cols - width : 0;
  let free = 0;
  outer: for (; free < rows; free++) {
    for (let c = col; c < col + width; c++) if (cells[free * cols + c]) break outer;
  }
  if (free === 0) return;
  const height = Math.min(q.height, free);
  const slab = addSlab(sim, 0, col, width, height);
  slab.state = 'falling';
  syncSlab(sim, slab);
  q.height -= height;
  if (q.height <= 0) {
    sim.garbageQueue.shift();
    sim.garbageDrops++;
  }
  if (events) {
    events.push({
      type: 'garbageDropped',
      slabId: slab.id,
      queueId: q.id,
      row: 0,
      col,
      width,
      height,
    });
  }
}
