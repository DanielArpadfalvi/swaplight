/** UI-facing state and actions of the Puzzle mode and the interactive tutorial. */

import type { PuzzleGoal, PuzzleStatus } from '../core/puzzles';
import type { TutorialStepId } from './tutorial';

/** A swap the coach mark / hint points at, in canvas CSS pixels. */
export interface CoachTarget {
  row: number;
  col: number;
  /** Center of the left cell. */
  x: number;
  y: number;
  cellSize: number;
  /** Drag the right block leftwards (the left cell is empty). */
  fromRight: boolean;
  /** Changes when the target is (re)shown (restarts the animation). */
  key: number;
}

export interface PuzzleResult {
  won: boolean;
  stars: number;
  /** Best stars before this solve (0 = first solve). */
  prevStars: number;
  movesUsed: number;
  hintsUsed: number;
  withinPar: boolean;
  /** Id of the next puzzle in the pack (null at the end of the pack). */
  nextId: string | null;
}

export interface PuzzleUiState {
  /** Pack shown on the level grid (1..4). */
  pack: number;
  /** Puzzle being played. */
  id: string | null;
  index: number;
  goal: PuzzleGoal | null;
  moveBudget: number;
  movesUsed: number;
  par: number;
  status: PuzzleStatus;
  canUndo: boolean;
  /** Solution hints used in this attempt. */
  hintsUsed: number;
  /** The puzzle has a teaching text hint (handcrafted). */
  hasTextHint: boolean;
  /** Open hint card: the teaching text, or the "show a move?" confirmation. */
  hintCard: 'text' | 'confirm' | null;
  /** i18n key of the teaching hint. */
  hintKey: string | null;
  /** Highlighted solution move. */
  highlight: CoachTarget | null;
  /** A drag is waiting for the board to settle. */
  waiting: boolean;
  result: PuzzleResult | null;
}

export const INITIAL_PUZZLE_UI: PuzzleUiState = {
  pack: 1,
  id: null,
  index: 0,
  goal: null,
  moveBudget: 0,
  movesUsed: 0,
  par: 0,
  status: 'playing',
  canUndo: false,
  hintsUsed: 0,
  hasTextHint: false,
  hintCard: null,
  hintKey: null,
  highlight: null,
  waiting: false,
  result: null,
};

export interface TutorialUiState {
  /** 0-based step index. */
  step: number;
  total: number;
  id: TutorialStepId;
  kind: 'board' | 'raise' | 'card';
  /** Moves made in the current step (picks the chain step's second text). */
  moves: number;
  coach: CoachTarget | null;
  /** The step was just completed (success flash before advancing). */
  success: boolean;
  /** Changes on every step (re)start (restarts the card animation). */
  key: number;
}

export interface PuzzleActions {
  /** Pack select → level grid. */
  openPack(pack: number): void;
  /** Level grid → play. */
  play(id: string): void;
  /** Back from the level grid to the pack select. */
  toPacks(): void;
  /** Back to the level grid of the current pack. */
  toLevels(): void;
  undo(): void;
  restart(): void;
  hint(): void;
  confirmHint(): void;
  closeHint(): void;
  next(): void;
}

export interface TutorialActions {
  skip(): void;
  /** Card steps: continue / finish. */
  next(): void;
}
