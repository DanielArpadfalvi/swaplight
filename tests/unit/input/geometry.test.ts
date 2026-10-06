import { describe, expect, it } from 'vitest';
import { loadAscii } from '../../../src/core/ascii';
import { createSim, riseFraction } from '../../../src/core/sim';
import {
  geometryForSim,
  hitTest,
  pointToCell,
  pointToGrid,
  type BoardGeometry,
} from '../../../src/input/geometry';
import { createSimView } from '../../../src/input/simView';

const geo = (riseOffsetPx = 0): BoardGeometry => ({
  originX: 10,
  originY: 20,
  cellSize: 40,
  cols: 6,
  rows: 12,
  riseOffsetPx,
});

describe('BoardGeometry', () => {
  it('maps points to cells (row 0 at the top)', () => {
    expect(pointToCell(geo(), 10, 20)).toEqual({ row: 0, col: 0 });
    expect(pointToCell(geo(), 49.9, 59.9)).toEqual({ row: 0, col: 0 });
    expect(pointToCell(geo(), 50, 60)).toEqual({ row: 1, col: 1 });
    expect(pointToCell(geo(), 10 + 5.5 * 40, 20 + 11.5 * 40)).toEqual({ row: 11, col: 5 });
    expect(pointToGrid(geo(), 30, 40)).toEqual({ row: 0.5, col: 0.5 });
  });

  it('accounts for the rise offset (grid shifted up)', () => {
    // Half a cell of rise: the point that used to be the top half of row 11 is now row 11's
    // bottom half, and the old bottom half of row 11 is the preview row.
    const y = 20 + 11 * 40 + 10; // quarter into row 11 without rise
    expect(pointToCell(geo(0), 30, y)).toEqual({ row: 11, col: 0 });
    expect(pointToCell(geo(20), 30, y)).toEqual({ row: 11, col: 0 });
    expect(hitTest(geo(20), 30, y + 15).zone).toBe('below');
    expect(pointToCell(geo(20), 30, 20 + 5 * 40 - 15)).toEqual({ row: 5, col: 0 });
    expect(pointToCell(geo(0), 30, 20 + 5 * 40 - 15)).toEqual({ row: 4, col: 0 });
  });

  it('classifies zones', () => {
    expect(hitTest(geo(), 30, 20 + 12 * 40 + 5)).toMatchObject({ zone: 'below', row: 12 });
    expect(hitTest(geo(), 500, 20 + 14 * 40).zone).toBe('below');
    expect(hitTest(geo(), 30, 10).zone).toBe('outside');
    expect(hitTest(geo(), 5, 100).zone).toBe('outside');
    expect(hitTest(geo(), 10 + 6 * 40, 100).zone).toBe('outside');
    expect(pointToCell(geo(), 5, 100)).toBeNull();
  });

  it('geometryForSim uses the sim size and riseFraction', () => {
    const sim = createSim('g', {}, 'endless');
    sim.riseOffset = 4;
    sim.riseAccum = 500;
    const g = geometryForSim({ originX: 0, originY: 0, cellSize: 32 }, sim);
    expect(g).toMatchObject({ cols: 6, rows: 12, cellSize: 32 });
    expect(g.riseOffsetPx).toBeCloseTo(riseFraction(sim) * 32);
    expect(g.riseOffsetPx).toBeCloseTo(9);
  });
});

describe('createSimView', () => {
  it('reads a live sim', () => {
    let sim = createSim('v', {}, 'static');
    loadAscii(sim, 'RG....');
    const view = createSimView(() => sim);
    const r = view.blockAt(11, 0)!;
    expect(view.rows).toBe(12);
    expect(view.cols).toBe(6);
    expect(view.locate(r.id)).toEqual({ row: 11, col: 0 });
    expect(view.locate(-1)).toBeNull();
    expect(view.canSwap(11, 0)).toBe(true);
    expect(view.canSwap(11, 3)).toBe(false);
    expect(view.canSwap(11, 5)).toBe(false);
    expect(view.rowsRisen()).toBe(0);
    sim = createSim('w', {}, 'static');
    loadAscii(sim, '......');
    expect(view.blockAt(11, 0)).toBeNull();
  });
});
