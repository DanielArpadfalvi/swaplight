import { describe, expect, it } from 'vitest';
import { cellCenter, computeLayout, ZERO_INSETS } from '../../../src/render/board/layout';

const opts = { rows: 12, cols: 6 };

describe('computeLayout', () => {
  it('fits a 390×844 portrait phone with an integer cell size', () => {
    const l = computeLayout(390, 844, ZERO_INSETS, opts);
    expect(Number.isInteger(l.cellSize)).toBe(true);
    expect(l.cellSize).toBeGreaterThanOrEqual(45);
    expect(l.boardWidth).toBe(l.cellSize * 6);
    expect(l.boardHeight).toBe(l.cellSize * 12);
    // Horizontally centered.
    expect(Math.abs(l.originX - (390 - l.boardWidth) / 2)).toBeLessThanOrEqual(1);
    // Below the HUD band, above the bottom edge (incl. preview strip and frame).
    expect(l.originY).toBeGreaterThanOrEqual(l.hudTop + l.hudHeight);
    expect(l.originY + l.boardHeight + l.previewHeight + l.framePad).toBeLessThanOrEqual(844);
    expect(l.hudHeight / 844).toBeGreaterThan(0.15);
    expect(l.hudHeight / 844).toBeLessThan(0.25);
  });

  it('respects safe-area insets', () => {
    const insets = { top: 47, right: 0, bottom: 34, left: 0 };
    const l = computeLayout(390, 844, insets, opts);
    expect(l.hudTop).toBe(47);
    expect(l.originY).toBeGreaterThanOrEqual(47 + l.hudHeight);
    expect(l.originY + l.boardHeight + l.previewHeight).toBeLessThanOrEqual(844 - 34);
  });

  it('is limited by width on narrow screens and by height on wide ones', () => {
    const narrow = computeLayout(320, 900, ZERO_INSETS, opts);
    expect(narrow.boardWidth).toBeLessThanOrEqual(320 - 2 * 14);
    const wide = computeLayout(1600, 800, ZERO_INSETS, opts);
    expect(wide.boardWidth).toBeLessThan(800);
    expect(wide.originX).toBeGreaterThan(500);
  });

  it('never returns a degenerate cell size', () => {
    expect(computeLayout(10, 10, ZERO_INSETS, opts).cellSize).toBeGreaterThanOrEqual(12);
    expect(computeLayout(4000, 4000, ZERO_INSETS, opts).cellSize).toBeLessThanOrEqual(76);
  });
});

describe('cellCenter', () => {
  it('maps grid coordinates to screen, shifted up by the rise', () => {
    const l = { originX: 10, originY: 100, cellSize: 50 };
    expect(cellCenter(l, 0, 0, 0)).toEqual({ x: 35, y: 125 });
    expect(cellCenter(l, 2, 1, 0.5)).toEqual({ x: 85, y: 200 });
  });
});
