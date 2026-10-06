import { createRng, randInt, shuffle, type RngState, type Seed } from '../rng';
import {
  applyMove,
  blockCount,
  EMPTY,
  gridFromAscii,
  gridHeight,
  gridToAscii,
  gridWidth,
  hasMatch,
  isStable,
  matchesAt,
  PUZZLE_COLS,
  PUZZLE_ROWS,
  type Grid,
} from './grid';
import { countSolutions, findShortest } from './solver';
import type { PuzzleGoal, PuzzleMove } from './types';

/**
 * Offline puzzle generator (dev tool – `scripts/gen-puzzles.ts`). Deterministic
 * for a given seed.
 *
 * Candidate boards come from two constructions, then the solver filters them:
 * - `bricks` (reverse construction): stack same-colored triples (horizontal or
 *   vertical, gravity-respecting) into a board that would clear completely,
 *   then scramble it with random legal-looking swaps until no line is left.
 *   Undoing the scramble is (roughly) a solution, so most candidates are
 *   solvable and their difficulty tracks the scramble length.
 * - `random`: random column heights, a shuffled multiset of colors (each color
 *   a multiple of 3), rejected if it already holds a line.
 * A candidate is accepted when its shortest solution is exactly `moves` (so the
 * move budget is tight) and it has at most `maxSolutions` solutions of that
 * length. Its difficulty is rated from the solution count, length, size and
 * required chain.
 */

export type BoardStyle = 'bricks' | 'random';

export interface GenParams {
  /** Target shortest solution = move budget. */
  moves: number;
  goal: PuzzleGoal;
  style: BoardStyle;
  /** Colors used (3..6). */
  colors: number;
  /** Number of triples on the board (blocks = 3 × triples). */
  triples: readonly [number, number];
  /** Columns used (3..6). */
  width: readonly [number, number];
  maxHeight: number;
  /** Scramble swaps for `bricks` (default ≈ moves + 1 .. moves + 3). */
  scramble?: readonly [number, number];
  /** Reject candidates with more solutions of the target length. */
  maxSolutions?: number;
  /** Reject candidates whose reference solution has a shorter chain. */
  minChain?: number;
  /** Solver node limit per candidate. */
  nodeLimit?: number;
}

export interface GeneratedPuzzle {
  board: string;
  goal: PuzzleGoal;
  par: number;
  solution: PuzzleMove[];
  /** Number of distinct move sequences of length `par` that solve it. */
  solutions: number;
  difficulty: number;
  blocks: number;
  /** Longest chain on the reference solution. */
  chain: number;
}

function between(rng: RngState, [lo, hi]: readonly [number, number]): number {
  return lo + randInt(rng, hi - lo + 1);
}

const idx = (r: number, c: number) => r * PUZZLE_COLS + c;

/** Random board: random heights + shuffled color multiset. Null when it holds a line. */
export function randomBoard(
  rng: RngState,
  colors: number,
  triples: number,
  width: number,
  maxHeight: number,
): Grid | null {
  const n = triples * 3;
  if (n > width * maxHeight) return null;
  const heights = new Array<number>(width).fill(0);
  for (let k = 0; k < n; k++) {
    const open = heights.map((h, c) => (h < maxHeight ? c : -1)).filter((c) => c >= 0);
    const c = open[randInt(rng, open.length)] as number;
    heights[c] = (heights[c] as number) + 1;
  }
  const bag: number[] = [];
  const palette = shuffle(rng, [0, 1, 2, 3, 4, 5]).slice(0, colors);
  for (let t = 0; t < triples; t++) {
    const color = t < colors ? (palette[t] as number) : (palette[randInt(rng, colors)] as number);
    bag.push(color, color, color);
  }
  shuffle(rng, bag);
  const offset = randInt(rng, PUZZLE_COLS - width + 1);
  const g = new Int8Array(PUZZLE_ROWS * PUZZLE_COLS).fill(EMPTY);
  let k = 0;
  heights.forEach((h, c) => {
    for (let i = 0; i < h; i++) g[idx(PUZZLE_ROWS - 1 - i, offset + c)] = bag[k++] as number;
  });
  return hasMatch(g) ? null : g;
}

