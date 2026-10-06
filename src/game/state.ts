/** UI-facing game state (published by the controller, rendered by the Preact overlay). */

import type { CpuLevel } from '../core/ai';
import type { RunState, StageGoal } from '../core/run';
import type { DailyChallenge } from './daily';
import type { Language } from '../i18n';
import type { ModeId } from './modes';
import type { CharmTargetKind, FinishedStage, RunResumePoint } from './runController';
import type { Overlay, Screen } from './nav';
import type { DailyResult, DailyStreak, ModeStats, PuzzleRecord, VersusRecord } from './save';
import type { GarbageIcon, VersusFormat } from './versus';
import {
  INITIAL_PUZZLE_UI,
  type PuzzleActions,
  type PuzzleUiState,
  type TutorialActions,
  type TutorialUiState,
} from './puzzleState';
import { DEFAULT_SETTINGS, type Settings } from './settings';

export type { Overlay, Screen } from './nav';

export type RestoreStatus = 'idle' | 'busy' | 'restored' | 'nothing' | 'failed';

export interface Toast {
  text: string;
  /** Display time in ms. */
  ms: number;
  /** Increments per toast (restarts the animation). */
  key: number;
}

export interface ScoreFlash {
  base: number;
  mult: number;
  total: number;
  chain: number;
  combo: number;
  /** Increments on every scored clear (restarts the chip animation). */
  key: number;
}

/** In-stage HUD numbers of a Run stage (published when they change). */
export interface RunHudState {
  goal: StageGoal;
  value: number;
  target: number;
  /** 0..1 */
  progress: number;
  /** Whole seconds left on the stage clock. */
  secondsLeft: number;
  won: boolean;
  act: number;
  stage: number;
  isBoss: boolean;
  curses: string[];
  /** Cryo charm active. */
  frozen: boolean;
  /** Overcharge charm active. */
  overcharged: boolean;
}

/** Charm waiting for a board target (the sim is paused meanwhile). */
export interface RunTargeting {
  slot: number;
  charmId: string;
  kind: CharmTargetKind;
  /** Board geometry in CSS px at the paused rise offset. */
  originX: number;
  originY: number;
  cellSize: number;
  rows: number;
  cols: number;
  riseOffsetPx: number;
}

export interface RunEndSummary {
  won: boolean;
  /** Where the run ended (act / stage index 0..3). */
  act: number;
  stage: number;
  reason: 'goal' | 'topOut' | 'time' | 'abandon';
  deckId: string;
  brightness: number;
  stagesCleared: number;
  bestChain: number;
  bestClear: number;
  totalScore: number;
  sparksEarned: number;
  relics: string[];
  /** Brightness levels unlocked by this run. */
  unlockedBrightness: number[];
}

export interface SavedRunInfo {
  act: number;
  stage: number;
  deckId: string;
  brightness: number;
  at: RunResumePoint;
}

/** Mode that owns the playing / paused screens. */
export type PlayMode = 'endless' | 'run' | 'versus' | 'daily' | 'puzzle' | 'tutorial';

/** A screen-space rectangle in CSS px. */
export interface UiRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Versus match in progress (setup choices + score line). */
export interface VersusUiState {
  level: CpuLevel;
  format: VersusFormat;
  round: number;
  /** Round wins of [player, CPU]. */
  wins: [number, number];
}

/** In-match Versus HUD numbers (published when they change). */
export interface VersusHudState {
  /** Garbage cells sent by the player / the CPU this round. */
  sent: number;
  oppSent: number;
  /** Incoming garbage (front first) of the player / the CPU. */
  queue: GarbageIcon[];
  oppQueue: GarbageIcon[];
  /** Total incoming cells of the player. */
  queueCells: number;
  oppDanger: boolean;
  /** Arming time of fresh incoming garbage (ms; queue icon animation). */
  armMs: number;
  /** Increments on every big incoming warning (restarts the banner). */
  warnKey: number;
  /**
   * Leaving now would forfeit the match (recorded as a loss): ask for confirmation first
   * (`VersusMode.needsLeaveConfirm`).
   */
  needsLeaveConfirm: boolean;
}

/** Placement of the Versus overlays (from the versus layout). */
export interface VersusLayoutUi {
  queue: UiRect;
  miniQueue: UiRect;
  card: UiRect;
  mini: UiRect;
}

