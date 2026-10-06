import { nextFloat, randInt, type RngState } from '../rng';
import { canSwap, cloneSim, step, type SimHooks } from '../sim';
import type { SimInput, SimState } from '../types';
import { comboGarbage, chainGarbage, attackCells } from '../versus';
import {
  CLEARING,
  EMPTY,
  applyDrag,
  boardMetrics,
  copyGrid,
  createGrid,
  drop,
  gridFromSim,
  gridHash,
  hasClearing,
  resolve,
  type BoardMetrics,
  type Grid,
  type Resolution,
} from './grid';
import type { CpuProfile } from './profiles';

/** One swap of a plan: input `{row, col}` at sim tick `tick` (row relative to `Plan.rowsRisen`). */
export interface PlannedSwap {
  tick: number;
  row: number;
  col: number;
  /** Expected block ids in the left / right cell when the swap is issued (0 = empty). */
  leftId: number;
  rightId: number;
}

export interface Outcome {
  /** Garbage cells this move would send (combos + chain). */
  attack: number;
  /** Highest chain level reached. */
  chain: number;
  cleared: number;
  garbageTouched: number;
  swaps: number;
  dead: boolean;
}

export interface Plan {
  actions: PlannedSwap[];
  /** `sim.stats.rowsRisen` the action rows refer to. */
  rowsRisen: number;
  score: number;
  baseline: number;
  outcome: Outcome;
  /** Planned on a busy board to extend a running chain. */
  skill: boolean;
  /** Picked on purpose instead of the best candidate (difficulty). */
  mistake: boolean;
}

/** Shared between the controller and the running search (updated every tick). */
export interface SearchContext {
  profile: CpuProfile;
  hooks: SimHooks | undefined;
  rng: RngState;
  /** The live sim at the current tick (read only). */
  live: SimState;
  /** Work units spent this tick. */
  units: number;
  /** Earliest tick for the plan's first swap (input speed limit). */
  earliest: number;
}

interface SwapRef {
  row: number;
  col: number;
}

interface Candidate {
  swaps: SwapRef[];
  score: number;
  cleared: number;
}

/** Board is at rest: nothing clearing, moving, swapping or converting, no chain open. */
export function isCalm(sim: SimState): boolean {
  if (sim.groups.length > 0 || sim.chain > 1) return false;
  for (const s of sim.garbage) if (s.state !== 'idle' && s.state !== 'landing') return false;
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const b = cells[i];
    if (b && b.state !== 'idle' && b.state !== 'landing') return false;
  }
  return true;
}

const METRICS: BoardMetrics = {
  maxHeight: 0,
  sumHeight: 0,
  bumpiness: 0,
  holes: 0,
  potential: 0,
  garbage: 0,
};

/** Heuristic value of a move outcome on the resulting board. Higher is better. */
export function scoreOutcome(o: Outcome, m: BoardMetrics, rows: number): number {
  if (o.dead) return -1e6;
  let s =
    o.attack * 4 + o.cleared + (o.chain >= 2 ? (o.chain - 1) * 12 : 0) + o.garbageTouched * 1.5;
  const free = rows - m.maxHeight;
  const danger = free <= 1 ? 120 : free === 2 ? 60 : free === 3 ? 24 : free === 4 ? 8 : 0;
  s -= danger + m.sumHeight * 0.15 + m.bumpiness * 0.5 + m.holes * 0.8;
  s += m.potential * 0.25;
  s -= o.swaps * 0.4;
  return s;
}

function dragSwaps(row: number, col: number, dir: -1 | 1, steps: number): SwapRef[] {
  const swaps: SwapRef[] = [];
  for (let s = 0; s < steps; s++) {
    swaps.push({ row, col: dir === 1 ? col + s : col - s - 1 });
  }
  return swaps;
}

const RES: Resolution = { chain: 1, cleared: 0, comboCells: 0, garbageTouched: 0, rounds: 0 };

/** Static evaluation of a grid right after a move (mutates `g`). */
function evaluateStatic(g: Grid, dynamic: boolean, chainStart: number, swaps: number): Candidate {
  if (dynamic) {
    // Projection: the clearing groups vanish, everything above falls with the chain flag.
    for (let i = 0; i < g.v.length; i++) if (g.v[i] === CLEARING) g.v[i] = EMPTY;
    drop(g, true);
  } else {
    g.fell.fill(0);
  }
  const res = resolve(g, chainStart, RES);
  const chainCells = attackCells(chainGarbage(res.chain, g.cols));
  const outcome: Outcome = {
    attack: res.comboCells + chainCells,
    chain: res.chain,
    cleared: res.cleared,
    garbageTouched: res.garbageTouched,
    swaps,
    dead: false,
  };
  const score = scoreOutcome(outcome, boardMetrics(g, METRICS), g.rows);
  return { swaps: [], score, cleared: res.cleared };
}

