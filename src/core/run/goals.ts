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
  /**
   * Stage-1 score target per act at brightness 1 (index = act − 1). Act 1 is tuned for a casual
   * relic-less player (~550–600 points per 60 s); acts 2 and 3 need relic synergy / a build.
   */
  scoreByAct: [360, 1400, 2800] as readonly number[],
  /** Brightness ≥ 6: steeper act curve. */
  steepScoreByAct: [360, 1750, 3850] as readonly number[],
  /** Score target factor per stage (index 3 = boss), per act. */
  stageScale: [
    [1, 1, 1.05, 1.4],
    [1, 1.2, 1.4, 1.7],
    [1, 1.2, 1.4, 1.7],
  ] as readonly (readonly number[])[],
  /** scoreInTime limits in seconds per stage index. */
  scoreSeconds: [60, 60, 60, 75] as readonly number[],
  /** clearBlocks: stage-1 target per act, + per stage index (per act). */
  blocksByAct: [40, 61, 77] as readonly number[],
  blocksPerStage: [3, 8, 8] as readonly number[],
  blocksSeconds: 90,
  surviveBaseSeconds: 40,
  survivePerStageSeconds: 5,
  survivePerActSeconds: 10,
  /** Survive stages start this many levels higher ("elevated speed"), per act. */
  surviveLevelBonus: [2, 4, 4] as readonly number[],
  /**
   * chainTarget: [chainLength, count at stage 0] per act; + ⌊stage × chainsPerStage⌋ (max +2).
   */
  chainByAct: [
    [2, 1],
    [2, 3],
    [3, 1],
  ] as readonly (readonly [number, number])[],
  chainsPerStage: [0, 1, 1] as readonly number[],
  chainSeconds: 90,
  /** Starting speed level: 1 + levelPerAct·(act−1) + (stage ≥ 2 ? lateStageLevel[act−1] : 0). */
  levelPerAct: 2,
  lateStageLevel: [0, 1, 1] as readonly number[],
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
  const startLevel = 1 + t.levelPerAct * a + (s >= 2 ? (t.lateStageLevel[a] as number) : 0);
  const dim = brightness >= 2;
  switch (type) {
    case 'scoreInTime': {
      const base = (brightness >= 6 ? t.steepScoreByAct : t.scoreByAct)[a] as number;
      const stageScale = (t.stageScale[a] as readonly number[])[s] as number;
      const raw = base * stageScale * (dim ? t.dimScoreFactor : 1);
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
        ((t.blocksByAct[a] as number) + (t.blocksPerStage[a] as number) * s) *
        (dim ? t.dimBlocksFactor : 1);
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
        startLevel: startLevel + (t.surviveLevelBonus[a] as number),
      };
    }
    case 'chainTarget': {
      const [length, count] = t.chainByAct[a] as readonly [number, number];
      return {
        type,
        target: count + Math.min(2, Math.floor(s * (t.chainsPerStage[a] as number))),
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