export interface VersusResultUi {
  level: CpuLevel;
  /** Winner of the round just played: 0 player, 1 CPU, null draw. */
  winner: 0 | 1 | null;
  matchOver: boolean;
  matchWinner: 0 | 1 | null;
  round: number;
  wins: [number, number];
  format: VersusFormat;
  sent: number;
  received: number;
  seconds: number;
  maxChain: number;
  record: VersusRecord;
}

/** Daily attempt being set up / played. */
export interface DailyUiState {
  challenge: DailyChallenge;
  official: boolean;
  /** Seconds left on the clock. */
  secondsLeft: number;
}

export interface DailyResultUi {
  date: string;
  score: number;
  official: boolean;
  reason: 'time' | 'topOut';
  newBest: boolean;
  streak: number;
  bestStreak: number;
  /** Official score of the day (null = not played officially). */
  todayScore: number | null;
  practiceBest: number;
  history: { date: string; score: number | null }[];
  shareText: string;
}

export interface GameUiState {
  screen: Screen;
  /** Which mode owns the playing / paused screens. */
  mode: PlayMode;
  versusSetup: { level: CpuLevel; format: VersusFormat };
  versus: VersusUiState | null;
  versusHud: VersusHudState | null;
  versusLayout: VersusLayoutUi | null;
  versusResult: VersusResultUi | null;
  /** Versus records per level (from the save). */
  versusRecords: Record<string, VersusRecord>;
  daily: DailyUiState | null;
  dailyResult: DailyResultUi | null;
  /** Daily history + streak (from the save). */
  dailySave: { records: Record<string, DailyResult>; streak: DailyStreak };
  /** Today's date key (local; overridable by the test hooks). */
  dailyToday: string;
  /** Clipboard available (share buttons). */
  canShare: boolean;
  /** Puzzle mode screens (pack select, level grid, play, result). */
  puzzle: PuzzleUiState;
  /** Solved puzzles (from the save). */
  puzzleRecords: Record<string, PuzzleRecord>;
  /** Interactive tutorial in progress. */
  tutorial: TutorialUiState | null;
  /** The tutorial was completed (or skipped through); hides the menu banner. */
  tutorialDone: boolean;
  /** Current run (plain data, replaced on every change). */
  run: RunState | null;
  runHud: RunHudState | null;
  /** Shop helpers for the current run. */
  runRerollCost: number;
  runRelicSlots: number;
  runCharmSlots: number;
  /** Result of the stage just finished (result screen). */
  runFinished: FinishedStage | null;
  runEnd: RunEndSummary | null;
  /** Relics that just fired (HUD pulse). */
  relicPulse: { ids: string[]; key: number } | null;
  /** Charm slot whose action card is open (in a stage the sim is paused). */
  charmMenu: number | null;
  targeting: RunTargeting | null;
  /** Deck / Brightness picked on the setup screen. */
  runSetup: { deckId: string; brightness: number };
  /** Unlock keys from the save (Brightness levels…). */
  unlocks: string[];
  /** Run items seen so far (`relic.<id>`, `charm.<id>`, `boss.<id>`; from the save). */
  collectionSeen: string[];
  /** Run saved in the save file (menu "Continue"). */
  savedRun: SavedRunInfo | null;
  score: number;
  level: number;
  /** Whole seconds played. */
  seconds: number;
  best: number;
  maxChain: number;
  newBest: boolean;
  /** Stack pinned against the ceiling. */
  danger: boolean;
  scoreFlash: ScoreFlash | null;
  /** HUD band placement in CSS px (from the board layout). */
  hudTop: number;
  hudHeight: number;
  boardLeft: number;
  boardWidth: number;
  /** Top of the in-game controls strip below the board (CSS px). */
  controlsTop: number;
  /** The on-screen RAISE button is held. */
  raiseHeld: boolean;
  /** Overlays stacked above the screen (settings, stats, dialogs), bottom → top. */
  overlays: Overlay[];
  settings: Settings;
  /** Current UI language (re-renders the tree on change). */
  language: Language;
  /** Lifetime stats per mode (from the save). */
  modeStats: Record<string, ModeStats>;
  fullVersion: boolean;
  restoreStatus: RestoreStatus;
  toast: Toast | null;
}

