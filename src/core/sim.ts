import {
  emptyCells,
  generateInitialBoard,
  generatePreviewRow,
  inBounds,
  pushRow,
  topRowOccupied,
  topRowResting,
} from './board';
import {
  RISE_SCALE,
  SUBUNITS_PER_CELL,
  makeConfig,
  riseSpeedForLevel,
  stopTicksFor,
  type SimConfig,
} from './config';
import { applyGravity, type GravityResult } from './gravity';
import { findMatches } from './match';
import { createRng, type Seed } from './rng';
import { scoreClear, type ScoreModifier } from './scoring';
import type {
  Block,
  CellRef,
  MatchGroup,
  MatchedBlockInfo,
  SimEvent,
  SimInput,
  SimMode,
  SimModifiers,
  SimState,
  SwapRejectReason,
} from './types';

/** Per-mode rule switches. */
export interface ModeRules {
  /** Stack rises (auto + manual), danger/top-out apply. */
  rise: boolean;
  /** Level increases over time / clears. */
  levels: boolean;
}

export const MODE_RULES: Readonly<Record<SimMode, ModeRules>> = Object.freeze({
  endless: { rise: true, levels: true },
  static: { rise: false, levels: false },
});

/** Context of the `stopTicks` hook. */
export interface StopTimeContext {
  readonly sim: Readonly<SimState>;
  /** Blocks in the group that earned the stop time. */
  readonly combo: number;
  /** Chain level of that group (1 = no chain). */
  readonly chain: number;
}

/** Context of the `onClear` hook (called when a group leaves the board). */
export interface ClearContext {
  /** The sim may be mutated (e.g. `sim.modifiers`, score) – deterministically. */
  readonly sim: SimState;
  readonly group: Readonly<MatchGroup>;
  /** Color of every cleared block, in pop order. */
  readonly colors: readonly number[];
}

/**
 * Behaviour hooks kept outside the (plain-data) state. Pass the same hooks to
 * every step (and to replay) to stay deterministic. Hooks must not step the same sim.
 */
export interface SimHooks {
  /** Extra score modifiers appended after the built-in pipeline (relics…). */
  scoreModifiers?: readonly ScoreModifier[];
  /** Adjust the stop time earned by a match (`base` from `stopTicksFor`). Result is floored, ≥ 0. */
  stopTicks?: (base: number, ctx: StopTimeContext) => number;
  /** Called when a match group has fully popped and is removed from the board. */
  onClear?: (ctx: ClearContext) => void;
  /** Adjust the auto-rise speed (1/RISE_SCALE sub-units per tick). Result is floored, ≥ 0. */
  riseSpeed?: (base: number, sim: Readonly<SimState>) => number;
}

export interface CreateSimOptions {
  /** Initial run modifiers (copied). */
  modifiers?: SimModifiers;
}

const NO_HOOKS: SimHooks = Object.freeze({});
/** Returned by `step` in silent mode. */
const NO_EVENTS: SimEvent[] = Object.freeze([]) as unknown as SimEvent[];

export function createSim(
  seed: Seed,
  config: Partial<SimConfig> = {},
  mode: SimMode = 'endless',
  options: CreateSimOptions = {},
): SimState {
  const cfg = Object.freeze(makeConfig(config));
  const sim: SimState = {
    seed,
    mode,
    config: cfg,
    modifiers: { ...options.modifiers },
    tick: 0,
    rng: createRng(seed),
    cells: emptyCells(cfg.rows, cfg.cols),
    preview: [],
    nextBlockId: 1,
    nextGroupId: 1,
    groups: [],
    riseOffset: 0,
    riseAccum: 0,
    stopTicks: 0,
    raiseHeld: false,
    manualRaising: false,
    grace: cfg.graceTicks,
    graceClearTicks: 0,
    danger: false,
    chain: 1,
    score: 0,
    level: cfg.startLevel,
    stats: { swaps: 0, matches: 0, blocksCleared: 0, maxCombo: 0, maxChain: 1, rowsRisen: 0 },
    gameOver: false,
    matchScanPending: true,
  };
  generateInitialBoard(sim);
  sim.preview = generatePreviewRow(sim);
  return sim;
}

