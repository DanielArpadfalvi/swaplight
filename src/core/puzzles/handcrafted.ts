import { rows, type PuzzleGoal } from './types';

/** Hand-made teaching puzzles (start of pack 1). `par` is verified by the solver. */
export interface HandcraftedPuzzle {
  board: string;
  goal: PuzzleGoal;
  par: number;
  hint: string;
}

export const HANDCRAFTED: readonly HandcraftedPuzzle[] = [
  // Swap two neighbours: RRR and BBB clear together.
  { board: rows('RRBRBB'), goal: 'clearAll', par: 1, hint: 'puzzle.hint.swap' },
  // A block can be slid into an empty cell.
  { board: rows('RR.R..'), goal: 'clearAll', par: 1, hint: 'puzzle.hint.slide' },
  // Vertical lines count too (and an L clears both lines at once).
  {
    board: rows('R.....', 'R.....', 'GRGG..'),
    goal: 'clearAll',
    par: 1,
    hint: 'puzzle.hint.vertical',
  },
  // Lines that share a block form one bigger combo.
  {
    board: rows('..R...', '..R...', 'RRGR..'),
    goal: { type: 'combo', size: 5 },
    par: 1,
    hint: 'puzzle.hint.combo',
  },
  // Blocks above a cleared line fall and can complete another line: a chain.
  {
    board: rows('.R....', '.R....', 'GG.G..', 'BRBB..'),
    goal: { type: 'chain', length: 2 },
    par: 1,
    hint: 'puzzle.hint.chain',
  },
  // Prepare first, then trigger.
  {
    board: rows('..B...', '..R...', 'BBRR..'),
    goal: 'clearAll',
    par: 2,
    hint: 'puzzle.hint.prepare',
  },
  {
    board: rows('.Y....', '.R....', 'YRY...', 'RYR...'),
    goal: { type: 'chain', length: 2 },
    par: 2,
    hint: 'puzzle.hint.chainSetup',
  },
];
