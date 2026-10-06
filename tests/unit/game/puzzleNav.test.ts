import { describe, expect, it, vi } from 'vitest';
import { createPuzzleSession, puzzleById } from '../../../src/core/puzzles';
import { getMode, modeStatus, startMode } from '../../../src/game/modes';
import { backAction, showsBoard } from '../../../src/game/nav';
import { coachTarget } from '../../../src/game/puzzleMode';

describe('puzzle / tutorial wiring', () => {
  it('Puzzles and Tutorial are free, playable modes that call their host entry', () => {
    expect(modeStatus(getMode('puzzles')!, false)).toBe('playable');
    expect(modeStatus(getMode('tutorial')!, false)).toBe('playable');
    const host = {
      startEndless: vi.fn(),
      startRun: vi.fn(),
      startVersus: vi.fn(),
      startDaily: vi.fn(),
      startPuzzles: vi.fn(),
      startTutorial: vi.fn(),
    };
    expect(startMode('puzzles', host, false)).toBe('playable');
    expect(host.startPuzzles).toHaveBeenCalledTimes(1);
    expect(startMode('tutorial', host, false)).toBe('playable');
    expect(host.startTutorial).toHaveBeenCalledTimes(1);
  });

  it('back: level grid → packs → menu; result → level grid', () => {
    expect(backAction('puzzleLevels', []).type).toBe('toPuzzlePacks');
    expect(backAction('puzzlePacks', []).type).toBe('toMenu');
    expect(backAction('puzzleResult', []).type).toBe('toPuzzleLevels');
    expect(backAction('puzzleResult', ['settings']).type).toBe('closeOverlay');
  });

  it('the board stays visible behind the result panel only', () => {
    expect(showsBoard('puzzleResult')).toBe(true);
    expect(showsBoard('puzzlePacks')).toBe(false);
    expect(showsBoard('puzzleLevels')).toBe(false);
  });

  it('coach targets point at the left cell center of the swap', () => {
    const geo = { originX: 10, originY: 20, cellSize: 40, cols: 6, rows: 12, riseOffsetPx: 0 };
    expect(coachTarget(geo, { row: 11, col: 2 }, 3)).toEqual({
      row: 11,
      col: 2,
      x: 10 + 2.5 * 40,
      y: 20 + 11.5 * 40,
      cellSize: 40,
      fromRight: false,
      key: 3,
    });
    expect(coachTarget(null, { row: 1, col: 1 }, 1)).toBeNull();
    expect(coachTarget(geo, null, 1)).toBeNull();
  });

  it('a move into an empty left cell is demonstrated right → left', () => {
    const geo = { originX: 0, originY: 0, cellSize: 40, cols: 6, rows: 12, riseOffsetPx: 0 };
    const p8 = createPuzzleSession(puzzleById('p1-08')!);
    const move = p8.def.solution![0]!;
    expect(coachTarget(geo, move, 1, p8.sim)?.fromRight).toBe(true);
    const p1 = createPuzzleSession(puzzleById('p1-01')!);
    expect(coachTarget(geo, p1.def.solution![0]!, 1, p1.sim)?.fromRight).toBe(false);
  });
});
