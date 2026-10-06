import type { SimConfig } from './config';
import type { SimState } from './types';

/**
 * Balatro-style scoring: every clear scores `base × mult`.
 *
 * A clear runs through a pipeline of ScoreModifier hooks that mutate a shared
 * context. The built-in hooks compute the defaults; relics/charms append hooks.
 */

export interface ScoreContext {
  /** Blocks cleared by this match. */
  blocks: number;
  /** Combo size (blocks matched in the same detection pass). */
  combo: number;
  /** Chain level credited to this clear (1 = no chain). */
  chain: number;
  /** Current speed level. */
  level: number;
  /** Color index of every cleared block. */
  colors: number[];
  base: number;
  mult: number;
  readonly config: Readonly<SimConfig>;
  /**
   * The sim that produced the clear (set by `step`; absent when scoring standalone).
   * Modifiers may read it and update `sim.modifiers` deterministically (stateful relics).
   */
  readonly sim?: SimState;
}

export type ScoreModifier = (ctx: ScoreContext) => void;

export interface ScoreBreakdown {
  blocks: number;
  combo: number;
  chain: number;
  base: number;
  mult: number;
  total: number;
}

export interface ClearInfo {
  blocks: number;
  combo: number;
  chain: number;
  level: number;
  colors: number[];
}

/**
 * Progressive combo bonus: 0 below 4, then unit × triangular(combo − 3):
 * 4 → 1u, 5 → 3u, 6 → 6u, 7 → 10u …
 */
export function comboBonus(combo: number, unit: number): number {
  if (combo < 4) return 0;
  const m = combo - 3;
  return (unit * m * (m + 1)) / 2;
}

/** base += pointsPerBlock per block. */
export const blockPoints: ScoreModifier = (ctx) => {
  ctx.base += ctx.blocks * ctx.config.pointsPerBlock;
};

/** base += progressive combo bonus. */
export const comboPoints: ScoreModifier = (ctx) => {
  ctx.base += comboBonus(ctx.combo, ctx.config.comboBonusUnit);
};

/** mult += chain − 1 (so chain n ⇒ mult n with the default starting mult of 1). */
export const chainMultiplier: ScoreModifier = (ctx) => {
  ctx.mult += Math.max(0, ctx.chain - 1);
};

export const BASE_SCORE_PIPELINE: readonly ScoreModifier[] = Object.freeze([
  blockPoints,
  comboPoints,
  chainMultiplier,
]);

/** Score a single clear: built-in pipeline, then `extra` modifiers in order (`sim` → `ctx.sim`). */
export function scoreClear(
  info: ClearInfo,
  config: Readonly<SimConfig>,
  extra: readonly ScoreModifier[] = [],
  sim?: SimState,
): ScoreBreakdown {
  const ctx: ScoreContext = {
    blocks: info.blocks,
    combo: info.combo,
    chain: info.chain,
    level: info.level,
    colors: [...info.colors],
    base: 0,
    mult: 1,
    config,
    sim,
  };
  for (const mod of BASE_SCORE_PIPELINE) mod(ctx);
  for (const mod of extra) mod(ctx);
  const total = Math.max(0, Math.floor(ctx.base * ctx.mult));
  return {
    blocks: ctx.blocks,
    combo: ctx.combo,
    chain: ctx.chain,
    base: ctx.base,
    mult: ctx.mult,
    total,
  };
}
