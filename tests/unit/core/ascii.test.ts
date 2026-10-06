import { describe, expect, it } from 'vitest';
import { boardStatesToAscii, boardToAscii, loadAscii, parseAscii } from '../../../src/core/ascii';
import { createSim } from '../../../src/core/sim';
import { simFromAscii, run } from './helpers';

describe('ascii boards', () => {
  it('round-trips, bottom-aligned, with chain flags and preview', () => {
    const text = `
      r.....
      GB...Y
      --
      RGBYPR
    `;
    const sim = simFromAscii(text);
    expect(boardToAscii(sim, { preview: true })).toBe('r.....\nGB...Y\n--\nRGBYPR');
    expect(sim.cells[10 * 6]!.chain).toBe(true);
    expect(boardToAscii(sim, { trim: false }).split('\n')).toHaveLength(12);
  });

  it('rejects malformed input', () => {
    expect(() => parseAscii('RGB', 6)).toThrow();
    expect(() => parseAscii('RGBXRG', 6)).toThrow();
    expect(() => parseAscii('RGBYRG\n--\nRGB.RG', 6)).toThrow();
    expect(() => parseAscii('RGBYRG\n--\nRGBYRG\nRGBYRG', 6)).toThrow();
    const sim = createSim('x', { colors: 3 });
    expect(() => loadAscii(sim, 'Y.....')).toThrow();
    expect(() => loadAscii(sim, 'R.....\n'.repeat(13))).toThrow();
  });

  it('state debug view marks block states', () => {
    const sim = simFromAscii('R.....\n......\nGG.G..');
    run(sim, 1);
    const view = boardStatesToAscii(sim);
    expect(view).toContain('Rh');
  });
});
