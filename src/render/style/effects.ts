import { BitmapFontManager, BitmapText, Container, Sprite, Texture } from 'pixi.js';
import type { BitmapFont, Renderer, TextStyleOptions } from 'pixi.js';
import { mixColor } from './colorMath';
import { mulberry32 } from './prng';
import { softDotTexture, sparkTexture } from './softTextures';

// ---------------------------------------------------------------------------------------------
// Particle bursts
// ---------------------------------------------------------------------------------------------

export interface BurstOptions {
  /** Number of particles (sparks + glow dots). Default 18. */
  count?: number;
  /** Initial speed in px/s. Default 260. */
  speed?: number;
  /** Lifetime in seconds. Default 0.55. */
  life?: number;
  /** Size multiplier. Default 1. */
  scale?: number;
  /** Downward acceleration in px/s². Default 420. */
  gravity?: number;
  /** Spawn jitter radius in px (e.g. half a tile). Default 6. */
  radius?: number;
}

export interface ParticlePoolOptions {
  capacity?: number;
  seed?: number;
  /** Override textures (tests / custom looks). Defaults to procedurally drawn dot + streak. */
  dotTexture?: Texture;
  sparkTexture?: Texture;
}

const KIND_DOT = 0;
const KIND_SPARK = 1;

/**
 * Fixed-capacity additive particle system for block pops. All particle state lives in typed
 * arrays and preallocated sprites; `burst` and `update` never allocate. When full, new particles
 * recycle the oldest slots.
 */
export class ParticleBurstPool extends Container {
  readonly capacity: number;
  private readonly sprites: Sprite[] = [];
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly gravity: Float32Array;
  private readonly kind: Uint8Array;
  private readonly alive: Uint8Array;
  private slot = 0;
  private live = 0;
  private readonly rand: () => number;

  constructor(options: ParticlePoolOptions = {}) {
    super();
    this.capacity = options.capacity ?? 384;
    const n = this.capacity;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.alive = new Uint8Array(n);
    this.rand = mulberry32(options.seed ?? 7);
    const dot = options.dotTexture ?? softDotTexture();
    const spark = options.sparkTexture ?? sparkTexture();
    for (let i = 0; i < n; i++) {
      // Even slots are glow dots, odd slots streaks — keeps a stable texture per sprite.
      const isSpark = i % 2 === 1;
      const s = new Sprite(isSpark ? spark : dot);
      s.anchor.set(isSpark ? 0.75 : 0.5, 0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.kind[i] = isSpark ? KIND_SPARK : KIND_DOT;
      this.sprites.push(s);
      this.addChild(s);
    }
  }

  get activeCount(): number {
    return this.live;
  }

  /** Emit a radial burst of sparks + soft dots in `color` around (x, y). */
  burst(x: number, y: number, color: number, options: BurstOptions = {}): void {
    const count = options.count ?? 18;
    const speed = options.speed ?? 260;
    const life = options.life ?? 0.55;
    const scale = options.scale ?? 1;
    const gravity = options.gravity ?? 420;
    const radius = options.radius ?? 6;
    const hot = mixColor(color, 0xffffff, 0.45);
    for (let k = 0; k < count; k++) {
      const wantSpark = k % 3 !== 0;
      const i = this.claim(wantSpark ? KIND_SPARK : KIND_DOT);
      const a = this.rand() * Math.PI * 2;
      const sp = speed * (0.35 + this.rand() * 0.8);
      const r = this.rand() * radius;
      this.px[i] = x + Math.cos(a) * r;
      this.py[i] = y + Math.sin(a) * r;
      this.vx[i] = Math.cos(a) * sp;
      this.vy[i] = Math.sin(a) * sp - speed * 0.25;
      this.age[i] = 0;
      this.life[i] = life * (0.6 + this.rand() * 0.6);
      this.size[i] = scale * (wantSpark ? 0.55 + this.rand() * 0.4 : 0.35 + this.rand() * 0.45);
      this.gravity[i] = gravity;
      const s = this.sprites[i];
      if (s) {
        s.tint = this.rand() < 0.35 ? hot : color;
        s.visible = true;
      }
    }
  }

  update(dt: number): void {
    if (this.live === 0) return;
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const s = this.sprites[i];
      if (!s) continue;
      const age = (this.age[i] ?? 0) + dt;
      const life = this.life[i] ?? 1;
      if (age >= life) {
        this.alive[i] = 0;
        s.visible = false;
        this.live--;
        continue;
      }
      this.age[i] = age;
      const vx = (this.vx[i] ?? 0) * drag;
      const vy = (this.vy[i] ?? 0) * drag + (this.gravity[i] ?? 0) * dt;
      this.vx[i] = vx;
      this.vy[i] = vy;
      const nx = (this.px[i] ?? 0) + vx * dt;
      const ny = (this.py[i] ?? 0) + vy * dt;
      this.px[i] = nx;
      this.py[i] = ny;
      const t = age / life;
      const size = this.size[i] ?? 1;
      s.position.set(nx, ny);
      s.alpha = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      if (this.kind[i] === KIND_SPARK) {
        const v = Math.sqrt(vx * vx + vy * vy);
        s.rotation = Math.atan2(vy, vx);
        s.scale.set(size * Math.min(1.4, 0.25 + v / 400), size);
      } else {
        s.scale.set(size * (1 - t * 0.5));
      }
    }
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.alive[i] = 0;
      const s = this.sprites[i];
      if (s) s.visible = false;
    }
    this.live = 0;
  }

  private claim(kind: number): number {
    // Prefer a dead slot of the right kind; otherwise recycle the slot under the cursor.
    for (let n = 0; n < this.capacity; n++) {
      const i = (this.slot + n) % this.capacity;
      if (!this.alive[i] && this.kind[i] === kind) {
        this.slot = (i + 1) % this.capacity;
        this.alive[i] = 1;
        this.live++;
        return i;
      }
    }
    let i = this.slot;
    if (this.kind[i] !== kind) i = (i + 1) % this.capacity;
    this.slot = (i + 1) % this.capacity;
    if (!this.alive[i]) {
      this.alive[i] = 1;
      this.live++;
    }
    return i;
  }
}

