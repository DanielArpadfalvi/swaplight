import { BlurFilter, Container, FillGradient, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';
import { dimmedColor } from './palette';
import { desaturate, mixColor, scaleColor } from './colorMath';
import { NEON_PALETTE } from './palette';
import type { BlockSymbol, Palette } from './palette';

/**
 * What sits in a cell. `color` blocks need a `color` index into `Palette.blocks`. `mystery` is a
 * color block whose color is hidden (The Veil boss curse): a neutral tile with a "?".
 */
export type BlockKind = 'color' | 'garbage' | 'wild' | 'bomb' | 'mystery';

/**
 * Visual state of a tile:
 * - `normal`: in play.
 * - `dimmed`: preview row that is still rising in (not yet active).
 * - `flash`: white-hot frame of the clear "flashing" phase (alternate with `normal`).
 */
export type BlockState = 'normal' | 'dimmed' | 'flash';

export interface BlockTextureRequest {
  kind: BlockKind;
  /** Block color index (required for `kind: 'color'`, ignored otherwise). */
  color?: number;
  state?: BlockState;
  /** Tile edge length in logical (CSS) pixels. */
  size: number;
}

export interface BlockTextureSet {
  /** Exactly `size × size` logical px: the tile itself. */
  readonly body: Texture;
  /**
   * `(size + 2·glowPadding)²` soft halo. Draw it centered under the body, ideally with all glows in
   * one layer below all bodies and `blendMode = 'add'` so neighbouring halos never tint tiles.
   */
  readonly glow: Texture;
  readonly glowPadding: number;
  readonly size: number;
}

export interface BlockTextureFactoryOptions {
  palette?: Palette;
  /** Texture resolution; defaults to the renderer's (i.e. device pixel ratio). */
  resolution?: number;
}

/** Halo margin around a tile of the given size. */
export function blockGlowPadding(size: number): number {
  return Math.ceil(size * 0.42);
}

const KIND_INDEX: Readonly<Record<BlockKind, number>> = {
  color: 0,
  garbage: 1,
  wild: 2,
  bomb: 3,
  mystery: 4,
};
const STATE_INDEX: Readonly<Record<BlockState, number>> = { normal: 0, dimmed: 1, flash: 2 };
/** Colors per kind slot in the numeric fast cache (larger indices fall back to `get`). */
const FAST_COLORS = 16;

export function blockTextureKey(req: BlockTextureRequest, resolution: number): string {
  const color = req.kind === 'color' ? (req.color ?? 0) : '-';
  return `${req.kind}:${color}:${req.state ?? 'normal'}:${req.size}:${resolution}`;
}

const WHITE = 0xffffff;

interface TileColors {
  rim: number;
  rimHighlight: number;
  faceTop: number;
  faceBottom: number;
  symbol: number;
  symbolGlow: number;
  symbolGlowAlpha: number;
  glow: number;
  glowAlpha: number;
}

/**
 * Generates and caches block tile textures at runtime (no bitmap assets). Each distinct
 * kind × color × state × size × resolution is rendered once with `renderer.generateTexture`, so the
 * blur used for glows is baked in and the board can draw thousands of tiles as plain sprites.
 */
export class BlockTextureFactory {
  private readonly cache = new Map<string, BlockTextureSet>();
  /**
   * Allocation-free per-frame lookup (`tile`): array indexed by kind × state × color for one size,
   * palette and resolution; reset whenever any of those change.
   */
  private fast: (BlockTextureSet | undefined)[] = [];
  private fastSize = -1;
  /**
   * The previous generation of textures (`clear`): kept alive until the next `clear` so sprites
   * still bound to them are re-textured before anything is destroyed.
   */
  private retired: { destroy(): void }[] = [];
  /**
   * Gradients used while baking. They stay alive until `clear()`: destroying them right after
   * `generateTexture` trips Pixi's "destroyed while still bound" warning.
   */
  private disposables: { destroy(): void }[] = [];
  private palette: Palette;
  private resolution: number;

  constructor(
    private readonly renderer: Renderer,
    options: BlockTextureFactoryOptions = {},
  ) {
    this.palette = options.palette ?? NEON_PALETTE;
    this.resolution = options.resolution ?? renderer.resolution;
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  get currentPalette(): Palette {
    return this.palette;
  }

  /**
   * Switch palette (e.g. the high-contrast setting). Textures are cached per palette, so switching
   * back and forth is free; call `clear()` to release them.
   */
  setPalette(palette: Palette): void {
    if (palette !== this.palette) this.fast = [];
    this.palette = palette;
  }

  setResolution(resolution: number): void {
    if (resolution === this.resolution) return;
    this.resolution = resolution;
    this.clear();
  }

  /**
   * Same as `get({kind, color, state, size})` without building a request object or a key string
   * (hot path: every tile, every frame).
   */
  tile(kind: BlockKind, color: number, state: BlockState, size: number): BlockTextureSet {
    if (size !== this.fastSize) {
      this.fast = [];
      this.fastSize = size;
    }
    const c = kind === 'color' ? color : 0;
    if (c < 0 || c >= FAST_COLORS) return this.get({ kind, color, state, size });
    const i = (KIND_INDEX[kind] * 3 + STATE_INDEX[state]) * FAST_COLORS + c;
    let set = this.fast[i];
    if (!set) {
      set = this.get({ kind, color, state, size });
      this.fast[i] = set;
    }
    return set;
  }

  get(req: BlockTextureRequest): BlockTextureSet {
    const key = `${this.palette.name}/${blockTextureKey(req, this.resolution)}`;
    let set = this.cache.get(key);
    if (!set) {
      set = this.build(req);
      this.cache.set(key, set);
    }
    return set;
  }

  getColor(color: number, size: number, state: BlockState = 'normal'): BlockTextureSet {
    return this.get({ kind: 'color', color, size, state });
  }

  /** Render every variant for the given sizes up front (avoids a hitch on first use). */
  warmup(sizes: readonly number[], colorCount = this.palette.blocks.length): void {
    const states: BlockState[] = ['normal', 'dimmed', 'flash'];
    for (const size of sizes) {
      for (const state of states) {
        for (let c = 0; c < colorCount; c++) this.get({ kind: 'color', color: c, size, state });
        this.get({ kind: 'garbage', size, state });
        this.get({ kind: 'wild', size, state });
        this.get({ kind: 'bomb', size, state });
      }
    }
  }

  /**
   * Drop every cached texture. They are not destroyed yet: this generation is kept alive until the
   * next `clear()` (one generation), because sprites – including hidden, pooled ones – may still be
   * bound to them; destroying a texture source that is still bound makes Pixi warn ("destroyed
   * while still bound"). Callers should re-texture their sprites right away.
   */
  clear(): void {
    deferDestroy(this.retired);
    const doomed: { destroy(): void }[] = [...this.disposables];
    for (const set of this.cache.values()) {
      doomed.push(
        { destroy: () => set.body.destroy(true) },
        { destroy: () => set.glow.destroy(true) },
      );
    }
    this.cache.clear();
    this.fast = [];
    this.disposables = [];
    this.retired = doomed;
  }

  destroy(): void {
    this.clear();
    deferDestroy(this.retired);
    this.retired = [];
  }

  // --- building -------------------------------------------------------------------------------

  private build(req: BlockTextureRequest): BlockTextureSet {
    const state = req.state ?? 'normal';
    const size = req.size;
    const colors = this.colorsFor(req.kind, req.color ?? 0, state);
    const pad = blockGlowPadding(size);

    const disposables: { destroy(): void }[] = [];
    const bodyRoot = new Container();
    this.drawTile(bodyRoot, req.kind, req.color ?? 0, state, size, colors, disposables);
    const body = this.bake(bodyRoot, new Rectangle(0, 0, size, size));

    const glowRoot = new Container();
    this.drawGlow(glowRoot, req.kind, size, pad, colors, disposables);
    const glow = this.bake(glowRoot, new Rectangle(-pad, -pad, size + 2 * pad, size + 2 * pad));

    this.disposables.push(...disposables);
    return { body, glow, glowPadding: pad, size };
  }

  private bake(root: Container, frame: Rectangle): Texture {
    const texture = this.renderer.generateTexture({
      target: root,
      frame,
      resolution: this.resolution,
      antialias: true,
    });
    root.destroy({ children: true });
    return texture;
  }

  private colorsFor(kind: BlockKind, color: number, state: BlockState): TileColors {
    const p = this.palette;
    let base: number;
    let light: number;
    let dark: number;
    switch (kind) {
      case 'color': {
        const spec = p.blocks[color] ?? p.blocks[0];
        if (!spec) throw new RangeError('Palette has no block colors');
        ({ base, light, dark } = spec);
        break;
      }
      case 'garbage':
        ({ base, light, dark } = p.garbage);
        break;
      case 'bomb':
        ({ base, light, dark } = p.bomb);
        break;
      case 'wild':
        base = WHITE;
        light = WHITE;
        dark = 0x2a1f4a;
        break;
      case 'mystery':
        base = 0x8c86b4;
        light = 0xe2ddff;
        dark = 0x17132c;
        break;
    }
    const tile: TileColors = {
      rim: base,
      rimHighlight: mixColor(light, WHITE, 0.55),
      faceTop: mixColor(base, dark, 0.22),
      faceBottom: mixColor(base, dark, 0.82),
      symbol: mixColor(light, WHITE, 0.35),
      symbolGlow: mixColor(base, WHITE, 0.35),
      symbolGlowAlpha: 0.7,
      glow: base,
      glowAlpha: kind === 'garbage' ? 0.28 : kind === 'mystery' ? 0.32 : 0.62,
    };
    if (state === 'dimmed') {
      const dim = (c: number): number => dimmedColor(c);
      tile.rim = dim(base);
      tile.rimHighlight = dim(light);
      tile.faceTop = scaleColor(desaturate(tile.faceTop, 0.45), 0.55);
      tile.faceBottom = scaleColor(desaturate(dark, 0.45), 0.55);
      tile.symbol = dim(light);
      tile.symbolGlow = dim(base);
      tile.symbolGlowAlpha = 0.25;
      tile.glowAlpha = 0.12;
    } else if (state === 'flash') {
      tile.rim = WHITE;
      tile.rimHighlight = WHITE;
      tile.faceTop = mixColor(light, WHITE, 0.75);
      tile.faceBottom = mixColor(base, WHITE, 0.35);
      tile.symbol = kind === 'wild' ? base : mixColor(base, 0x000000, 0.25);
      tile.symbolGlow = WHITE;
      tile.symbolGlowAlpha = 0.6;
      tile.glow = mixColor(base, WHITE, 0.55);
      tile.glowAlpha = 0.95;
    }
    return tile;
  }

  private drawTile(
    root: Container,
    kind: BlockKind,
    color: number,
    state: BlockState,
    s: number,
    c: TileColors,
    disposables: { destroy(): void }[],
  ): void {
    const radius = s * 0.2;
    const rimW = Math.max(1.5, s * 0.062);
    const inner = s - 2 * rimW;
    const innerR = Math.max(1, radius - rimW * 0.8);

    const g = new Graphics();
    root.addChild(g);

    // 1) Neon rim: bright gradient rounded square (lit from the top).
    const rimGrad = linear(
      [
        [0, c.rimHighlight],
        [0.35, c.rim],
        [1, scaleColor(c.rim, state === 'flash' ? 1 : 0.72)],
      ],
      disposables,
    );
    g.roundRect(0, 0, s, s, radius).fill(rimGrad);

    // 2) Recessed face.
    if (kind === 'wild' && state !== 'dimmed') {
      const stops = this.palette.blocks.map(
        (b, i, all) =>
          [
            i / (all.length - 1),
            state === 'flash' ? mixColor(b.base, WHITE, 0.6) : b.base,
          ] as const,
      );
      const rainbow = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        colorStops: stops.map(([offset, col]) => ({ offset, color: col })),
        textureSpace: 'local',
      });
      disposables.push(rainbow);
      g.roundRect(rimW, rimW, inner, inner, innerR).fill(rainbow);
      // Darken the lower half so the white sparkle keeps contrast.
      const shade = linear(
        [
          [0, 0x000000, 0],
          [1, 0x000000, state === 'flash' ? 0.1 : 0.45],
        ],
        disposables,
      );
      g.roundRect(rimW, rimW, inner, inner, innerR).fill(shade);
    } else {
      const face = linear(
        [
          [0, c.faceTop],
          [1, c.faceBottom],
        ],
        disposables,
      );
      g.roundRect(rimW, rimW, inner, inner, innerR).fill(face);
    }

    // 3) Garbage: diagonal hazard stripes inside the face (masked).
    if (kind === 'garbage') {
      const stripes = new Graphics();
      const step = s / 4;
      for (let x = -s; x < s * 2; x += step) {
        stripes
          .poly([x, s, x + step * 0.5, s, x + step * 0.5 + s, 0, x + s, 0])
          .fill({ color: c.rimHighlight, alpha: state === 'dimmed' ? 0.06 : 0.12 });
      }
      const mask = new Graphics().roundRect(rimW, rimW, inner, inner, innerR).fill(WHITE);
      stripes.mask = mask;
      root.addChild(stripes, mask);
    }

    // 4) Inner bevel: thin dark line inside the rim + soft top sheen.
    const deco = new Graphics();
    root.addChild(deco);
    deco
      .roundRect(rimW, rimW, inner, inner, innerR)
      .stroke({ width: Math.max(1, s * 0.022), color: 0x000000, alpha: 0.35, alignment: 1 });
    const sheen = linear(
      [
        [0, WHITE, state === 'flash' ? 0.35 : 0.22],
        [1, WHITE, 0],
      ],
      disposables,
    );
    deco
      .roundRect(rimW * 1.6, rimW * 1.4, inner - rimW * 1.2, inner * 0.42, innerR * 0.8)
      .fill(sheen);
    // Specular glint in the top-left corner of the rim.
    deco
      .roundRect(radius * 0.55, s * 0.035, s * 0.3, Math.max(1, s * 0.03), s * 0.015)
      .fill({ color: WHITE, alpha: state === 'dimmed' ? 0.1 : 0.45 });

    // 5) Symbol with baked neon glow.
    const cx = s / 2;
    const cy = s / 2;
    const r = s * 0.25;
    const symbolKind = kind === 'color' ? this.symbolFor(color) : kind;
    if (kind === 'garbage') {
      drawGarbageMark(deco, s, c, state);
      return;
    }

    const halo = new Graphics();
    drawSymbol(halo, symbolKind, cx, cy, r * 1.08);
    halo.fill({ color: c.symbolGlow, alpha: c.symbolGlowAlpha });
    const blur = new BlurFilter({ strength: Math.max(2, s * 0.07), quality: 4 });
    blur.resolution = 'inherit';
    halo.filters = [blur];
    root.addChild(halo);

    const sym = new Graphics();
    root.addChild(sym);
    // Drop shadow for depth, then the bright glyph.
    drawSymbol(sym, symbolKind, cx, cy + s * 0.025, r);
    sym.fill({ color: 0x000000, alpha: state === 'dimmed' ? 0.2 : 0.35 });
    drawSymbol(sym, symbolKind, cx, cy, r);
    if (state === 'normal' && symbolKind !== 'bomb') {
      // Glyph lit from above: white-hot top fading into the pale hue.
      sym.fill(
        linear(
          [
            [0, mixColor(c.symbol, WHITE, 0.75)],
            [1, mixColor(c.symbol, c.rim, 0.12)],
          ],
          disposables,
        ),
      );
    } else {
      sym.fill(c.symbol);
    }
    if (symbolKind === 'bomb') drawBombDetail(sym, cx, cy, r, c, state, this.palette);
  }

  private drawGlow(
    root: Container,
    kind: BlockKind,
    s: number,
    pad: number,
    c: TileColors,
    disposables: { destroy(): void }[],
  ): void {
    const g = new Graphics();
    if (kind === 'wild') {
      const stops = this.palette.blocks.map((b, i, all) => ({
        offset: i / (all.length - 1),
        color: b.base,
      }));
      const rainbow = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        colorStops: stops,
        textureSpace: 'local',
      });
      disposables.push(rainbow);
      g.roundRect(-s * 0.02, -s * 0.02, s * 1.04, s * 1.04, s * 0.22).fill({
        fill: rainbow,
        alpha: c.glowAlpha,
      });
    } else {
      g.roundRect(-s * 0.02, -s * 0.02, s * 1.04, s * 1.04, s * 0.22).fill({
        color: c.glow,
        alpha: c.glowAlpha,
      });
    }
    const blur = new BlurFilter({ strength: pad * 0.32, quality: 6 });
    blur.padding = pad;
    g.filters = [blur];
    root.addChild(g);
  }

  private symbolFor(color: number): BlockSymbol {
    return this.palette.blocks[color]?.symbol ?? 'circle';
  }
}

