import {
  applyMove,
  blockCount,
  colorCounts,
  gridFromAscii,
  gridKey,
  goalReached,
  hasMatch,
  isCandidateMove,
  isStable,
  PUZZLE_COLS,
  PUZZLE_ROWS,
  type Grid,
  type MoveResult,
} from './grid';
import type { PuzzleGoal, PuzzleMove } from './types';

/**
 * Exhaustive puzzle solver over swap sequences made on settled boards.
 *
 * Every state is a settled color grid (see grid.ts); a move is resolved with
 * the real engine, so the solver agrees with the runner tick for tick.
 * - `findShortest`: iterative deepening DFS with a transposition table of
 *   settled grids (`key → deepest remaining budget that failed`). Proves "not
 *   solvable in fewer moves" as a side effect.
 * - `countSolutions`: exact number of move sequences of each length 1..N that
 *   reach the goal on their last move (memoised per grid; counts are a prefix
 *   property, so one table serves every depth).
 * Pruning: same-color and empty/empty swaps are skipped (never useful); for
 * `clearAll` a grid holding a color with 1 or 2 blocks is dead (no new blocks
 * appear in static mode).
 */

export interface SolverInput {
  board: string;
  goal: PuzzleGoal;
}

export interface SolveOptions {
  /** Abort after expanding this many states (result `aborted`). Default 2e6. */
  nodeLimit?: number;
}

export interface SolveResult {
  /** Shortest solution length within the budget, or null. */
  shortest: number | null;
  /** One shortest solution. */
  solution: PuzzleMove[] | null;
  /** States expanded. */
  nodes: number;
  /** Moves resolved with the engine (the rest took the no-match fast path). */
  engineMoves: number;
  aborted: boolean;
}

export interface CountResult {
  /** `byLength[k]` = sequences of exactly k moves that reach the goal on move k (index 0 unused). */
  byLength: number[];
  /** Total sequences of ≤ N moves. */
  total: number;
  shortest: number | null;
  nodes: number;
  aborted: boolean;
}

interface Child {
  move: PuzzleMove;
  result: MoveResult;
  key: string;
}

class Search {
  nodes = 0;
  engineMoves = 0;
  aborted = false;
  /** Engine results per (grid, move), so iterative deepening never re-simulates. */
  private readonly moveCache = new Map<string, MoveResult>();

  constructor(
    readonly goal: PuzzleGoal,
    readonly nodeLimit: number,
  ) {}

  dead(g: Grid): boolean {
    if (this.goal !== 'clearAll') return false;
    for (const n of colorCounts(g)) if (n === 1 || n === 2) return true;
    return false;
  }

  expand(g: Grid, key: string): Child[] {
    this.nodes++;
    if (this.nodes > this.nodeLimit) this.aborted = true;
    const out: Child[] = [];
    // Highest occupied row: nothing above it can move.
    let top = 0;
    while (top < PUZZLE_ROWS && rowEmpty(g, top)) top++;
    for (let row = top; row < PUZZLE_ROWS; row++) {
      for (let col = 0; col < PUZZLE_COLS - 1; col++) {
        if (!isCandidateMove(g, row, col)) continue;
        const ck = `${key}${row * PUZZLE_COLS + col}`;
        let result = this.moveCache.get(ck);
        if (!result) {
          result = applyMove(g, row, col);
          if (result.engine) this.engineMoves++;
          if (this.moveCache.size > 400_000) this.moveCache.clear();
          this.moveCache.set(ck, result);
        }
        out.push({ move: { row, col }, result, key: gridKey(result.grid) });
      }
    }
    return out;
  }
}

function rowEmpty(g: Grid, row: number): boolean {
  for (let c = 0; c < PUZZLE_COLS; c++) if ((g[row * PUZZLE_COLS + c] as number) >= 0) return false;
  return true;
}

/** Checks a board string is a valid puzzle start: fits, settled (stable, no match), non-empty. */
export function validateBoard(board: string): string | null {
  let g: Grid;
  try {
    g = gridFromAscii(board);
  } catch (e) {
    return (e as Error).message;
  }
  if (blockCount(g) === 0) return 'empty board';
  if (!isStable(g)) return 'floating blocks';
  if (hasMatch(g)) return 'board already has a match';
  return null;
}

/** Shortest solution within `maxMoves` (iterative deepening). */
export function findShortest(
  input: SolverInput,
  maxMoves: number,
  options: SolveOptions = {},
): SolveResult {
  const search = new Search(input.goal, options.nodeLimit ?? 2_000_000);
  const root = gridFromAscii(input.board);
  const rootKey = gridKey(root);
  const failed = new Map<string, number>();
  const path: PuzzleMove[] = [];

  const dfs = (g: Grid, key: string, depth: number): boolean => {
    const f = failed.get(key);
    if (f !== undefined && f >= depth) return false;
    if (search.aborted || search.dead(g)) return false;
    const children = search.expand(g, key);
    for (const ch of children) {
      if (goalReached(input.goal, ch.result)) {
        path.push(ch.move);
        return true;
      }
    }
    if (depth > 1) {
      for (const ch of children) {
        if (dfs(ch.result.grid, ch.key, depth - 1)) {
          path.push(ch.move);
          return true;
        }
      }
    }
    if (!search.aborted) failed.set(key, depth);
    return false;
  };

  for (let d = 1; d <= maxMoves; d++) {
    path.length = 0;
    if (dfs(root, rootKey, d)) {
      return {
        shortest: d,
        solution: path.reverse(),
        nodes: search.nodes,
        engineMoves: search.engineMoves,
        aborted: false,
      };
    }
    if (search.aborted) break;
  }
  return {
    shortest: null,
    solution: null,
    nodes: search.nodes,
    engineMoves: search.engineMoves,
    aborted: search.aborted,
  };
}

/** Is the puzzle solvable in at most `maxMoves`? (Exhaustive when the answer is no.) */
export function isSolvable(input: SolverInput, maxMoves: number, options?: SolveOptions): boolean {
  return findShortest(input, maxMoves, options).shortest !== null;
}

/** Exact solution counts by length up to `maxMoves`. */
export function countSolutions(
  input: SolverInput,
  maxMoves: number,
  options: SolveOptions = {},
): CountResult {
  const search = new Search(input.goal, options.nodeLimit ?? 2_000_000);
  const memo = new Map<string, number[]>();
  const zero = (n: number) => new Array<number>(n + 1).fill(0);

  const count = (g: Grid, key: string, depth: number): number[] => {
    const cached = memo.get(key);
    if (cached && cached.length > depth) return cached;
    const out = zero(depth);
    if (search.aborted || search.dead(g)) return out;
    for (const ch of search.expand(g, key)) {
      if (goalReached(input.goal, ch.result)) {
        out[1] = (out[1] as number) + 1;
      } else if (depth > 1) {
        const sub = count(ch.result.grid, ch.key, depth - 1);
        for (let k = 1; k < depth; k++) out[k + 1] = (out[k + 1] as number) + (sub[k] as number);
      }
    }
    if (!search.aborted) memo.set(key, out);
    return out;
  };

  const root = gridFromAscii(input.board);
  const byLength = count(root, gridKey(root), maxMoves).slice(0, maxMoves + 1);
  let total = 0;
  let shortest: number | null = null;
  for (let k = 1; k <= maxMoves; k++) {
    const n = byLength[k] as number;
    total += n;
    if (n > 0 && shortest === null) shortest = k;
  }
  return { byLength, total, shortest, nodes: search.nodes, aborted: search.aborted };
}