interface RolloutResult {
  outcome: Outcome;
  score: number;
  ids: [number, number][];
}

/**
 * Real rollout on a clone: issue `swaps` (rows relative to `from.stats.rowsRisen`)
 * at the given ticks, then run until the board is calm again (or `horizon`).
 * Returns null if a swap would be rejected.
 */
function rollout(
  from: SimState,
  swaps: readonly SwapRef[],
  ticks: readonly number[],
  ctx: SearchContext,
): RolloutResult | null {
  const sim = cloneSim(from);
  const { cols } = sim.config;
  const risen0 = from.stats.rowsRisen;
  const cleared0 = sim.stats.blocksCleared;
  const garbage0 = countGarbage(sim);
  const ids: [number, number][] = [];
  let k = 0;
  let attack = 0;
  let maxChain = sim.chain;
  let chainAttacked = 0;
  const horizon =
    ctx.profile.horizon + (ticks.length > 0 ? (ticks[ticks.length - 1] as number) - sim.tick : 0);
  const input: SimInput[] = [{ type: 'swap', row: 0, col: 0 }];
  const none: SimInput[] = [];
  for (let t = 0; t < horizon; t++) {
    let inputs = none;
    if (k < swaps.length && sim.tick >= (ticks[k] as number)) {
      const sw = swaps[k] as SwapRef;
      const row = sw.row - (sim.stats.rowsRisen - risen0);
      if (canSwap(sim, row, sw.col) !== null) return null;
      const i = row * cols + sw.col;
      ids.push([sim.cells[i]?.id ?? 0, sim.cells[i + 1]?.id ?? 0]);
      input[0] = { type: 'swap', row, col: sw.col };
      inputs = input;
      k++;
    }
    const matches = sim.stats.matches;
    const chainBefore = sim.chain;
    step(sim, inputs, ctx.hooks, null);
    ctx.units++;
    if (sim.stats.matches > matches) {
      const g = sim.groups[sim.groups.length - 1];
      if (g) attack += attackCells(comboGarbage(g.size, cols));
    }
    if (sim.chain > maxChain) maxChain = sim.chain;
    if (chainBefore > 1 && sim.chain === 1) {
      chainAttacked += attackCells(chainGarbage(chainBefore, cols));
    }
    if (sim.gameOver) break;
    if (k === swaps.length && t > 4 && isCalm(sim)) break;
  }
  if (k < swaps.length) return null;
  if (sim.chain > 1) chainAttacked += attackCells(chainGarbage(sim.chain, cols));
  const outcome: Outcome = {
    attack: attack + chainAttacked,
    chain: maxChain,
    cleared: sim.stats.blocksCleared - cleared0,
    garbageTouched: Math.max(0, garbage0 - countGarbage(sim)),
    swaps: swaps.length,
    dead: sim.gameOver,
  };
  const g = gridFromSim(sim, rolloutGrid(sim));
  const score = scoreOutcome(outcome, boardMetrics(g, METRICS), sim.config.rows);
  return { outcome, score, ids };
}

let rGrid: Grid | null = null;
function rolloutGrid(sim: SimState): Grid {
  const { rows, cols } = sim.config;
  if (!rGrid || rGrid.rows !== rows || rGrid.cols !== cols) rGrid = createGrid(rows, cols);
  return rGrid;
}

function countGarbage(sim: SimState): number {
  let n = 0;
  for (const s of sim.garbage) n += s.width * s.height;
  return n;
}

/**
 * Amortized planner (generator): yields whenever `ctx.units` reaches the profile
 * budget; the controller resumes it on the next tick. Phases:
 * 1. single-block drags (1..maxDrag swaps) on the static grid of `snap`;
 * 2. 2-move sequences: the best non-clearing "setup" drags × every second drag;
 * 3. the best `verify` candidates (+ a no-move baseline) are re-checked with real
 *    rollouts from the *current* live sim, with swaps spaced `actionTicks` apart.
 * Returns the best verified plan if it beats the baseline, else null.
 */
