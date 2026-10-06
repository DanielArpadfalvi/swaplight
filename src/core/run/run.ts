import { DEFAULT_CONFIG, TICKS_PER_SECOND } from '../config';
import { hashString, stableStringify } from '../replay';
import { createRng, nextFloat, randInt, type RngState } from '../rng';
import type { SimState } from '../types';
import { CURSES, getCurse, isCurseId } from './bosses';
import { getCharm, isCharmId } from './charms';
import { MAX_BRIGHTNESS, getDeck, isDeckId } from './decks';
import { runEconomy } from './effects';
import { CHARM_LAST_USE } from './keys';
import { getRelic, isRelicId, relicsByRarity } from './relics';
import { generateShop, type ActionResult } from './shop';
import {
  ACTS,
  BOSS_STAGE,
  STAGES_PER_ACT,
  currentPlan,
  relicStateFrom,
  stageConfig,
} from './stage';
import type { CharmCtx, GoalType, PlannedStage, RunState, StageInfo, StageResult } from './types';

export const RUN_VERSION = 1;

/** Base Szikra per stage index (3 = boss). */
export const STAGE_REWARD = [3, 4, 5, 8] as const;
/** +1 Szikra per full 25% above the goal, at most this many. */
export const OVERACHIEVE_CAP = 3;
/** +1 Szikra per full 15 s left, at most this many. */
export const TIME_BONUS_SECONDS = 15;
export const TIME_BONUS_CAP = 3;
/** Interest: +1 per this many Szikra held. */
export const INTEREST_STEP = 5;

/** Goal-type weights for normal stages (act 1 stage 1 is always scoreInTime; no repeats in a row). */
const GOAL_WEIGHTS: readonly [GoalType, number][] = [
  ['scoreInTime', 3],
  ['clearBlocks', 2],
  ['survive', 2],
  ['chainTarget', 2],
];

function pickGoal(rng: RngState, previous: GoalType | null): GoalType {
  const pool = GOAL_WEIGHTS.filter(([t]) => t !== previous);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let x = nextFloat(rng) * total;
  for (const [t, w] of pool) {
    x -= w;
    if (x < 0) return t;
  }
  return 'scoreInTime';
}

function deckColors(deckId: string): number {
  const cfg: { colors?: number } = {};
  getDeck(deckId).config?.(cfg, {} as StageInfo);
  return cfg.colors ?? DEFAULT_CONFIG.colors;
}

/** Decide all 12 stages (goal types + boss curses) from the run RNG. */
export function makePlan(rng: RngState, deckId: string, brightness: number): PlannedStage[] {
  const colors = deckColors(deckId);
  const cursePool = CURSES.filter(
    (c) => c.maxDeckColors === undefined || colors <= c.maxDeckColors,
  ).map((c) => c.id);
  const plan: PlannedStage[] = [];
  for (let act = 1; act <= ACTS; act++) {
    let previous: GoalType | null = null;
    for (let stage = 0; stage < BOSS_STAGE; stage++) {
      const goalType: GoalType = act === 1 && stage === 0 ? 'scoreInTime' : pickGoal(rng, previous);
      plan.push({ act, stage, goalType, curses: [] });
      previous = goalType;
    }
    const count = brightness >= 8 ? 2 : 1;
    const curses: string[] = [];
    for (let k = 0; k < count; k++) {
      // The harshest curses (`minAct`) never appear on the act-1 boss.
      const allowed = cursePool.filter((id) => (getCurse(id).minAct ?? 1) <= act);
      if (allowed.length === 0) break;
      const id = allowed[randInt(rng, allowed.length)] as string;
      cursePool.splice(cursePool.indexOf(id), 1);
      curses.push(id);
    }
    plan.push({ act, stage: BOSS_STAGE, goalType: 'scoreInTime', curses });
  }
  return plan;
}

