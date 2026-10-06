import { canSwap, step } from '../../../../src/core/sim';
import { findMatchingSwap } from '../../../e2e/support/solver';
import type { SimInput, SimState } from '../../../../src/core/types';
import {
  buyCharm,
  buyRelic,
  completeStage,
  createStageSim,
  evaluateStage,
  getCharm,
  getRelic,
  leaveShop,
  runEconomy,
  stageConfig,
  stageResult,
  topRow,
  useCharm,
  type RunState,
  type StageGoal,
  type StageResult,
  type StageRewards,
} from '../../../../src/core/run';

/**
 * Test bot: greedy on a simplified color-grid model (instant gravity + cascades), with a
 * 2-ply lookahead when no single swap clears anything. Acts only on a quiet board.
 */

const EMPTY = -1;
const OTHER = -5; // wild / bomb / non-normal: never matches in the model

interface Eval {
  cleared: number;
  chain: number;
  score: number;
}

function gridOf(sim: SimState): Int8Array {
  const g = new Int8Array(sim.cells.length);
  sim.cells.forEach((b, i) => {
    g[i] = b ? (b.kind === 'normal' ? b.color : OTHER) : EMPTY;
  });
  return g;
}

function drop(g: Int8Array, rows: number, cols: number): void {
  for (let c = 0; c < cols; c++) {
    let w = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const v = g[r * cols + c] as number;
      if (v !== EMPTY) {
        g[r * cols + c] = EMPTY;
        g[w * cols + c] = v;
        w--;
      }
    }
  }
}

const marks = new Uint8Array(256);
function mark(g: Int8Array, rows: number, cols: number): number {
  marks.fill(0);
  let n = 0;
  const run = (start: number, stride: number, len: number) => {
    let s = 0;
    for (let i = 1; i <= len; i++) {
      const prev = g[start + (i - 1) * stride] as number;
      const cur = i < len ? (g[start + i * stride] as number) : -99;
      if (cur === prev && prev >= 0) continue;
      if (prev >= 0 && i - s >= 3) for (let m = s; m < i; m++) marks[start + m * stride] = 1;
      s = i;
    }
  };
  for (let r = 0; r < rows; r++) run(r * cols, 1, cols);
  for (let c = 0; c < cols; c++) run(c, cols, rows);
  for (let i = 0; i < rows * cols; i++) {
    if (marks[i]) {
      g[i] = EMPTY;
      n++;
    }
  }
  return n;
}

function resolve(g: Int8Array, rows: number, cols: number): Eval {
  let cleared = 0;
  let chain = 0;
  let score = 0;
  for (;;) {
    drop(g, rows, cols);
    const n = mark(g, rows, cols);
    if (n === 0) break;
    chain++;
    cleared += n;
    const comboBonus = n >= 4 ? (10 * (n - 3) * (n - 2)) / 2 : 0;
    score += (10 * n + comboBonus) * chain;
  }
  return { cleared, chain, score };
}

function swapGrid(g: Int8Array, i: number): void {
  const t = g[i] as number;
  g[i] = g[i + 1] as number;
  g[i + 1] = t;
}

function maxHeight(g: Int8Array, rows: number, cols: number): number {
  for (let i = 0; i < rows * cols; i++) if (g[i] !== EMPTY) return rows - Math.floor(i / cols);
  return 0;
}

export interface BotOptions {
  /** Hold raise while the stack is lower than this many rows. */
  raiseBelow: number;
  /** Use 2-ply lookahead. */
  lookahead: boolean;
  /** Minimum ticks between two swaps (0 = superhuman; ~30 ≈ a quick human). */
  cooldown?: number;
}

export function isQuiet(sim: SimState): boolean {
  if (sim.groups.length > 0) return false;
  for (const b of sim.cells) if (b && b.state !== 'idle' && b.state !== 'landing') return false;
  return true;
}

/** Best swap on a quiet board, or null (`clears`: the swap itself makes a match in the model). */
export function bestSwap(
  sim: SimState,
  opts: BotOptions,
): { row: number; col: number; clears: boolean } | null {
  const { rows, cols } = sim.config;
  const base = gridOf(sim);
  const h0 = maxHeight(base, rows, cols);
  let best: { row: number; col: number; clears: boolean } | null = null;
  let bestValue = 0;
  const work = new Int8Array(base.length);
  const work2 = new Int8Array(base.length);
  const candidates: { row: number; col: number; grid: Int8Array }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      if (base[i] === base[i + 1]) continue;
      if (canSwap(sim, r, c) !== null) continue;
      work.set(base);
      swapGrid(work, i);
      const e = resolve(work, rows, cols);
      const h = maxHeight(work, rows, cols);
      const value = e.score + e.cleared * 2 + (h0 - h) * (h0 >= rows - 3 ? 40 : 3);
      if (value > bestValue) {
        bestValue = value;
        best = { row: r, col: c, clears: e.cleared > 0 };
      }
      if (e.cleared === 0) candidates.push({ row: r, col: c, grid: work.slice() });
    }
  }
  if (best && bestValue >= 30) return best;
  if (!opts.lookahead) return best;
  // 2-ply: a setup swap followed by the best clearing swap.
  for (const cand of candidates) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i = r * cols + c;
        if (cand.grid[i] === cand.grid[i + 1]) continue;
        work2.set(cand.grid);
        swapGrid(work2, i);
        const e = resolve(work2, rows, cols);
        if (e.cleared === 0) continue;
        const value = (e.score + e.cleared * 2) * 0.5 + (e.chain >= 2 ? 40 : 0);
        if (value > bestValue) {
          bestValue = value;
          best = { row: cand.row, col: cand.col, clears: false };
        }
      }
    }
  }
  return best;
}