/** Reverse construction: stacked triples, then scrambled. Null on failure. */
export function bricksBoard(
  rng: RngState,
  colors: number,
  triples: number,
  width: number,
  maxHeight: number,
  scramble: number,
): Grid | null {
  const offset = randInt(rng, PUZZLE_COLS - width + 1);
  const g = new Int8Array(PUZZLE_ROWS * PUZZLE_COLS).fill(EMPTY);
  const heights = new Array<number>(PUZZLE_COLS).fill(0);
  const palette = shuffle(rng, [0, 1, 2, 3, 4, 5]).slice(0, colors);
  for (let t = 0; t < triples; t++) {
    const color = palette[randInt(rng, colors)] as number;
    const options: { col: number; vertical: boolean }[] = [];
    for (let c = offset; c < offset + width; c++) {
      const h = heights[c] as number;
      if (h + 3 <= maxHeight) options.push({ col: c, vertical: true });
      if (c + 2 < offset + width && h < maxHeight && heights[c + 1] === h && heights[c + 2] === h) {
        // Horizontal triples are favoured (they make the more interesting boards).
        options.push({ col: c, vertical: false }, { col: c, vertical: false });
      }
    }
    if (options.length === 0) return null;
    const o = options[randInt(rng, options.length)] as { col: number; vertical: boolean };
    if (o.vertical) {
      for (let i = 0; i < 3; i++) {
        const h = heights[o.col] as number;
        g[idx(PUZZLE_ROWS - 1 - h, o.col)] = color;
        heights[o.col] = h + 1;
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const c = o.col + i;
        const h = heights[c] as number;
        g[idx(PUZZLE_ROWS - 1 - h, c)] = color;
        heights[c] = h + 1;
      }
    }
  }
  // Scramble with swaps that keep the board resting (no block left floating).
  // After `scramble` random swaps, only swaps touching a remaining line count.
  let done = 0;
  for (let tries = 0; tries < 400 && (done < scramble || hasMatch(g)); tries++) {
    if (done >= scramble * 2 + 2) return null;
    const row = PUZZLE_ROWS - 1 - randInt(rng, maxHeight);
    const col = offset + randInt(rng, width - 1);
    const i = idx(row, col);
    const a = g[i] as number;
    const b = g[i + 1] as number;
    if (a === b) continue;
    if (done >= scramble && !matchesAt(g, row, col) && !matchesAt(g, row, col + 1)) continue;
    g[i] = b;
    g[i + 1] = a;
    if (!isStable(g) || gridHeight(g) > maxHeight) {
      g[i] = a;
      g[i + 1] = b;
      continue;
    }
    done++;
  }
  if (hasMatch(g) || !isStable(g)) return null;
  return g;
}

export interface DifficultyInput {
  par: number;
  /** Solutions of length `par`. */
  solutions: number;
  blocks: number;
  colors: number;
  /** Longest chain on the reference solution (1 = none). */
  chain: number;
  goal: PuzzleGoal;
}

/**
 * Difficulty 0..100: longer solutions, fewer alternative solutions, bigger
 * boards, more colors and required chains are harder.
 */
export function rateDifficulty(d: DifficultyInput): number {
  const parScore = (d.par - 1) * 15; // 0..60
  const uniqueness = Math.max(0, 16 - 4 * Math.log2(Math.max(1, d.solutions))); // 0..16
  const size = Math.min(10, d.blocks / 2.5);
  const palette = Math.max(0, d.colors - 2) * 1.5;
  const chain = Math.min(8, (d.chain - 1) * 3);
  let goal = 0;
  if (d.goal !== 'clearAll')
    goal = d.goal.type === 'chain' ? (d.goal.length - 1) * 3 : d.goal.size - 3;
  return Math.round(Math.min(100, parScore + uniqueness + size + palette + chain + goal));
}

