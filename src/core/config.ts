/**
 * All simulation tunables. Times are in ticks @ 60 Hz. Distances are integer
 * sub-cell units (SUBUNITS_PER_CELL per cell) so everything stays deterministic.
 */

/** Sub-cell resolution used for rise offset and fall progress. */
export const SUBUNITS_PER_CELL = 16;
/** Rise speeds are expressed in 1/RISE_SCALE sub-units per tick (fixed point). */
export const RISE_SCALE = 1000;
/** Fixed simulation rate. */
export const TICKS_PER_SECOND = 60;

export interface SimConfig {
  cols: number;
  rows: number;
  /** Number of block colors in play (3–6). */
  colors: number;

  /** Duration of a swap animation; blocks are locked meanwhile. */
  swapTicks: number;
  /** Blocks that lose support hover this long before falling. */
  hoverTicks: number;
  /** Fall speed in sub-units per tick (16 = one cell per tick). */
  fallSpeed: number;
  /** Cosmetic landing "bounce" duration (block is idle-equivalent meanwhile). */
  landTicks: number;

  /** Matched blocks flash this long before popping starts. */
  flashTicks: number;
  /** Gap between consecutive pops inside a match group. */
  popTicksPerBlock: number;

  /** Auto-rise speed at level 1, in 1/RISE_SCALE sub-units per tick. */
  riseSpeedBase: number;
  /** Added auto-rise speed per level above 1. */
  riseSpeedPerLevel: number;
  /** Manual raise speed, in 1/RISE_SCALE sub-units per tick. */
  manualRaiseSpeed: number;

  /** Stop time for a combo of 4: comboStopBase; each extra block adds comboStopPerBlock. */
  comboStopBase: number;
  comboStopPerBlock: number;
  /** Stop time for chain x2: chainStopBase; each extra chain level adds chainStopPerLevel. */
  chainStopBase: number;
  chainStopPerLevel: number;

  /** Ticks the stack may be pinned against the ceiling before game over. */
  graceTicks: number;

  startLevel: number;
  maxLevel: number;
  /** Level +1 every N ticks (0 disables). */
  levelUpTicks: number;
  /** Level +1 every N blocks cleared (0 disables). */
  levelUpBlocks: number;

  /** Initial board column heights are drawn uniformly from [min, max]. */
  initialMinHeight: number;
  initialMaxHeight: number;

  /** Scoring: base points per cleared block. */
  pointsPerBlock: number;
  /** Scoring: unit of the progressive combo bonus (see scoring.ts). */
  comboBonusUnit: number;
}

export const DEFAULT_CONFIG: Readonly<SimConfig> = Object.freeze({
  cols: 6,
  rows: 12,
  colors: 5,

  swapTicks: 4,
  hoverTicks: 12,
  fallSpeed: SUBUNITS_PER_CELL,
  landTicks: 10,

  flashTicks: 44,
  popTicksPerBlock: 9,

  // Level 1: 16 sub-units / 0.02 per tick = 800 ticks (~13 s) per row.
  riseSpeedBase: 20,
  // Level 20: 20 + 19*14 = 286 → ~56 ticks (~0.9 s) per row.
  riseSpeedPerLevel: 14,
  // 2 sub-units per tick → 8 ticks per row.
  manualRaiseSpeed: 2000,

  comboStopBase: 45,
  comboStopPerBlock: 10,
  chainStopBase: 90,
  chainStopPerLevel: 30,

  graceTicks: 120,

  startLevel: 1,
  maxLevel: 20,
  levelUpTicks: 30 * TICKS_PER_SECOND,
  levelUpBlocks: 50,

  initialMinHeight: 4,
  initialMaxHeight: 7,

  pointsPerBlock: 10,
  comboBonusUnit: 10,
});

/** Merge overrides onto the defaults and validate. Returns a fresh plain object. */
export function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  const config: SimConfig = { ...DEFAULT_CONFIG, ...overrides };
  validateConfig(config);
  return config;
}

export function validateConfig(config: SimConfig): void {
  const ints = Object.entries(config) as [keyof SimConfig, number][];
  for (const [key, value] of ints) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`SimConfig.${key} must be a non-negative integer (got ${value})`);
    }
  }
  if (config.cols < 3) throw new RangeError('SimConfig.cols must be >= 3');
  if (config.rows < 4) throw new RangeError('SimConfig.rows must be >= 4');
  if (config.colors < 3 || config.colors > 6) throw new RangeError('SimConfig.colors must be 3..6');
  if (config.swapTicks < 1) throw new RangeError('SimConfig.swapTicks must be >= 1');
  if (config.fallSpeed < 1) throw new RangeError('SimConfig.fallSpeed must be >= 1');
  if (config.startLevel < 1 || config.maxLevel < config.startLevel) {
    throw new RangeError('SimConfig level range invalid');
  }
  if (config.initialMaxHeight < config.initialMinHeight || config.initialMaxHeight >= config.rows) {
    throw new RangeError('SimConfig initial height range invalid');
  }
}

/** Auto-rise speed (1/RISE_SCALE sub-units per tick) for a level. */
export function riseSpeedForLevel(config: SimConfig, level: number): number {
  const clamped = Math.max(1, Math.min(config.maxLevel, level));
  return config.riseSpeedBase + (clamped - 1) * config.riseSpeedPerLevel;
}

/** Stop time awarded by a clear. `chain` is the chain level of the clear (1 = no chain). */
export function stopTicksFor(config: SimConfig, combo: number, chain: number): number {
  const comboStop = combo >= 4 ? config.comboStopBase + (combo - 4) * config.comboStopPerBlock : 0;
  const chainStop = chain >= 2 ? config.chainStopBase + (chain - 2) * config.chainStopPerLevel : 0;
  return Math.max(comboStop, chainStop);
}
