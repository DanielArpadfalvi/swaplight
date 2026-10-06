import { describe, expect, it } from 'vitest';
import {
  analyzePuzzle,
  generatePuzzles,
  rateDifficulty,
} from '../../../../src/core/puzzles/generator';
import { createPuzzleSession, puzzlePlay } from '../../../../src/core/puzzles/session';
import {
  countSolutions,
  findShortest,
  isSolvable,
  validateBoard,
} from '../../../../src/core/puzzles/solver';
import type { PuzzleDef, PuzzleGoal } from '../../../../src/core/puzzles/types';

function play(board: string, goal: PuzzleGoal, moves: NonNullable<PuzzleDef['solution']>) {
  const def: PuzzleDef = { id: 't', pack: 1, index: 0, board, moves: moves.length, goal };
  return puzzlePlay(createPuzzleSession(def), moves);
}

describe('puzzle solver', () => {
  it('finds one-move solutions', () => {
    const r = findShortest({ board: 'RRBRBB', goal: 'clearAll' }, 3);
    expect(r.shortest).toBe(1);
    expect(r.solution).toEqual([{ row: 11, col: 2 }]);
    expect(r.aborted).toBe(false);
  });

  it('finds the shortest multi-move solution and it wins in the runner', () => {
    const board = '..B...\n..R...\nBBRR..';
    const r = findShortest({ board, goal: 'clearAll' }, 4);
    expect(r.shortest).toBe(2);
    expect(play(board, 'clearAll', r.solution ?? [])).toBe('won');
    // Not solvable in one move.
    expect(isSolvable({ board, goal: 'clearAll' }, 1)).toBe(false);
  });

  it('proves unsolvable boards (exhaustively, without aborting)', () => {
    const r = findShortest({ board: 'RGBRGB\nGBRGBR', goal: 'clearAll' }, 2);
    expect(r.shortest).toBeNull();
    expect(r.aborted).toBe(false);
    expect(r.nodes).toBeGreaterThan(1);
    // A color with fewer than 3 blocks can never be cleared: pruned at the root.
    const dead = findShortest({ board: 'RRGGB.', goal: 'clearAll' }, 5);
    expect(dead.shortest).toBeNull();
    expect(dead.nodes).toBe(0);
  });

  it('aborts at the node limit', () => {
    const r = findShortest({ board: 'GBRYGB\nRGBRYR\nYRGBRG\nBYRGYB', goal: 'clearAll' }, 5, {
      nodeLimit: 50,
    });
    expect(r.aborted).toBe(true);
    expect(r.shortest).toBeNull();
  });

  it('counts solutions by length', () => {
    const board = '..B...\n..R...\nBBRR..';
    const c = countSolutions({ board, goal: 'clearAll' }, 3);
    expect(c.shortest).toBe(2);
    expect(c.byLength[1]).toBe(0);
    expect(c.byLength[2]).toBe(4);
    expect(c.total).toBe(c.byLength.reduce((a, b) => a + b, 0));
    expect(countSolutions({ board: 'RR.R..', goal: 'clearAll' }, 1).byLength).toEqual([0, 1]);
  });

  it('handles chain and combo goals', () => {
    const chainBoard = '.R....\n.R....\nGG.G..\nBRBB..';
    expect(
      findShortest({ board: chainBoard, goal: { type: 'chain', length: 2 } }, 2).shortest,
    ).toBe(1);
    expect(
      findShortest({ board: chainBoard, goal: { type: 'chain', length: 3 } }, 2).shortest,
    ).toBeNull();
    const comboBoard = '..R...\n..R...\nRRGR..';
    expect(findShortest({ board: comboBoard, goal: { type: 'combo', size: 5 } }, 1).shortest).toBe(
      1,
    );
  });

  it('validates boards', () => {
    expect(validateBoard('RR.R..')).toBeNull();
    expect(validateBoard('')).toBe('empty board');
    expect(validateBoard('R.....\n.RR...')).toBe('floating blocks');
    expect(validateBoard('RRR...')).toBe('board already has a match');
    expect(validateBoard('RRX...')).toMatch(/unknown/);
    expect(validateBoard('RR')).toMatch(/6 cells/);
  });
});

describe('puzzle generator', () => {
  it('is deterministic and only returns tight, solvable puzzles', () => {
    const params = {
      moves: 2,
      goal: 'clearAll' as const,
      style: 'bricks' as const,
      colors: 3,
      triples: [2, 4] as const,
      width: [3, 5] as const,
      maxHeight: 4,
    };
    const a = generatePuzzles('gen-test', params, 3, 500);
    const b = generatePuzzles('gen-test', params, 3, 500);
    expect(a.map((p) => p.board)).toEqual(b.map((p) => p.board));
    expect(a).toHaveLength(3);
    for (const p of a) {
      expect(validateBoard(p.board)).toBeNull();
      expect(p.par).toBe(2);
      expect(isSolvable({ board: p.board, goal: p.goal }, 1)).toBe(false);
      expect(play(p.board, p.goal, p.solution)).toBe('won');
      expect(p.solutions).toBeGreaterThanOrEqual(1);
    }
  });

  it('rates longer, more unique puzzles harder', () => {
    const base = {
      par: 2,
      solutions: 4,
      blocks: 12,
      colors: 3,
      chain: 1,
      goal: 'clearAll' as const,
    };
    expect(rateDifficulty({ ...base, par: 4 })).toBeGreaterThan(rateDifficulty(base));
    expect(rateDifficulty({ ...base, solutions: 1 })).toBeGreaterThan(rateDifficulty(base));
    expect(rateDifficulty({ ...base, chain: 3 })).toBeGreaterThan(rateDifficulty(base));
    const a = analyzePuzzle('..B...\n..R...\nBBRR..', 'clearAll', 3);
    expect(a.par).toBe(2);
    expect(a.solutions).toBe(4);
    expect(a.chain).toBe(2);
  });
});