/** Destroy GPU resources a few frames later, once no bind group references them any more. */
export function deferDestroy(items: readonly { destroy(): void }[], delayMs = 250): void {
  if (items.length === 0) return;
  setTimeout(() => {
    for (const item of items) item.destroy();
  }, delayMs);
}

type Stop = readonly [offset: number, color: number, alpha?: number];

function linear(stops: readonly Stop[], disposables: { destroy(): void }[]): FillGradient {
  const grad = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: stops.map(([offset, color, alpha]) => ({
      offset,
      color: alpha === undefined ? color : rgba(color, alpha),
    })),
    textureSpace: 'local',
  });
  disposables.push(grad);
  return grad;
}

function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

type GlyphKind = BlockSymbol | 'wild' | 'bomb' | 'garbage' | 'mystery';

/**
 * Append the path of a block symbol centered at (cx, cy) with nominal radius r. The caller fills
 * it. Shapes are optically balanced so they read as the same size at a glance.
 */
export function drawSymbol(g: Graphics, kind: GlyphKind, cx: number, cy: number, r: number): void {
  switch (kind) {
    case 'circle':
      g.circle(cx, cy, r * 0.9);
      break;
    case 'diamond':
      g.poly([cx, cy - r * 1.12, cx + r * 0.88, cy, cx, cy + r * 1.12, cx - r * 0.88, cy]);
      break;
    case 'triangle': {
      const R = r * 1.14;
      const oy = cy + r * 0.16;
      const pts: number[] = [];
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        pts.push(cx + Math.cos(a) * R, oy + Math.sin(a) * R);
      }
      g.poly(pts);
      break;
    }
    case 'square':
      g.roundRect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6, r * 0.22);
      break;
    case 'star':
      g.star(cx, cy + r * 0.06, 5, r * 1.14, r * 0.5);
      break;
    case 'heart': {
      const y = cy + r * 0.05;
      g.moveTo(cx, y + r * 0.92)
        .bezierCurveTo(
          cx - r * 0.35,
          y + r * 0.6,
          cx - r * 1.08,
          y + r * 0.12,
          cx - r * 1.0,
          y - r * 0.38,
        )
        .bezierCurveTo(cx - r * 0.92, y - r * 0.98, cx - r * 0.18, y - r * 1.06, cx, y - r * 0.5)
        .bezierCurveTo(
          cx + r * 0.18,
          y - r * 1.06,
          cx + r * 0.92,
          y - r * 0.98,
          cx + r * 1.0,
          y - r * 0.38,
        )
        .bezierCurveTo(cx + r * 1.08, y + r * 0.12, cx + r * 0.35, y + r * 0.6, cx, y + r * 0.92)
        .closePath();
      break;
    }
    case 'wild':
      // Four-point sparkle.
      g.star(cx, cy, 4, r * 1.2, r * 0.36);
      break;
    case 'bomb':
      g.circle(cx - r * 0.08, cy + r * 0.12, r * 0.86);
      break;
    case 'garbage':
      g.roundRect(cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4, r * 0.3);
      break;
    case 'mystery': {
      // A bold "?": a ring segment (hook), a short stem and a dot.
      const hy = cy - r * 0.38;
      const R = r * 0.62;
      const w = r * 0.36;
      const a0 = (155 * Math.PI) / 180;
      const a1 = (445 * Math.PI) / 180;
      const steps = 18;
      const pts: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        pts.push(cx + Math.cos(a) * (R + w / 2), hy + Math.sin(a) * (R + w / 2));
      }
      for (let i = steps; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / steps;
        pts.push(cx + Math.cos(a) * (R - w / 2), hy + Math.sin(a) * (R - w / 2));
      }
      g.poly(pts);
      g.roundRect(cx - w / 2, hy + R - w * 0.6, w, r * 0.62, w * 0.3);
      g.circle(cx, cy + r * 0.95, w * 0.62);
      break;
    }
  }
}