// ---------------------------------------------------------------------------------------------
// Neon text
// ---------------------------------------------------------------------------------------------

export const NEON_FONT_FAMILY =
  "'Avenir Next', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

/** Text style for one-off neon `Text` (HUD titles etc.): white-hot core with a colored halo. */
export function neonTextStyle(color: number, fontSize = 32): TextStyleOptions {
  return {
    fontFamily: NEON_FONT_FAMILY,
    fontSize,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: fontSize * 0.04,
    fill: mixColor(color, 0xffffff, 0.7),
    stroke: { color, width: Math.max(1, fontSize * 0.05) },
    dropShadow: { color, blur: fontSize * 0.35, distance: 0, alpha: 1, angle: 0 },
    padding: Math.ceil(fontSize * 0.5),
  };
}

const POPUP_GLOW_FONT = 'SwaplightPopupGlow';
const POPUP_CORE_FONT = 'SwaplightPopupCore';
const POPUP_FONT_SIZE = 56;
/**
 * Every glyph a popup can show: upper-case EN + HU letters, digits and the score / chain
 * punctuation. A glyph missing here is drawn on first use, which re-uploads a whole font page to
 * the GPU mid-game (a visible hitch on phones).
 */
export const POPUP_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÖŐÚÜŰ0123456789 ×+-!.,:%';
let popupFonts: BitmapFont[] | null = null;

/** Install the dynamic bitmap fonts used by popups (idempotent). */
export function installPopupFonts(resolution = 2): void {
  if (popupFonts) return;
  const base = {
    fontFamily: NEON_FONT_FAMILY,
    fontSize: POPUP_FONT_SIZE,
    fontWeight: '900' as const,
    fontStyle: 'italic' as const,
    letterSpacing: 2,
    fill: 0xffffff,
  };
  const glow = BitmapFontManager.install({
    name: POPUP_GLOW_FONT,
    chars: POPUP_GLYPHS,
    resolution,
    padding: 18,
    style: {
      ...base,
      stroke: { color: 0xffffff, width: 6, join: 'round' },
      dropShadow: { color: 0xffffff, blur: 14, distance: 0, alpha: 1, angle: 0 },
    },
  });
  // Dark outline survives tinting (black × tint = black) and keeps the label legible over tiles.
  const core = BitmapFontManager.install({
    name: POPUP_CORE_FONT,
    chars: POPUP_GLYPHS,
    resolution,
    padding: 6,
    style: { ...base, stroke: { color: 0x0a0414, width: 5, join: 'round' } },
  });
  popupFonts = [glow, core];
}

