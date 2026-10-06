import {
  buyCharm,
  buyRelic,
  completeStage,
  createRun,
  createStageSim,
  currentPlan,
  deserializeRun,
  evaluateStage,
  getCharm,
  getRelic,
  leaveShop,
  relicPrefix,
  reroll,
  rerollCost,
  runEconomy,
  sellCharm,
  sellRelic,
  stageConfig,
  stageResult,
  useCharm,
  type ActionResult,
  type EconomyMods,
  type EffectScoreCtx,
  type PlannedStage,
  type RunState,
  type StageProgress,
  type StageResult,
  type StageRewards,
  type StageSetup,
} from '../core/run';
import type { ScoreModifier } from '../core/scoring';
import type { SimHooks } from '../core/sim';
import type { SimState } from '../core/types';

/**
 * Run-mode glue between the pure run layer (`src/core/run`) and the app: owns the current
 * `RunState`, the stage being played (setup + sim + hooks), detects which relics fired, and
 * (de)serializes everything for the save. No DOM, audio or Pixi — the app wires the results to the
 * UI store and the scene (see `runMode.ts`).
 */

export const RUN_BLOB_VERSION = 1;

/** Where a saved run resumes. */
export type RunResumePoint = 'map' | 'shop' | 'stage';

/** The `runInProgress` save blob (plain JSON). */
export interface RunBlob {
  v: typeof RUN_BLOB_VERSION;
  run: RunState;
  /** Mid-stage sim (null between stages). */
  sim: SimState | null;
  at: RunResumePoint;
  bestClear: number;
  playTicks: number;
}

/** Charms that ask the player for a target on the board. */
export type CharmTargetKind = 'column' | 'row' | 'cell';

const CHARM_TARGETS: Readonly<Record<string, CharmTargetKind>> = {
  purge: 'column',
  monotone: 'row',
  detonate: 'cell',
};

export function charmTargetKind(id: string): CharmTargetKind | null {
  return CHARM_TARGETS[id] ?? null;
}

/** Why a stage ended. */
export type StageEndReason = 'goal' | 'topOut' | 'time';

export interface FinishedStage {
  plan: PlannedStage;
  result: StageResult;
  /** Szikra breakdown (null when lost). */
  rewards: StageRewards | null;
  won: boolean;
  reason: StageEndReason;
  /** The act-3 boss fell: the run is won. */
  victory: boolean;
}

export interface CharmUseResult extends ActionResult {
  /** Cells (row, col, color) whose blocks the charm removed (for particles). */
  removed: { row: number; col: number; color: number }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function looksLikeSim(v: unknown): v is SimState {
  return (
    isRecord(v) &&
    Array.isArray(v.cells) &&
    isRecord(v.config) &&
    typeof v.tick === 'number' &&
    isRecord(v.modifiers)
  );
}

export class RunController {
  run: RunState;
  setup: StageSetup | null = null;
  sim: SimState | null = null;
  hooks: SimHooks | null = null;
  /** Highest single clear (base × mult) this run. */
  bestClear = 0;
  /** Ticks played over all stages. */
  playTicks = 0;
  /** Last finished stage (result screen / run summary). */
  last: FinishedStage | null = null;
  private readonly fired = new Set<string>();
  private relicSignature = new Map<string, string>();

  constructor(run: RunState) {
    this.run = run;
  }

  static create(seed: string, deckId = 'neon', brightness = 1): RunController {
    return new RunController(createRun(seed, deckId, brightness));
  }

  /** Rebuild from a save blob; null when it is missing, outdated or invalid. */
  static fromBlob(blob: unknown): RunController | null {
    if (!isRecord(blob) || blob.v !== RUN_BLOB_VERSION || !isRecord(blob.run)) return null;
    let run: RunState;
    try {
      run = deserializeRun(JSON.stringify(blob.run));
    } catch {
      return null;
    }
    if (run.phase !== 'stage' && run.phase !== 'shop') return null;
    const c = new RunController(run);
    c.bestClear = typeof blob.bestClear === 'number' ? Math.max(0, blob.bestClear) : 0;
    c.playTicks = typeof blob.playTicks === 'number' ? Math.max(0, blob.playTicks) : 0;
    if (run.phase === 'stage' && blob.at === 'stage' && looksLikeSim(blob.sim)) {
      c.attachStage(structuredClone(blob.sim));
    }
    return c;
  }

