import { describe, expect, it } from 'vitest';
import { boardToAscii } from '../../../src/core/ascii';
import { RISE_SCALE, SUBUNITS_PER_CELL } from '../../../src/core/config';
import { checkInvariants } from '../../../src/core/invariants';
import { riseFraction, step } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/types';
import { ofType, run, simFromAscii } from './helpers';

const FAST = { riseSpeedBase: RISE_SCALE, levelUpTicks: 0, levelUpBlocks: 0 }; // 16 ticks/row

const TOWER = Array.from({ length: 12 }, (_, i) => (i % 2 ? 'R.....' : 'G.....')).join('\n');

describe('rise', () => {
  it('auto-rise: the preview row becomes the bottom row and a new preview appears', () => {
    const sim = simFromAscii('RG....\n--\nBYBYBY', FAST, 'endless');
    const previewIds = sim.preview.map((b) => b.id);
    run(sim, SUBUNITS_PER_CELL / 2);
    expect(sim.riseOffset).toBe(8);
    expect(riseFraction(sim)).toBeCloseTo(0.5);
    const ev = run(sim, SUBUNITS_PER_CELL / 2);
    expect(ofType(ev, 'rowRisen')).toHaveLength(1);
    expect(sim.riseOffset).toBe(0);
    expect(boardToAscii(sim)).toBe('RG....\nBYBYBY');
    const { rows, cols } = sim.config;
    expect(sim.cells.slice((rows - 1) * cols).map((b) => b!.id)).toEqual(previewIds);
    expect(ofType(ev, 'rowRisen')[0]!.previewIds).toEqual(sim.preview.map((b) => b.id));
    expect(sim.stats.rowsRisen).toBe(1);
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('slow default rise uses the fixed-point accumulator', () => {
    const sim = simFromAscii('RG....', { levelUpTicks: 0, levelUpBlocks: 0 }, 'endless');
    run(sim, 100); // 100 × 20 = 2000 → 2 sub-units
    expect(sim.riseOffset).toBe(2);
    expect(sim.riseAccum).toBe(0);
    run(sim, 25);
    expect(sim.riseAccum).toBe(500);
  });

  it('static mode never rises', () => {
    const sim = simFromAscii('RG....', FAST, 'static');
    run(sim, 100);
    expect(sim.riseOffset).toBe(0);
    expect(boardToAscii(sim)).toBe('RG....');
  });

  it('rise is frozen while blocks clear, then stop time halts it after a combo', () => {
    const sim = simFromAscii('RRRR..\nGBGBGB', FAST, 'endless');
    const ev = run(sim, 1);
    const m = ofType(ev, 'matched')[0]!;
    expect(m.combo).toBe(4);
    expect(m.stopTicks).toBe(sim.config.comboStopBase);
    const offset = sim.riseOffset;
    const clearTicks = sim.config.flashTicks + 4 * sim.config.popTicksPerBlock;
    run(sim, clearTicks - 1);
    expect(sim.groups).toHaveLength(1);
    run(sim, 1);
    expect(sim.groups).toHaveLength(0);
    expect(sim.riseOffset).toBe(offset);
    expect(sim.stopTicks).toBe(sim.config.comboStopBase - 1);
    run(sim, sim.config.comboStopBase - 1);
    expect(sim.stopTicks).toBe(0);
    expect(sim.riseOffset).toBe(offset);
    run(sim, 1);
    expect(sim.riseOffset).toBe(offset + 1);
  });

  it('manual raise is fast, cancels stop time and finishes the row after release', () => {
    const sim = simFromAscii('RG....\n--\nBYBYBY', { levelUpTicks: 0 }, 'endless');
    sim.stopTicks = 500;
    step(sim, [{ type: 'raise', active: true }]);
    expect(sim.stopTicks).toBe(0);
    expect(sim.riseOffset).toBe(2);
    step(sim, [{ type: 'raise', active: false }]);
    expect(sim.riseOffset).toBe(4);
    const ev = run(sim, 6);
    expect(ofType(ev, 'rowRisen')).toHaveLength(1);
    expect(sim.manualRaising).toBe(false);
    run(sim, 10);
    expect(sim.riseOffset).toBe(0); // back to slow auto-rise
    expect(sim.riseAccum).toBe(200);
  });

  it('holding raise keeps raising row after row', () => {
    const sim = simFromAscii('RG....', { levelUpTicks: 0 }, 'endless');
    step(sim, [{ type: 'raise', active: true }]);
    const ev = run(sim, 31);
    expect(ofType(ev, 'rowRisen')).toHaveLength(4);
  });

  it('manual raise does nothing while blocks are clearing', () => {
    const sim = simFromAscii('RRR...\nGBGBGB', { levelUpTicks: 0 }, 'endless');
    step(sim, [{ type: 'raise', active: true }]);
    run(sim, 10);
    expect(sim.riseOffset).toBe(0);
  });
});

describe('danger and top-out', () => {
  it('pinned stack drains grace and ends the game', () => {
    const sim = simFromAscii(TOWER, { ...FAST, graceTicks: 30 }, 'endless');
    const events: SimEvent[] = [];
    for (let i = 0; i < 29; i++) events.push(...step(sim));
    expect(ofType(events, 'danger')).toEqual([{ type: 'danger', active: true, grace: 30 }]);
    expect(sim.danger).toBe(true);
    expect(sim.grace).toBe(1);
    expect(sim.gameOver).toBe(false);
    expect(sim.riseOffset).toBe(0);
    const last = step(sim);
    expect(ofType(last, 'gameOver')).toHaveLength(1);
    expect(sim.gameOver).toBe(true);
    const tick = sim.tick;
    expect(step(sim, [{ type: 'swap', row: 11, col: 0 }])).toEqual([]);
    expect(sim.tick).toBe(tick);
  });

  it('stop time protects against grace drain', () => {
    const sim = simFromAscii(TOWER, { ...FAST, graceTicks: 30 }, 'endless');
    sim.stopTicks = 50;
    run(sim, 50);
    expect(sim.grace).toBe(30);
    expect(sim.danger).toBe(false);
  });

  it('grace refills once the top row is clear', () => {
    const sim = simFromAscii(TOWER, { ...FAST, graceTicks: 60 }, 'endless');
    run(sim, 20);
    expect(sim.grace).toBe(40);
    // Slide the top block off the tower: it hovers then falls down column 1.
    const ev = step(sim, [{ type: 'swap', row: 0, col: 0 }]);
    expect(ofType(ev, 'swapped')).toHaveLength(1);
    const after: SimEvent[] = [];
    for (let i = 0; i < sim.config.swapTicks + 1; i++) after.push(...step(sim));
    expect(ofType(after, 'danger')).toEqual([{ type: 'danger', active: false, grace: 60 }]);
    expect(sim.grace).toBe(60);
    // The top block hovers in row 0 (rise blocked, no drain), falls, then rising resumes
    // until the tower is pinned again and grace starts draining from full.
    for (let i = 0; i < 40; i++) after.push(...step(sim));
    expect(ofType(after, 'rowRisen')).toHaveLength(1);
    expect(sim.gameOver).toBe(false);
    expect(sim.danger).toBe(true);
    expect(sim.grace).toBeGreaterThan(40);
  });

  it('holding raise while pinned neither raises nor loses faster', () => {
    const sim = simFromAscii(TOWER, { ...FAST, graceTicks: 30 }, 'endless');
    step(sim, [{ type: 'raise', active: true }]);
    run(sim, 10);
    expect(sim.grace).toBe(19);
    expect(sim.riseOffset).toBe(0);
  });
});

describe('levels', () => {
  it('levels up over time and speeds up the rise', () => {
    const sim = simFromAscii('RG....', { levelUpTicks: 60, levelUpBlocks: 0 }, 'endless');
    const ev = run(sim, 120);
    expect(ofType(ev, 'levelUp').map((e) => e.level)).toEqual([2, 3]);
    expect(sim.level).toBe(3);
  });

  it('levels up from cleared blocks and is clamped to maxLevel', () => {
    const sim = simFromAscii(
      'RRRGGG\nBYBYBY',
      { levelUpTicks: 0, levelUpBlocks: 3, maxLevel: 2 },
      'endless',
    );
    const ev = run(sim, 1);
    expect(ofType(ev, 'levelUp')).toEqual([{ type: 'levelUp', level: 2 }]);
    expect(sim.level).toBe(2);
  });

  it('static mode keeps the level', () => {
    const sim = simFromAscii('RG....', { levelUpTicks: 1 }, 'static');
    run(sim, 10);
    expect(sim.level).toBe(1);
  });
});
