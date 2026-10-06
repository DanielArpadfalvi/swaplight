import { describe, expect, it } from 'vitest';
import { boardToAscii } from '../../../src/core/ascii';
import { cellAt } from '../../../src/core/board';
import { checkInvariants } from '../../../src/core/invariants';
import { step } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/types';
import { isSettled, ofType, settle, simFromAscii, swap } from './helpers';

/** Swap, then run until settled, checking invariants every tick. */
function playSwap(ascii: string, row: number, col: number) {
  const sim = simFromAscii(ascii);
  const events: SimEvent[] = [...swap(sim, row, col)];
  for (let i = 0; i < 2000 && !isSettled(sim); i++) {
    events.push(...step(sim));
    expect(checkInvariants(sim)).toEqual([]);
  }
  expect(isSettled(sim)).toBe(true);
  return { sim, events };
}

describe('chains', () => {
  // Swap brings G into col 0 → vertical GGG clears → R falls into row 11 → RRR (x2)
  // → Y/B and Y/Y stacks fall → row 11 YYY (x3).
  const CHAIN3 = `
    R.....
    BGY...
    GYY...
    GRRY..
  `;

  it('builds a x2 and x3 chain from falling blocks and reports chainEnd', () => {
    const { sim, events } = playSwap(CHAIN3, 9, 0);
    const matched = ofType(events, 'matched');
    expect(matched.map((m) => [m.combo, m.chain])).toEqual([
      [3, 1],
      [3, 2],
      [3, 3],
    ]);
    expect(matched[1]!.blocks.map((b) => b.color)).toEqual([0, 0, 0]);
    expect(matched[2]!.blocks.map((b) => [b.row, b.col])).toEqual([
      [11, 1],
      [11, 2],
      [11, 3],
    ]);
    expect(ofType(events, 'chainEnd')).toEqual([{ type: 'chainEnd', length: 3 }]);
    expect(sim.chain).toBe(1);
    expect(sim.stats.maxChain).toBe(3);
    expect(boardToAscii(sim)).toBe('.BY...');
    // Scoring: 30×1 + 30×2 + 30×3
    expect(sim.score).toBe(30 + 60 + 90);
    // Stop time awarded by the chain links
    expect(matched[1]!.stopTicks).toBe(sim.config.chainStopBase);
    expect(matched[2]!.stopTicks).toBe(sim.config.chainStopBase + sim.config.chainStopPerLevel);
    // Landed events of chain blocks carry the flag
    expect(ofType(events, 'landed').some((l) => l.chain)).toBe(true);
  });

  it('blocks above a clearing group get the chain flag; flag clears on a non-matching landing', () => {
    const sim = simFromAscii(`
      Y.....
      B.....
      RRR...
      GBG...
    `);
    const events: SimEvent[] = [];
    step(sim);
    const y = cellAt(sim, 8, 0)!;
    const b = cellAt(sim, 9, 0)!;
    expect(y.chain).toBe(false);
    for (let i = 0; i < 200 && sim.groups.length > 0; i++) events.push(...step(sim));
    expect(y.chain).toBe(true);
    expect(b.chain).toBe(true);
    expect(y.state).toBe('hovering');
    events.push(...settle(sim));
    expect(y.chain).toBe(false);
    expect(b.chain).toBe(false);
    expect(ofType(events, 'chainEnd')).toHaveLength(0);
    expect(ofType(events, 'matched')).toHaveLength(0);
    expect(boardToAscii(sim)).toBe('Y.....\nB.....\nGBG...');
  });

  it('a chain block that lands without matching does not count later', () => {
    const sim = simFromAscii(`
      B.....
      RRRBB.
      GYGYG.
    `);
    step(sim);
    for (let i = 0; i < 300 && !isSettled(sim); i++) step(sim);
    expect(boardToAscii(sim)).toBe('B..BB.\nGYGYG.');
    expect(sim.cells.some((x) => x?.chain)).toBe(false);
    swap(sim, 10, 0);
    for (let i = 0; i < sim.config.swapTicks; i++) step(sim);
    const ev = [...swap(sim, 10, 1)];
    ev.push(...settle(sim));
    const matched = ofType(ev, 'matched');
    expect(matched).toHaveLength(1);
    expect(matched[0]!.chain).toBe(1);
    expect(sim.stats.maxChain).toBe(1);
    expect(ofType(ev, 'chainEnd')).toHaveLength(0);
  });

  it('the chain stays alive while its groups are clearing', () => {
    const sim = simFromAscii(`
      R.....
      BGY...
      GYY...
      GRRY..
    `);
    swap(sim, 9, 0);
    // Wait until the x2 match happens.
    let guard = 0;
    while (sim.chain < 2 && guard++ < 500) step(sim);
    expect(sim.chain).toBe(2);
    // Chain is alive while groups clear even if a new independent match is made.
    expect(sim.groups.length).toBeGreaterThan(0);
  });

  it('chain resets after the last chain block settles', () => {
    const { sim, events } = playSwap(
      `
      R.....
      BG....
      GY....
      GRR...
    `,
      9,
      0,
    );
    const matched = ofType(events, 'matched');
    expect(matched.map((m) => m.chain)).toEqual([1, 2]);
    expect(ofType(events, 'chainEnd')).toEqual([{ type: 'chainEnd', length: 2 }]);
    const endIdx = events.findIndex((e) => e.type === 'chainEnd');
    const lastLand = events.map((e) => e.type).lastIndexOf('landed');
    expect(endIdx).toBeGreaterThan(lastLand);
    expect(sim.chain).toBe(1);
  });
});