function cloneBlock(b: Block): Block {
  return {
    id: b.id,
    kind: b.kind,
    color: b.color,
    state: b.state,
    timer: b.timer,
    fall: b.fall,
    swapDir: b.swapDir,
    chain: b.chain,
    group: b.group,
    popIndex: b.popIndex,
  };
}

/**
 * Deep copy for AI lookahead / snapshots. Hand-written (≈10× faster than
 * structuredClone); the frozen `config` is shared by reference.
 */
export function cloneSim(sim: SimState): SimState {
  const src = sim.cells;
  const cells = new Array<Block | null>(src.length);
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    cells[i] = b ? cloneBlock(b) : null;
  }
  const groups: MatchGroup[] = [];
  for (const g of sim.groups) {
    groups.push({ id: g.id, size: g.size, age: g.age, chain: g.chain, cells: g.cells.slice() });
  }
  const { rng, stats } = sim;
  return {
    seed: sim.seed,
    mode: sim.mode,
    config: sim.config,
    modifiers: { ...sim.modifiers },
    tick: sim.tick,
    rng: { a: rng.a, b: rng.b, c: rng.c, d: rng.d },
    cells,
    preview: sim.preview.map(cloneBlock),
    nextBlockId: sim.nextBlockId,
    nextGroupId: sim.nextGroupId,
    groups,
    riseOffset: sim.riseOffset,
    riseAccum: sim.riseAccum,
    stopTicks: sim.stopTicks,
    raiseHeld: sim.raiseHeld,
    manualRaising: sim.manualRaising,
    grace: sim.grace,
    graceClearTicks: sim.graceClearTicks,
    danger: sim.danger,
    chain: sim.chain,
    score: sim.score,
    level: sim.level,
    stats: {
      swaps: stats.swaps,
      matches: stats.matches,
      blocksCleared: stats.blocksCleared,
      maxCombo: stats.maxCombo,
      maxChain: stats.maxChain,
      rowsRisen: stats.rowsRisen,
    },
    gameOver: sim.gameOver,
    matchScanPending: sim.matchScanPending,
  };
}

/** Scratch list of blocks whose swap ended this tick (reused unless step re-enters). */
const SWAP_ENDED: Block[] = [];
const GRAVITY: GravityResult = { landed: false };
let depth = 0;

/**
 * Advance exactly one tick. Order within a tick:
 * 1. swap/landing timers  2. match groups (flash → pop → clear)  3. inputs
 * 4. gravity  5. match detection + scoring  6. chain bookkeeping
 * 7. rise / stop time / danger  8. level
 *
 * Events: by default a fresh array is returned. Pass an array as `events` to
 * collect into it (it is returned), or `null` for silent mode (AI rollouts):
 * no event objects are built and an empty frozen array is returned.
 */
export function step(
  sim: SimState,
  inputs: readonly SimInput[] = [],
  hooks: SimHooks = NO_HOOKS,
  events?: SimEvent[] | null,
): SimEvent[] {
  const out = events === undefined ? [] : events;
  if (sim.gameOver) return out ?? NO_EVENTS;
  const ended = depth === 0 ? SWAP_ENDED : [];
  const gravity = depth === 0 ? GRAVITY : { landed: false };
  depth++;
  try {
    ended.length = 0;
    sim.tick++;
    updateTimers(sim, ended);
    updateGroups(sim, out, hooks);
    for (const input of inputs) applyInput(sim, input, out);
    applyGravity(sim, out, gravity);
    if (sim.matchScanPending || ended.length > 0 || gravity.landed) {
      sim.matchScanPending = false;
      detectMatches(sim, ended, out, hooks);
    }
    updateChain(sim, out);
    const rules = MODE_RULES[sim.mode];
    if (rules.rise) updateRise(sim, out, hooks);
    if (rules.levels) updateLevel(sim, out);
  } finally {
    ended.length = 0;
    depth--;
  }
  return out ?? NO_EVENTS;
}

/**
 * Can the player swap (row, col) with (row, col + 1) right now?
 * Panel de Pon rules: both cells must be empty or resting (not both empty), and
 * neither cell directly above may hold a hovering block (no "catching") or a
 * block that is part-way through falling into the cell.
 */