/**
 * Upload the popup font pages to the GPU now (scene setup) instead of on the first popup, which
 * would otherwise stall the frame of the player's first chain by several large texture uploads.
 */
export function uploadPopupFonts(renderer: Renderer): void {
  for (const font of popupFonts ?? []) {
    for (const page of font.pages) renderer.texture.initSource(page.texture.source);
  }
}

export interface PopupOptions {
  /** Font scale relative to 56 px. Default 0.5 (≈28 px). */
  scale?: number;
  /** Seconds on screen. Default 1.1. */
  life?: number;
  /** Pixels risen over the lifetime. Default 48. */
  rise?: number;
  /**
   * Horizontal bounds (same space as `x`) the label must stay inside: long labels are scaled down
   * to fit the width and the center is clamped so neither edge leaves the range.
   */
  minX?: number;
  maxX?: number;
}

/**
 * Fit a centered label of local width `width` drawn at `scale` into [minX, maxX]: shrink the scale
 * when it is wider than the range, then clamp the center so both edges stay inside. The pop-in
 * overshoot never exceeds the resting scale, so the resting scale bounds the drawn width.
 */
export function fitPopup(
  x: number,
  width: number,
  scale: number,
  minX: number,
  maxX: number,
): { x: number; scale: number } {
  const span = maxX - minX;
  if (!(span > 0) || !(width > 0)) return { x, scale };
  const s = width * scale > span ? span / width : scale;
  const half = (width * s) / 2;
  return { x: Math.max(minX + half, Math.min(maxX - half, x)), scale: s };
}

interface Popup {
  root: Container;
  glow: BitmapText;
  core: BitmapText;
  age: number;
  life: number;
  rise: number;
  scale: number;
  x: number;
  y: number;
}

/**
 * Pool of floating neon labels ("CHAIN ×3", "+1 240"). Uses dynamic bitmap fonts so changing the
 * text is cheap; the colored halo is a tinted glow font under a near-white core.
 */
export class FloatingTextPool extends Container {
  private readonly items: Popup[] = [];
  private next = 0;

  constructor(capacity = 12, resolution = 2) {
    super();
    installPopupFonts(resolution);
    for (let i = 0; i < capacity; i++) {
      const root = new Container();
      const glow = new BitmapText({
        text: '',
        style: { fontFamily: POPUP_GLOW_FONT, fontSize: POPUP_FONT_SIZE },
      });
      const core = new BitmapText({
        text: '',
        style: { fontFamily: POPUP_CORE_FONT, fontSize: POPUP_FONT_SIZE },
      });
      glow.anchor.set(0.5);
      core.anchor.set(0.5);
      glow.blendMode = 'add';
      root.addChild(glow, core);
      root.visible = false;
      this.addChild(root);
      this.items.push({ root, glow, core, age: 0, life: 1, rise: 0, scale: 1, x: 0, y: 0 });
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.items) if (p.root.visible) n++;
    return n;
  }

  spawn(text: string, x: number, y: number, color: number, options: PopupOptions = {}): void {
    const p = this.items[this.next];
    if (!p) return;
    this.next = (this.next + 1) % this.items.length;
    if (p.glow.text !== text) {
      p.glow.text = text;
      p.core.text = text;
    }
    p.glow.tint = color;
    p.core.tint = mixColor(color, 0xffffff, 0.8);
    p.age = 0;
    p.life = options.life ?? 1.1;
    p.rise = options.rise ?? 48;
    p.scale = options.scale ?? 0.5;
    p.x = x;
    const { minX, maxX } = options;
    if (minX !== undefined && maxX !== undefined) {
      const fit = fitPopup(x, p.core.width, p.scale, minX, maxX);
      p.x = fit.x;
      p.scale = fit.scale;
    }
    p.y = y;
    p.root.visible = true;
    // Newest on top.
    this.addChild(p.root);
    this.place(p);
  }

