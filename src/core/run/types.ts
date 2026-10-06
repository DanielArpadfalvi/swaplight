import type { SimConfig } from '../config';
import type { RngState } from '../rng';
import type { ScoreContext } from '../scoring';
import type { SimHooks } from '../sim';
import type { SimModifiers, SimState } from '../types';

/** Plain-data run types. Everything in `RunState` is JSON-serializable. */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type GoalType = 'scoreInTime' | 'clearBlocks' | 'survive' | 'chainTarget';

export interface StageGoal {
  type: GoalType;
  /**
   * scoreInTime: points · clearBlocks: blocks · chainTarget: number of chains ·
   * survive: equals `timeLimit` (ticks to survive).
   */
  target: number;
  /** chainTarget: minimum chain length that counts (2 = "×2"). 0 otherwise. */
  chainLength: number;
  /** Time limit in ticks (survive: the duration to survive). */
  timeLimit: number;
  /** Speed level the stage starts at. */
  startLevel: number;
}

export interface StageProgress {
  /** Current value towards the goal (points, blocks, chains, ticks survived). */
  value: number;
  target: number;
  /** value / target clamped to 0..1. */
  progress: number;
  /** value / target, unclamped (overachievement). */
  ratio: number;
  ticksLeft: number;
  /** Goal reached (latched: values are monotone). */
  won: boolean;
  /** Topped out or ran out of time before reaching the goal. */
  lost: boolean;
  /**
   * The stage is over: lost, or won and the board has settled (no group clearing, no chain
   * in progress) so a finishing chain still counts. The game layer then calls `stageResult`.
   */
  finished: boolean;
}

/** Summary of a finished stage (plain data), input of `completeStage`. */
export interface StageResult {
  won: boolean;
  value: number;
  target: number;
  ratio: number;
  ticks: number;
  ticksLeft: number;
  score: number;
  blocksCleared: number;
  maxChain: number;
  maxCombo: number;
  /** Final `sim.modifiers` (carries relic state and stage counters back into the run). */
  modifiers: SimModifiers;
}

export type RunPhase = 'stage' | 'shop' | 'won' | 'lost';

export interface OwnedRelic {
  id: string;
  /** Price paid (sell value = ⌊paid / 2⌋, min 1). */
  paid: number;
  /** Relic state (plain numbers), copied into `sim.modifiers` during a stage. */
  state: Record<string, number>;
}

export interface OwnedCharm {
  id: string;
  paid: number;
}

export interface ShopOffer {
  id: string;
  price: number;
  sold: boolean;
}

export interface ShopState {
  relics: ShopOffer[];
  charms: ShopOffer[];
  /** Rerolls bought in this shop. */
  rerolls: number;
  /** Free rerolls left in this shop. */
  freeRerolls: number;
}

export interface PlannedStage {
  act: number;
  /** 0..2 normal, 3 boss. */
  stage: number;
  goalType: GoalType;
  /** Boss curses (empty for normal stages). */
  curses: string[];
}

export interface StageRecord {
  act: number;
  stage: number;
  goalType: GoalType;
  won: boolean;
  value: number;
  target: number;
  score: number;
  szikra: number;
}

export interface RunStats {
  totalScore: number;
  maxChain: number;
  maxCombo: number;
  blocksCleared: number;
  szikraEarned: number;
  charmsUsed: number;
  relicsBought: number;
}

export interface RunState {
  version: 1;
  seed: string;
  deckId: string;
  /** Difficulty 1..8 (cumulative modifiers). */
  brightness: number;
  phase: RunPhase;
  /** 1..3 */
  act: number;
  /** 0..2 normal stages, 3 = boss. */
  stage: number;
  /** Currency. */
  szikra: number;
  relics: OwnedRelic[];
  charms: OwnedCharm[];
  shop: ShopState | null;
  /** All 12 stages, decided at run creation (shown ahead, Balatro-style). */
  plan: PlannedStage[];
  /** Run RNG stream (shop offers); independent of every sim RNG. */
  rng: RngState;
  bossesDefeated: number;
  history: StageRecord[];
  stats: RunStats;
}

/* ------------------------------------------------------------------------------------------ */
/* Effects                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Static facts about the stage being played (constant during the stage). */
export interface StageInfo {
  act: number;
  stage: number;
  isBoss: boolean;
  goal: StageGoal;
  /** Szikra held when the stage started. */
  szikra: number;
  relicCount: number;
  relicSlots: number;
  bossesDefeated: number;
}

/** Per-effect view of its own state (namespaced keys in `sim.modifiers`). */
export interface EffectState {
  get(key: string): number;
  set(key: string, value: number): void;
}

export interface EffectScoreCtx extends EffectState {
  readonly score: ScoreContext;
  readonly sim: SimState;
  readonly info: StageInfo;
}

export interface EffectSimCtx extends EffectState {
  readonly sim: SimState;
  readonly info: StageInfo;
}