  /** Where this run resumes: mid-stage, map (before a stage) or shop. */
  get resumePoint(): RunResumePoint {
    if (this.run.phase === 'shop') return 'shop';
    return this.sim ? 'stage' : 'map';
  }

  toBlob(): RunBlob {
    return {
      v: RUN_BLOB_VERSION,
      run: structuredClone(this.run),
      sim: this.sim && this.run.phase === 'stage' ? structuredClone(this.sim) : null,
      at: this.resumePoint,
      bestClear: this.bestClear,
      playTicks: this.playTicks,
    };
  }

  get plan(): PlannedStage {
    return currentPlan(this.run);
  }

  get economy(): EconomyMods {
    return runEconomy(this.run);
  }

  get rerollCost(): number {
    return rerollCost(this.run);
  }

  /** Setup of the current stage (pure; also usable before the stage begins, e.g. the map). */
  previewSetup(): StageSetup {
    return stageConfig(this.run);
  }

  /** Create the current stage's sim (phase 'stage'). */
  beginStage(): SimState {
    if (this.run.phase !== 'stage') throw new Error(`beginStage in phase '${this.run.phase}'`);
    const setup = stageConfig(this.run);
    this.attachStage(createStageSim(setup), setup);
    return this.sim!;
  }

  /** Drop the stage in progress (back to the map without playing). */
  discardStage(): void {
    this.setup = null;
    this.sim = null;
    this.hooks = null;
  }

  private attachStage(sim: SimState, setup = stageConfig(this.run)): void {
    this.setup = setup;
    this.sim = sim;
    const base = setup.hooks.scoreModifiers ?? [];
    this.hooks = { ...setup.hooks, scoreModifiers: [...base, this.relicProbe()] };
    this.fired.clear();
    this.relicSignature = this.relicStateSignature();
  }

  progress(): StageProgress | null {
    if (!this.setup || !this.sim) return null;
    return evaluateStage(this.setup.goal, this.sim);
  }

  /** A clear scored (game layer feeds the `scored` events). */
  noteScored(total: number): void {
    if (total > this.bestClear) this.bestClear = total;
  }

  /**
   * Read-only score modifier appended after the run's own: re-evaluates each relic's score phases
   * on the same clear and records the ones that changed it (HUD flash). Never writes the sim.
   */
  private relicProbe(): ScoreModifier {
    return (score) => {
      const sim = score.sim;
      const setup = this.setup;
      if (!sim || !setup) return;
      for (const owned of this.run.relics) {
        const def = getRelic(owned.id);
        if (!def.base && !def.mult && !def.xmult) continue;
        const prefix = relicPrefix(owned.id);
        const ctx: EffectScoreCtx = {
          score,
          sim,
          info: setup.info,
          get: (k) => sim.modifiers[prefix + k] ?? 0,
          set: () => undefined,
        };
        const hit =
          (def.base?.(ctx) ?? 0) !== 0 ||
          (def.mult?.(ctx) ?? 0) !== 0 ||
          (def.xmult?.(ctx) ?? 1) !== 1;
        if (hit) this.fired.add(owned.id);
      }
    };
  }

  private relicStateSignature(): Map<string, string> {
    const out = new Map<string, string>();
    const mods = this.sim?.modifiers ?? {};
    for (const owned of this.run.relics) {
      const prefix = relicPrefix(owned.id);
      let sig = '';
      for (const [k, v] of Object.entries(mods)) if (k.startsWith(prefix)) sig += `${k}=${v};`;
      out.set(owned.id, sig);
    }
    return out;
  }