/** Start a new run. `brightness` 1..8. */
export function createRun(seed: string | number, deckId = 'neon', brightness = 1): RunState {
  if (!isDeckId(deckId)) throw new Error(`unknown deck '${deckId}'`);
  if (!Number.isInteger(brightness) || brightness < 1 || brightness > MAX_BRIGHTNESS) {
    throw new RangeError(`brightness must be 1..${MAX_BRIGHTNESS}`);
  }
  const deck = getDeck(deckId);
  const rng = createRng(`${seed}|run`);
  const plan = makePlan(rng, deckId, brightness);
  const run: RunState = {
    version: RUN_VERSION,
    seed: String(seed),
    deckId,
    brightness,
    phase: 'stage',
    act: 1,
    stage: 0,
    szikra: deck.startSzikra,
    relics: [],
    charms: [],
    shop: null,
    plan,
    rng,
    bossesDefeated: 0,
    history: [],
    stats: {
      totalScore: 0,
      maxChain: 1,
      maxCombo: 0,
      blocksCleared: 0,
      szikraEarned: 0,
      charmsUsed: 0,
      relicsBought: 0,
    },
  };
  for (const id of deck.startRelics) {
    const relicId =
      id === 'random-common'
        ? (relicsByRarity('common')[randInt(rng, relicsByRarity('common').length)]?.id as string)
        : id;
    run.relics.push({ id: relicId, paid: 0, state: { ...getRelic(relicId).initialState } });
  }
  for (const id of deck.startCharms) run.charms.push({ id, paid: 0 });
  return run;
}

export interface StageRewards {
  base: number;
  overachieve: number;
  time: number;
  interest: number;
  /** Relic / deck economy bonuses. */
  relics: number;
  total: number;
}

/**
 * Szikra for a won stage:
 * - base: 3 / 4 / 5 for stages 1–3, 8 for the boss (+ deck delta; 0 for the first stage of
 *   an act from Brightness 3);
 * - overachieve: +1 per full 25% above the goal (cap 3; not for survive) × relic multiplier;
 * - time: +1 per full 15 s left (cap 3; not for survive) × relic multiplier;
 * - interest: +1 per 5 Szikra held before the payout, capped (default 5);
 * - relics: stage / boss bonuses and `stageEnd` relic payouts.
 * Pure: `run` is the run as it was when the stage was played.
 */
export function computeRewards(run: RunState, result: StageResult): StageRewards {
  const setup = stageConfig(run);
  const { info, goal } = setup;
  const eco = runEconomy(run);
  const deck = getDeck(run.deckId);
  let base = Math.max(0, (STAGE_REWARD[info.stage] ?? 3) + deck.stageRewardDelta);
  if (run.brightness >= 3 && info.stage === 0) base = 0;
  const timed = goal.type !== 'survive';
  const overachieve = timed
    ? Math.floor(
        Math.min(OVERACHIEVE_CAP, Math.max(0, Math.floor((result.ratio - 1) * 4))) *
          eco.overachieveMult,
      )
    : 0;
  const time = timed
    ? Math.floor(
        Math.min(
          TIME_BONUS_CAP,
          Math.floor(result.ticksLeft / (TIME_BONUS_SECONDS * TICKS_PER_SECOND)),
        ) * eco.timeBonusMult,
      )
    : 0;
  const interest = Math.min(eco.interestCap, Math.floor(Math.max(0, run.szikra) / INTEREST_STEP));
  let relics = eco.stageBonus + (info.isBoss ? eco.bossBonus : 0);
  for (const owned of run.relics) {
    const def = getRelic(owned.id);
    if (def.stageEnd)
      relics += def.stageEnd(relicStateFrom(result.modifiers, owned.id), result, info);
  }
  return {
    base,
    overachieve,
    time,
    interest,
    relics,
    total: base + overachieve + time + interest + relics,
  };
}

export interface CompleteStageResult {
  run: RunState;
  /** null when the stage was lost. */
  rewards: StageRewards | null;
}

/**
 * Finish the current stage. Lost → phase 'lost'. Won → relic state is carried over from
 * the sim, rewards are paid, and the run moves to the shop (or to 'won' after the last boss).
 */
