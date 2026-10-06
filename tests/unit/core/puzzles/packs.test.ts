/**
 * Pack validation. Always on: format, settled boards, the reference solution
 * wins in the runner within the move budget, and the solver proves no shorter
 * solution exists (packs 1–3: par − 1; pack 4: par − 2 by default, par − 1 with
 * PUZZLE_EXHAUSTIVE=1 – about 10 s).
 */
import { describe, expect, it } from 'vitest';
import {
  gridFromAscii,
  gridHeight,
  PUZZLE_COLS,
  PUZZLE_ROWS,
} from '../../../../src/core/puzzles/grid';
import {
  allPuzzles,
  FREE_PUZZLE_PACKS,
  isPuzzlePackFree,
  nextPuzzle,
  puzzleById,
  puzzlePack,
  PUZZLE_PACKS,
} from '../../../../src/core/puzzles/packs';
import { createPuzzleSession, puzzlePlay } from '../../../../src/core/puzzles/session';
import { findShortest, validateBoard } from '../../../../src/core/puzzles/solver';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const EXHAUSTIVE = env?.PUZZLE_EXHAUSTIVE === '1';

/** Allowed par range per pack. */
const PAR: Record<number, [number, number]> = { 1: [1, 2], 2: [2, 3], 3: [3, 4], 4: [4, 5] };

describe('puzzle packs', () => {
  it('has 4 packs × 30 puzzles with unique ids and boards', () => {
    expect(PUZZLE_PACKS).toHaveLength(4);
    for (const [i, pack] of PUZZLE_PACKS.entries()) {
      expect(pack).toHaveLength(30);
      pack.forEach((def, index) => {
        expect(def.pack).toBe(i + 1);
        expect(def.index).toBe(index);
        expect(def.id).toBe(`p${i + 1}-${String(index + 1).padStart(2, '0')}`);
      });
    }
    const all = allPuzzles();
    expect(new Set(all.map((d) => d.id)).size).toBe(120);
    expect(new Set(all.map((d) => d.board)).size).toBe(120);
    expect(FREE_PUZZLE_PACKS).toEqual([1]);
    expect(isPuzzlePackFree(1)).toBe(true);
    expect(isPuzzlePackFree(2)).toBe(false);
    expect(puzzleById('p3-05')).toBe(puzzlePack(3)[4]);
    expect(nextPuzzle('p1-01')).toBe(puzzlePack(1)[1]);
    expect(nextPuzzle('p1-30')).toBeUndefined();
  });

  it('every board is a settled 12×6 board and the budget matches par', () => {
    for (const def of allPuzzles()) {
      expect(validateBoard(def.board), def.id).toBeNull();
      const g = gridFromAscii(def.board);
      expect(g.length).toBe(PUZZLE_ROWS * PUZZLE_COLS);
      expect(gridHeight(g)).toBeLessThanOrEqual(8);
      const [lo, hi] = PAR[def.pack] as [number, number];
      expect(def.par, def.id).toBeGreaterThanOrEqual(lo);
      expect(def.par, def.id).toBeLessThanOrEqual(hi);
      expect(def.moves, def.id).toBeGreaterThanOrEqual(def.par as number);
      expect(def.solution?.length, def.id).toBe(def.par);
      if (def.goal !== 'clearAll') {
        if (def.goal.type === 'chain') expect(def.goal.length).toBeGreaterThanOrEqual(2);
        else expect(def.goal.size).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('difficulty rises from pack to pack', () => {
    const avg = PUZZLE_PACKS.map(
      (pack) => pack.reduce((s, d) => s + (d.difficulty ?? 0), 0) / pack.length,
    );
    for (let i = 1; i < avg.length; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1] as number);
  });

  it('every reference solution wins in the runner', () => {
    for (const def of allPuzzles()) {
      const s = createPuzzleSession(def);
      expect(puzzlePlay(s, def.solution ?? []), def.id).toBe('won');
    }
  });

  for (const pack of [1, 2, 3, 4]) {
    // Pack 4 (4–5 moves) takes ~10 s exhaustively: by default it is proven not
    // solvable in par − 2 moves; PUZZLE_EXHAUSTIVE=1 checks par − 1.
    const slack = pack <= 3 || EXHAUSTIVE ? 1 : 2;
    it(`pack ${pack}: no puzzle is solvable in par − ${slack} moves (exhaustive)`, () => {
      for (const def of puzzlePack(pack)) {
        const depth = (def.par as number) - slack;
        if (depth < 1) continue;
        const r = findShortest(def, depth, { nodeLimit: 5_000_000 });
        expect(r.aborted, def.id).toBe(false);
        expect(r.shortest, def.id).toBeNull();
      }
    }, 600_000);
  }
});