export function canSwap(sim: SimState, row: number, col: number): SwapRejectReason | null {
  if (sim.gameOver) return 'gameOver';
  if (!inBounds(sim, row, col) || !inBounds(sim, row, col + 1)) return 'outOfBounds';
  const { cols } = sim.config;
  const i = row * cols + col;
  const a = sim.cells[i] ?? null;
  const b = sim.cells[i + 1] ?? null;
  if (!a && !b) return 'empty';
  if (!isSwappable(a) || !isSwappable(b)) return 'locked';
  if (swapLockedByModifiers(sim, col)) return 'locked';
  if (
    row > 0 &&
    (blocksSwapBelow(sim.cells[i - cols]) || blocksSwapBelow(sim.cells[i - cols + 1]))
  ) {
    return 'locked';
  }
  return null;
}

/**
 * Reserved `sim.modifiers` keys read by the engine itself (run curses / charms).
 * Absent keys have no effect.
 */
export const MOD_SWAP_LOCK_UNTIL = 'swapLockUntil';
/** Bit mask of columns (bit c = column c) whose cells cannot take part in a swap. */
export const MOD_LOCKED_COLUMNS = 'lockedColumns';

/** Swaps are locked while `sim.tick < modifiers.swapLockUntil`, or when touching a locked column. */
function swapLockedByModifiers(sim: SimState, col: number): boolean {
  const mods = sim.modifiers;
  const until = mods[MOD_SWAP_LOCK_UNTIL];
  if (until !== undefined && sim.tick < until) return true;
  const mask = mods[MOD_LOCKED_COLUMNS];
  return mask !== undefined && ((mask >>> col) & 3) !== 0;
}

function blocksSwapBelow(above: Block | null | undefined): boolean {
  if (!above) return false;
  return above.state === 'hovering' || (above.state === 'falling' && above.fall > 0);
}

/** Empty cells and resting blocks (idle/landing) can be swapped. */
export function isSwappable(block: Block | null): boolean {
  return block === null || block.state === 'idle' || block.state === 'landing';
}

/** Total rise progress in rows [0, 1) — for smooth rendering. */
export function riseFraction(sim: SimState): number {
  return (sim.riseOffset * RISE_SCALE + sim.riseAccum) / (SUBUNITS_PER_CELL * RISE_SCALE);
}

function applyInput(sim: SimState, input: SimInput, events: SimEvent[] | null): void {
  if (input.type === 'raise') {
    // Tracks the control; a press only latches a manual raise once no group is
    // clearing (see updateRise), so a tap during a clear is ignored.
    sim.raiseHeld = input.active;
    return;
  }
  const { row, col } = input;
  const reason = canSwap(sim, row, col);
  if (reason) {
    if (events) events.push({ type: 'swapRejected', row, col, reason });
    return;
  }
  const i = row * sim.config.cols + col;
  const a = sim.cells[i] ?? null;
  const b = sim.cells[i + 1] ?? null;
  sim.cells[i] = b;
  sim.cells[i + 1] = a;
  const { swapTicks } = sim.config;
  if (a) {
    a.state = 'swapping';
    a.timer = swapTicks;
    a.swapDir = 1;
  }
  if (b) {
    b.state = 'swapping';
    b.timer = swapTicks;
    b.swapDir = -1;
  }
  sim.stats.swaps++;
  if (events) {
    events.push({ type: 'swapped', row, col, leftId: b?.id ?? null, rightId: a?.id ?? null });
  }
}

function updateTimers(sim: SimState, ended: Block[]): void {
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const b = cells[i];
    if (!b || (b.state !== 'swapping' && b.state !== 'landing')) continue;
    b.timer--;
    if (b.timer > 0) continue;
    b.timer = 0;
    if (b.state === 'swapping') {
      b.swapDir = 0;
      ended.push(b);
    }
    b.state = 'idle';
  }
}