function distinctColors(g: Grid): number {
  const seen = new Set<number>();
  for (const v of g) if (v >= 0) seen.add(v);
  return seen.size;
}

export interface PuzzleAnalysis {
  /** Shortest solution length (null: not solvable within the budget). */
  par: number | null;
  solution: PuzzleMove[] | null;
  /** Solutions of length `par`. */
  solutions: number;
  /** Longest chain on the reference solution. */
  chain: number;
  difficulty: number;
  aborted: boolean;
}

/** Solve + count + rate a board (used for generated and handcrafted puzzles). */
export function analyzePuzzle(
  board: string,
  goal: PuzzleGoal,
  maxMoves: number,
  nodeLimit = 2_000_000,
): PuzzleAnalysis {
  const input = { board, goal };
  const fail = (aborted: boolean): PuzzleAnalysis => ({
    par: null,
    solution: null,
    solutions: 0,
    chain: 1,
    difficulty: 0,
    aborted,
  });
  const shortest = findShortest(input, maxMoves, { nodeLimit });
  if (shortest.shortest === null || !shortest.solution) return fail(shortest.aborted);
  const par = shortest.shortest;
  const counted = countSolutions(input, par, { nodeLimit: nodeLimit * 4 });
  if (counted.aborted) return fail(true);
  const solutions = counted.byLength[par] as number;
  let g = gridFromAscii(board);
  let chain = 1;
  for (const m of shortest.solution) {
    const r = applyMove(g, m.row, m.col);
    chain = Math.max(chain, r.chain);
    g = r.grid;
  }
  const start = gridFromAscii(board);
  const difficulty = rateDifficulty({
    par,
    solutions,
    blocks: blockCount(start),
    colors: distinctColors(start),
    chain,
    goal,
  });
  return { par, solution: shortest.solution, solutions, chain, difficulty, aborted: false };
}

/** Try one candidate board; returns the puzzle if it passes the filters. */
export function evaluateCandidate(g: Grid, params: GenParams): GeneratedPuzzle | null {
  const board = gridToAscii(g);
  const a = analyzePuzzle(board, params.goal, params.moves, params.nodeLimit ?? 60_000);
  if (a.par !== params.moves || !a.solution) return null;
  if (params.maxSolutions !== undefined && a.solutions > params.maxSolutions) return null;
  if (params.minChain !== undefined && a.chain < params.minChain) return null;
  return {
    board,
    goal: params.goal,
    par: a.par,
    solution: a.solution,
    solutions: a.solutions,
    chain: a.chain,
    blocks: blockCount(g),
    difficulty: a.difficulty,
  };
}

/** Generate up to `count` distinct puzzles (deterministic for the seed). */
export function generatePuzzles(
  seed: Seed,
  params: GenParams,
  count: number,
  maxAttempts = 4000,
  exclude: ReadonlySet<string> = new Set(),
): GeneratedPuzzle[] {
  const rng = createRng(seed);
  const out: GeneratedPuzzle[] = [];
  const seen = new Set(exclude);
  for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
    const triples = between(rng, params.triples);
    const width = between(rng, params.width);
    const g =
      params.style === 'bricks'
        ? bricksBoard(
            rng,
            params.colors,
            triples,
            width,
            params.maxHeight,
            between(rng, params.scramble ?? [params.moves + 1, params.moves + 3]),
          )
        : randomBoard(rng, params.colors, triples, width, params.maxHeight);
    if (!g || gridWidth(g) < 3) continue;
    const board = gridToAscii(g);
    if (seen.has(board)) continue;
    seen.add(board);
    const p = evaluateCandidate(g, params);
    if (p) out.push(p);
  }
  return out;
}
