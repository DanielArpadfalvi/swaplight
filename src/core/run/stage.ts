import type { SimConfig } from '../config';
import { createRng } from '../rng';
import { createSim } from '../sim';
import type { SimModifiers, SimState } from '../types';
import { activeEffects, buildHooks, runEconomy } from './effects';
import { makeGoal } from './goals';
import { relicPrefix } from './keys';
import { getRelic } from './relics';
import type { PlannedStage, RunState, StageInfo, StageSetup } from './types';

export const STAGES_PER_ACT = 4;
export const ACTS = 3;
export const BOSS_STAGE = 3;

/** The planned stage the run is currently on. */
export function currentPlan(run: RunState): PlannedStage {
  const p = run.plan[(run.act - 1) * STAGES_PER_ACT + run.stage];
  if (!p) throw new Error(`no planned stage for act ${run.act} stage ${run.stage}`);
  return p;
}

/** Seed of a stage's sim: derived from the run seed, independent of the run RNG stream. */
export function stageSeed(run: RunState, act = run.act, stage = run.stage): string {
  return `${run.seed}|stage|${act}|${stage}`;
}

/**
 * Everything needed to play the current stage. Pure: does not touch `run` (curse
 * parameters use their own seeded stream), so it may be called any number of times.
 */
export function stageConfig(run: RunState): StageSetup {
  const plan = currentPlan(run);
  const goal = makeGoal(plan.goalType, plan.act, plan.stage, run.brightness);
  const eco = runEconomy(run);
  const info: StageInfo = {
    act: plan.act,
    stage: plan.stage,
    isBoss: plan.stage === BOSS_STAGE,
    goal,
    szikra: run.szikra,
    relicCount: run.relics.length,
    relicSlots: eco.relicSlots,
    bossesDefeated: run.bossesDefeated,
  };
  const effects = activeEffects(run, plan.curses);
  const config: Partial<SimConfig> = { startLevel: goal.startLevel };
  for (const a of effects) a.effect.config?.(config, info);

  const modifiers: SimModifiers = {};
  const curseRng = createRng(`${run.seed}|curse|${plan.act}|${plan.stage}`);
  for (const a of effects) a.effect.modifiers?.(modifiers, info, curseRng);
  for (const owned of run.relics) {
    const def = getRelic(owned.id);
    const state = { ...def.initialState, ...owned.state };
    def.stageStart?.(state);
    const prefix = relicPrefix(owned.id);
    for (const [k, v] of Object.entries(state)) modifiers[prefix + k] = v;
  }

  return {
    seed: stageSeed(run, plan.act, plan.stage),
    mode: 'endless',
    config,
    modifiers,
    hooks: buildHooks(effects, info),
    goal,
    info,
    curses: [...plan.curses],
  };
}

/** Create the sim for a stage setup. */
export function createStageSim(setup: StageSetup): SimState {
  return createSim(setup.seed, setup.config, setup.mode, { modifiers: setup.modifiers });
}

/** Read a relic's state back out of a sim's modifiers. */
export function relicStateFrom(mods: SimModifiers, id: string): Record<string, number> {
  const prefix = relicPrefix(id);
  const state: Record<string, number> = {};
  for (const [k, v] of Object.entries(mods)) {
    if (k.startsWith(prefix)) state[k.slice(prefix.length)] = v;
  }
  return state;
}