function updateGroups(sim: SimState, events: SimEvent[] | null, hooks: SimHooks): void {
  const groups = sim.groups;
  if (groups.length === 0) return;
  const { flashTicks, popTicksPerBlock, cols } = sim.config;
  const cells = sim.cells;
  let kept = 0;
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g] as MatchGroup;
    group.age++;
    const age = group.age;
    if (age >= flashTicks) {
      const members = group.cells;
      for (let k = 0; k < members.length; k++) {
        const index = members[k] as number;
        const block = cells[index] as Block;
        if (block.state === 'matched') block.state = 'popping';
        if (block.state === 'popping' && age >= flashTicks + block.popIndex * popTicksPerBlock) {
          block.state = 'popped';
          if (events) {
            events.push({
              type: 'popped',
              groupId: group.id,
              id: block.id,
              row: Math.floor(index / cols),
              col: index % cols,
              color: block.color,
              index: block.popIndex,
              size: group.size,
              chain: group.chain,
            });
          }
        }
      }
    }
    if (age >= flashTicks + group.size * popTicksPerBlock) {
      clearGroup(sim, group, events, hooks);
    } else {
      groups[kept++] = group;
    }
  }
  groups.length = kept;
}

/**
 * Remove a fully popped group. Every block stacked directly above a cleared
 * cell gets the chain flag and starts hovering right away (so it can never be
 * swapped under in the same tick). A swapping block in that column takes the
 * flag too and passes it on when its swap ends (Panel Attack propagatesChaining).
 */
function clearGroup(
  sim: SimState,
  group: MatchGroup,
  events: SimEvent[] | null,
  hooks: SimHooks,
): void {
  const { cols, hoverTicks } = sim.config;
  const cells = sim.cells;
  const members = group.cells;
  const colors = hooks.onClear ? members.map((i) => (cells[i] as Block).color) : null;
  for (let k = 0; k < members.length; k++) cells[members[k] as number] = null;
  for (let k = 0; k < members.length; k++) {
    const index = members[k] as number;
    for (let i = index - cols; i >= 0; i -= cols) {
      const above = cells[i];
      if (!above || above.group !== 0) break;
      above.chain = true;
      if (above.state === 'swapping') break;
      if (above.state === 'idle' || above.state === 'landing') {
        above.state = 'hovering';
        above.timer = hoverTicks;
      }
    }
  }
  if (events) {
    const refs: CellRef[] = members.map((i) => ({ row: Math.floor(i / cols), col: i % cols }));
    events.push({ type: 'cleared', groupId: group.id, cells: refs });
  }
  if (hooks.onClear && colors) hooks.onClear({ sim, group, colors });
}

function detectMatches(
  sim: SimState,
  ended: readonly Block[],
  events: SimEvent[] | null,
  hooks: SimHooks,
): void {
  const indices = findMatches(sim, ended);
  if (indices.length === 0) return;
  const cfg = sim.config;
  const cells = sim.cells;
  let isChain = false;
  for (let k = 0; k < indices.length; k++) {
    if ((cells[indices[k] as number] as Block).chain) isChain = true;
  }
  if (isChain) sim.chain++;
  const chain = isChain ? sim.chain : 1;
  const combo = indices.length;
  const group: MatchGroup = { id: sim.nextGroupId++, size: combo, age: 0, chain, cells: indices };
  const colors: number[] = [];
  for (let k = 0; k < indices.length; k++) {
    const block = cells[indices[k] as number] as Block;
    block.state = 'matched';
    block.group = group.id;
    block.popIndex = k;
    block.timer = 0;
    block.fall = 0;
    block.swapDir = 0;
    colors.push(block.color);
  }
  sim.groups.push(group);

  const base = stopTicksFor(cfg, combo, chain);
  const stop = hooks.stopTicks
    ? Math.max(0, Math.floor(hooks.stopTicks(base, { sim, combo, chain })))
    : base;
  if (stop > sim.stopTicks) sim.stopTicks = stop;

  const stats = sim.stats;
  stats.matches++;
  stats.blocksCleared += combo;
  if (combo > stats.maxCombo) stats.maxCombo = combo;
  if (sim.chain > stats.maxChain) stats.maxChain = sim.chain;

  const breakdown = scoreClear(
    { blocks: combo, combo, chain, level: sim.level, colors },
    cfg,
    hooks.scoreModifiers,
    sim,
  );
  sim.score += breakdown.total;
  if (!events) return;
  const blocks: MatchedBlockInfo[] = indices.map((i, k) => ({
    id: (cells[i] as Block).id,
    color: colors[k] as number,
    row: Math.floor(i / cfg.cols),
    col: i % cfg.cols,
  }));
  events.push({ type: 'matched', groupId: group.id, blocks, combo, chain, stopTicks: stop });
  events.push({ type: 'scored', groupId: group.id, breakdown, score: sim.score });
}

