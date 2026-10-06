import { describe, expect, it } from 'vitest';
import { boardToAscii } from '../../../../src/core/ascii';
import {
  createPuzzleSession,
  puzzleCanSwap,
  puzzleIsSettled,
  puzzleMovesLeft,
  puzzleMovesUsed,
  puzzlePlay,
  puzzleRestart,
  puzzleSettle,
  puzzleSwap,
  puzzleTick,
  puzzleUndo,
} from '../../../../src/core/puzzles/session';
import type { PuzzleDef } from '../../../../src/core/puzzles/types';
import type { SimEvent } from '../../../../src/core/types';

const BOTTOM = 11;

function def(board: string, moves: number, goal: PuzzleDef['goal'] = 'clearAll'): PuzzleDef {
  return { id: 'test', pack: 1, index: 0, board, moves, goal };
}

describe('puzzle session', () => {
  it('wins a one-move clear, stepping tick by tick', () => {
    const s = createPuzzleSession(def('RR.R..', 1));
    expect(s.status).toBe('playing');
    expect(puzzleMovesLeft(s)).toBe(1);
    const events: SimEvent[] = [];
    expect(puzzleSwap(s, BOTTOM, 2, events)).toBeNull();
    expect(events.some((e) => e.type === 'swapped')).toBe(true);
    expect(puzzleMovesUsed(s)).toBe(1);
    let ticks = 0;
    while (s.status === 'playing' && ticks < 1000) {
      puzzleTick(s, events);
      ticks++;
    }
    expect(s.status).toBe('won');
    expect(events.some((e) => e.type === 'matched')).toBe(true);
    expect(s.sim.cells.every((b) => b === null)).toBe(true);
  });

  it('only accepts swaps on a settled board, within the budget', () => {
    const s = createPuzzleSession(def('..B...\n..R...\nBBRR..', 2));
    expect(puzzleCanSwap(s, 0, 0)).toBe('empty');
    expect(puzzleSwap(s, 10, 2)).toBeNull(); // R slides right off the ledge
    expect(puzzleIsSettled(s)).toBe(false);
    expect(puzzleSwap(s, BOTTOM, 0)).toBe('notSettled');
    expect(puzzleMovesUsed(s)).toBe(1);
    puzzleSettle(s);
    expect(puzzleIsSettled(s)).toBe(true);
    expect(puzzleSwap(s, BOTTOM, 0)).toBeNull();
    expect(puzzleCanSwap(s, BOTTOM, 3)).toBe('noMoves');
  });

  it('is lost once the moves are used up and the board settles without the goal', () => {
    const s = createPuzzleSession(def('RRBRBB', 1));
    expect(puzzleSwap(s, BOTTOM, 0)).toBeNull(); // swapping R with R is legal but wasted
    expect(s.status).toBe('playing'); // the swap is still animating
    expect(puzzleSettle(s)).toBe('lost');
    expect(puzzleCanSwap(s, BOTTOM, 2)).toBe('finished');
  });

  it('undo restores the previous state (also after losing); restart resets everything', () => {
    const s = createPuzzleSession(def('RRBRBB', 1));
    const start = boardToAscii(s.sim);
    puzzleSwap(s, BOTTOM, 3);
    puzzleSettle(s);
    expect(s.status).toBe('lost');
    expect(puzzleUndo(s)).toBe(true);
    expect(s.status).toBe('playing');
    expect(boardToAscii(s.sim)).toBe(start);
    expect(puzzleMovesLeft(s)).toBe(1);
    expect(puzzleUndo(s)).toBe(false);
    expect(puzzlePlay(s, [{ row: BOTTOM, col: 2 }])).toBe('won');
    puzzleRestart(s);
    expect(s.status).toBe('playing');
    expect(puzzleMovesUsed(s)).toBe(0);
    expect(s.undoStack).toHaveLength(0);
    expect(boardToAscii(s.sim)).toBe(start);
  });

  it('undo during a cascade rewinds to before the swap', () => {
    const s = createPuzzleSession(def('RR.R..', 1));
    puzzleSwap(s, BOTTOM, 2);
    for (let i = 0; i < 20; i++) puzzleTick(s);
    expect(puzzleUndo(s)).toBe(true);
    expect(boardToAscii(s.sim)).toBe('RR.R..');
    expect(puzzleIsSettled(s)).toBe(true);
  });

  it('chain and combo goals are won as soon as they are reached', () => {
    const chain = createPuzzleSession(
      def('.R....\n.R....\nGG.G..\nBRBB..', 1, { type: 'chain', length: 2 }),
    );
    expect(puzzlePlay(chain, [{ row: 10, col: 2 }])).toBe('won');
    expect(chain.sim.stats.maxChain).toBe(2);
    expect(chain.sim.cells.some((b) => b !== null)).toBe(true); // goal ≠ clear all

    const combo = createPuzzleSession(def('..R...\n..R...\nRRGR..', 1, { type: 'combo', size: 5 }));
    expect(puzzlePlay(combo, [{ row: BOTTOM, col: 2 }])).toBe('won');
    const small = createPuzzleSession(def('..R...\n..R...\nRRGR..', 1, { type: 'combo', size: 6 }));
    expect(puzzlePlay(small, [{ row: BOTTOM, col: 2 }])).toBe('lost');
  });

  it('puzzlePlay rejects illegal swaps', () => {
    const s = createPuzzleSession(def('RR.R..', 1));
    expect(() => puzzlePlay(s, [{ row: 0, col: 0 }])).toThrow(/rejected/);
  });
});