  /** Hide every active popup (new game / stage). */
  clear(): void {
    for (const p of this.items) p.root.visible = false;
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.root.visible) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.root.visible = false;
        continue;
      }
      this.place(p);
    }
  }

  private place(p: Popup): void {
    const t = p.age / p.life;
    // Pop in with overshoot over the first 0.18 s, then drift up and fade over the last 35 %.
    const pin = Math.min(1, p.age / 0.18);
    const pop = 1 + 0.35 * Math.sin(pin * Math.PI) * (1 - pin * 0.4);
    const s = p.scale * (pin < 1 ? 0.4 + 0.6 * pin : 1) * pop;
    const rise = 1 - Math.pow(1 - t, 2.2);
    p.root.position.set(p.x, p.y - p.rise * rise);
    p.root.scale.set(s);
    p.root.alpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
    p.glow.alpha = 0.7 + 0.15 * Math.sin(p.age * 30);
  }
}

// ---------------------------------------------------------------------------------------------
// Screen shake
// ---------------------------------------------------------------------------------------------

export interface ShakeOffset {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Smooth pseudo-noise shake offset for `intensity` (0..1) at time `time` (s). Pure and
 * deterministic; writes into `out` (no allocation when provided).
 */
export function shakeOffset(
  intensity: number,
  time: number,
  out: ShakeOffset = { x: 0, y: 0, rotation: 0 },
  maxOffset = 14,
  maxRotation = 0.025,
): ShakeOffset {
  const k = Math.max(0, Math.min(1, intensity));
  if (k === 0) {
    out.x = 0;
    out.y = 0;
    out.rotation = 0;
    return out;
  }
  const nx = Math.sin(time * 47.3) * 0.6 + Math.sin(time * 83.1 + 1.3) * 0.4;
  const ny = Math.sin(time * 53.7 + 2.1) * 0.6 + Math.sin(time * 91.9 + 0.4) * 0.4;
  const nr = Math.sin(time * 37.9 + 4.2) * 0.7 + Math.sin(time * 71.3) * 0.3;
  out.x = nx * maxOffset * k;
  out.y = ny * maxOffset * k;
  out.rotation = nr * maxRotation * k;
  return out;
}

/**
 * Trauma-based screen shake: `add()` trauma on big chains, call `update(dt)` each frame and apply
 * `offset` to the gameplay container. Shake amount is trauma², so small hits stay subtle.
 */
export class ScreenShake {
  trauma = 0;
  /** Set to false for the reduced-motion accessibility option. */
  enabled = true;
  readonly offset: ShakeOffset = { x: 0, y: 0, rotation: 0 };
  private time = 0;

  constructor(
    private readonly maxOffset = 14,
    private readonly maxRotation = 0.025,
    private readonly decayPerSecond = 1.6,
  ) {}

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): ShakeOffset {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - this.decayPerSecond * dt);
    const k = this.enabled ? this.trauma * this.trauma : 0;
    return shakeOffset(k, this.time, this.offset, this.maxOffset, this.maxRotation);
  }
}

// ---------------------------------------------------------------------------------------------
// Flash overlay
// ---------------------------------------------------------------------------------------------

/** Full-screen additive color flash (big chain, game over, level up). */
export class FlashOverlay extends Sprite {
  private remaining = 0;
  private duration = 1;
  private peak = 0;

  constructor(width: number, height: number) {
    super(Texture.WHITE);
    this.blendMode = 'add';
    this.alpha = 0;
    this.visible = false;
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  flash(color = 0xffffff, peakAlpha = 0.6, duration = 0.35): void {
    this.tint = color;
    this.peak = peakAlpha;
    this.duration = Math.max(0.01, duration);
    this.remaining = this.duration;
    this.alpha = peakAlpha;
    this.visible = true;
  }

  update(dt: number): void {
    if (this.remaining <= 0) return;
    this.remaining = Math.max(0, this.remaining - dt);
    const t = this.remaining / this.duration;
    this.alpha = this.peak * t * t;
    this.visible = this.remaining > 0;
  }
}
