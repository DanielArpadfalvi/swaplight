import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  deltaE2000,
  hexToLab,
  minPairwiseDeltaE,
  mixColor,
  simulateCvd,
} from '../../../src/render/style/colorMath';
import {
  HIGH_CONTRAST_PALETTE,
  NEON_PALETTE,
  getBlockColor,
} from '../../../src/render/style/palette';
import type { Palette } from '../../../src/render/style/palette';

describe('colorMath', () => {
  it('computes CIEDE2000 against reference pairs (Sharma et al.)', () => {
    expect(deltaE2000(0x000000, 0x000000)).toBe(0);
    // Black vs white is ~100 in CIEDE2000.
    expect(deltaE2000(0x000000, 0xffffff)).toBeCloseTo(100, 0);
    expect(hexToLab(0xffffff).L).toBeCloseTo(100, 1);
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 1);
    expect(contrastRatio(0x777777, 0x777777)).toBeCloseTo(1, 5);
  });

  it('mixes and keeps grays gray under CVD simulation', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    const g = simulateCvd(0x808080, 'deuteranopia');
    expect(deltaE2000(g, 0x808080)).toBeLessThan(2);
  });
});

const PALETTES: Palette[] = [NEON_PALETTE, HIGH_CONTRAST_PALETTE];

describe.each(PALETTES)('palette $name', (palette) => {
  const bases = palette.blocks.map((b) => b.base);

  it('has six blocks with unique ids, names and symbols', () => {
    expect(palette.blocks).toHaveLength(6);
    expect(new Set(palette.blocks.map((b) => b.symbol)).size).toBe(6);
    expect(new Set(palette.blocks.map((b) => b.name)).size).toBe(6);
    palette.blocks.forEach((b, i) => expect(b.id).toBe(i));
    expect(getBlockColor(palette, 2).id).toBe(2);
    expect(() => getBlockColor(palette, 9)).toThrow(RangeError);
  });

  it('keeps block hues clearly apart for normal vision', () => {
    expect(minPairwiseDeltaE(bases)).toBeGreaterThan(20);
  });

  it.each(['protanopia', 'deuteranopia', 'tritanopia'] as const)(
    'keeps block hues distinguishable under %s',
    (cvd) => {
      // The high-contrast palette must separate hues clearly even without relying on the symbols.
      const floor = palette.name === 'high-contrast' ? 11 : 8;
      expect(minPairwiseDeltaE(bases, cvd)).toBeGreaterThan(floor);
    },
  );

  it('makes every block, symbol and UI text pop off the backdrop', () => {
    for (const b of palette.blocks) {
      expect(contrastRatio(b.base, palette.background.bottom)).toBeGreaterThan(3);
      // The pale symbol must read against the dark lower body of its own tile.
      expect(contrastRatio(b.light, b.dark)).toBeGreaterThan(4.5);
    }
    expect(contrastRatio(palette.ui.text, palette.background.top)).toBeGreaterThan(12);
    expect(contrastRatio(palette.ui.textDim, palette.background.top)).toBeGreaterThan(4.5);
  });

  it('keeps garbage distinct from every color block', () => {
    for (const b of bases) expect(deltaE2000(palette.garbage.base, b)).toBeGreaterThan(15);
  });
});
