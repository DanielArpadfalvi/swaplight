import { rows, type PuzzleDef, type PuzzleMove } from '../core/puzzles';
import type { SimState } from '../core/types';

/**
 * Interactive tutorial script (pure data + rules, no DOM). Each step is a scripted board with a
 * success condition; the coach mark points at the next move of `script`. Board steps run on a
 * static puzzle sim (no rise); the `raise` step runs on a short Endless stack; `card` steps are a
 * single explanatory card.
 */

export type TutorialStepId = 'swap' | 'match' | 'drop' | 'combo' | 'chain' | 'raise' | 'relics';

export type TutorialGoal =
  /** Any completed swap. */
  | { type: 'swap' }
  /** Any match. */
  | { type: 'match' }
  | { type: 'combo'; size: number }
  | { type: 'chain'; length: number }
  /** Rows risen (manual raise or the natural rise). */
  | { type: 'raise'; rows: number }
  /** Acknowledge a card. */
  | { type: 'card' };

export interface TutorialStep {
  id: TutorialStepId;
  kind: 'board' | 'raise' | 'card';
  /** `loadAscii` board (rows top → bottom, bottom aligned). */
  board?: string;
  goal: TutorialGoal;
  /** The moves the coach mark demonstrates, in order. */
  script: readonly PuzzleMove[];
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'swap',
    kind: 'board',
    board: rows('..Y...', '.PGB..', 'GRBYRP'),
    goal: { type: 'swap' },
    script: [{ row: 10, col: 2 }],
  },
  {
    id: 'match',
    kind: 'board',
    board: rows('.YP...', 'RRBRGY'),
    goal: { type: 'match' },
    script: [{ row: 11, col: 2 }],
  },
  {
    id: 'drop',
    kind: 'board',
    board: rows('.B....', '.Y....', '.RB...', 'GYBR..'),
    goal: { type: 'match' },
    script: [{ row: 8, col: 1 }],
  },
  {
    id: 'combo',
    kind: 'board',
    board: rows('..R...', '..R.Y.', 'RRGRYB'),
    goal: { type: 'combo', size: 4 },
    script: [{ row: 11, col: 2 }],
  },
  {
    id: 'chain',
    kind: 'board',
    board: rows('.Y....', '.R....', 'YRY...', 'RYR...'),
    goal: { type: 'chain', length: 2 },
    script: [
      { row: 10, col: 2 },
      { row: 11, col: 1 },
    ],
  },
  {
    id: 'raise',
    kind: 'raise',
    board: rows('..G...', '.BRY..', 'YRBGP.', 'GPYRBY'),
    goal: { type: 'raise', rows: 2 },
    script: [],
  },
  {
    id: 'relics',
    kind: 'card',
    goal: { type: 'card' },
    script: [],
  },
];

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

/** Puzzle definition used to run a board step on the puzzle session runner. */
export function tutorialPuzzleDef(step: TutorialStep, index: number): PuzzleDef {
  if (step.kind !== 'board' || !step.board) throw new Error(`tutorial: ${step.id} has no board`);
  return {
    id: `tutorial-${step.id}`,
    pack: 0,
    index,
    board: step.board,
    // Generous budget: a wrong move restarts the step anyway (see `tutorialShouldRetry`).
    moves: step.script.length + 4,
    // The tutorial checks its own goal; the session goal only stops input once reached.
    goal: step.goal.type === 'chain' ? step.goal : { type: 'combo', size: 99 },
  };
}

/** Has the step's goal been reached on `sim` (after `movesMade` swaps)? */
export function tutorialGoalMet(goal: TutorialGoal, sim: SimState, movesMade: number): boolean {
  switch (goal.type) {
    case 'swap':
      return movesMade > 0;
    case 'match':
      return sim.stats.matches > 0;
    case 'combo':
      return sim.stats.maxCombo >= goal.size;
    case 'chain':
      return sim.stats.maxChain >= goal.length;
    case 'raise':
      return sim.stats.rowsRisen >= goal.rows;
    case 'card':
      return false;
  }
}

function samePrefix(moves: readonly PuzzleMove[], script: readonly PuzzleMove[]): boolean {
  if (moves.length > script.length) return false;
  return moves.every((m, i) => m.row === script[i]!.row && m.col === script[i]!.col);
}

/** The scripted move the coach mark should show next (null once the player left the script). */
export function nextCoachMove(step: TutorialStep, moves: readonly PuzzleMove[]): PuzzleMove | null {
  if (!samePrefix(moves, step.script)) return null;
  return step.script[moves.length] ?? null;
}

/**
 * After a settled board without success: restart the step when the player left the script (or
 * ran out of script) — the scripted board can then no longer be solved the intended way.
 */
export function tutorialShouldRetry(step: TutorialStep, moves: readonly PuzzleMove[]): boolean {
  if (step.kind !== 'board' || moves.length === 0) return false;
  return !samePrefix(moves, step.script) || moves.length >= step.script.length;
}
