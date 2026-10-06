import {
  cellAt,
  emptyCells,
  forEachBlock,
  generateInitialBoard,
  generatePreviewRow,
  inBounds,
  pushRow,
  setCell,
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
import { applyGravity } from './gravity';
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

/**
 * Behaviour hooks kept outside the (plain-data) state. Pass the same hooks to
 * every step (and to replay) to stay deterministic.
 */
export interface SimHooks {
  /** Extra score modifiers appended after the built-in pipeline (relics…). */
  scoreModifiers?: readonly ScoreModifier[];
}

export function createSim(
  seed: Seed,
  config: Partial<SimConfig> = {},
  mode: SimMode = 'endless',
): SimState {
  const cfg = makeConfig(config);
  const sim: SimState = {
    seed,
    mode,
    config: cfg,
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
    danger: false,
    chain: 1,
    score: 0,
    level: cfg.startLevel,
    stats: { swaps: 0, matches: 0, blocksCleared: 0, maxCombo: 0, maxChain: 1, rowsRisen: 0 },
    gameOver: false,
  };
  generateInitialBoard(sim);
  sim.preview = generatePreviewRow(sim);
  return sim;
}

/** Deep copy (plain data). Use for AI lookahead / snapshots. */
export function cloneSim(sim: SimState): SimState {
  return structuredClone(sim);
}

/**
 * Advance exactly one tick. Order within a tick:
 * 1. swap/landing timers  2. match groups (flash → pop → clear)  3. inputs
 * 4. gravity  5. match detection + scoring  6. chain bookkeeping
 * 7. rise / stop time / danger  8. level
 */
export function step(
  sim: SimState,
  inputs: readonly SimInput[] = [],
  hooks: SimHooks = {},
): SimEvent[] {
  const events: SimEvent[] = [];
  if (sim.gameOver) return events;
  sim.tick++;
  updateTimers(sim);
  updateGroups(sim, events);
  for (const input of inputs) applyInput(sim, input, events);
  applyGravity(sim, events);
  detectMatches(sim, events, hooks);
  updateChain(sim, events);
  if (MODE_RULES[sim.mode].rise) updateRise(sim, events);
  if (MODE_RULES[sim.mode].levels) updateLevel(sim, events);
  return events;
}

/** Can the player swap (row, col) with (row, col + 1) right now? */
export function canSwap(sim: SimState, row: number, col: number): SwapRejectReason | null {
  if (sim.gameOver) return 'gameOver';
  if (!inBounds(sim, row, col) || !inBounds(sim, row, col + 1)) return 'outOfBounds';
  const a = cellAt(sim, row, col);
  const b = cellAt(sim, row, col + 1);
  if (!a && !b) return 'empty';
  if (!isSwappable(a) || !isSwappable(b)) return 'locked';
  return null;
}

/** Empty cells and resting blocks (idle/landing) can be swapped. */
export function isSwappable(block: Block | null): boolean {
  return block === null || block.state === 'idle' || block.state === 'landing';
}

/** Total rise progress in rows [0, 1) — for smooth rendering. */
export function riseFraction(sim: SimState): number {
  return (sim.riseOffset * RISE_SCALE + sim.riseAccum) / (SUBUNITS_PER_CELL * RISE_SCALE);
}

function applyInput(sim: SimState, input: SimInput, events: SimEvent[]): void {
  if (input.type === 'raise') {
    sim.raiseHeld = input.active;
    return;
  }
  const { row, col } = input;
  const reason = canSwap(sim, row, col);
  if (reason) {
    events.push({ type: 'swapRejected', row, col, reason });
    return;
  }
  const a = cellAt(sim, row, col);
  const b = cellAt(sim, row, col + 1);
  setCell(sim, row, col, b);
  setCell(sim, row, col + 1, a);
  for (const [block, dir] of [
    [a, 1],
    [b, -1],
  ] as const) {
    if (!block) continue;
    block.state = 'swapping';
    block.timer = sim.config.swapTicks;
    block.swapDir = dir;
  }
  sim.stats.swaps++;
  events.push({ type: 'swapped', row, col, leftId: b?.id ?? null, rightId: a?.id ?? null });
}

function updateTimers(sim: SimState): void {
  forEachBlock(sim, (b) => {
    if (b.state !== 'swapping' && b.state !== 'landing') return;
    b.timer--;
    if (b.timer > 0) return;
    b.timer = 0;
    b.swapDir = 0;
    b.state = 'idle';
  });
}

interface Located {
  block: Block;
  row: number;
  col: number;
}

function updateGroups(sim: SimState, events: SimEvent[]): void {
  if (sim.groups.length === 0) return;
  const { flashTicks, popTicksPerBlock } = sim.config;
  const members = new Map<number, Located[]>();
  forEachBlock(sim, (block, row, col) => {
    if (block.group === 0) return;
    let list = members.get(block.group);
    if (!list) members.set(block.group, (list = []));
    list.push({ block, row, col });
  });

  const remaining: MatchGroup[] = [];
  for (const group of sim.groups) {
    group.age++;
    const list = members.get(group.id) ?? [];
    for (const { block, row, col } of list) {
      if (block.state === 'matched' && group.age >= flashTicks) block.state = 'popping';
      if (
        block.state === 'popping' &&
        group.age >= flashTicks + block.popIndex * popTicksPerBlock
      ) {
        block.state = 'popped';
        events.push({
          type: 'popped',
          groupId: group.id,
          id: block.id,
          row,
          col,
          color: block.color,
          index: block.popIndex,
          size: group.size,
          chain: group.chain,
        });
      }
    }
    if (group.age >= flashTicks + group.size * popTicksPerBlock) {
      clearGroup(sim, group, list, events);
    } else {
      remaining.push(group);
    }
  }
  sim.groups = remaining;
}

/** Remove a fully popped group; blocks stacked above it get the chain flag. */
function clearGroup(sim: SimState, group: MatchGroup, list: Located[], events: SimEvent[]): void {
  const cells: CellRef[] = [];
  for (const { row, col } of list) {
    setCell(sim, row, col, null);
    cells.push({ row, col });
  }
  for (const { row, col } of list) {
    for (let r = row - 1; r >= 0; r--) {
      const above = cellAt(sim, r, col);
      if (!above || above.group !== 0 || above.state === 'swapping') break;
      above.chain = true;
    }
  }
  events.push({ type: 'cleared', groupId: group.id, cells });
}

function detectMatches(sim: SimState, events: SimEvent[], hooks: SimHooks): void {
  const indices = findMatches(sim);
  if (indices.length === 0) return;
  const { cols } = sim.config;
  const blocks: MatchedBlockInfo[] = [];
  let isChain = false;
  const matched: Block[] = [];
  for (const i of indices) {
    const block = sim.cells[i] as Block;
    matched.push(block);
    if (block.chain) isChain = true;
    blocks.push({ id: block.id, color: block.color, row: Math.floor(i / cols), col: i % cols });
  }
  if (isChain) sim.chain++;
  const chain = isChain ? sim.chain : 1;
  const combo = matched.length;
  const group: MatchGroup = { id: sim.nextGroupId++, size: combo, age: 0, chain };
  matched.forEach((block, index) => {
    block.state = 'matched';
    block.group = group.id;
    block.popIndex = index;
    block.timer = 0;
    block.swapDir = 0;
  });
  sim.groups.push(group);

  const stop = stopTicksFor(sim.config, combo, chain);
  if (stop > sim.stopTicks) sim.stopTicks = stop;

  sim.stats.matches++;
  sim.stats.blocksCleared += combo;
  sim.stats.maxCombo = Math.max(sim.stats.maxCombo, combo);
  sim.stats.maxChain = Math.max(sim.stats.maxChain, sim.chain);
  events.push({ type: 'matched', groupId: group.id, blocks, combo, chain, stopTicks: stop });

  const breakdown = scoreClear(
    { blocks: combo, combo, chain, level: sim.level, colors: matched.map((b) => b.color) },
    sim.config,
    hooks.scoreModifiers,
  );
  sim.score += breakdown.total;
  events.push({ type: 'scored', groupId: group.id, breakdown, score: sim.score });
}

/**
 * Resting blocks that did not match lose their chain flag. The chain ends when
 * no group is clearing and no chain-flagged block is left (hovering/falling).
 */
function updateChain(sim: SimState, events: SimEvent[]): void {
  let flagged = false;
  forEachBlock(sim, (b) => {
    if (!b.chain) return;
    if (b.state === 'idle' || b.state === 'landing' || b.state === 'swapping') b.chain = false;
    else flagged = true;
  });
  if (sim.chain > 1 && !flagged && sim.groups.length === 0) {
    events.push({ type: 'chainEnd', length: sim.chain });
    sim.chain = 1;
  }
}

function setDanger(sim: SimState, active: boolean, events: SimEvent[]): void {
  if (sim.danger === active) return;
  sim.danger = active;
  events.push({ type: 'danger', active, grace: sim.grace });
}

function updateRise(sim: SimState, events: SimEvent[]): void {
  const cfg = sim.config;
  if (!topRowResting(sim)) {
    sim.grace = cfg.graceTicks;
    setDanger(sim, false, events);
  }
  if (sim.raiseHeld) sim.manualRaising = true;
  // Clearing blocks freeze the stack (and manual raise) entirely.
  if (sim.groups.length > 0) return;
  if (sim.manualRaising) sim.stopTicks = 0;
  if (sim.stopTicks > 0) {
    sim.stopTicks--;
    return;
  }
  if (topRowOccupied(sim)) {
    sim.manualRaising = false;
    sim.riseAccum = 0;
    if (!topRowResting(sim)) return;
    setDanger(sim, true, events);
    sim.grace--;
    if (sim.grace <= 0) {
      sim.grace = 0;
      sim.gameOver = true;
      events.push({ type: 'gameOver', tick: sim.tick, score: sim.score });
    }
    return;
  }
  sim.riseAccum += sim.manualRaising ? cfg.manualRaiseSpeed : riseSpeedForLevel(cfg, sim.level);
  while (sim.riseAccum >= RISE_SCALE) {
    sim.riseAccum -= RISE_SCALE;
    sim.riseOffset++;
    if (sim.riseOffset < SUBUNITS_PER_CELL) continue;
    sim.riseOffset = 0;
    pushRow(sim);
    sim.stats.rowsRisen++;
    events.push({ type: 'rowRisen', previewIds: sim.preview.map((b) => b.id) });
    if (!sim.raiseHeld) sim.manualRaising = false;
    if (topRowOccupied(sim) || !sim.manualRaising) {
      sim.riseAccum = 0;
      break;
    }
  }
}

function updateLevel(sim: SimState, events: SimEvent[]): void {
  const cfg = sim.config;
  let level = cfg.startLevel;
  if (cfg.levelUpTicks > 0) level += Math.floor(sim.tick / cfg.levelUpTicks);
  if (cfg.levelUpBlocks > 0) level += Math.floor(sim.stats.blocksCleared / cfg.levelUpBlocks);
  level = Math.min(cfg.maxLevel, level);
  if (level > sim.level) {
    sim.level = level;
    events.push({ type: 'levelUp', level });
  }
}
