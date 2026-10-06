import { describe, expect, it } from 'vitest';
import { puzzlePack } from '../../../src/core/puzzles';
import {
  allPackSummaries,
  computeStars,
  goalText,
  isPuzzleUnlocked,
  levelNumber,
  levelState,
  puzzlePackAvailable,
  recordPuzzleSolve,
} from '../../../src/game/puzzleProgress';
import { createDefaultSave, parseSave, SAVE_VERSION } from '../../../src/game/save';

describe('puzzle progress', () => {
  it('stars: 3 without a hint within par, one less per shortfall, never below 1', () => {
    expect(computeStars({ movesUsed: 2, par: 2, hintsUsed: 0 })).toBe(3);
    expect(computeStars({ movesUsed: 3, par: 2, hintsUsed: 0 })).toBe(2);
    expect(computeStars({ movesUsed: 2, par: 2, hintsUsed: 1 })).toBe(2);
    expect(computeStars({ movesUsed: 2, par: 2, hintsUsed: 2 })).toBe(1);
    expect(computeStars({ movesUsed: 9, par: 2, hintsUsed: 5 })).toBe(1);
  });

  it('pack 1 is free, packs 2–4 need the Full Version', () => {
    expect(puzzlePackAvailable(1, false)).toBe(true);
    for (const p of [2, 3, 4]) {
      expect(puzzlePackAvailable(p, false)).toBe(false);
      expect(puzzlePackAvailable(p, true)).toBe(true);
    }
  });

  it('levels unlock sequentially inside a pack', () => {
    const defs = puzzlePack(1);
    const save = createDefaultSave();
    expect(levelState(defs, 0, save.puzzles)).toBe('open');
    expect(levelState(defs, 1, save.puzzles)).toBe('locked');
    recordPuzzleSolve(save, defs[0]!.id, 3, 1);
    expect(levelState(defs, 0, save.puzzles)).toBe('solved');
    expect(levelState(defs, 1, save.puzzles)).toBe('open');
    expect(levelState(defs, 2, save.puzzles)).toBe('locked');
    expect(isPuzzleUnlocked(defs[1]!, save.puzzles, false)).toBe(true);
    expect(isPuzzleUnlocked(puzzlePack(2)[0]!, save.puzzles, false)).toBe(false);
    expect(isPuzzleUnlocked(puzzlePack(2)[0]!, save.puzzles, true)).toBe(true);
  });

  it('records keep the best stars and fewest moves', () => {
    const save = createDefaultSave();
    expect(recordPuzzleSolve(save, 'p1-05', 2, 3)).toEqual({
      stars: 2,
      prevStars: 0,
      firstSolve: true,
    });
    expect(recordPuzzleSolve(save, 'p1-05', 1, 2).firstSolve).toBe(false);
    expect(save.puzzles['p1-05']).toEqual({ stars: 2, moves: 2 });
    recordPuzzleSolve(save, 'p1-05', 3, 4);
    expect(save.puzzles['p1-05']).toEqual({ stars: 3, moves: 2 });
  });

  it('pack summaries count solved levels and stars', () => {
    const save = createDefaultSave();
    recordPuzzleSolve(save, 'p1-01', 3, 1);
    recordPuzzleSolve(save, 'p1-02', 2, 1);
    const [p1, p2] = allPackSummaries(save.puzzles, false);
    expect(p1).toMatchObject({ pack: 1, total: 30, solved: 2, stars: 5, maxStars: 90 });
    expect(p1!.available).toBe(true);
    expect(p1!.nextIndex).toBe(2);
    expect(p2).toMatchObject({ pack: 2, solved: 0, available: false, nextIndex: 0 });
  });

  it('formats level numbers and goal texts', () => {
    expect(levelNumber(0)).toBe('01');
    expect(levelNumber(29)).toBe('30');
    expect(goalText('clearAll').key).toBe('puzzle.goalClearAll');
    expect(goalText({ type: 'chain', length: 3 })).toEqual({
      key: 'puzzle.goalChain',
      params: { n: 3 },
    });
    expect(goalText({ type: 'combo', size: 5 }).params).toEqual({ n: 5 });
  });

  it('save v1 → v2 adds empty puzzle progress; bad records are dropped', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(2);
    const v1 = parseSave({ version: 1, tutorialDone: true });
    expect(v1.ok && v1.data.puzzles).toEqual({});
    expect(v1.ok && v1.data.tutorialDone).toBe(true);
    const parsed = parseSave({
      version: 2,
      puzzles: {
        'p1-01': { stars: 3, moves: 1 },
        'p1-02': { stars: 0 },
        x: 'nope',
        'p1-03': { stars: 7, moves: 2 },
      },
    });
    expect(parsed.ok && parsed.data.puzzles).toEqual({
      'p1-01': { stars: 3, moves: 1 },
      'p1-03': { stars: 3, moves: 2 },
    });
  });

  it('save v1 → v2 keeps the Versus / Daily fields', () => {
    const v1 = parseSave({
      version: 1,
      daily: {
        '2026-10-05': { score: 900, attempts: 2, official: true, practiceBest: 1200 },
      },
      dailyStreak: { current: 3, best: 5, last: '2026-10-05' },
      versus: { '2': { played: 5, won: 4, lost: 1, fastestWin: 61, garbageSent: 20 } },
    });
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    expect(v1.data.version).toBe(SAVE_VERSION);
    expect(v1.data.puzzles).toEqual({});
    expect(v1.data.daily['2026-10-05']).toMatchObject({
      score: 900,
      official: true,
      practiceBest: 1200,
    });
    expect(v1.data.dailyStreak).toEqual({ current: 3, best: 5, last: '2026-10-05' });
    expect(v1.data.versus['2']).toMatchObject({ played: 5, won: 4, fastestWin: 61 });
  });
});