export function completeStage(run: RunState, result: StageResult): CompleteStageResult {
  if (run.phase !== 'stage') throw new Error(`completeStage in phase '${run.phase}'`);
  const plan = currentPlan(run);
  const next = structuredClone(run);
  next.stats.totalScore += result.score;
  next.stats.maxChain = Math.max(next.stats.maxChain, result.maxChain);
  next.stats.maxCombo = Math.max(next.stats.maxCombo, result.maxCombo);
  next.stats.blocksCleared += result.blocksCleared;
  const record = {
    act: plan.act,
    stage: plan.stage,
    goalType: plan.goalType,
    won: result.won,
    value: result.value,
    target: result.target,
    score: result.score,
    szikra: 0,
  };
  if (!result.won) {
    next.phase = 'lost';
    next.history.push(record);
    return { run: next, rewards: null };
  }
  // Relic state comes back from the sim; then rewards (stageEnd sees the final state).
  for (const owned of next.relics) owned.state = relicStateFrom(result.modifiers, owned.id);
  const rewards = computeRewards(next, result);
  const info = stageConfig(next).info;
  for (const owned of next.relics) getRelic(owned.id).afterStage?.(owned.state, result, info);
  next.szikra += rewards.total;
  next.stats.szikraEarned += rewards.total;
  record.szikra = rewards.total;
  next.history.push(record);
  if (plan.stage === BOSS_STAGE) next.bossesDefeated++;
  if (plan.act === ACTS && plan.stage === BOSS_STAGE) {
    next.phase = 'won';
    next.shop = null;
  } else {
    next.phase = 'shop';
    next.shop = generateShop(next);
  }
  return { run: next, rewards };
}

/** Leave the shop and move to the next stage. */
export function leaveShop(run: RunState): RunState {
  if (run.phase !== 'shop') throw new Error(`leaveShop in phase '${run.phase}'`);
  const next = structuredClone(run);
  next.shop = null;
  next.phase = 'stage';
  next.stage++;
  if (next.stage >= STAGES_PER_ACT) {
    next.stage = 0;
    next.act++;
  }
  return next;
}

/**
 * Use the charm in `slot`. Stage charms need the running stage's sim (mutated in place);
 * 'any' charms (Golden Ticket) also work in the shop with `sim = null`. A charm without
 * effect (e.g. Lantern with nothing hidden) is kept and `ok` is false.
 */
export function useCharm(
  run: RunState,
  slot: number,
  sim: SimState | null,
  ctx: CharmCtx = {},
): ActionResult {
  const owned = run.charms[slot];
  if (!owned) return { ok: false, run, reason: 'index' };
  const def = getCharm(owned.id);
  if (run.phase !== 'stage' && !(run.phase === 'shop' && def.usable === 'any')) {
    return { ok: false, run, reason: 'phase' };
  }
  if (def.apply && !sim) return { ok: false, run, reason: 'noSim' };
  if (def.apply && sim && !def.apply(sim, ctx)) return { ok: false, run, reason: 'noEffect' };
  const next = structuredClone(run);
  next.charms.splice(slot, 1);
  def.applyRun?.(next);
  next.szikra += runEconomy(next).charmUseBonus;
  next.stats.charmsUsed++;
  if (sim) sim.modifiers[CHARM_LAST_USE] = sim.tick;
  for (const r of next.relics) {
    const relic = getRelic(r.id);
    if (!relic.onCharm) continue;
    relic.onCharm({
      sim,
      get: (k) => r.state[k] ?? 0,
      set: (k, v) => {
        r.state[k] = v;
      },
    });
  }
  return { ok: true, run: next };
}

/* ------------------------------------------------------------------------------------------ */
/* Persistence                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export function serializeRun(run: RunState): string {
  return JSON.stringify(run);
}

/** Parse and validate a saved run. Throws on unknown versions / ids. */
export function deserializeRun(text: string): RunState {
  const run = JSON.parse(text) as RunState;
  validateRun(run);
  return run;
}

export function validateRun(run: RunState): void {
  if (run.version !== RUN_VERSION) throw new Error(`unsupported run version ${run.version}`);
  if (!isDeckId(run.deckId)) throw new Error(`unknown deck '${run.deckId}'`);
  if (run.plan.length !== ACTS * STAGES_PER_ACT) throw new Error('bad plan length');
  for (const p of run.plan)
    for (const c of p.curses) if (!isCurseId(c)) throw new Error(`curse ${c}`);
  for (const r of run.relics) if (!isRelicId(r.id)) throw new Error(`unknown relic '${r.id}'`);
  for (const c of run.charms) if (!isCharmId(c.id)) throw new Error(`unknown charm '${c.id}'`);
  for (const o of run.shop?.relics ?? []) if (!isRelicId(o.id)) throw new Error(`relic ${o.id}`);
  for (const o of run.shop?.charms ?? []) if (!isCharmId(o.id)) throw new Error(`charm ${o.id}`);
}

/** Stable hash of the complete run state (cyrb53 over key-sorted JSON). */
export function runHash(run: RunState): string {
  return hashString(stableStringify(run));
}
