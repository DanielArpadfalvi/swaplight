import { createRng, type Seed } from '../rng';
import { cloneSim, step, type SimHooks } from '../sim';
import type { SimInput, SimState } from '../types';
import { cpuProfile, type CpuProfile } from './profiles';
import { isCalm, planSearch, type Plan, type SearchContext } from './search';

/**
 * CPU opponent controller. Call `cpuStep(cpu, sim)` once per tick *before*
 * stepping `sim`, and feed the returned inputs to that step. Deterministic for a
 * given seed and sim history (work is budgeted in units, never by wall time).
 *
 * Loop: wait `reactionTicks` → search (amortized over ticks, see `planSearch`) →
 * execute the plan one swap at a time, at most one swap per `actionTicks`, each
 * swap re-validated against the live board (expected block ids + a one-tick probe
 * on a clone, so the CPU never issues a swap the sim would reject) → repeat.
 * Without a worthwhile move on a calm, low board it taps manual raise.
 */
export interface CpuStats {
  swaps: number;
  plans: number;
  aborted: number;
  raises: number;
  mistakes: number;
  skillPlans: number;
  /** Total search work units (≈ µs). */
  units: number;
}

export interface CpuState {
  profile: CpuProfile;
  ctx: SearchContext;
  plan: Plan | null;
  next: number;
  lastActionTick: number;
  search: Generator<void, Plan | null, void> | null;
  cooldown: number;
  raiseRelease: boolean;
  stats: CpuStats;
}

export interface CpuOptions {
  /** Seed of the CPU's own RNG (mistakes). Default 'cpu'. */
  seed?: Seed;
  /** Hooks used by the sim being played (rollouts must match it). */
  hooks?: SimHooks;
}

export function createCpu(level: number, options: CpuOptions = {}): CpuState {
  const profile = cpuProfile(level);
  return {
    profile,
    ctx: {
      profile,
      hooks: options.hooks,
      rng: createRng(`${options.seed ?? 'cpu'}|ai`),
      live: null as unknown as SimState,
      units: 0,
      earliest: 0,
    },
    plan: null,
    next: 0,
    lastActionTick: -1e9,
    search: null,
    cooldown: profile.reactionTicks,
    raiseRelease: false,
    stats: { swaps: 0, plans: 0, aborted: 0, raises: 0, mistakes: 0, skillPlans: 0, units: 0 },
  };
}

/** Inputs for the CPU-controlled sim for its next step. */
export function cpuStep(cpu: CpuState, sim: SimState): SimInput[] {
  const out: SimInput[] = [];
  if (cpu.raiseRelease) {
    out.push({ type: 'raise', active: false });
    cpu.raiseRelease = false;
  }
  if (sim.gameOver) return out;
  const { ctx, profile } = cpu;
  ctx.live = sim;
  ctx.units = 0;
  ctx.earliest = cpu.lastActionTick + profile.actionTicks;

  if (cpu.plan) {
    execute(cpu, sim, out);
    return out;
  }
  if (!cpu.search) {
    if (cpu.cooldown > 0) {
      cpu.cooldown--;
      return out;
    }
    if (!profile.skillChains && !isCalm(sim)) return out;
    cpu.search = planSearch(ctx, cloneSim(sim));
  }
  const result = cpu.search.next();
  cpu.stats.units += ctx.units;
  if (!result.done) return out;
  cpu.search = null;
  const plan = result.value;
  if (plan) {
    cpu.plan = plan;
    cpu.next = 0;
    if (plan.mistake) cpu.stats.mistakes++;
    if (plan.skill) cpu.stats.skillPlans++;
    execute(cpu, sim, out);
    return out;
  }
  cpu.cooldown = profile.reactionTicks;
  if (out.length === 0 && shouldRaise(cpu, sim)) {
    out.push({ type: 'raise', active: true });
    cpu.raiseRelease = true;
    cpu.stats.raises++;
    cpu.cooldown = Math.min(cpu.cooldown, profile.actionTicks);
  }
  return out;
}

function shouldRaise(cpu: CpuState, sim: SimState): boolean {
  if (!isCalm(sim) || sim.garbageQueue.length > 0) return false;
  const { rows, cols } = sim.config;
  const first = sim.cells.findIndex((b) => b !== null);
  const height = first < 0 ? 0 : rows - Math.floor(first / cols);
  return height < cpu.profile.raiseBelow;
}

function execute(cpu: CpuState, sim: SimState, out: SimInput[]): void {
  const plan = cpu.plan as Plan;
  const action = plan.actions[cpu.next];
  if (!action) {
    finish(cpu, false);
    return;
  }
  if (sim.tick < action.tick || sim.tick - cpu.lastActionTick < cpu.profile.actionTicks) return;
  const row = action.row - (sim.stats.rowsRisen - plan.rowsRisen);
  if (!swapStillValid(cpu, sim, row, action.col, action.leftId, action.rightId)) {
    finish(cpu, true);
    return;
  }
  out.push({ type: 'swap', row, col: action.col });
  cpu.lastActionTick = sim.tick;
  cpu.stats.swaps++;
  cpu.next++;
  if (cpu.next >= plan.actions.length) finish(cpu, false);
}

function finish(cpu: CpuState, aborted: boolean): void {
  cpu.plan = null;
  cpu.next = 0;
  if (aborted) {
    cpu.stats.aborted++;
    cpu.cooldown = Math.ceil(cpu.profile.reactionTicks / 2);
  } else {
    cpu.stats.plans++;
    cpu.cooldown = cpu.profile.reactionTicks;
  }
}

function swapStillValid(
  cpu: CpuState,
  sim: SimState,
  row: number,
  col: number,
  leftId: number,
  rightId: number,
): boolean {
  const { rows, cols } = sim.config;
  if (row < 0 || row >= rows || col < 0 || col >= cols - 1) return false;
  const i = row * cols + col;
  if ((sim.cells[i]?.id ?? 0) !== leftId || (sim.cells[i + 1]?.id ?? 0) !== rightId) return false;
  // Probe one tick on a clone: the swap must not be rejected (state can change in
  // the timer/group phases that run before inputs).
  const probe = cloneSim(sim);
  const events = step(probe, [{ type: 'swap', row, col }], cpu.ctx.hooks);
  for (const e of events) if (e.type === 'swapRejected') return false;
  return true;
}