  /**
   * Relics that fired since the last call: changed a clear's score, or changed their own state
   * (stateful relics such as Snowball, Domino, Amber Bank).
   */
  takeFiredRelics(): string[] {
    const sig = this.relicStateSignature();
    for (const [id, s] of sig) {
      const before = this.relicSignature.get(id);
      // Stage-tick bookkeeping (e.g. Hot Streak's "last" tick) also counts as firing: it only
      // changes on clears.
      if (before !== undefined && before !== s) this.fired.add(id);
    }
    this.relicSignature = sig;
    if (this.fired.size === 0) return [];
    const out = this.run.relics.map((r) => r.id).filter((id) => this.fired.has(id));
    this.fired.clear();
    return out;
  }

  /** Finish the stage if the goal says so (after a tick). */
  checkFinished(): FinishedStage | null {
    const p = this.progress();
    if (!p || !p.finished) return null;
    return this.finishStage();
  }

  /**
   * Complete the current stage. `override` (tests / debug hooks) replaces fields of the result,
   * e.g. `{ won: true }` to force a win.
   */
  finishStage(override: Partial<StageResult> = {}): FinishedStage {
    const setup = this.setup;
    const sim = this.sim;
    if (!setup || !sim) throw new Error('no stage in progress');
    const plan = this.plan;
    const base = stageResult(setup.goal, sim);
    const result: StageResult = { ...base, ...override };
    if (override.won && !base.won) {
      result.value = Math.max(result.value, result.target);
      result.ratio = Math.max(result.ratio, 1);
    }
    const { run, rewards } = completeStage(this.run, result);
    this.run = run;
    this.playTicks += sim.tick;
    const reason: StageEndReason = result.won ? 'goal' : sim.gameOver ? 'topOut' : 'time';
    this.last = {
      plan,
      result,
      rewards,
      won: result.won,
      reason,
      victory: run.phase === 'won',
    };
    this.setup = null;
    this.sim = null;
    this.hooks = null;
    return this.last;
  }

  /* ---------------------------------------------------------------------------- shop */

  private apply(res: ActionResult): ActionResult {
    if (res.ok) this.run = res.run;
    return res;
  }

  buyRelic(index: number): ActionResult {
    return this.apply(buyRelic(this.run, index));
  }

  buyCharm(index: number): ActionResult {
    return this.apply(buyCharm(this.run, index));
  }

  sellRelic(slot: number): ActionResult {
    return this.apply(sellRelic(this.run, slot));
  }

  sellCharm(slot: number): ActionResult {
    return this.apply(sellCharm(this.run, slot));
  }

  reroll(): ActionResult {
    return this.apply(reroll(this.run));
  }

  leaveShop(): void {
    this.run = leaveShop(this.run);
  }

  /** Use a charm (in a stage with its sim, or an 'any' charm in the shop). */
  useCharm(slot: number, target?: { row?: number; col?: number }): CharmUseResult {
    const sim = this.run.phase === 'stage' ? this.sim : null;
    const before = sim ? sim.cells.map((b) => (b ? b.id : -1)) : [];
    const colors = sim ? sim.cells.map((b) => (b ? b.color : 0)) : [];
    const res = this.apply(useCharm(this.run, slot, sim, target ? { target } : {}));
    const removed: CharmUseResult['removed'] = [];
    if (res.ok && sim) {
      const alive = new Set(sim.cells.map((b) => (b ? b.id : -1)));
      const cols = sim.config.cols;
      before.forEach((id, i) => {
        if (id >= 0 && !alive.has(id)) {
          removed.push({ row: Math.floor(i / cols), col: i % cols, color: colors[i] ?? 0 });
        }
      });
    }
    return { ...res, removed };
  }

  /** Can the charm in `slot` be used right now (phase-wise)? */
  charmUsable(slot: number): boolean {
    const owned = this.run.charms[slot];
    if (!owned) return false;
    const def = getCharm(owned.id);
    if (this.run.phase === 'stage') return this.sim !== null;
    return this.run.phase === 'shop' && def.usable === 'any';
  }

  /** Number of won stages. */
  get stagesCleared(): number {
    return this.run.history.filter((h) => h.won).length;
  }
}
