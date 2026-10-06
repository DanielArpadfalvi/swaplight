import { describe, expect, it } from 'vitest';
import { cellAt } from '../../../src/core/board';
import { checkInvariants } from '../../../src/core/invariants';
import { findMatches } from '../../../src/core/match';
import {
  MOD_LOCKED_COLUMNS,
  MOD_SWAP_LOCK_UNTIL,
  canSwap,
  createSim,
  step,
} from '../../../src/core/sim';
import type { ScoreContext } from '../../../src/core/scoring';
import type { BlockKind, SimState } from '../../../src/core/types';
import { ofType, settle, simFromAscii } from './helpers';

function setKind(sim: SimState, row: number, col: number, kind: BlockKind): void {
  cellAt(sim, row, col)!.kind = kind;
  sim.matchScanPending = true;
}

const cellsOf = (sim: SimState, idx: number[]) =>
  idx.map((i) => `${Math.floor(i / sim.config.cols)},${i % sim.config.cols}`);

describe('wild blocks', () => {
  it('a wild completes a line of 3 between two blocks of one color', () => {
    const sim = simFromAscii('RGRB..');
    expect(findMatches(sim)).toEqual([]);
    setKind(sim, 11, 1, 'wild');
    expect(cellsOf(sim, findMatches(sim))).toEqual(['11,0', '11,1', '11,2']);
  });

  it('a wild joins runs of two different colors on both sides', () => {
    const sim = simFromAscii('RRGBB.');
    setKind(sim, 11, 2, 'wild');
    expect(findMatches(sim)).toHaveLength(5);
  });

  it('does not bridge two different colors in a single line of 3', () => {
    const sim = simFromAscii('RGB...');
    setKind(sim, 11, 1, 'wild');
    expect(findMatches(sim)).toEqual([]);
  });

  it('three wilds match, and wilds work vertically', () => {
    const sim = simFromAscii('G.....\nR.....\nG.....\nB.....');
    setKind(sim, 9, 0, 'wild');
    expect(cellsOf(sim, findMatches(sim))).toEqual(['8,0', '9,0', '10,0']);
    const three = simFromAscii('RGB...');
    for (let c = 0; c < 3; c++) setKind(three, 11, c, 'wild');
    expect(findMatches(three)).toHaveLength(3);
  });

  it('only resting blocks take part (a hovering wild does not match)', () => {
    const sim = simFromAscii('RGR...');
    setKind(sim, 11, 1, 'wild');
    cellAt(sim, 11, 1)!.state = 'hovering';
    cellAt(sim, 11, 1)!.timer = 5;
    expect(findMatches(sim)).toEqual([]);
  });

  it('clears and scores in the sim, keeping invariants', () => {
    const sim = simFromAscii('RGR...');
    setKind(sim, 11, 1, 'wild');
    const events = [...step(sim), ...settle(sim)];
    expect(ofType(events, 'matched')[0]!.combo).toBe(3);
    expect(sim.score).toBe(30);
    expect(sim.cells.every((b) => b === null)).toBe(true);
    expect(checkInvariants(sim)).toEqual([]);
  });
});

describe('bomb blocks', () => {
  it('a matched bomb pulls its resting 3×3 neighbourhood into the match', () => {
    const sim = simFromAscii(`
      GBY...
      BRRR..
    `);
    setKind(sim, 11, 1, 'bomb');
    expect(cellsOf(sim, findMatches(sim)).sort()).toEqual(
      ['10,0', '10,1', '10,2', '11,0', '11,1', '11,2', '11,3'].sort(),
    );
  });

  it('an unmatched bomb does nothing', () => {
    const sim = simFromAscii('GBY...\nBRGR..');
    setKind(sim, 11, 1, 'bomb');
    expect(findMatches(sim)).toEqual([]);
  });

  it('bombs caught in a blast detonate too', () => {
    const sim = simFromAscii(`
      ....GY
      ...BGB
      RRRYBG
    `);
    setKind(sim, 11, 2, 'bomb');
    setKind(sim, 10, 3, 'bomb');
    const m = cellsOf(sim, findMatches(sim));
    // second bomb at (10,3) reaches column 4 and row 9
    expect(m).toContain('9,4');
    expect(m).toContain('11,4');
    expect(m).not.toContain('9,5');
    expect(m).toContain('10,4');
  });

  it('a bomb blast is one combo group that clears cleanly', () => {
    const sim = simFromAscii('GBY...\nBRRR..');
    setKind(sim, 11, 1, 'bomb');
    const events = [...step(sim), ...settle(sim)];
    expect(ofType(events, 'matched').map((m) => m.combo)).toEqual([7]);
    expect(checkInvariants(sim)).toEqual([]);
  });
});

describe('modifier swap locks', () => {
  it('lockedColumns blocks swaps touching a locked column', () => {
    const sim = simFromAscii('RGBYRG');
    sim.modifiers[MOD_LOCKED_COLUMNS] = 1 << 2;
    expect(canSwap(sim, 11, 0)).toBeNull();
    expect(canSwap(sim, 11, 1)).toBe('locked');
    expect(canSwap(sim, 11, 2)).toBe('locked');
    expect(canSwap(sim, 11, 3)).toBeNull();
  });

  it('swapLockUntil locks every swap until that tick', () => {
    const sim = simFromAscii('RGBYRG');
    sim.modifiers[MOD_SWAP_LOCK_UNTIL] = 3;
    expect(canSwap(sim, 11, 0)).toBe('locked');
    step(sim);
    step(sim);
    step(sim);
    expect(canSwap(sim, 11, 0)).toBeNull();
  });

  it('absent keys change nothing', () => {
    const sim = createSim('x');
    const free = createSim('x');
    free.modifiers = { other: 1 };
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 5; c++) expect(canSwap(free, r, c)).toBe(canSwap(sim, r, c));
    }
  });
});

describe('score context', () => {
  it('step passes the sim to score modifiers', () => {
    const sim = simFromAscii('RRR...');
    let seen: ScoreContext['sim'] = undefined;
    step(sim, [], { scoreModifiers: [(ctx) => (seen = ctx.sim)] });
    expect(seen).toBe(sim);
  });
});
