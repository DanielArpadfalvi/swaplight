import { Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import { deferDestroy } from './blockTextures';
import { mixColor } from './colorMath';
import { NEON_PALETTE } from './palette';
import type { Palette } from './palette';
import { mulberry32 } from './prng';
import { softDotTexture, vignetteTexture } from './softTextures';

export interface NeonBackgroundOptions {
  width: number;
  height: number;
  palette?: Palette;
  /** Seed for star placement (deterministic screenshots). */
  seed?: number;
  starCount?: number;
  /** Horizon height as a fraction of the screen height. */
  horizon?: number;
}

interface Star {
  sprite: Sprite;
  x: number;
  y: number;
  speed: number;
  phase: number;
  baseAlpha: number;
}

const ROW_COUNT = 14;
const COLUMN_COUNT = 13;

/**
 * Animated synthwave backdrop: vertical gradient sky with horizon glow, a perspective grid that
 * scrolls toward the viewer and slowly drifting, twinkling stars.
 *
 * Cheap by construction: the sky/horizon/vertical grid lines are static Graphics rebuilt only on
 * `resize`; the moving parts (horizontal grid rows, stars, danger vignette) are sprites whose
 * position/alpha/tint are mutated in place — no per-frame allocation.
 */
export class NeonBackground extends Container {
  private palette: Palette;
  private w: number;
  private h: number;
  private readonly horizonFrac: number;
  private time = 0;
  private scroll = 0;
  private intensity = 0;
  private targetIntensity = 0;

  private readonly sky = new Graphics();
  private readonly gridVertical = new Graphics();
  private readonly gridFade = new Graphics();
  private readonly rows: Sprite[] = [];
  private readonly rowLayer = new Container();
  private readonly starLayer = new Container();
  private readonly stars: Star[] = [];
  private readonly vignette: Sprite;
  /** Gradients are resolution-independent (local space), so they are built once per palette. */
  private readonly gradients = new Map<
    Palette,
    { sky: FillGradient; glow: FillGradient; fade: FillGradient }
  >();

  constructor(options: NeonBackgroundOptions) {
    super();
    this.palette = options.palette ?? NEON_PALETTE;
    this.w = options.width;
    this.h = options.height;
    this.horizonFrac = options.horizon ?? 0.6;
    const rand = mulberry32(options.seed ?? 1);

    this.addChild(this.sky, this.starLayer, this.gridVertical, this.rowLayer, this.gridFade);

    for (let i = 0; i < ROW_COUNT; i++) {
      const row = new Sprite(Texture.WHITE);
      row.anchor.set(0, 0.5);
      this.rows.push(row);
      this.rowLayer.addChild(row);
    }

    const dot = softDotTexture();
    const count = options.starCount ?? 70;
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(dot);
      sprite.anchor.set(0.5);
      const big = rand() < 0.12;
      sprite.scale.set((big ? 0.12 : 0.05) + rand() * 0.05);
      sprite.blendMode = 'add';
      this.starLayer.addChild(sprite);
      this.stars.push({
        sprite,
        x: rand(),
        y: rand(),
        speed: 0.004 + rand() * 0.012,
        phase: rand() * Math.PI * 2,
        baseAlpha: big ? 0.9 : 0.35 + rand() * 0.45,
      });
    }

    this.vignette = new Sprite(vignetteTexture());
    this.vignette.alpha = 0;
    this.vignette.blendMode = 'add';
    this.addChild(this.vignette);

    this.layoutStatic();
    this.update(0);
  }

  /** Current (eased) intensity 0..1. */
  get currentIntensity(): number {
    return this.intensity;
  }

  /** 0 = calm; 1 = danger / huge chain. Eases toward the target over ~0.3 s. */
  setIntensity(value: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, value));
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.layoutStatic();
    this.update(0);
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.layoutStatic();
    this.update(0);
  }

  /** Advance the animation by `dt` seconds. */
  update(dt: number): void {
    this.time += dt;
    const ease = 1 - Math.exp(-dt * 6);
    this.intensity += (this.targetIntensity - this.intensity) * ease;
    const k = this.intensity;
    const bg = this.palette.background;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (3 + k * 5));

    // Grid: scroll speed and heat follow intensity.
    this.scroll = (this.scroll + dt * (0.35 + k * 1.4)) % 1;
    const gridColor = mixColor(bg.grid, bg.gridHot, Math.min(1, k * 1.2));
    this.gridVertical.tint = gridColor;
    this.gridVertical.alpha = 0.55 + k * 0.3 * pulse;

    const horizonY = this.h * this.horizonFrac;
    const depth = this.h - horizonY;
    for (let i = 0; i < ROW_COUNT; i++) {
      const row = this.rows[i];
      if (!row) continue;
      // z runs from far (≈ROW_COUNT) to near (≈0.4); perspective y = horizon + depth·near/z.
      const z = ROW_COUNT - i - this.scroll + 0.4;
      const p = 0.9 / z;
      const y = horizonY + depth * p * 1.15;
      row.visible = y <= this.h + 2;
      row.position.set(0, y);
      row.width = this.w;
      row.height = Math.max(1, 2.4 * Math.min(1, p * 1.6));
      row.tint = gridColor;
      const fade = Math.min(1, (y - horizonY) / (depth * 0.35));
      row.alpha = fade * (0.55 + 0.35 * k * pulse);
    }

    // Stars drift upward slowly and twinkle; they live above the horizon.
    for (const s of this.stars) {
      s.y -= s.speed * dt * (1 + k * 2);
      if (s.y < 0) s.y += 1;
      s.sprite.position.set(s.x * this.w, s.y * horizonY);
      const tw = 0.6 + 0.4 * Math.sin(this.time * 1.7 + s.phase);
      s.sprite.alpha = s.baseAlpha * tw * Math.min(1, (1 - s.y) * 3);
      s.sprite.tint = mixColor(bg.star, bg.gridHot, k * 0.5);
    }

    this.vignette.tint = bg.gridHot;
    this.vignette.alpha = k * (0.22 + 0.28 * pulse);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    super.destroy(options);
    deferDestroy([...this.gradients.values()].flatMap((g) => [g.sky, g.glow, g.fade]));
    this.gradients.clear();
  }

  private layoutStatic(): void {
    const { w, h } = this;
    const bg = this.palette.background;
    const horizonY = h * this.horizonFrac;

    const { sky: skyGrad, glow: glowGrad, fade } = this.gradientsFor(this.palette);

    this.sky.clear();
    this.sky.rect(0, 0, w, h).fill(skyGrad);
    // Horizon bloom + thin bright horizon line.
    this.sky.ellipse(w / 2, horizonY, w * 0.9, h * 0.16).fill(glowGrad);
    this.sky
      .rect(0, horizonY - 0.75, w, 1.5)
      .fill({ color: mixColor(bg.gridHot, 0xffffff, 0.35), alpha: 0.7 });

    // Vertical grid lines converge on a vanishing point at the horizon center (drawn white, tinted).
    const g = this.gridVertical;
    g.clear();
    const vx = w / 2;
    const spread = w * 2.4;
    for (let i = 0; i <= COLUMN_COUNT * 2; i++) {
      const t = i / (COLUMN_COUNT * 2) - 0.5;
      g.moveTo(vx + t * w * 0.18, horizonY).lineTo(vx + t * spread, h);
    }
    g.stroke({ width: 1.25, color: 0xffffff, alpha: 0.75 });
    // Fade the lines into the horizon with a gradient overlay of the sky color.
    this.gridFade.clear();
    this.gridFade.rect(0, horizonY + 0.75, w, (h - horizonY) * 0.3).fill(fade);

    this.vignette.width = w;
    this.vignette.height = h;
  }

  private gradientsFor(palette: Palette): {
    sky: FillGradient;
    glow: FillGradient;
    fade: FillGradient;
  } {
    const cached = this.gradients.get(palette);
    if (cached) return cached;
    const bg = palette.background;
    const skyGrad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: bg.top },
        { offset: this.horizonFrac * 0.55, color: mixColor(bg.top, bg.horizon, 0.35) },
        { offset: this.horizonFrac, color: bg.horizon },
        {
          offset: Math.min(1, this.horizonFrac + 0.02),
          color: mixColor(bg.horizon, bg.bottom, 0.6),
        },
        { offset: 1, color: bg.bottom },
      ],
      textureSpace: 'local',
    });
    const glowGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba(bg.gridHot, 0.42) },
        { offset: 0.45, color: rgba(bg.grid, 0.16) },
        { offset: 1, color: rgba(bg.grid, 0) },
      ],
      textureSpace: 'local',
    });
    const fade = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: rgba(bg.horizon, 1) },
        { offset: 1, color: rgba(bg.horizon, 0) },
      ],
      textureSpace: 'local',
    });
    const entry = { sky: skyGrad, glow: glowGrad, fade };
    this.gradients.set(palette, entry);
    return entry;
  }
}

function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},${alpha})`;
}
