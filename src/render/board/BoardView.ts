import { Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { MOD_HIDDEN_COLOR } from '../../core/run/keys';
import { MOD_LOCKED_COLUMNS, MOD_SWAP_LOCK_UNTIL, riseFraction } from '../../core/sim';
import type { BlockKind as CoreBlockKind, CellRef, SimState } from '../../core/types';
import { blockRenderPos, dangerColumns, slabRenderPositions } from '../../core/view';
import {
  BlockTextureFactory,
  blockGlowPadding,
  type BlockKind as TexKind,
  type BlockState as TexState,
  type BlockTextureSet,
} from '../style/blockTextures';
import { mixColor } from '../style/colorMath';
import { GarbageSlabTextures } from '../style/garbageTextures';
import { NEON_PALETTE, type Palette } from '../style/palette';
import type { GameLayout } from './layout';
import { PositionTrack } from './interp';

/** Per-frame inputs that are not part of the sim. */
export interface BoardRenderHints {
  /** Block under the player's finger (gesture controller). */
  heldBlockId: number | null;
  /** Keyboard cursor (left cell of the 2-wide pair), or null when hidden. */
  cursor: CellRef | null;
  /** The stack is being raised manually. */
  raising: boolean;
}

interface Tile {
  glow: Sprite;
  body: Sprite;
  seen: number;
}

const TEX_KIND: Record<CoreBlockKind, TexKind> = {
  normal: 'color',
  garbage: 'garbage',
  wild: 'wild',
  bomb: 'bomb',
};

/** Matched blocks alternate normal / white-hot every N ticks. */
const FLASH_PERIOD_TICKS = 3;

/** Blocks freed from a garbage slab pop in over this many seconds. */
const EMERGE_SECONDS = 0.32;

interface SlabSprite {
  glow: Sprite;
  body: Sprite;
  seen: number;
}

/** Slab ids share the position track with block ids: negative keys. */
const slabKey = (id: number): number => -id;

/**
 * Pixi view of the board. Reads the sim (never mutates it), tracks sprites by block id with a pool
 * and interpolates every block between the previous and the current tick (`captureTick` after each
 * simulation step, `render(alpha)` once per frame).
 *
 * Layers (back → front): well + danger columns → [masked: halos (additive) → bodies → held ring]
 * → preview fade → neon frame → keyboard cursor.
 */
export class BoardView extends Container {
  readonly textures: BlockTextureFactory;
  private palette: Palette;
  private layout: GameLayout | null = null;
  private cols = 6;

  private readonly well = new Graphics();
  private readonly dangerLayer = new Container();
  private readonly dangerStrips: Sprite[] = [];
  private readonly content = new Container();
  private readonly glowLayer = new Container();
  private readonly bodyLayer = new Container();
  private readonly held = new Graphics();
  private readonly mask_ = new Graphics();
  private readonly previewFade = new Graphics();
  private readonly frame = new Graphics();
  private readonly frameHot = new Graphics();
  private readonly cursorGfx = new Graphics();
  /** Run curses: frozen columns / swap lock overlay. */
  private readonly lockGfx = new Graphics();
  private fadeGradient: FillGradient | null = null;
  private frameGradient: FillGradient | null = null;

  readonly slabTextures: GarbageSlabTextures;
  private readonly slabGlowLayer = new Container();
  private readonly slabLayer = new Container();
  /** Conversion sweep / sparks over converting slabs. */
  private readonly slabFx = new Graphics();
  private readonly slabs = new Map<number, SlabSprite>();
  private readonly slabPool: SlabSprite[] = [];
  /** Ids of the blocks recorded at the last tick (detects blocks freed from garbage). */
  private knownIds = new Set<number>();
  private nextKnown = new Set<number>();
  /** Block id → time (s) it emerged from a slab. */
  private readonly emerging = new Map<number, number>();
  /** Frame gradient colors (top, bottom); defaults to the palette accents. */
  private frameColors: [number, number] | null = null;
  private readonly tiles = new Map<number, Tile>();
  private readonly pool: Tile[] = [];
  private readonly track = new PositionTrack();
  private frameNo = 0;
  private time = 0;
  private dangerLevel = 0;

  constructor(renderer: Renderer, palette: Palette = NEON_PALETTE) {
    super();
    this.palette = palette;
    this.textures = new BlockTextureFactory(renderer, { palette });
    this.slabTextures = new GarbageSlabTextures(renderer, palette);
    this.glowLayer.blendMode = 'add';
    this.slabGlowLayer.blendMode = 'add';
    this.slabFx.blendMode = 'add';
    this.content.addChild(
      this.glowLayer,
      this.slabGlowLayer,
      this.bodyLayer,
      this.slabLayer,
      this.slabFx,
      this.held,
    );
    this.content.mask = this.mask_;
    this.addChild(
      this.well,
      this.dangerLayer,
      this.content,
      this.mask_,
      this.previewFade,
      this.lockGfx,
      this.frameHot,
      this.frame,
      this.cursorGfx,
    );
  }

  /** Number of live block sprites (tests / debugging). */
  get spriteCount(): number {
    return this.tiles.size;
  }

  setLayout(layout: GameLayout, cols: number): void {
    const sizeChanged = this.layout?.cellSize !== layout.cellSize;
    this.layout = layout;
    this.cols = cols;
    if (sizeChanged) {
      this.textures.clear();
      this.slabTextures.clear();
    }
    this.drawStatic(cols);
  }

  /** Switch palette (high-contrast setting); block textures are cached per palette. */
  setPalette(palette: Palette): void {
    if (palette === this.palette) return;
    this.palette = palette;
    this.textures.setPalette(palette);
    this.slabTextures.setPalette(palette);
    this.drawStatic(this.cols);
  }

  /** Recolor the neon frame (e.g. the CPU's board); null = palette accents. */
  setFrameColors(colors: [number, number] | null): void {
    this.frameColors = colors;
    this.drawStatic(this.cols);
  }

  /** Forget interpolation history (new game / board replaced). */
  resetTracking(): void {
    this.track.clear();
    this.knownIds.clear();
    this.emerging.clear();
  }

  /** Record block positions after a simulation step (call after every `step`). */
  captureTick(sim: SimState): void {
    const t = this.track;
    t.begin();
    const { rows, cols } = sim.config;
    const rise = riseFraction(sim);
    const known = this.knownIds;
    const next = this.nextKnown;
    next.clear();
    const fresh = known.size > 0;
    for (let i = 0; i < sim.cells.length; i++) {
      const b = sim.cells[i];
      if (!b || b.kind === 'garbage') continue;
      const p = blockRenderPos(sim, i);
      if (!p) continue;
      t.set(p.id, p.row - rise, p.col);
      next.add(b.id);
      // A board block that did not exist last tick was freed from a garbage slab.
      if (fresh && !known.has(b.id)) this.emerging.set(b.id, this.time);
    }
    for (let c = 0; c < sim.preview.length && c < cols; c++) {
      const b = sim.preview[c];
      if (!b) continue;
      t.set(b.id, rows - rise, c);
      next.add(b.id);
    }
    for (const s of slabRenderPositions(sim)) t.set(slabKey(s.id), s.row - rise, s.col);
    this.knownIds = next;
    this.nextKnown = known;
  }

  render(sim: SimState, alpha: number, dt: number, hints: BoardRenderHints): void {
    const layout = this.layout;
    if (!layout) return;
    this.time += dt;
    this.frameNo++;
    const frame = this.frameNo;
    const cell = layout.cellSize;
    const { rows, cols, landTicks } = sim.config;
    const rise = riseFraction(sim);
    const danger = dangerColumns(sim);
    const pinned = sim.danger;
    this.dangerLevel += ((pinned ? 1 : danger.length > 0 ? 0.45 : 0) - this.dangerLevel) * 0.12;
    const t = this.time;
    let heldPos: { x: number; y: number } | null = null;
    // The Veil: one color is drawn as a neutral "?" tile (revealed while it flashes in a match).
    const hidden = sim.modifiers[MOD_HIDDEN_COLOR];
    const texKind = (kind: CoreBlockKind, color: number, revealed: boolean): TexKind =>
      kind === 'normal' && hidden !== undefined && color === hidden && !revealed
        ? 'mystery'
        : TEX_KIND[kind];

    for (let i = 0; i < sim.cells.length; i++) {
      const b = sim.cells[i];
      if (!b || b.kind === 'garbage') continue;
      const p = blockRenderPos(sim, i);
      if (!p) continue;
      if (p.state === 'popped' && p.popProgress >= 1) continue;
      const pos = this.track.get(b.id, alpha);
      const sr = pos ? pos.row : p.row - rise;
      const sc = pos ? pos.col : p.col;

      let state: TexState = 'normal';
      let scaleX = 1;
      let scaleY = 1;
      let alphaV = 1;
      let tint = 0xffffff;
      let dy = 0;
      let dx = 0;
      if (p.state === 'matched') {
        state = Math.floor(sim.tick / FLASH_PERIOD_TICKS) % 2 === 0 ? 'flash' : 'normal';
      } else if (p.state === 'popping') {
        tint = 0x9c98b8;
      } else if (p.state === 'popped') {
        const k = p.popProgress;
        state = 'flash';
        scaleX = scaleY = 1 + 0.35 * k;
        alphaV = 1 - k * k;
      } else if (p.state === 'landing' && landTicks > 0) {
        // Subtle squash on landing, anchored to the bottom edge.
        const k = 1 - b.timer / landTicks;
        const s = Math.sin(Math.PI * k) * (1 - k * 0.5);
        scaleY = 1 - 0.1 * s;
        scaleX = 1 + 0.06 * s;
        dy = (cell * (1 - scaleY)) / 2;
      }
      const col = Math.max(0, Math.min(cols - 1, Math.round(sc)));
      if (danger.includes(col) && p.state !== 'popped' && p.state !== 'matched') {
        if (pinned) {
          dx = Math.sin(t * 46 + col * 1.7) * cell * 0.035;
          tint = mixColor(0xffffff, this.palette.ui.danger, 0.18 + 0.12 * Math.sin(t * 12));
        } else {
          dy -= Math.abs(Math.sin(t * 7 + col * 0.6)) * cell * 0.05;
        }
      }
      if (b.id === hints.heldBlockId) {
        scaleX *= 1.07;
        scaleY *= 1.07;
      }
      const born = this.emerging.get(b.id);
      if (born !== undefined) {
        const k = (t - born) / EMERGE_SECONDS;
        if (k >= 1 || k < 0) {
          this.emerging.delete(b.id);
        } else {
          // Pop out of the slab: small → overshoot → 1, white-hot at first.
          const e = 1 - Math.pow(1 - k, 3);
          const s = 0.45 + 0.55 * e + Math.sin(Math.PI * k) * 0.12;
          scaleX *= s;
          scaleY *= s;
          if (k < 0.45 && state === 'normal') state = 'flash';
        }
      }
      const x = layout.originX + (sc + 0.5) * cell + dx;
      const y = layout.originY + (sr + 0.5) * cell + dy;
      if (b.id === hints.heldBlockId) heldPos = { x, y };
      const revealed = p.state === 'matched' || p.state === 'popped';
      const kind = texKind(b.kind, b.color, revealed);
      this.place(b.id, kind, b.color, state, x, y, scaleX, scaleY, alphaV, tint, frame);
    }

    for (let c = 0; c < sim.preview.length && c < cols; c++) {
      const b = sim.preview[c];
      if (!b) continue;
      const pos = this.track.get(b.id, alpha);
      const sr = pos ? pos.row : rows - rise;
      const x = layout.originX + (c + 0.5) * cell;
      const y = layout.originY + (sr + 0.5) * cell;
      this.place(
        b.id,
        texKind(b.kind, b.color, false),
        b.color,
        'dimmed',
        x,
        y,
        1,
        1,
        1,
        0xffffff,
        frame,
      );
    }

    // Release sprites of blocks that are gone.
    for (const [id, tile] of this.tiles) {
      if (tile.seen === frame) continue;
      tile.glow.visible = false;
      tile.body.visible = false;
      this.tiles.delete(id);
      this.pool.push(tile);
    }

    this.renderSlabs(sim, alpha, frame, cell, rise);

    this.drawHeld(heldPos, cell);
    this.drawCursor(hints.cursor, rise, cell);
    this.drawDanger(danger, pinned, cell);
    this.drawLocks(sim, cell);
  }

  /** Garbage slabs: one panel sprite per slab, blinking and swept while converting. */
  private renderSlabs(
    sim: SimState,
    alpha: number,
    frame: number,
    cell: number,
    rise: number,
  ): void {
    const layout = this.layout;
    const fx = this.slabFx;
    fx.clear();
    if (!layout) return;
    if (sim.garbage.length > 0) {
      for (const s of slabRenderPositions(sim)) {
        const pos = this.track.get(slabKey(s.id), alpha);
        const sr = pos ? pos.row : s.row - rise;
        const sc = pos ? pos.col : s.col;
        let sprite = this.slabs.get(s.id);
        if (!sprite) {
          sprite = this.slabPool.pop() ?? this.newSlab();
          this.slabs.set(s.id, sprite);
        }
        sprite.seen = frame;
        const converting = s.state === 'converting';
        const blink = converting && Math.floor(sim.tick / FLASH_PERIOD_TICKS) % 2 === 0;
        const set = this.slabTextures.get(s.width, s.height, cell, blink ? 'flash' : 'normal');
        const { body, glow } = sprite;
        if (body.texture !== set.body) body.texture = set.body;
        if (glow.texture !== set.glow) glow.texture = set.glow;
        body.visible = glow.visible = true;
        const x = layout.originX + sc * cell;
        let y = layout.originY + sr * cell;
        let sy = 1;
        if (s.state === 'landing' && sim.config.landTicks > 0) {
          // Heavy landing: a short squash anchored to the bottom.
          const slab = sim.garbage.find((g) => g.id === s.id);
          const k = slab ? 1 - slab.timer / sim.config.landTicks : 1;
          sy = 1 - 0.06 * Math.sin(Math.PI * k) * (1 - k * 0.5);
          y += s.height * cell * (1 - sy);
        }
        body.position.set(x, y);
        body.scale.set(1, sy);
        glow.position.set(x - set.glowPadding, y - set.glowPadding * sy);
        glow.scale.set(1, sy);
        glow.alpha = converting ? 0.7 + 0.3 * Math.sin(this.time * 30) : 1;
        if (converting) this.drawConversion(fx, x, y, s.width, s.height, cell, s.convertProgress);
      }
    }
    for (const [id, sprite] of this.slabs) {
      if (sprite.seen === frame) continue;
      sprite.body.visible = false;
      sprite.glow.visible = false;
      this.slabs.delete(id);
      this.slabPool.push(sprite);
    }
  }

  /** A bright scanline sweeping the bottom row (the part that turns into blocks) + sparks. */
  private drawConversion(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    cell: number,
    progress: number,
  ): void {
    const accent = this.palette.ui.accent;
    const rowY = y + (h - 1) * cell;
    const sweepX = x + progress * w * cell;
    g.rect(x, rowY + cell * 0.08, Math.max(0, sweepX - x), cell * 0.84).fill({
      color: 0xffffff,
      alpha: 0.12 + 0.1 * progress,
    });
    g.rect(sweepX - cell * 0.06, rowY + cell * 0.04, cell * 0.12, cell * 0.92).fill({
      color: accent,
      alpha: 0.85,
    });
    g.rect(sweepX - cell * 0.22, rowY + cell * 0.04, cell * 0.44, cell * 0.92).fill({
      color: accent,
      alpha: 0.18,
    });
    for (let i = 0; i < 4; i++) {
      const a = this.time * 9 + i * 1.7;
      const sx = sweepX + Math.sin(a * 1.3) * cell * 0.25;
      const sy = rowY + cell * (0.5 + 0.42 * Math.sin(a));
      g.circle(sx, sy, Math.max(1, cell * 0.05)).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }

  private newSlab(): SlabSprite {
    const glow = new Sprite(Texture.EMPTY);
    glow.blendMode = 'add';
    const body = new Sprite(Texture.EMPTY);
    this.slabGlowLayer.addChild(glow);
    this.slabLayer.addChild(body);
    return { glow, body, seen: 0 };
  }

  /** Frozen columns (The Lock) and the swap lock (The Stagger): icy overlays with a padlock. */
  private drawLocks(sim: SimState, cell: number): void {
    const g = this.lockGfx;
    g.clear();
    const layout = this.layout;
    if (!layout) return;
    const mods = sim.modifiers;
    const mask = mods[MOD_LOCKED_COLUMNS] ?? 0;
    const until = mods[MOD_SWAP_LOCK_UNTIL];
    const swapLocked = until !== undefined && sim.tick < until;
    if (mask === 0 && !swapLocked) return;
    const ice = 0x8fe3ff;
    const { originX: x0, originY: y0, boardHeight: h } = layout;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    for (let c = 0; c < this.cols; c++) {
      if (((mask >>> c) & 1) === 0) continue;
      const x = x0 + c * cell;
      g.rect(x + 1, y0, cell - 2, h).fill({ color: ice, alpha: 0.1 + 0.05 * pulse });
      // Chain links down the column edges.
      for (let y = y0 + cell * 0.25; y < y0 + h; y += cell * 0.5) {
        g.roundRect(x + 2, y, cell * 0.08, cell * 0.28, cell * 0.04).fill({
          color: ice,
          alpha: 0.5,
        });
        g.roundRect(x + cell - 2 - cell * 0.08, y, cell * 0.08, cell * 0.28, cell * 0.04).fill({
          color: ice,
          alpha: 0.5,
        });
      }
      this.drawPadlock(g, x + cell / 2, y0 + cell * 0.55, cell * 0.36, ice);
    }
    if (swapLocked) {
      const left = (until - sim.tick) / 60;
      const a = Math.min(1, left) * 0.18;
      g.rect(x0, y0, layout.boardWidth, h).fill({ color: ice, alpha: a });
      this.drawPadlock(g, x0 + layout.boardWidth / 2, y0 + h * 0.12, cell * 0.5, ice);
    }
  }

  private drawPadlock(g: Graphics, cx: number, cy: number, s: number, color: number): void {
    g.circle(cx, cy, s * 0.95).fill({ color: 0x0b0a1c, alpha: 0.75 });
    g.moveTo(cx - s * 0.3, cy - s * 0.12)
      .arc(cx, cy - s * 0.12, s * 0.3, Math.PI, 0)
      .stroke({ width: s * 0.12, color, alpha: 0.95 });
    g.roundRect(cx - s * 0.42, cy - s * 0.12, s * 0.84, s * 0.62, s * 0.12).fill({
      color,
      alpha: 0.95,
    });
    g.circle(cx, cy + s * 0.17, s * 0.09).fill({ color: 0x0b0a1c, alpha: 0.9 });
  }

  private place(
    id: number,
    kind: TexKind,
    color: number,
    state: TexState,
    x: number,
    y: number,
    sx: number,
    sy: number,
    alpha: number,
    tint: number,
    frame: number,
  ): void {
    const layout = this.layout;
    if (!layout) return;
    let tile = this.tiles.get(id);
    if (!tile) {
      tile = this.pool.pop() ?? this.newTile();
      this.tiles.set(id, tile);
    }
    tile.seen = frame;
    const set: BlockTextureSet = this.textures.get({ kind, color, state, size: layout.cellSize });
    const { glow, body } = tile;
    if (body.texture !== set.body) body.texture = set.body;
    if (glow.texture !== set.glow) glow.texture = set.glow;
    body.visible = glow.visible = true;
    body.position.set(x, y);
    glow.position.set(x, y);
    body.scale.set(sx, sy);
    glow.scale.set(sx, sy);
    body.alpha = alpha;
    glow.alpha = alpha;
    body.tint = tint;
  }

  private newTile(): Tile {
    const glow = new Sprite(Texture.EMPTY);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    const body = new Sprite(Texture.EMPTY);
    body.anchor.set(0.5);
    this.glowLayer.addChild(glow);
    this.bodyLayer.addChild(body);
    return { glow, body, seen: 0 };
  }

  private drawHeld(pos: { x: number; y: number } | null, cell: number): void {
    const g = this.held;
    g.clear();
    if (!pos) return;
    const s = cell * 1.12;
    const r = cell * 0.2;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 10);
    g.roundRect(pos.x - s / 2 - 3, pos.y - s / 2 - 3, s + 6, s + 6, r + 3).stroke({
      width: 6,
      color: this.palette.ui.accent,
      alpha: 0.25 * pulse,
    });
    g.roundRect(pos.x - s / 2, pos.y - s / 2, s, s, r).stroke({
      width: 2.5,
      color: mixColor(this.palette.ui.accent, 0xffffff, 0.6),
      alpha: 0.95 * pulse,
    });
  }

  private drawCursor(cursor: CellRef | null, rise: number, cell: number): void {
    const g = this.cursorGfx;
    g.clear();
    const layout = this.layout;
    if (!cursor || !layout) return;
    const x = layout.originX + cursor.col * cell;
    const y = layout.originY + (cursor.row - rise) * cell;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 8);
    g.roundRect(x - 3, y - 3, cell * 2 + 6, cell + 6, cell * 0.22).stroke({
      width: 7,
      color: 0xffffff,
      alpha: 0.18 * pulse,
    });
    g.roundRect(x - 1, y - 1, cell * 2 + 2, cell + 2, cell * 0.2).stroke({
      width: 3,
      color: 0xffffff,
      alpha: 0.95 * pulse,
    });
    g.moveTo(x + cell, y + cell * 0.2)
      .lineTo(x + cell, y + cell * 0.8)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
  }

  private drawDanger(columns: readonly number[], pinned: boolean, cell: number): void {
    const layout = this.layout;
    if (!layout) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (pinned ? 14 : 6));
    for (let c = 0; c < this.dangerStrips.length; c++) {
      const strip = this.dangerStrips[c];
      if (!strip) continue;
      const on = columns.includes(c);
      const target = on ? (pinned ? 0.16 + 0.16 * pulse : 0.06 + 0.07 * pulse) : 0;
      strip.alpha += (target - strip.alpha) * 0.25;
      strip.visible = strip.alpha > 0.004;
      strip.position.set(layout.originX + c * cell, layout.originY);
    }
    this.frameHot.alpha = Math.min(1, this.dangerLevel * (0.55 + 0.45 * pulse));
  }

  /** Well, grid lines, mask, preview fade and the neon frame (rebuilt on layout change). */
  private drawStatic(cols: number): void {
    const layout = this.layout;
    if (!layout) return;
    const { originX: x, originY: y, boardWidth: w, boardHeight: h, previewHeight: ph } = layout;
    const cell = layout.cellSize;
    const pal = this.palette;
    const r = Math.max(6, Math.round(cell * 0.22));
    const pad = layout.framePad;

    this.well.clear();
    // Soft drop shadow / bloom behind the panel.
    this.well
      .roundRect(x - pad - 10, y - pad - 10, w + 2 * pad + 20, h + ph + 2 * pad + 20, r + 10)
      .fill({ color: 0x000000, alpha: 0.35 });
    this.well
      .roundRect(x - pad, y - pad, w + 2 * pad, h + ph + 2 * pad, r)
      .fill({ color: pal.background.panel, alpha: 0.9 });
    for (let c = 1; c < cols; c++) {
      this.well
        .moveTo(x + c * cell, y + 2)
        .lineTo(x + c * cell, y + h - 2)
        .stroke({ width: 1, color: pal.background.grid, alpha: 0.12 });
    }
    // Faint ceiling line (top-out boundary).
    this.well
      .moveTo(x + 4, y + 0.5)
      .lineTo(x + w - 4, y + 0.5)
      .stroke({ width: 1, color: pal.ui.danger, alpha: 0.25 });

    // Danger strips: one per column, tinted, alpha animated.
    this.dangerLayer.removeChildren();
    this.dangerStrips.length = 0;
    for (let c = 0; c < cols; c++) {
      const s = new Sprite(Texture.WHITE);
      s.tint = pal.ui.danger;
      s.width = cell;
      s.height = h;
      s.alpha = 0;
      s.visible = false;
      s.blendMode = 'add';
      this.dangerStrips.push(s);
      this.dangerLayer.addChild(s);
    }

    const glowPad = blockGlowPadding(cell);
    this.mask_.clear();
    this.mask_
      .rect(x - Math.min(glowPad, pad + 4), y, w + 2 * Math.min(glowPad, pad + 4), h + ph)
      .fill(0xffffff);

    // Preview strip: darken towards the bottom so the incoming row reads as "not yet active".
    this.fadeGradient?.destroy();
    this.fadeGradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 'rgba(11,10,28,0.1)' },
        { offset: 1, color: 'rgba(11,10,28,0.92)' },
      ],
      textureSpace: 'local',
    });
    this.previewFade.clear();
    this.previewFade.rect(x, y + h, w, ph).fill(this.fadeGradient);
    this.previewFade
      .moveTo(x, y + h)
      .lineTo(x + w, y + h)
      .stroke({ width: 1.5, color: pal.ui.accent, alpha: 0.45 });

    // Neon frame: soft halo strokes + a crisp gradient rim (cyan → magenta).
    this.frameGradient?.destroy();
    this.frameGradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: this.frameColors?.[0] ?? pal.ui.accent },
        { offset: 1, color: this.frameColors?.[1] ?? pal.ui.accent2 },
      ],
      textureSpace: 'local',
    });
    const fx = x - pad;
    const fy = y - pad;
    const fw = w + 2 * pad;
    const fh = h + ph + 2 * pad;
    this.frame.clear();
    this.frame.roundRect(fx - 4, fy - 4, fw + 8, fh + 8, r + 4).stroke({
      width: 10,
      color: this.frameColors?.[0] ?? pal.ui.accent,
      alpha: 0.1,
    });
    this.frame.roundRect(fx - 1.5, fy - 1.5, fw + 3, fh + 3, r + 1.5).stroke({
      width: 4,
      color: this.frameColors?.[1] ?? pal.ui.accent2,
      alpha: 0.22,
    });
    this.frame.roundRect(fx, fy, fw, fh, r).stroke({ width: 2.5, fill: this.frameGradient });
    this.frame.roundRect(fx + 2, fy + 2, fw - 4, fh - 4, Math.max(2, r - 2)).stroke({
      width: 1,
      color: 0xffffff,
      alpha: 0.12,
    });

    // Red rim shown while in danger (alpha animated).
    this.frameHot.clear();
    this.frameHot.roundRect(fx - 4, fy - 4, fw + 8, fh + 8, r + 4).stroke({
      width: 12,
      color: pal.ui.danger,
      alpha: 0.28,
    });
    this.frameHot.roundRect(fx, fy, fw, fh, r).stroke({ width: 3, color: pal.ui.danger });
    this.frameHot.blendMode = 'add';
    this.frameHot.alpha = 0;
  }
}
