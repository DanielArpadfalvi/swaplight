import { BlurFilter, Container, FillGradient, Graphics, Rectangle } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';
import { deferDestroy } from './blockTextures';
import { mixColor, scaleColor } from './colorMath';
import { NEON_PALETTE, type Palette } from './palette';

/** `flash` = white-hot frame of the conversion blink. */
export type SlabState = 'normal' | 'flash';

export interface SlabTextureSet {
  /** Exactly `width·cell × height·cell` logical px. */
  readonly body: Texture;
  /** Soft halo, `glowPadding` larger on every side. */
  readonly glow: Texture;
  readonly glowPadding: number;
}

const WHITE = 0xffffff;

function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function slabGlowPadding(cell: number): number {
  return Math.ceil(cell * 0.34);
}

/**
 * Multi-cell garbage slab textures: one rounded armoured panel spanning the whole slab (neon rim,
 * hazard stripes, row seams, rivets and a glowing "face" plate), baked once per
 * width × height × cell size × state with `renderer.generateTexture`.
 */
export class GarbageSlabTextures {
  private readonly cache = new Map<string, SlabTextureSet>();
  private disposables: { destroy(): void }[] = [];
  /** Numeric-key cache for one cell size / resolution / palette (see `get`). */
  private readonly fast = new Map<number, SlabTextureSet>();
  private fastCell = -1;
  private fastResolution = -1;
  /** Previous generation, destroyed on the next `clear()` (see `BlockTextureFactory.clear`). */
  private retired: { destroy(): void }[] = [];
  private palette: Palette;

  constructor(
    private readonly renderer: Renderer,
    palette: Palette = NEON_PALETTE,
  ) {
    this.palette = palette;
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  setPalette(palette: Palette): void {
    if (palette === this.palette) return;
    this.palette = palette;
    this.clear();
  }

  get(width: number, height: number, cell: number, state: SlabState = 'normal'): SlabTextureSet {
    // Allocation-free fast path for the current cell size / resolution (every slab, every frame).
    if (cell !== this.fastCell || this.renderer.resolution !== this.fastResolution) {
      this.fast.clear();
      this.fastCell = cell;
      this.fastResolution = this.renderer.resolution;
    }
    const fastKey = (width * 64 + height) * 2 + (state === 'flash' ? 1 : 0);
    const hit = this.fast.get(fastKey);
    if (hit) return hit;
    const set = this.lookup(width, height, cell, state);
    this.fast.set(fastKey, set);
    return set;
  }

  private lookup(width: number, height: number, cell: number, state: SlabState): SlabTextureSet {
    const key = `${this.palette.name}/${width}x${height}@${cell}/${state}/${this.renderer.resolution}`;
    let set = this.cache.get(key);
    if (!set) {
      set = this.build(width, height, cell, state);
      this.cache.set(key, set);
    }
    return set;
  }

  /** Drop the cache; the textures live one more generation (until the next `clear`). */
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
    this.fast.clear();
    this.disposables = [];
    this.retired = doomed;
  }

  private linear(stops: readonly (readonly [number, number, number?])[]): FillGradient {
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
    this.disposables.push(grad);
    return grad;
  }

