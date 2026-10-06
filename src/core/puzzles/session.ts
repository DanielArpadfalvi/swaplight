import { loadAscii } from '../ascii';
import { canSwap, cloneSim, createSim, step, type SimHooks } from '../sim';
import type { SimEvent, SimInput, SimState, SwapRejectReason } from '../types';
import { isBoardSettled, PUZZLE_CONFIG, PUZZLE_MODE, settleSim } from './grid';
import type { PuzzleDef, PuzzleGoal, PuzzleMove } from './types';

/**
 * Puzzle runner. Wraps a static-mode sim (no rise) with a move budget:
 * - a swap is only accepted while the board is settled (`isBoardSettled`) and
 *   costs one move;
 * - the caller steps the sim per frame with `puzzleTick` (or fast-forwards with
 *   `puzzleSettle`); the status is re-evaluated after every step;
 * - won as soon as the goal is reached; lost once the board is settled with no
 *   moves left and the goal not reached;
 * - `puzzleUndo` restores the state before the last swap, `puzzleRestart` the
 *   initial board.
 */

export type PuzzleStatus = 'playing' | 'won' | 'lost';

export type PuzzleSwapReject = SwapRejectReason | 'finished' | 'noMoves' | 'notSettled';

interface Snapshot {
  sim: SimState;
  moves: PuzzleMove[];
}

export interface PuzzleSession {
  readonly def: PuzzleDef;
  sim: SimState;
  status: PuzzleStatus;
  /** Swaps made so far (in order); `length` = moves used. */
  moves: PuzzleMove[];
  /** States before each swap (for undo). */
  undoStack: Snapshot[];
}

const NO_HOOKS: SimHooks = Object.freeze({});

function freshSim(def: PuzzleDef): SimState {
  const sim = createSim(`puzzle:${def.id}`, PUZZLE_CONFIG, PUZZLE_MODE);
  loadAscii(sim, def.board);
  return sim;
}

export function createPuzzleSession(def: PuzzleDef): PuzzleSession {
  const session: PuzzleSession = {
    def,
    sim: freshSim(def),
    status: 'playing',
    moves: [],
    undoStack: [],
  };
  // Run the initial match scan (a valid puzzle board has nothing to resolve).
  settleSim(session.sim);
  evaluate(session);
  return session;
}

export function puzzleMovesUsed(s: PuzzleSession): number {
  return s.moves.length;
}

export function puzzleMovesLeft(s: PuzzleSession): number {
  return Math.max(0, s.def.moves - s.moves.length);
}

/** Has the goal been reached in the current sim (cumulative over the session)? */
export function goalMet(goal: PuzzleGoal, sim: SimState): boolean {
  if (goal === 'clearAll') return sim.cells.every((b) => b === null);
  if (goal.type === 'chain') return sim.stats.maxChain >= goal.length;
  return sim.stats.maxCombo >= goal.size;
}

function evaluate(s: PuzzleSession): PuzzleStatus {
  if (goalMet(s.def.goal, s.sim)) s.status = 'won';
  else if (puzzleMovesLeft(s) === 0 && isBoardSettled(s.sim)) s.status = 'lost';
  else s.status = 'playing';
  return s.status;
}

export function puzzleCanSwap(s: PuzzleSession, row: number, col: number): PuzzleSwapReject | null {
  if (s.status !== 'playing') return 'finished';
  if (puzzleMovesLeft(s) === 0) return 'noMoves';
  if (!isBoardSettled(s.sim)) return 'notSettled';
  return canSwap(s.sim, row, col);
}

/**
 * Swap (row, col)↔(row, col+1): validates, records an undo snapshot, counts the
 * move and runs the tick that starts the swap (events go into `events`).
 * Returns null on success, otherwise the reject reason (nothing changes).
 */
export function puzzleSwap(
  s: PuzzleSession,
  row: number,
  col: number,
  events?: SimEvent[] | null,
): PuzzleSwapReject | null {
  const reason = puzzleCanSwap(s, row, col);
  if (reason) return reason;
  s.undoStack.push({ sim: cloneSim(s.sim), moves: s.moves.slice() });
  s.moves.push({ row, col });
  const input: SimInput = { type: 'swap', row, col };
  step(s.sim, [input], NO_HOOKS, events === undefined ? [] : events);
  evaluate(s);
  return null;
}

/** Advance one tick (render loop). */
export function puzzleTick(s: PuzzleSession, events?: SimEvent[] | null): SimEvent[] {
  const out = step(s.sim, [], NO_HOOKS, events);
  evaluate(s);
  return out;
}

/** Fast-forward silently until the board is settled; returns the new status. */
export function puzzleSettle(s: PuzzleSession): PuzzleStatus {
  settleSim(s.sim);
  return evaluate(s);
}

export function puzzleIsSettled(s: PuzzleSession): boolean {
  return isBoardSettled(s.sim);
}

/** Undo the last swap (also from a won/lost state). Returns false if there is nothing to undo. */
export function puzzleUndo(s: PuzzleSession): boolean {
  const snap = s.undoStack.pop();
  if (!snap) return false;
  s.sim = snap.sim;
  s.moves = snap.moves;
  evaluate(s);
  return true;
}

export function puzzleRestart(s: PuzzleSession): void {
  s.sim = freshSim(s.def);
  s.moves = [];
  s.undoStack = [];
  settleSim(s.sim);
  evaluate(s);
}

/** Apply a whole move list (each swap fast-forwarded). Returns the final status. */
export function puzzlePlay(s: PuzzleSession, moves: readonly PuzzleMove[]): PuzzleStatus {
  for (const m of moves) {
    const reason = puzzleSwap(s, m.row, m.col, null);
    if (reason) throw new Error(`puzzle ${s.def.id}: swap ${m.row},${m.col} rejected (${reason})`);
    puzzleSettle(s);
  }
  return s.status;
}
