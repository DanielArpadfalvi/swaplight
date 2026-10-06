/**
 * Puzzle ("Fejtörő") definitions. A puzzle is a static board (no rise) plus a move
 * budget: the player swaps only while the board is settled, every swap costs one
 * move, and the goal must be reached before the moves run out.
 */

/** Goal of a puzzle. */
export type PuzzleGoal =
  /** Clear every block from the board. */
  | 'clearAll'
  /** Make a chain of at least `length` (2 = "×2"). */
  | { type: 'chain'; length: number }
  /** Clear at least `size` blocks in a single match (combo ≥ 4). */
  | { type: 'combo'; size: number };

/** A swap of (row, col) with (row, col + 1). Row 0 is the top row of the 12-row board. */
export interface PuzzleMove {
  row: number;
  col: number;
}

export interface PuzzleDef {
  /** Stable id, e.g. `p2-07`. */
  id: string;
  /** Pack number 1..4. */
  pack: number;
  /** 0-based position inside the pack. */
  index: number;
  /**
   * Board in `loadAscii` format (rows top → bottom, bottom-aligned, 6 columns,
   * `RGBYPC` colors, `.` empty). Must be settled: no floating blocks, no matches.
   */
  board: string;
  /** Move budget (maximum number of swaps). */
  moves: number;
  goal: PuzzleGoal;
  /** Intended minimum number of moves (verified by the solver: not solvable in fewer). */
  par?: number;
  /** i18n key of an optional hint (handcrafted teaching puzzles). */
  hint?: string;
  /** A reference solution (used for "show solution" and quick validation). */
  solution?: readonly PuzzleMove[];
  /** Difficulty rating 0..100 from the generator (higher = harder). */
  difficulty?: number;
}

/** Build a board string from row strings (top → bottom). */
export function rows(...lines: string[]): string {
  return lines.join('\n');
}

export function goalLabel(goal: PuzzleGoal): string {
  if (goal === 'clearAll') return 'clearAll';
  return goal.type === 'chain' ? `chain${goal.length}` : `combo${goal.size}`;
}
