import { TICKS_PER_SECOND } from '../config';

/** CPU difficulty 1–5. */
export type CpuLevel = 1 | 2 | 3 | 4 | 5;

export const CPU_LEVEL_NAMES: Readonly<Record<CpuLevel, string>> = Object.freeze({
  1: 'easy',
  2: 'normal',
  3: 'hard',
  4: 'expert',
  5: 'insane',
});

export interface CpuProfile {
  level: CpuLevel;
  /** Swaps per second (human-like input speed). */
  actionsPerSecond: number;
  /** Minimum ticks between two swaps (60 / actionsPerSecond). */
  actionTicks: number;
  /** Ticks to "look at the board" before planning after a plan ends / the board changes. */
  reactionTicks: number;
  /** Longest single-block drag considered (swaps). */
  maxDrag: number;
  /** Setup moves expanded into 2-move sequences (0 = no 2-move search). */
  pairs: number;
  /** Best static candidates verified with real rollouts. */
  verify: number;
  /** Chance to pick a random verified candidate instead of the best one. */
  mistakeRate: number;
  /** Plan on a busy board (groups clearing) to extend chains ("skill chains"). */
  skillChains: boolean;
  /** Manual raise when the tallest column is below this many blocks. */
  raiseBelow: number;
  /**
   * Search work units per tick (one rollout step or half a static evaluation, ≈ 1–2 µs).
   * A tick may overshoot by at most one rollout.
   */
  budget: number;
  /** Rollout horizon cap (ticks). */
  horizon: number;
}

function profile(
  level: CpuLevel,
  actionsPerSecond: number,
  rest: Omit<CpuProfile, 'level' | 'actionsPerSecond' | 'actionTicks'>,
): CpuProfile {
  return Object.freeze({
    level,
    actionsPerSecond,
    actionTicks: Math.round(TICKS_PER_SECOND / actionsPerSecond),
    ...rest,
  });
}

export const CPU_PROFILES: Readonly<Record<CpuLevel, CpuProfile>> = Object.freeze({
  1: profile(1, 1.5, {
    reactionTicks: 45,
    maxDrag: 1,
    pairs: 0,
    verify: 2,
    mistakeRate: 0.3,
    skillChains: false,
    raiseBelow: 4,
    budget: 400,
    horizon: 240,
  }),
  2: profile(2, 2.5, {
    reactionTicks: 28,
    maxDrag: 2,
    pairs: 0,
    verify: 3,
    mistakeRate: 0.12,
    skillChains: false,
    raiseBelow: 5,
    budget: 500,
    horizon: 300,
  }),
  3: profile(3, 4, {
    reactionTicks: 16,
    maxDrag: 3,
    pairs: 4,
    verify: 5,
    mistakeRate: 0.03,
    skillChains: false,
    raiseBelow: 6,
    budget: 700,
    horizon: 360,
  }),
  4: profile(4, 6, {
    reactionTicks: 9,
    maxDrag: 3,
    pairs: 8,
    verify: 6,
    mistakeRate: 0,
    skillChains: true,
    raiseBelow: 7,
    budget: 900,
    horizon: 420,
  }),
  5: profile(5, 8, {
    reactionTicks: 4,
    maxDrag: 4,
    pairs: 12,
    verify: 8,
    mistakeRate: 0,
    skillChains: true,
    raiseBelow: 7,
    budget: 1100,
    horizon: 480,
  }),
});

export function cpuProfile(level: number): CpuProfile {
  const l = Math.max(1, Math.min(5, Math.round(level))) as CpuLevel;
  return CPU_PROFILES[l];
}