  private build(w: number, h: number, cell: number, state: SlabState): SlabTextureSet {
    const W = w * cell;
    const H = h * cell;
    const flash = state === 'flash';
    const { base, light, dark } = this.palette.garbage;
    const eye = this.palette.ui.accent2;
    const inset = Math.max(1, Math.round(cell * 0.03));
    const radius = cell * 0.24;
    const rimW = Math.max(2, cell * 0.075);

    const root = new Container();
    const g = new Graphics();
    root.addChild(g);
    const x0 = inset;
    const y0 = inset;
    const ww = W - 2 * inset;
    const hh = H - 2 * inset;

    // Rim: lit from the top.
    const rimTop = flash ? WHITE : mixColor(light, WHITE, 0.45);
    const rimMid = flash ? mixColor(light, WHITE, 0.7) : base;
    const rimLow = flash ? mixColor(base, WHITE, 0.5) : scaleColor(base, 0.6);
    g.roundRect(x0, y0, ww, hh, radius).fill(
      this.linear([
        [0, rimTop],
        [Math.min(0.4, 0.3 / h), rimMid],
        [1, rimLow],
      ]),
    );
    // Recessed armoured face.
    const fx = x0 + rimW;
    const fy = y0 + rimW;
    const fw = ww - 2 * rimW;
    const fh = hh - 2 * rimW;
    const fr = Math.max(1, radius - rimW * 0.8);
    const faceTop = flash ? mixColor(light, WHITE, 0.55) : mixColor(base, dark, 0.38);
    const faceBottom = flash ? mixColor(base, WHITE, 0.3) : mixColor(base, dark, 0.86);
    g.roundRect(fx, fy, fw, fh, fr).fill(
      this.linear([
        [0, faceTop],
        [1, faceBottom],
      ]),
    );

    // Hazard stripes (masked to the face).
    const stripes = new Graphics();
    const step = cell * 0.55;
    const stripeAlpha = flash ? 0.25 : 0.1;
    for (let x = -H; x < W + H; x += step) {
      stripes
        .poly([x, H, x + step * 0.45, H, x + step * 0.45 + H, 0, x + H, 0])
        .fill({ color: flash ? WHITE : light, alpha: stripeAlpha });
    }
    const mask = new Graphics().roundRect(fx, fy, fw, fh, fr).fill(WHITE);
    stripes.mask = mask;
    root.addChild(stripes, mask);

    const deco = new Graphics();
    root.addChild(deco);
    // Row seams: tall slabs read as stacked plates.
    for (let r = 1; r < h; r++) {
      const y = r * cell;
      deco
        .moveTo(fx + 2, y)
        .lineTo(fx + fw - 2, y)
        .stroke({ width: Math.max(1, cell * 0.04), color: 0x000000, alpha: 0.4 });
      deco
        .moveTo(fx + 2, y + Math.max(1, cell * 0.04))
        .lineTo(fx + fw - 2, y + Math.max(1, cell * 0.04))
        .stroke({ width: 1, color: WHITE, alpha: flash ? 0.3 : 0.08 });
    }
    // Inner bevel + top sheen.
    deco
      .roundRect(fx, fy, fw, fh, fr)
      .stroke({ width: Math.max(1, cell * 0.025), color: 0x000000, alpha: 0.45, alignment: 1 });
    deco
      .roundRect(
        fx + rimW * 0.6,
        fy + rimW * 0.4,
        fw - rimW * 1.2,
        Math.min(fh, cell) * 0.38,
        fr * 0.8,
      )
      .fill(
        this.linear([
          [0, WHITE, flash ? 0.4 : 0.2],
          [1, WHITE, 0],
        ]),
      );
    // Specular glint along the top-left of the rim.
    deco
      .roundRect(
        x0 + radius * 0.6,
        y0 + cell * 0.03,
        Math.min(ww * 0.3, cell * 1.2),
        Math.max(1, cell * 0.03),
        cell * 0.015,
      )
      .fill({ color: WHITE, alpha: 0.5 });

    // Rivets: corners, plus the middle of long edges.
    const rr = Math.max(1, cell * 0.045);
    const ri = cell * 0.2;
    const rivets: [number, number][] = [
      [ri, ri],
      [W - ri, ri],
      [ri, H - ri],
      [W - ri, H - ri],
    ];
    if (w >= 4) rivets.push([W / 2, ri], [W / 2, H - ri]);
    if (h >= 3) rivets.push([ri, H / 2], [W - ri, H / 2]);
    for (const [x, y] of rivets) {
      deco.circle(x, y + rr * 0.45, rr).fill({ color: 0x000000, alpha: 0.45 });
      deco
        .circle(x, y, rr)
        .fill({ color: flash ? WHITE : mixColor(light, WHITE, 0.3), alpha: 0.9 });
      deco.circle(x - rr * 0.3, y - rr * 0.3, rr * 0.35).fill({ color: WHITE, alpha: 0.7 });
    }

    // Face plate with two angry neon eye slits (the slab "glares" at you).
    const plateH = Math.min(cell * 0.56, fh * 0.7);
    const plateW = Math.min(fw * 0.62, plateH * 2.3);
    const pcx = W / 2;
    const pcy = H / 2 + (h === 1 ? cell * 0.02 : 0);
    deco
      .roundRect(pcx - plateW / 2, pcy - plateH / 2 + cell * 0.02, plateW, plateH, plateH * 0.35)
      .fill({ color: 0x000000, alpha: 0.35 });
    deco
      .roundRect(pcx - plateW / 2, pcy - plateH / 2, plateW, plateH, plateH * 0.35)
      .fill({
        color: flash ? mixColor(light, WHITE, 0.4) : mixColor(dark, 0x000000, 0.35),
        alpha: 0.95,
      })
      .stroke({ width: Math.max(1, cell * 0.03), color: flash ? WHITE : light, alpha: 0.55 });
    const eyes = new Graphics();
    const halo = new Graphics();
    const ew = plateW * 0.26;
    const eh = Math.max(1.5, plateH * 0.2);
    for (const side of [-1, 1]) {
      const cx = pcx + side * plateW * 0.2;
      // Slanted towards the middle: "\ /".
      const tilt = side * eh * 0.9;
      const pts = [
        cx - ew / 2,
        pcy - eh / 2 - tilt,
        cx + ew / 2,
        pcy - eh / 2 + tilt,
        cx + ew / 2,
        pcy + eh / 2 + tilt,
        cx - ew / 2,
        pcy + eh / 2 - tilt,
      ];
      halo.poly(pts).fill({ color: flash ? WHITE : eye, alpha: 0.9 });
      eyes.poly(pts).fill(flash ? WHITE : mixColor(eye, WHITE, 0.45));
    }
    const blur = new BlurFilter({ strength: Math.max(2, cell * 0.08), quality: 3 });
    blur.resolution = 'inherit';
    halo.filters = [blur];
    root.addChild(halo, eyes);

    const body = this.bake(root, new Rectangle(0, 0, W, H));

    // Halo.
    const pad = slabGlowPadding(cell);
    const glowRoot = new Container();
    const gg = new Graphics();
    gg.roundRect(0, 0, W, H, radius).fill({
      color: flash ? mixColor(base, WHITE, 0.6) : base,
      alpha: flash ? 0.8 : 0.32,
    });
    const gblur = new BlurFilter({ strength: pad * 0.3, quality: 5 });
    gblur.padding = pad;
    gg.filters = [gblur];
    glowRoot.addChild(gg);
    const glow = this.bake(glowRoot, new Rectangle(-pad, -pad, W + 2 * pad, H + 2 * pad));
    return { body, glow, glowPadding: pad };
  }

  private bake(root: Container, frame: Rectangle): Texture {
    const texture = this.renderer.generateTexture({
      target: root,
      frame,
      resolution: this.renderer.resolution,
      antialias: true,
    });
    root.destroy({ children: true });
    return texture;
  }
}
