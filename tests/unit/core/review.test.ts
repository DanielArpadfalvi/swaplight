/**
 * Review reproductions (2026-10). Tests in this file document suspected bugs /
 * divergences from Panel de Pon; a failing test here is EXPECTED until the
 * engine is changed. See the review report for the reasoning behind each case.
 */
import { describe, expect, it } from 'vitest';
import { cellAt } from '../../../src/core/board';
import { RISE_SCALE } from '../../../src/core/config';
import { canSwap, step } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/types';
import { ofType, run, settle, simFromAscii, swap } from './helpers';

const FAST = { riseSpeedBase: RISE_SCALE, levelUpTicks: 0, levelUpBlocks: 0 };
const TOWER = Array.from({ length: 12 }, (_, i) => (i % 2 ? 'R.....' : 'G.....')).join('\n');

describe('review: swap rules', () => {
  // Panel de Pon / Panel Attack: a panel slid over a gap is still checked for
  // matches on the frame its swap completes (Panel Attack: `matchAnyway`), so
  // "sliding a panel off a ledge into a horizontal line" clears it mid-air.
  // Here updateTimers → idle, then applyGravity → hovering BEFORE detectMatches,
  // so the panel can never match before it falls.
  it('a block slid over a gap completes a horizontal match before it falls', () => {
    const sim = simFromAscii(`
      RR.R..
      GB.Y..
    `);
    const events: SimEvent[] = [...swap(sim, 10, 2)];
    events.push(...run(sim, sim.config.swapTicks));
    const matched = ofType(events, 'matched');
    expect(matched).toHaveLength(1);
    expect(matched[0]!.blocks.map((b) => [b.row, b.col])).toEqual([
      [10, 0],
      [10, 1],
      [10, 2],
    ]);
  });

  // Panel Attack canSwap: "neither space above us can be hovering". The engine
  // deliberately allows "catching" a hovering block; flagging as a rule divergence.
  it('cannot swap a block into the gap directly below a hovering block (PdP rule)', () => {
    const sim = simFromAscii('Y.....\nG.....\nRB....');
    swap(sim, 10, 0);
    run(sim, sim.config.swapTicks);
    expect(cellAt(sim, 9, 0)!.state).toBe('hovering');
    expect(canSwap(sim, 10, 0)).toBe('locked');
  });
});

describe('review: chain consistency', () => {
  // Originally: the "catch" swap gave a x2 one tick after the clear but not on
  // the clear tick itself. With the PdP rule (no swapping under a hovering block,
  // and blocks above a clear start hovering on the clear tick) the catch is
  // rejected at both timings, so the outcome no longer depends on the tick.
  const BOARD = `
    .Y....
    YRRR..
    GYBG..
  `;
  function clearTick(): number {
    const sim = simFromAscii(BOARD);
    step(sim); // match
    for (let i = 0; i < 500; i++) {
      step(sim);
      if (sim.groups.length === 0) return sim.tick;
    }
    throw new Error('no clear');
  }
  function play(swapAt: number) {
    const sim = simFromAscii(BOARD);
    const events: SimEvent[] = [];
    while (sim.tick < swapAt - 1) events.push(...step(sim));
    events.push(...step(sim, [{ type: 'swap', row: 10, col: 0 }]));
    events.push(...settle(sim));
    return {
      chains: ofType(events, 'matched').map((m) => m.chain),
      rejected: ofType(events, 'swapRejected').map((r) => r.reason),
    };
  }
  it('catch one tick after the clear is rejected (block above is hovering)', () => {
    expect(play(clearTick() + 1)).toEqual({ chains: [1], rejected: ['locked'] });
  });
  it('catch on the same tick as the clear is rejected too', () => {
    expect(play(clearTick())).toEqual({ chains: [1], rejected: ['locked'] });
  });
});

describe('review: raise / stop time', () => {
  // A single raise tap (press + release) while a combo is still clearing is
  // latched into manualRaising; once the clear ends it wipes the stop time the
  // combo just earned and raises a full row. In PdP raise input during a clear
  // is simply ignored.
  it('a raise tap during a clear does not cancel the stop time earned by that clear', () => {
    const sim = simFromAscii('RRRR..\nGBGBGB', { levelUpTicks: 0, levelUpBlocks: 0 }, 'endless');
    step(sim); // combo 4 → stop time awarded
    step(sim, [{ type: 'raise', active: true }]);
    step(sim, [{ type: 'raise', active: false }]);
    const events: SimEvent[] = [];
    while (sim.groups.length > 0) events.push(...step(sim));
    events.push(...step(sim));
    expect(sim.stopTicks).toBeGreaterThan(0);
    expect(ofType([...events, ...run(sim, 10)], 'rowRisen')).toHaveLength(0);
  });

  // README: "stop time protects against grace drain" and "holding raise while
  // pinned does not drain faster". Holding (or brushing) raise while pinned
  // zeroes stopTicks, so grace starts draining immediately.
  it('holding raise while pinned does not throw away stop time', () => {
    const sim = simFromAscii(TOWER, { ...FAST, graceTicks: 30 }, 'endless');
    sim.stopTicks = 50;
    step(sim, [{ type: 'raise', active: true }]);
    run(sim, 20);
    expect(sim.grace).toBe(30);
    expect(sim.stopTicks).toBeGreaterThan(0);
  });
});

describe('review: render continuity', () => {
  // With fallSpeed < SUBUNITS_PER_CELL a falling block is drawn at row + fall/16.
  // Swapping a block into the cell below it makes it "land" in its current row
  // and reset `fall` to 0, i.e. it jumps UP by fall/16 of a cell.
  it('a falling block never moves up when a block is swapped in below it', () => {
    const sim = simFromAscii(
      `
      .R....
      ......
      ......
      ......
      G.....
      BY....
    `,
      { fallSpeed: 4 },
    );
    const r = cellAt(sim, 6, 1)!;
    const y = () => {
      const idx = sim.cells.indexOf(r);
      return Math.floor(idx / sim.config.cols) + r.fall / 16;
    };
    let last = y();
    let swapped = false;
    for (let i = 0; i < 200; i++) {
      const doSwap = !swapped && cellAt(sim, 9, 1) === r && r.fall === 8;
      if (doSwap) swapped = true;
      step(sim, doSwap ? [{ type: 'swap', row: 10, col: 0 }] : []);
      const now = y();
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(swapped).toBe(true);
  });
});
