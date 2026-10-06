import type { SimConfig } from './config';
import type { RngState, Seed } from './rng';
import type { ScoreBreakdown } from './scoring';

/**
 * Block lifecycle (see README.md for the timing diagram):
 * - idle      resting, swappable, matchable
 * - swapping  mid-swap (already stored in its destination cell); locked, acts as support
 * - hovering  lost support; waits `timer` ticks, then falls
 * - falling   moving down (`fall` = sub-cell progress towards the next row)
 * - landing   just landed; cosmetic bounce for `timer` ticks; behaves like idle
 * - matched   part of a match group, flashing
 * - popping   flash over, waiting for its turn to pop
 * - popped    popped (invisible) but still occupies its cell until the whole group clears
 */
export type BlockState =
  'idle' | 'swapping' | 'hovering' | 'falling' | 'landing' | 'matched' | 'popping' | 'popped';

/**
 * Block kind. Only 'normal' blocks are generated today; the others are reserved
 * for garbage / relic mechanics (matching ignores the kind for now).
 */
export type BlockKind = 'normal' | 'garbage' | 'wild' | 'bomb';

export interface Block {
  /** Stable unique id (for render interpolation / audio). */
  id: number;
  kind: BlockKind;
  /** Color index 0..colors-1. */
  color: number;
  state: BlockState;
  /** Countdown for swapping / hovering / landing. */
  timer: number;
  /** Fall progress in sub-units (falling only). */
  fall: number;
  /** Direction the block is moving while swapping: +1 right, -1 left, 0 none. */
  swapDir: -1 | 0 | 1;
  /**
   * Chain flag: block is falling because a group below it cleared. A swapping
   * block keeps the flag ("propagates chaining") and hands it to the blocks
   * above it when it starts hovering at the end of its swap.
   */
  chain: boolean;
  /** Match group id (0 = none). */
  group: number;
  /** Pop order within its group. */
  popIndex: number;
}

export interface MatchGroup {
  id: number;
  size: number;
  /** Ticks since the match was detected. */
  age: number;
  /** Chain level credited to this clear (1 = not a chain link). */
  chain: number;
  /** Member cell indices in pop order (reading order). Blocks of a group never move. */
  cells: number[];
}

/**
 * Plain-data run modifiers (relic / curse parameters). Serializable, cloned by
 * `cloneSim` and included in both state hashes. Behaviour lives in `SimHooks`,
 * which may read (and mutate) these values.
 */
export type SimModifiers = Record<string, number>;

export type SimMode = 'endless' | 'static';

export interface SimStats {
  swaps: number;
  matches: number;
  blocksCleared: number;
  maxCombo: number;
  maxChain: number;
  rowsRisen: number;
}

/**
 * Complete simulation state: plain data only (structuredClone / JSON safe).
 * Grid is row-major, row 0 = TOP, row rows-1 = bottom active row.
 * `config` is frozen by `createSim` and shared by reference between clones.
 */
export interface SimState {
  seed: Seed;
  mode: SimMode;
  config: Readonly<SimConfig>;
  /** Relic / run parameters (plain numbers). */
  modifiers: SimModifiers;
  /** Number of steps executed so far. */
  tick: number;
  rng: RngState;
  /** rows*cols cells, index = row*cols + col. */
  cells: (Block | null)[];
  /** Next row coming up from below (not interactable, not matchable). */
  preview: Block[];
  nextBlockId: number;
  nextGroupId: number;
  groups: MatchGroup[];

  /** Rise progress into the next row, in sub-units [0, SUBUNITS_PER_CELL). */
  riseOffset: number;
  /** Fixed-point remainder of rise progress, [0, RISE_SCALE). */
  riseAccum: number;
  /** Remaining stop time (rise frozen). */
  stopTicks: number;
  /** Player is holding the raise control. */
  raiseHeld: boolean;
  /** Manual raise in progress (continues to the next full row after release). */
  manualRaising: boolean;
  /** Remaining top-out grace ticks. */
  grace: number;
  /** Consecutive ticks the top row has held no resting block (grace refills at graceRefillTicks). */
  graceClearTicks: number;
  /** Stack pinned against the ceiling and grace is draining. */
  danger: boolean;

  /** Current chain level (1 = no chain in progress). */
  chain: number;
  score: number;
  level: number;
  stats: SimStats;
  gameOver: boolean;
  /**
   * A match scan is needed on the next detection pass even if no block became
   * matchable through a swap/landing (set by row rise and board edits). Code that
   * edits `cells` directly should set it (`loadAscii` does).
   */
  matchScanPending: boolean;
}

export type SimInput =
  { type: 'swap'; row: number; col: number } | { type: 'raise'; active: boolean };

export type SwapRejectReason = 'gameOver' | 'outOfBounds' | 'empty' | 'locked';

export interface CellRef {
  row: number;
  col: number;
}

export interface MatchedBlockInfo extends CellRef {
  id: number;
  color: number;
}

export type SimEvent =
  | { type: 'swapped'; row: number; col: number; leftId: number | null; rightId: number | null }
  | { type: 'swapRejected'; row: number; col: number; reason: SwapRejectReason }
  | { type: 'landed'; id: number; row: number; col: number; chain: boolean }
  | {
      type: 'matched';
      groupId: number;
      blocks: MatchedBlockInfo[];
      combo: number;
      chain: number;
      stopTicks: number;
    }
  | { type: 'scored'; groupId: number; breakdown: ScoreBreakdown; score: number }
  | {
      type: 'popped';
      groupId: number;
      id: number;
      row: number;
      col: number;
      color: number;
      index: number;
      size: number;
      chain: number;
    }
  | { type: 'cleared'; groupId: number; cells: CellRef[] }
  | { type: 'chainEnd'; length: number }
  | { type: 'rowRisen'; previewIds: number[] }
  | { type: 'danger'; active: boolean; grace: number }
  | { type: 'levelUp'; level: number }
  | { type: 'gameOver'; tick: number; score: number };

export type SimEventType = SimEvent['type'];