export function* planSearch(
  ctx: SearchContext,
  snap: SimState,
): Generator<void, Plan | null, void> {
  const { profile } = ctx;
  const { rows, cols } = snap.config;
  const g0 = gridFromSim(snap, createGrid(rows, cols));
  const g = createGrid(rows, cols);
  const busy = hasClearing(g0) || !isCalm(snap);
  const chainStart = busy ? snap.chain : 1;
  const maxDrag = busy ? Math.min(2, profile.maxDrag) : profile.maxDrag;
  const seen = new Set<number>();
  const candidates: Candidate[] = [];
  const setups: { cand: Candidate; grid: Grid }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if ((g0.v[i] as number) < 0 || !g0.movable[i]) continue;
      for (const dir of [-1, 1] as const) {
        for (let steps = 1; steps <= maxDrag; steps++) {
          ctx.units += 2;
          if (ctx.units >= profile.budget) yield;
          copyGrid(g0, g);
          if (!applyDrag(g, r, c, dir, steps)) break;
          const h = gridHash(g);
          if (seen.has(h)) continue;
          seen.add(h);
          const keep = !busy && profile.pairs > 0 ? copyGrid(g, createGrid(rows, cols)) : null;
          const cand = evaluateStatic(g, busy, chainStart, steps);
          cand.swaps = dragSwaps(r, c, dir, steps);
          candidates.push(cand);
          if (keep && cand.cleared === 0) setups.push({ cand, grid: keep });
        }
      }
    }
  }

  if (setups.length > 0) {
    setups.sort((a, b) => b.cand.score - a.cand.score);
    const first = setups.slice(0, profile.pairs);
    for (const { cand: setup, grid } of first) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if ((grid.v[i] as number) < 0 || !grid.movable[i]) continue;
          for (const dir of [-1, 1] as const) {
            for (let steps = 1; steps <= Math.min(2, profile.maxDrag); steps++) {
              ctx.units += 2;
              if (ctx.units >= profile.budget) yield;
              copyGrid(grid, g);
              if (!applyDrag(g, r, c, dir, steps)) break;
              const h = gridHash(g);
              if (seen.has(h)) continue;
              seen.add(h);
              const cand = evaluateStatic(g, false, 1, setup.swaps.length + steps);
              if (cand.cleared === 0) continue;
              cand.swaps = setup.swaps.concat(dragSwaps(r, c, dir, steps));
              candidates.push(cand);
            }
          }
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, profile.verify);

  // Verify against a fresh copy of the live board (it may have moved on while we
  // were thinking). Rollouts are spread over the next ticks too, so the plan starts
  // after the worst-case verification time; meanwhile the live board only advances
  // without our input, exactly like the rollouts assume.
  if (ctx.units >= profile.budget) yield;
  const fresh = cloneSim(ctx.live);
  const shift = fresh.stats.rowsRisen - snap.stats.rowsRisen;
  let maxSpan = 0;
  for (const cand of top) maxSpan = Math.max(maxSpan, cand.swaps.length * profile.actionTicks);
  const verifyTicks = Math.ceil(((top.length + 1) * (profile.horizon + maxSpan)) / profile.budget);
  const start = Math.max(fresh.tick + verifyTicks + 1, ctx.earliest);
  const base = rollout(fresh, [], [], ctx);
  const baseline = base ? base.score : -1e6;
  const verified: { cand: Candidate; result: RolloutResult; ticks: number[]; swaps: SwapRef[] }[] =
    [];
  for (const cand of top) {
    if (ctx.units >= profile.budget) yield;
    const swaps = cand.swaps.map((s) => ({ row: s.row - shift, col: s.col }));
    if (swaps.some((s) => s.row < 0)) continue;
    const ticks = swaps.map((_, j) => start + j * profile.actionTicks);
    const result = rollout(fresh, swaps, ticks, ctx);
    if (result) verified.push({ cand, result, ticks, swaps });
  }
  if (verified.length === 0) return null;
  verified.sort((a, b) => b.result.score - a.result.score);
  let pick = verified[0] as (typeof verified)[number];
  if (pick.result.score <= baseline + 0.5) return null;
  let mistake = false;
  if (verified.length > 1 && nextFloat(ctx.rng) < profile.mistakeRate) {
    pick = verified[1 + randInt(ctx.rng, verified.length - 1)] as (typeof verified)[number];
    mistake = true;
  }
  return {
    actions: pick.swaps.map((s, j) => ({
      tick: pick.ticks[j] as number,
      row: s.row,
      col: s.col,
      leftId: pick.result.ids[j]?.[0] ?? 0,
      rightId: pick.result.ids[j]?.[1] ?? 0,
    })),
    rowsRisen: fresh.stats.rowsRisen,
    score: pick.result.score,
    baseline,
    outcome: pick.result.outcome,
    skill: busy,
    mistake,
  };
}
