import { TICKS_PER_SECOND } from '../config';
import type { SimState } from '../types';
import { STAGE_CHARM_CLEARED, chainKey } from './keys';
import type { GoalType, StageGoal, StageProgress, StageResult } from './types';

/**
 * Stage goals and their difficulty curve. All numbers are tunable here.
 *
 * Score goals scale steeply (relics multiply score); block / survive / chain goals
 * scale gently and get their pressure from the speed level instead.
 */
export const GOAL_TUNING = Object.freeze({
  /** Act 1, stage 1 score target at brightness 1. */
  scoreBase: 700,
  /** Score target factor per act (index = act − 1). */
  actScale: [1, 2, 4] as readonly number[],
  /** Brightness ≥ 6: steeper act curve. */
  steepActScale: [1, 2.5, 5.5] as readonly number[],
  /** Score target factor per stage (index 3 = boss). */
  stageScale: [1, 1.2, 1.4, 1.7] as readonly number[],
  /** scoreInTime limits in seconds per stage index. */
  scoreSeconds: [60, 60, 60, 75] as readonly number[],
  blocksBase: 45,
  blocksPerStage: 8,
  blocksPerAct: 16,
  blocksSeconds: 90,
  surviveBaseSeconds: 40,
  survivePerStageSeconds: 5,
  survivePerActSeconds: 10,
  /** Survive stages start this many levels higher ("elevated speed"). */
  surviveLevelBonus: 4,
  /** chainTarget: [chainLength, count at stage 0] per act; +1 count per stage index. */
  chainByAct: [
    [2, 1],
    [2, 3],
    [3, 1],
  ] as readonly (readonly [number, number])[],
  chainSeconds: 90,
  /** Starting speed level: 1 + levelPerAct·(act−1) + (stage ≥ 2 ? 1 : 0). */
  levelPerAct: 2,
  /** Brightness ≥ 2: score ×, blocks × */
  dimScoreFactor: 1.15,
  dimBlocksFactor: 1.1,
});

/** Round to a "nice" number: 2 significant digits, at least multiples of 5. */
export function niceRound(x: number): number {
  if (x <= 0) return 0;
  const digits = Math.floor(Math.log10(x)) + 1;
  const step = Math.max(5, Math.pow(10, digits - 2));
  return Math.max(step, Math.round(x / step) * step);
}

/** Build the goal of a stage. */
export function makeGoal(
  type: GoalType,
  act: number,
  stage: number,
  brightness: number,
): StageGoal {
  const t = GOAL_TUNING;
  const a = Math.min(3, Math.max(1, act)) - 1;
  const s = Math.min(3, Math.max(0, stage));
  const startLevel = 1 + t.levelPerAct * a + (s >= 2 ? 1 : 0);
  const dim = brightness >= 2;
  switch (type) {
    case 'scoreInTime': {
      const actScale = (brightness >= 6 ? t.steepActScale : t.actScale)[a] as number;
      const raw =
        t.scoreBase * actScale * (t.stageScale[s] as number) * (dim ? t.dimScoreFactor : 1);
      return {
        type,
        target: niceRound(raw),
        chainLength: 0,
        timeLimit: (t.scoreSeconds[s] as number) * TICKS_PER_SECOND,
        startLevel,
      };
    }
    case 'clearBlocks': {
      const raw =
        (t.blocksBase + t.blocksPerStage * s + t.blocksPerAct * a) * (dim ? t.dimBlocksFactor : 1);
      return {
        type,
        target: Math.round(raw),
        chainLength: 0,
        timeLimit: t.blocksSeconds * TICKS_PER_SECOND,
        startLevel,
      };
    }
    case 'survive': {
      const seconds =
        t.surviveBaseSeconds + t.survivePerStageSeconds * s + t.survivePerActSeconds * a;
      const ticks = seconds * TICKS_PER_SECOND;
      return {
        type,
        target: ticks,
        chainLength: 0,
        timeLimit: ticks,
        startLevel: startLevel + t.surviveLevelBonus,
      };
    }
    case 'chainTarget': {
      const [length, count] = t.chainByAct[a] as readonly [number, number];
      return {
        type,
        target: count + Math.min(2, s),
        chainLength: length,
        timeLimit: t.chainSeconds * TICKS_PER_SECOND,
        startLevel,
      };
    }
  }
}

/** Current value of the goal's metric. */
export function goalValue(goal: StageGoal, sim: Readonly<SimState>): number {
  switch (goal.type) {
    case 'scoreInTime':
      return sim.score;
    case 'clearBlocks':
      return sim.stats.blocksCleared + (sim.modifiers[STAGE_CHARM_CLEARED] ?? 0);
    case 'survive':
      return sim.tick;
    case 'chainTarget':
      return sim.modifiers[chainKey(goal.chainLength)] ?? 0;
  }
}

/** Progress of the goal on the current sim state (pure). */
export function evaluateStage(goal: StageGoal, sim: Readonly<SimState>): StageProgress {
  const value = goalValue(goal, sim);
  const target = Math.max(1, goal.target);
  const ratio = value / target;
  const won = value >= target && (goal.type !== 'survive' || !sim.gameOver);
  const ticksLeft = goal.timeLimit > 0 ? Math.max(0, goal.timeLimit - sim.tick) : 0;
  const lost = !won && (sim.gameOver || (goal.timeLimit > 0 && sim.tick >= goal.timeLimit));
  const settled = sim.groups.length === 0 && sim.chain === 1;
  return {
    value,
    target,
    progress: Math.min(1, Math.max(0, ratio)),
    ratio,
    ticksLeft,
    won,
    lost,
    finished: lost || (won && (settled || sim.gameOver)),
  };
}

/** Summarize a (finished) stage for `completeStage`. */
export function stageResult(goal: StageGoal, sim: Readonly<SimState>): StageResult {
  const p = evaluateStage(goal, sim);
  return {
    won: p.won,
    value: p.value,
    target: p.target,
    ratio: p.ratio,
    ticks: sim.tick,
    ticksLeft: goal.type === 'survive' ? 0 : p.ticksLeft,
    score: sim.score,
    blocksCleared: sim.stats.blocksCleared,
    maxChain: sim.stats.maxChain,
    maxCombo: sim.stats.maxCombo,
    modifiers: { ...sim.modifiers },
  };
}