function drawBombDetail(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  c: TileColors,
  state: BlockState,
  palette: Palette,
): void {
  const bx = cx - r * 0.08;
  const by = cy + r * 0.12;
  // Dark shell inside the bright outline.
  g.circle(bx, by, r * 0.68).fill(state === 'flash' ? mixColor(c.rim, 0, 0.2) : 0x14080a);
  g.circle(bx - r * 0.25, by - r * 0.25, r * 0.18).fill({ color: WHITE, alpha: 0.75 });
  // Cap + fuse.
  g.roundRect(bx + r * 0.38, by - r * 0.86, r * 0.42, r * 0.34, r * 0.08)
    .fill(c.symbol)
    .moveTo(bx + r * 0.6, by - r * 0.86)
    .bezierCurveTo(
      bx + r * 0.7,
      by - r * 1.25,
      bx + r * 1.0,
      by - r * 1.05,
      bx + r * 1.02,
      by - r * 1.25,
    )
    .stroke({ width: r * 0.14, color: c.symbol, cap: 'round' });
  // Spark.
  const spark = state === 'dimmed' ? c.symbol : palette.ui.gold;
  g.star(bx + r * 1.04, by - r * 1.28, 4, r * 0.34, r * 0.1).fill(spark);
}

function drawGarbageMark(g: Graphics, s: number, c: TileColors, state: BlockState): void {
  // Four rivets + a centered slot: reads as "inert metal" rather than a playable color.
  const alpha = state === 'dimmed' ? 0.4 : 0.9;
  const inset = s * 0.2;
  const rr = Math.max(1, s * 0.04);
  for (const [x, y] of [
    [inset, inset],
    [s - inset, inset],
    [inset, s - inset],
    [s - inset, s - inset],
  ] as const) {
    g.circle(x, y + rr * 0.4, rr).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(x, y, rr).fill({ color: c.rimHighlight, alpha });
  }
  const w = s * 0.34;
  const h = Math.max(2, s * 0.08);
  g.roundRect(s / 2 - w / 2, s / 2 - h / 2 + s * 0.02, w, h, h / 2).fill({
    color: 0x000000,
    alpha: 0.4,
  });
  g.roundRect(s / 2 - w / 2, s / 2 - h / 2, w, h, h / 2).fill({
    color: c.rimHighlight,
    alpha: alpha * 0.8,
  });
}

/**
 * Convenience: a self-contained tile (halo + body) centered on its position. Fine for menus and the
 * gallery; the board should batch halos into their own layer instead.
 */
export function createBlockSprite(set: BlockTextureSet): Container {
  const root = new Container();
  const glow = new Sprite(set.glow);
  glow.anchor.set(0.5);
  glow.blendMode = 'add';
  const body = new Sprite(set.body);
  body.anchor.set(0.5);
  root.addChild(glow, body);
  return root;
}
