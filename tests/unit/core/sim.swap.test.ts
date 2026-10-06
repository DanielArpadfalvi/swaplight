import { describe, expect, it } from 'vitest';
import { boardToAscii } from '../../../src/core/ascii';
import { cellAt } from '../../../src/core/board';
import { checkInvariants } from '../../../src/core/invariants';
import { canSwap, cloneSim, createSim, step } from '../../../src/core/sim';
import { ofType, run, settle, simFromAscii, swap } from './helpers';

describe('swap', () => {
  it('swaps two blocks, locks them for swapTicks, then they are idle', () => {
    const sim = simFromAscii('RGB...');
    const r = cellAt(sim, 11, 0)!;
    const g = cellAt(sim, 11, 1)!;
    const ev = swap(sim, 11, 0);
    expect(ofType(ev, 'swapped')[0]).toMatchObject({ leftId: g.id, rightId: r.id });
    expect(boardToAscii(sim)).toBe('GRB...');
    expect(r.state).toBe('swapping');
    expect(r.swapDir).toBe(1);
    expect(g.swapDir).toBe(-1);
    expect(canSwap(sim, 11, 0)).toBe('locked');
    run(sim, sim.config.swapTicks - 1);
    expect(r.state).toBe('swapping');
    run(sim, 1);
    expect(r.state).toBe('idle');
    expect(r.swapDir).toBe(0);
    expect(sim.stats.swaps).toBe(1);
  });

  it('rejects invalid swaps with a reason', () => {
    const sim = simFromAscii('R.....');
    expect(ofType(swap(sim, 11, 5), 'swapRejected')[0]!.reason).toBe('outOfBounds');
    expect(ofType(swap(sim, -1, 0), 'swapRejected')[0]!.reason).toBe('outOfBounds');
    expect(ofType(swap(sim, 11, 0.5), 'swapRejected')[0]!.reason).toBe('outOfBounds');
    expect(ofType(swap(sim, 11, 2), 'swapRejected')[0]!.reason).toBe('empty');
    sim.gameOver = true;
    expect(canSwap(sim, 11, 0)).toBe('gameOver');
  });

  it('swap into empty: block hovers, falls, lands', () => {
    const sim = simFromAscii('G.....\nR.....\nB.....');
    const g = cellAt(sim, 9, 0)!;
    swap(sim, 9, 0);
    // The vacated column: nothing above. Moving block is swapping over a hole.
    run(sim, sim.config.swapTicks);
    expect(g.state).toBe('hovering');
    expect(cellAt(sim, 9, 1)).toBe(g);
    run(sim, sim.config.hoverTicks - 1);
    expect(g.state).toBe('hovering');
    const ev = run(sim, 1);
    expect(g.state).toBe('falling');
    expect(cellAt(sim, 10, 1)).toBe(g);
    expect(ofType(ev, 'landed')).toHaveLength(0);
    const land = run(sim, 1);
    expect(cellAt(sim, 11, 1)).toBe(g);
    expect(g.state).toBe('landing');
    expect(ofType(land, 'landed')[0]).toMatchObject({ id: g.id, row: 11, col: 1, chain: false });
    run(sim, sim.config.landTicks);
    expect(g.state).toBe('idle');
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('a stack above a block swapped away hovers and falls together', () => {
    const sim = simFromAscii('Y.....\nG.....\nR.....\nBP....');
    swap(sim, 10, 0); // R moves right over the hole at (10,1)
    const y = cellAt(sim, 8, 0)!;
    const g = cellAt(sim, 9, 0)!;
    expect(y.state).toBe('hovering');
    expect(g.state).toBe('hovering');
    expect(y.timer).toBe(g.timer);
    settle(sim);
    expect(boardToAscii(sim)).toBe('Y.....\nGR....\nBP....');
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('cannot swap under a hovering block (PdP: no catching); it falls instead', () => {
    const sim = simFromAscii('Y.....\nG.....\nRB....');
    swap(sim, 10, 0); // G moves right; Y hovers at (9,0)
    run(sim, sim.config.swapTicks);
    const y = cellAt(sim, 9, 0)!;
    expect(y.state).toBe('hovering');
    expect(canSwap(sim, 10, 0)).toBe('locked');
    expect(ofType(swap(sim, 10, 0), 'swapRejected')[0]!.reason).toBe('locked');
    settle(sim);
    expect(boardToAscii(sim)).toBe('YG....\nRB....');
  });

  it('cannot swap a block sideways under a hovering block above the right-hand cell', () => {
    const sim = simFromAscii('.Y....\nRG....\nBRB...');
    swap(sim, 10, 1); // G moves right onto B; Y hovers at (9,1)
    run(sim, sim.config.swapTicks);
    expect(cellAt(sim, 9, 1)!.state).toBe('hovering');
    expect(canSwap(sim, 10, 0)).toBe('locked');
    expect(canSwap(sim, 10, 2)).toBe(null);
  });

  it('cannot swap into the cell below a block that is part-way through falling', () => {
    const sim = simFromAscii('.R....\n......\n......\nG.....\nBY....', {
      fallSpeed: 4,
      hoverTicks: 0,
    });
    const r = cellAt(sim, 7, 1)!;
    let checked = false;
    for (let i = 0; i < 40 && !checked; i++) {
      step(sim);
      if (cellAt(sim, 9, 1) === r && r.fall > 0) {
        expect(canSwap(sim, 10, 0)).toBe('locked');
        checked = true;
      }
    }
    expect(checked).toBe(true);
  });

  it('landing blocks can be swapped', () => {
    const sim = simFromAscii('R.....\n......\nGB....', { landTicks: 30 });
    run(sim, 20);
    const r = cellAt(sim, 10, 0)!;
    expect(r.state).toBe('landing');
    expect(canSwap(sim, 10, 0)).toBe(null);
  });

  it('hovering and falling blocks cannot be swapped', () => {
    const sim = simFromAscii('R.....\n......\n......\n......\nGB....');
    run(sim, 1);
    expect(cellAt(sim, 7, 0)!.state).toBe('hovering');
    expect(canSwap(sim, 7, 0)).toBe('locked');
    run(sim, sim.config.hoverTicks);
    const falling = sim.cells.find((b) => b?.state === 'falling');
    expect(falling).toBeDefined();
    const idx = sim.cells.indexOf(falling!);
    expect(canSwap(sim, Math.floor(idx / 6), 0)).toBe('locked');
  });

  it('respects zero landTicks and hoverTicks and fractional fall speed', () => {
    const sim = simFromAscii('R.....\n......\n......\nG.....', {
      landTicks: 0,
      hoverTicks: 0,
      fallSpeed: 4,
    });
    const r = cellAt(sim, 8, 0)!;
    const ev = run(sim, 3);
    expect(r.state).toBe('falling');
    expect(cellAt(sim, 8, 0)).toBe(r);
    run(sim, 1);
    expect(cellAt(sim, 9, 0)).toBe(r);
    const rest = run(sim, 4);
    expect(cellAt(sim, 10, 0)).toBe(r);
    expect(r.state).toBe('idle');
    expect(ofType([...ev, ...rest], 'landed')).toHaveLength(1);
  });

  it('a stack falls at the speed of its slowest member and never overlaps', () => {
    const sim = simFromAscii('B.....\nY.....\n......\n......\n......\nG.....', { fallSpeed: 5 });
    for (let i = 0; i < 100; i++) {
      step(sim);
      expect(checkInvariants(sim)).toEqual([]);
    }
    expect(boardToAscii(sim)).toBe('B.....\nY.....\nG.....');
  });

  it('a block swapped onto a slowly falling block falls along with it', () => {
    const sim = simFromAscii(
      `
      R.....
      GB....
      Y.....
      R.....
      G.....
      Y.....
      RG....
    `,
      { fallSpeed: 1, hoverTicks: 0 },
    );
    const r = cellAt(sim, 5, 0)!;
    const b = cellAt(sim, 6, 1)!;
    swap(sim, 5, 0);
    run(sim, sim.config.swapTicks);
    expect(b.state).toBe('falling');
    expect(r.state).toBe('falling');
    expect(r.fall).toBe(b.fall);
    for (let i = 0; i < 200; i++) {
      step(sim);
      expect(checkInvariants(sim)).toEqual([]);
    }
    expect(cellAt(sim, 9, 1)).toBe(r);
    expect(cellAt(sim, 10, 1)).toBe(b);
  });

  it('cloneSim produces an independent deep copy', () => {
    const sim = createSim('clone');
    const copy = cloneSim(sim);
    expect(copy).toEqual(sim);
    step(copy, [{ type: 'swap', row: 11, col: 0 }]);
    expect(copy).not.toEqual(sim);
    expect(sim.tick).toBe(0);
  });
});