/**
 * Resting blocks that did not match lose their chain flag. The chain ends when
 * no group is clearing and no chain-flagged block is left (hovering, falling, or
 * swapping and still propagating the flag).
 */
function updateChain(sim: SimState, events: SimEvent[] | null): void {
  let flagged = false;
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const b = cells[i];
    if (!b || !b.chain) continue;
    if (b.state === 'idle' || b.state === 'landing') b.chain = false;
    else flagged = true;
  }
  if (sim.chain > 1 && !flagged && sim.groups.length === 0) {
    if (events) events.push({ type: 'chainEnd', length: sim.chain });
    sim.chain = 1;
  }
}

function setDanger(sim: SimState, active: boolean, events: SimEvent[] | null): void {
  if (sim.danger === active) return;
  sim.danger = active;
  if (events) events.push({ type: 'danger', active, grace: sim.grace });
}

function updateRise(sim: SimState, events: SimEvent[] | null, hooks: SimHooks): void {
  const cfg = sim.config;
  const resting = topRowResting(sim);
  if (resting) {
    sim.graceClearTicks = 0;
  } else {
    if (sim.grace < cfg.graceTicks && ++sim.graceClearTicks >= cfg.graceRefillTicks) {
      sim.grace = cfg.graceTicks;
      sim.graceClearTicks = 0;
    }
    setDanger(sim, false, events);
  }
  // Clearing blocks freeze the stack entirely; raise presses are not latched meanwhile.
  if (sim.groups.length > 0) return;
  if (sim.raiseHeld) sim.manualRaising = true;
  const pinned = topRowOccupied(sim);
  // A raise only cancels stop time when the stack can actually rise.
  if (pinned) sim.manualRaising = false;
  else if (sim.manualRaising) sim.stopTicks = 0;
  if (sim.stopTicks > 0) {
    sim.stopTicks--;
    return;
  }
  if (pinned) {
    sim.riseAccum = 0;
    if (!resting) return;
    setDanger(sim, true, events);
    sim.grace--;
    if (sim.grace <= 0) {
      sim.grace = 0;
      sim.gameOver = true;
      if (events) events.push({ type: 'gameOver', tick: sim.tick, score: sim.score });
    }
    return;
  }
  let speed: number;
  if (sim.manualRaising) {
    speed = cfg.manualRaiseSpeed;
  } else {
    speed = riseSpeedForLevel(cfg, sim.level);
    if (hooks.riseSpeed) speed = Math.max(0, Math.floor(hooks.riseSpeed(speed, sim)));
  }
  sim.riseAccum += speed;
  while (sim.riseAccum >= RISE_SCALE) {
    sim.riseAccum -= RISE_SCALE;
    sim.riseOffset++;
    if (sim.riseOffset < SUBUNITS_PER_CELL) continue;
    sim.riseOffset = 0;
    pushRow(sim);
    sim.stats.rowsRisen++;
    if (events) events.push({ type: 'rowRisen', previewIds: sim.preview.map((b) => b.id) });
    if (!sim.raiseHeld) sim.manualRaising = false;
    if (topRowOccupied(sim) || !sim.manualRaising) {
      sim.riseAccum = 0;
      break;
    }
  }
}

function updateLevel(sim: SimState, events: SimEvent[] | null): void {
  const cfg = sim.config;
  let level = cfg.startLevel;
  if (cfg.levelUpTicks > 0) level += Math.floor(sim.tick / cfg.levelUpTicks);
  if (cfg.levelUpBlocks > 0) level += Math.floor(sim.stats.blocksCleared / cfg.levelUpBlocks);
  level = Math.min(cfg.maxLevel, level);
  if (level > sim.level) {
    sim.level = level;
    if (events) events.push({ type: 'levelUp', level });
  }
}