export interface GameActions {
  /** Start the Endless mode (kept for the quick-play path and tests). */
  play(): void;
  /** Start a mode from the menu (explains locked / coming-soon modes with a toast). */
  startMode(id: ModeId): void;
  pause(): void;
  resume(): void;
  /** Press (true) / release (false) the on-screen RAISE button. */
  setRaise(active: boolean): void;
  retry(): void;
  /** Quit to the main menu. */
  menu(): void;
  openOverlay(overlay: Overlay): void;
  /** Close the top overlay. */
  closeOverlay(): void;
  updateSettings(patch: Partial<Settings>): void;
  restorePurchases(): void;
  /** Same as the hardware back button / Escape. */
  back(): void;
  exitApp(): void;
  run: RunActions;
  versus: VersusActions;
  daily: DailyActions;
  puzzle: PuzzleActions;
  tutorial: TutorialActions;
}

/** Versus-mode UI actions (see `versusMode.ts`). */
export interface VersusActions {
  selectLevel(level: number): void;
  selectFormat(format: VersusFormat): void;
  /** Setup → match. */
  start(): void;
  /** Result → next round of an undecided match. */
  nextRound(): void;
  rematch(): void;
  /** Result → difficulty select. */
  changeOpponent(): void;
}

/** Daily-mode UI actions (see `dailyMode.ts`). */
export interface DailyActions {
  /** Intro → playing. */
  begin(): void;
  /** Result → a practice attempt of the same challenge. */
  practiceAgain(): void;
  /** Copy the share text. */
  share(): void;
}

/** Run-mode UI actions (see `runMode.ts`). */
export interface RunActions {
  continueRun(): void;
  /** Open the deck select for a new run. */
  newRun(): void;
  selectDeck(id: string): void;
  selectBrightness(level: number): void;
  start(): void;
  /** Map → stage intro. */
  playStage(): void;
  /** Stage intro → playing. */
  beginStage(): void;
  /** Result screen → shop (or victory summary). */
  continueFromResult(): void;
  buyRelic(index: number): void;
  buyCharm(index: number): void;
  sellRelic(slot: number): void;
  sellCharm(slot: number): void;
  reroll(): void;
  leaveShop(): void;
  /** Open / close a charm's action card. */
  openCharm(slot: number | null): void;
  useCharm(slot: number): void;
  /** Board target picked while targeting. */
  target(row: number, col: number): void;
  cancelCharm(): void;
  /** Ask to abandon (confirm dialog). */
  abandon(): void;
  confirmAbandon(): void;
  /** Run summary → menu. */
  finish(): void;
}

export const INITIAL_UI_STATE: GameUiState = {
  screen: 'menu',
  mode: 'endless',
  versusSetup: { level: 1, format: 'single' },
  versus: null,
  versusHud: null,
  versusLayout: null,
  versusResult: null,
  versusRecords: {},
  daily: null,
  dailyResult: null,
  dailySave: { records: {}, streak: { current: 0, best: 0, last: '' } },
  dailyToday: '1970-01-01',
  canShare: false,
  puzzle: INITIAL_PUZZLE_UI,
  puzzleRecords: {},
  tutorial: null,
  tutorialDone: false,
  run: null,
  runHud: null,
  runRerollCost: 0,
  runRelicSlots: 5,
  runCharmSlots: 2,
  runFinished: null,
  runEnd: null,
  relicPulse: null,
  charmMenu: null,
  targeting: null,
  runSetup: { deckId: 'neon', brightness: 1 },
  unlocks: [],
  collectionSeen: [],
  savedRun: null,
  score: 0,
  level: 1,
  seconds: 0,
  best: 0,
  maxChain: 1,
  newBest: false,
  danger: false,
  scoreFlash: null,
  hudTop: 0,
  hudHeight: 160,
  boardLeft: 0,
  boardWidth: 300,
  controlsTop: 0,
  raiseHeld: false,
  overlays: [],
  settings: { ...DEFAULT_SETTINGS },
  language: 'en',
  modeStats: {},
  fullVersion: false,
  restoreStatus: 'idle',
  toast: null,
};

/** "m:ss" game clock. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