/** Inputs for this tick. */
export interface BotMemory {
  held: boolean;
  lastMove: number;
}

export function botInputs(sim: SimState, opts: BotOptions, raising: BotMemory): SimInput[] {
  const inputs: SimInput[] = [];
  const { rows } = sim.config;
  const height = rows - topRow(sim);
  const wantRaise = height < opts.raiseBelow && sim.groups.length === 0;
  if (wantRaise !== raising.held) {
    raising.held = wantRaise;
    inputs.push({ type: 'raise', active: wantRaise });
  }
  if (sim.tick - raising.lastMove >= (opts.cooldown ?? 0) && isQuiet(sim)) {
    const move = bestSwap(sim, opts);
    if (move) {
      inputs.push({ type: 'swap', row: move.row, col: move.col });
      raising.lastMove = sim.tick;
    }
  }
  return inputs;
}

/**
 * "Casual" player (the QA balance bot): every `reaction` ticks it makes the first single swap
 * that produces a match (bottom-up scan), or else taps raise when the stack is low. No drags,
 * no planning, no chains on purpose.
 */
export interface CasualMemory {
  next: number;
  raiseUntil: number;
  raising: boolean;
}

export function casualMemory(reaction: number): CasualMemory {
  return { next: reaction, raiseUntil: 0, raising: false };
}

export function casualInputs(sim: SimState, reaction: number, mem: CasualMemory): SimInput[] {
  const inputs: SimInput[] = [];
  if (sim.tick >= mem.next) {
    mem.next = sim.tick + reaction;
    const m = findMatchingSwap(sim, 30);
    if (m) inputs.push({ type: 'swap', row: m.row, col: m.col });
    else if (!sim.danger && sim.config.rows - topRow(sim) < 6) {
      inputs.push({ type: 'raise', active: true });
      mem.raising = true;
      mem.raiseUntil = sim.tick + 8;
    }
  }
  if (mem.raising && sim.tick >= mem.raiseUntil) {
    inputs.push({ type: 'raise', active: false });
    mem.raising = false;
  }
  return inputs;
}

export interface PlayOptions {
  bot: BotOptions | null;
  /** Use held charms when the stack is in danger. */
  useCharms: boolean;
  maxTicks?: number;
}

export interface PlayedStage {
  run: RunState;
  result: StageResult;
  goal: StageGoal;
  rewards: StageRewards | null;
}

/** Play the run's current stage to the end with the bot; returns the updated run. */
export function playStage(run: RunState, opts: PlayOptions): PlayedStage {
  const setup = stageConfig(run);
  const sim = createStageSim(setup);
  const raising: BotMemory = { held: false, lastMove: -1000 };
  const maxTicks = opts.maxTicks ?? 60 * 60 * 5;
  let current = run;
  for (let t = 0; t < maxTicks; t++) {
    const p = evaluateStage(setup.goal, sim);
    if (p.finished) break;
    if (opts.useCharms && current.charms.length > 0 && topRow(sim) <= 1) {
      const slot = current.charms.findIndex((c) => getCharm(c.id).usable === 'stage');
      if (slot >= 0) {
        const r = useCharm(current, slot, sim);
        if (r.ok) current = r.run;
      }
    }
    const inputs = opts.bot
      ? botInputs(
          sim,
          setup.goal.type === 'survive' ? { ...opts.bot, raiseBelow: 4 } : opts.bot,
          raising,
        )
      : [];
    step(sim, inputs, setup.hooks, null);
  }
  const result = stageResult(setup.goal, sim);
  const done = completeStage(current, result);
  return { run: done.run, result, goal: setup.goal, rewards: done.rewards };
}

/** Scoring relics first (×mult > +mult > +base), then everything else. */
function relicRank(id: string): number {
  const d = getRelic(id);
  return d.xmult ? 3 : d.mult ? 2 : d.base ? 1 : 0;
}

/** Shop policy: buy the priciest affordable relics (keeping 5 for interest late), charms if cheap. */
export function shopGreedy(run: RunState): RunState {
  let cur = run;
  for (let guard = 0; guard < 10; guard++) {
    const shop = cur.shop;
    if (!shop) break;
    const slots = runEconomy(cur).relicSlots;
    if (cur.relics.length >= slots) break;
    let bestIdx = -1;
    let bestRank = -1;
    shop.relics.forEach((o, i) => {
      const rank = relicRank(o.id) * 100 + o.price;
      if (!o.sold && o.price <= cur.szikra && rank > bestRank) {
        bestIdx = i;
        bestRank = rank;
      }
    });
    if (bestIdx < 0) break;
    const r = buyRelic(cur, bestIdx);
    if (!r.ok) break;
    cur = r.run;
  }
  if (cur.shop && cur.charms.length < runEconomy(cur).charmSlots) {
    const idx = cur.shop.charms.findIndex((o) => !o.sold && o.price <= cur.szikra - 4);
    if (idx >= 0) cur = buyCharm(cur, idx).run;
  }
  return cur;
}

export interface RunLog {
  run: RunState;
  stages: PlayedStage[];
}

/** Play a whole run with the bot and the greedy shop policy. */
export function playRun(run: RunState, opts: PlayOptions): RunLog {
  const stages: PlayedStage[] = [];
  let cur = run;
  while (cur.phase === 'stage') {
    const played = playStage(cur, opts);
    stages.push(played);
    cur = played.run;
    if (cur.phase === 'shop') cur = leaveShop(shopGreedy(cur));
  }
  return { run: cur, stages };
}
