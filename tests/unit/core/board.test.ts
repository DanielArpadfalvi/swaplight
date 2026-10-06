import { describe, expect, it } from 'vitest';
import { boardToAscii, loadAscii } from '../../../src/core/ascii';
import { cellAt, columnTops, generatePreviewRow, pushRow } from '../../../src/core/board';
import { findMatches } from '../../../src/core/match';
import { createSim } from '../../../src/core/sim';
import { checkInvariants } from '../../../src/core/invariants';

describe('initial board generation', () => {
  it('has no matches, no floating blocks and uneven heights over 200 seeds', () => {
    let unevenBoards = 0;
    for (let seed = 0; seed < 200; seed++) {
      const sim = createSim(seed);
      expect(findMatches(sim)).toEqual([]);
      expect(checkInvariants(sim)).toEqual([]);
      const heights = columnTops(sim).map((t) => sim.config.rows - t);
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(sim.config.initialMinHeight);
        expect(h).toBeLessThanOrEqual(sim.config.initialMaxHeight);
      }
      if (new Set(heights).size > 1) unevenBoards++;
      // Preview row never forms a vertical/horizontal 3 with the bottom rows.
      const { rows, cols } = sim.config;
      sim.preview.forEach((b, c) => {
        const a1 = cellAt(sim, rows - 1, c);
        const a2 = cellAt(sim, rows - 2, c);
        expect(a1 && a2 && a1.color === b.color && a2.color === b.color).toBeFalsy();
        if (c >= 2) {
          expect(
            sim.preview[c - 1]!.color === b.color && sim.preview[c - 2]!.color === b.color,
          ).toBe(false);
        }
      });
      expect(sim.preview).toHaveLength(cols);
    }
    expect(unevenBoards).toBeGreaterThan(190);
  });

  it('same seed gives the same board, different seeds differ', () => {
    expect(boardToAscii(createSim('a'), { preview: true })).toBe(
      boardToAscii(createSim('a'), { preview: true }),
    );
    expect(boardToAscii(createSim('a'))).not.toBe(boardToAscii(createSim('b')));
  });

  it('works with 3 colors (tightest palette)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const sim = createSim(seed, { colors: 3 });
      expect(findMatches(sim)).toEqual([]);
    }
  });
});

describe('preview row / pushRow', () => {
  it('avoids vertical 3 with the bottom two rows', () => {
    const sim = createSim('pv', { colors: 3 });
    loadAscii(sim, 'RGBRGB\nRGBRGB');
    for (let i = 0; i < 100; i++) {
      const row = generatePreviewRow(sim);
      row.forEach((b, c) => expect(b.color).not.toBe(c % 3));
    }
  });

  it('pushRow shifts everything up and activates the preview', () => {
    const sim = createSim('push', {}, 'static');
    loadAscii(sim, 'R.....\nGB....\n--\nYPYPYP');
    const previewIds = sim.preview.map((b) => b.id);
    pushRow(sim);
    expect(boardToAscii(sim)).toBe('R.....\nGB....\nYPYPYP');
    const { rows, cols } = sim.config;
    expect(sim.cells.slice((rows - 1) * cols).map((b) => b?.id)).toEqual(previewIds);
    expect(sim.preview).toHaveLength(cols);
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('columnTops reports empty columns as rows', () => {
    const sim = createSim('tops', {}, 'static');
    loadAscii(sim, 'R.....\nG....B');
    expect(columnTops(sim)).toEqual([10, 12, 12, 12, 12, 11]);
  });
});