export interface EffectClearCtx extends EffectSimCtx {
  readonly combo: number;
  readonly chain: number;
  readonly colors: readonly number[];
}

/** Static economy / loadout changes (summed over deck, relics, brightness). */
export interface EconomyMods {
  interestCap: number;
  relicSlots: number;
  charmSlots: number;
  /** Free rerolls per shop. */
  freeRerolls: number;
  /** Extra Szikra after every won stage. */
  stageBonus: number;
  /** Extra Szikra after a boss stage. */
  bossBonus: number;
  /** Multipliers (×) for the overachievement / remaining-time bonus. */
  overachieveMult: number;
  timeBonusMult: number;
  /** Szikra when a charm is used. */
  charmUseBonus: number;
}

/**
 * A run effect: the common shape of relics, deck rules, brightness rules and boss curses.
 * Every hook is optional. See README.md for the order of application.
 */
export interface RunEffect {
  /** Change the stage's SimConfig overrides (start level, colors, hover time …). */
  config?: (cfg: Partial<SimConfig>, info: StageInfo) => void;
  /** Initial `sim.modifiers` entries for the stage (e.g. a curse's locked column). */
  modifiers?: (mods: SimModifiers, info: StageInfo, rng: RngState) => void;
  /** Runs once per match before the score phases: update state, react to the clear. */
  onMatch?: (c: EffectScoreCtx) => void;
  /** Phase 1: added to base. */
  base?: (c: EffectScoreCtx) => number;
  /** Phase 2: added to mult. */
  mult?: (c: EffectScoreCtx) => number;
  /** Phase 3: mult is multiplied by the result (1 = no change). */
  xmult?: (c: EffectScoreCtx) => number;
  /** Adjust stop time earned by a match (chained in order). */
  stopTicks?: (ticks: number, c: EffectSimCtx & { combo: number; chain: number }) => number;
  /** Adjust auto-rise speed (chained in order). */
  riseSpeed?: (speed: number, c: EffectSimCtx) => number;
  /** A group left the board (board effects: bombs, wilds …). */
  onClear?: (c: EffectClearCtx) => void;
  /** Static economy changes. */
  economy?: Partial<EconomyMods>;
}

export interface RelicDef extends RunEffect {
  id: string;
  rarity: Rarity;
  price: number;
  /** i18n keys: `${key}.name`, `${key}.desc`. */
  i18nKey: string;
  /** English description (docs / fallback). */
  desc: string;
  /** Initial state (persisted for the whole run). */
  initialState?: Record<string, number>;
  /** Reset stage-scoped keys before a stage starts. */
  stageStart?: (state: Record<string, number>) => void;
  /** Extra Szikra at the end of a won stage (state = final relic state). */
  stageEnd?: (state: Record<string, number>, result: StageResult, info: StageInfo) => number;
  /** Run-level update after a won stage (e.g. count bosses). */
  afterStage?: (state: Record<string, number>, result: StageResult, info: StageInfo) => void;
  /** A charm was used during a stage (sim) or in the shop (sim = null). */
  onCharm?: (c: { sim: SimState | null } & EffectState) => void;
}

export interface CurseDef extends RunEffect {
  id: string;
  i18nKey: string;
  desc: string;
  /** Curse cannot appear when the deck already plays this many colors (Spectrum). */
  maxDeckColors?: number;
}

export interface DeckDef extends RunEffect {
  id: string;
  i18nKey: string;
  desc: string;
  /** Free deck (unlocked without the full version). */
  free: boolean;
  startSzikra: number;
  /** Extra shop offers. */
  shopRelics: number;
  shopCharms: number;
  /** Added to relic prices. */
  relicPriceDelta: number;
  /** Added to every stage's base Szikra reward (may be negative, reward ≥ 0). */
  stageRewardDelta: number;
  /** Starting relics/charms; `random-common` draws one common relic from the run RNG. */
  startRelics: string[];
  startCharms: string[];
}

export interface BrightnessDef extends RunEffect {
  level: number;
  i18nKey: string;
  desc: string;
}

export interface CharmCtx {
  /** Optional target cell; charms pick a deterministic default when absent. */
  target?: { row?: number; col?: number };
}

export interface CharmDef {
  id: string;
  rarity: Rarity;
  price: number;
  i18nKey: string;
  desc: string;
  /** 'stage': needs a sim · 'any': usable in the shop too (no sim). */
  usable: 'stage' | 'any';
  /** Mutate the sim deterministically. Returns false when it had no effect (charm kept). */
  apply?: (sim: SimState, ctx: CharmCtx) => boolean;
  /** Run-level effect (e.g. Szikra). */
  applyRun?: (run: RunState) => void;
}

/** Everything the game layer needs to play a stage. */
export interface StageSetup {
  /** Seed of the stage's sim (independent of the run RNG). */
  seed: string;
  mode: 'endless';
  config: Partial<SimConfig>;
  modifiers: SimModifiers;
  hooks: SimHooks;
  goal: StageGoal;
  info: StageInfo;
  curses: string[];
}
