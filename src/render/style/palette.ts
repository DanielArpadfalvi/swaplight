import { desaturate, mixColor, scaleColor } from './colorMath';

/** Colorblind-safe shape that accompanies every block color. */
export type BlockSymbol = 'heart' | 'circle' | 'star' | 'diamond' | 'triangle' | 'square';

export interface BlockColorSpec {
  /** Stable id (index into `Palette.blocks`); matches the core color index. */
  readonly id: number;
  /** Debug / i18n key, e.g. `red`. */
  readonly name: string;
  readonly symbol: BlockSymbol;
  /** Saturated neon hue: rim + glow. */
  readonly base: number;
  /** Pale tint of the hue: highlights and the symbol. */
  readonly light: number;
  /** Deep shade: lower body / gradient end. */
  readonly dark: number;
}

export interface Palette {
  readonly name: 'neon' | 'high-contrast';
  readonly background: {
    /** Top of the vertical backdrop gradient. */
    readonly top: number;
    /** Horizon band color. */
    readonly horizon: number;
    /** Bottom of the backdrop gradient. */
    readonly bottom: number;
    readonly grid: number;
    /** Grid color while intensity → 1 (danger / big chain). */
    readonly gridHot: number;
    readonly star: number;
    /** Board well / panel fill. */
    readonly panel: number;
  };
  /** Six block colors; the first five are used in normal difficulty. */
  readonly blocks: readonly BlockColorSpec[];
  readonly garbage: { readonly base: number; readonly light: number; readonly dark: number };
  readonly bomb: { readonly base: number; readonly light: number; readonly dark: number };
  readonly ui: {
    readonly accent: number;
    readonly accent2: number;
    readonly text: number;
    readonly textDim: number;
    readonly danger: number;
    readonly success: number;
    readonly gold: number;
  };
}

const WHITE = 0xffffff;
const NIGHT = 0x05040d;

function block(id: number, name: string, symbol: BlockSymbol, base: number): BlockColorSpec {
  return {
    id,
    name,
    symbol,
    base,
    light: mixColor(base, WHITE, 0.62),
    dark: mixColor(scaleColor(base, 0.42), NIGHT, 0.25),
  };
}

/**
 * Default neon palette. Hues were tuned (see tests/unit/render/palette.test.ts) so that every pair
 * stays apart (CIEDE2000) for normal vision and simulated protan/deutan/tritanopia; the per-color
 * symbol carries the rest.
 */
export const NEON_PALETTE: Palette = {
  name: 'neon',
  background: {
    top: 0x04030b,
    horizon: 0x2a0b45,
    bottom: 0x0a0618,
    grid: 0x7a3cff,
    gridHot: 0xff2e7e,
    star: 0xcfd8ff,
    panel: 0x0b0a1c,
  },
  blocks: [
    block(0, 'red', 'heart', 0xff3b30),
    block(1, 'green', 'circle', 0x3dff7a),
    block(2, 'amber', 'star', 0xffae00),
    block(3, 'cyan', 'diamond', 0x1ec8ff),
    block(4, 'violet', 'triangle', 0x8050ff),
    block(5, 'magenta', 'square', 0xff4fbf),
  ],
  garbage: { base: 0x8a86b8, light: 0xd6d3f5, dark: 0x24223d },
  bomb: { base: 0xff5a1f, light: 0xffd2a8, dark: 0x1a0a08 },
  ui: {
    accent: 0x1ec8ff,
    accent2: 0xff4fbf,
    text: 0xeeeaff,
    textDim: 0x9a94c4,
    danger: 0xff3b30,
    success: 0x3dff7a,
    gold: 0xffd23f,
  },
};

/**
 * High-contrast alternative: black backdrop, hues spread across lightness (Okabe–Ito inspired)
 * so they separate even in grayscale.
 */
export const HIGH_CONTRAST_PALETTE: Palette = {
  name: 'high-contrast',
  background: {
    top: 0x000000,
    horizon: 0x101018,
    bottom: 0x000000,
    grid: 0x5a5a78,
    gridHot: 0xff4040,
    star: 0xffffff,
    panel: 0x000000,
  },
  blocks: [
    block(0, 'red', 'heart', 0xff2626),
    block(1, 'green', 'circle', 0x00c76b),
    block(2, 'amber', 'star', 0xffdc26),
    block(3, 'cyan', 'diamond', 0x7ee9ff),
    block(4, 'violet', 'triangle', 0x3c55ff),
    block(5, 'magenta', 'square', 0xfe69ff),
  ],
  garbage: { base: 0xb0b0b0, light: 0xffffff, dark: 0x303030 },
  bomb: { base: 0xff6a00, light: 0xffe0c0, dark: 0x000000 },
  ui: {
    accent: 0xffdc26,
    accent2: 0x7ee9ff,
    text: 0xffffff,
    textDim: 0xc8c8c8,
    danger: 0xff2626,
    success: 0x00c76b,
    gold: 0xffdc26,
  },
};

export const PALETTES = { neon: NEON_PALETTE, 'high-contrast': HIGH_CONTRAST_PALETTE } as const;

export function getBlockColor(palette: Palette, id: number): BlockColorSpec {
  const spec = palette.blocks[id];
  if (!spec) throw new RangeError(`No block color ${id} in palette ${palette.name}`);
  return spec;
}

/** Colors for the dimmed (preview row) variant of a hue. */
export function dimmedColor(hex: number): number {
  return scaleColor(desaturate(hex, 0.45), 0.5);
}
