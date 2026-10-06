import { Application, Container } from 'pixi.js';
import type { SimState } from '../core/types';
import { riseFraction } from '../core/sim';
import { BoardView, type BoardRenderHints } from './board/BoardView';
import { cellCenter, type GameLayout } from './board/layout';
import { NeonBackground } from './style/background';
import { attachDeferredDestroy } from './style/blockTextures';
import { AttackBoltPool, type BoltOptions } from './style/bolts';
import { mixColor } from './style/colorMath';
import {
  FlashOverlay,
  FloatingTextPool,
  ParticleBurstPool,
  ScreenShake,
  uploadPopupFonts,
} from './style/effects';
import { NEON_PALETTE, type Palette } from './style/palette';

export type PopupToneName = 'chain' | 'combo' | 'score' | 'level';

interface WarmJob {
  view: 'main' | 'opponent';
  size: number;
  /** Also bake the common garbage slabs (Versus). */
  slabs: boolean;
}

/** Wall-clock time per idle frame spent baking textures ahead of use. */
const WARMUP_BUDGET_MS = 3;
/** Distinct player-board cell sizes (Endless, Run / Daily, Puzzle / Tutorial, Versus). */
const MAIN_TEXTURE_SIZES = 4;

/**
 * The gameplay canvas: synthwave backdrop, the board and the effect layers (particles, popups,
 * shake, flash). It only draws; game flow lives in `src/game`.
 */
export class GameScene {
  readonly app: Application;
  readonly board: BoardView;
  private readonly bg: NeonBackground;
  private readonly world = new Container();
  private readonly particles: ParticleBurstPool;
  private readonly popups: FloatingTextPool;
  private readonly flashOverlay: FlashOverlay;
  private readonly shaker = new ScreenShake(10, 0.012, 1.8);
  private readonly bolts = new AttackBoltPool();
  /** Versus: the CPU's mini board (created on first use). */
  private opponentView: BoardView | null = null;
  private opponentLayout: GameLayout | null = null;
  private layout: GameLayout | null = null;
  private excitement = 0;
  private palette: Palette = NEON_PALETTE;
  private reduced = false;
  /** Pending idle-time texture bakes (see `prewarm`). */
  private warmQueue: WarmJob[] = [];

  private constructor(app: Application) {
    this.app = app;
    attachDeferredDestroy(app.renderer);
    const { width, height } = app.screen;
    this.bg = new NeonBackground({ width, height, seed: 3, horizon: 0.62 });
    this.board = new BoardView(app.renderer, this.palette, MAIN_TEXTURE_SIZES);
    this.particles = new ParticleBurstPool({ seed: 11 });
    this.popups = new FloatingTextPool(16, Math.max(2, app.renderer.resolution));
    uploadPopupFonts(app.renderer);
    this.flashOverlay = new FlashOverlay(width, height);
    this.world.addChild(this.board, this.particles, this.popups, this.bolts);
    app.stage.addChild(this.bg, this.world, this.flashOverlay);
  }

  static async create(host: HTMLElement): Promise<GameScene> {
    const app = new Application();
    await app.init({
      resizeTo: window,
      // Tiles are baked with antialiasing; MSAA on the main canvas only costs fill rate.
      antialias: false,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      background: NEON_PALETTE.background.top,
      preference: 'webgl',
    });
    host.appendChild(app.canvas);
    (globalThis as unknown as { __PIXI_APP__?: Application }).__PIXI_APP__ = app; // Pixi devtools
    return new GameScene(app);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  setLayout(layout: GameLayout, cols: number): void {
    this.layout = layout;
    this.bg.resize(layout.width, layout.height);
    this.flashOverlay.resize(layout.width, layout.height);
    this.board.setLayout(layout, cols);
  }

  /** Short-lived excitement (big chains) on top of the danger level. */
  excite(amount: number): void {
    this.excitement = Math.min(1, Math.max(this.excitement, amount));
  }

  /**
   * Bake block textures for the layouts the player can enter next (each mode has its own cell
   * size) during idle menu frames, so a mode's first frame does not stall on texture baking.
   * Versus sizes (its main board and the CPU's mini board) also get the common garbage slabs,
   * which would otherwise be baked mid-match. Replaces any pending warmup.
   */
  prewarm(mainSizes: readonly number[], versus?: { main: number; opponent: number }): void {
    const jobs: WarmJob[] = [...new Set(mainSizes)].map((size) => ({
      view: 'main',
      size,
      slabs: size === versus?.main,
    }));
    if (versus) jobs.push({ view: 'opponent', size: versus.opponent, slabs: true });
    this.warmQueue = jobs;
  }

  private runWarmup(): void {
    const deadline = performance.now() + WARMUP_BUDGET_MS;
    const outOfTime = (): boolean => performance.now() >= deadline;
    while (this.warmQueue.length > 0) {
      const job = this.warmQueue[0]!;
      const view = job.view === 'main' ? this.board : this.ensureOpponentView();
      if (!view.warmup(job.size, outOfTime, job.slabs)) return;
      this.warmQueue.shift();
      if (outOfTime()) return;
    }
  }

  render(sim: SimState, alpha: number, dt: number, hints: BoardRenderHints, danger: number): void {
    // Only while the board is hidden (menus): never compete with gameplay frames.
    if (this.warmQueue.length > 0 && !this.world.visible) this.runWarmup();
    this.excitement = Math.max(0, this.excitement - dt * 0.8);
    this.bg.setIntensity(Math.max(danger, this.excitement));
    this.bg.update(dt);
    this.board.render(sim, alpha, dt, hints);
    this.particles.update(dt);
    this.popups.update(dt);
    this.bolts.update(dt);
    this.flashOverlay.update(dt);
    const o = this.shaker.update(dt);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.world.pivot.set(w / 2, h / 2);
    this.world.position.set(w / 2 + o.x, h / 2 + o.y);
    this.world.rotation = o.rotation;
  }

  burst(sim: SimState, row: number, col: number, color: number, chain: number): void {
    const layout = this.layout;
    if (!layout) return;
    const p = cellCenter(layout, row, col, riseFraction(sim));
    const base = this.palette.blocks[color]?.base ?? 0xffffff;
    const k = layout.cellSize / 48;
    const count = 12 + Math.min(10, (chain - 1) * 3);
    this.particles.burst(p.x, p.y, base, {
      count: this.reduced ? Math.ceil(count * 0.35) : count,
      speed: 230 * k * (1 + 0.08 * (chain - 1)),
      radius: layout.cellSize * 0.3,
      scale: 0.85 * k,
      life: 0.55,
    });
  }

  popup(
    sim: SimState,
    text: string,
    row: number,
    col: number,
    tone: PopupToneName,
    scale: number,
  ): void {
    const layout = this.layout;
    if (!layout) return;
    const p = cellCenter(layout, row, col, riseFraction(sim));
    // Keep labels inside the board horizontally.
    const half = layout.boardWidth / 2;
    const cx = layout.originX + half;
    const x = cx + Math.max(-half * 0.55, Math.min(half * 0.55, p.x - cx));
    const ui = this.palette.ui;
    const color =
      tone === 'chain'
        ? ui.accent2
        : tone === 'combo'
          ? ui.accent
          : tone === 'level'
            ? ui.success
            : mixColor(ui.gold, 0xffffff, 0.1);
    const k = layout.cellSize / 50;
    const inset = layout.cellSize * 0.12;
    this.popups.spawn(text, x, p.y, color, {
      scale: scale * k,
      life: tone === 'score' ? 0.95 : 1.25,
      rise: layout.cellSize * (tone === 'score' ? 0.9 : 1.2),
      minX: layout.originX + inset,
      maxX: layout.originX + layout.boardWidth - inset,
    });
  }

  /**
   * Versus: show (layout) or hide (null) the opponent's mini board. It sits in the shaking world,
   * below the player's effects.
   */
  setOpponentLayout(layout: GameLayout | null, cols = 6): void {
    this.opponentLayout = layout;
    if (!layout) {
      if (this.opponentView) this.opponentView.visible = false;
      return;
    }
    const view = this.ensureOpponentView();
    view.visible = true;
    view.setLayout(layout, cols);
  }

  private ensureOpponentView(): BoardView {
    if (!this.opponentView) {
      this.opponentView = new BoardView(this.app.renderer, this.palette);
      this.opponentView.setFrameColors([0xff8a3d, 0xff3b6b]);
      this.opponentView.visible = false;
      this.world.addChildAt(this.opponentView, 1);
    }
    return this.opponentView;
  }

  get opponent(): BoardView | null {
    return this.opponentLayout ? this.opponentView : null;
  }

  renderOpponent(sim: SimState, alpha: number, dt: number): void {
    this.opponent?.render(sim, alpha, dt, { heldBlockId: null, cursor: null, raising: false });
  }

  /** Particle burst at a cell of the opponent's mini board. */
  burstOpponent(sim: SimState, row: number, col: number, color: number): void {
    const layout = this.opponentLayout;
    if (!layout) return;
    const p = cellCenter(layout, row, col, riseFraction(sim));
    const base = this.palette.blocks[color]?.base ?? 0xffffff;
    const k = layout.cellSize / 48;
    this.particles.burst(p.x, p.y, base, {
      count: this.reduced ? 3 : 7,
      speed: 230 * k,
      radius: layout.cellSize * 0.3,
      scale: 0.85 * k,
      life: 0.45,
    });
  }

  /** Energy bolt between two canvas points (versus attacks). */
  bolt(x0: number, y0: number, x1: number, y1: number, color: number, opts?: BoltOptions): void {
    this.bolts.fire(x0, y0, x1, y1, color, opts);
  }

  /** Sparks at an arbitrary canvas point (bolt impacts, garbage landings). */
  sparks(x: number, y: number, color: number, count = 10, scale = 1): void {
    this.particles.burst(x, y, color, {
      count: this.reduced ? Math.ceil(count * 0.35) : count,
      speed: 260 * scale,
      radius: 6 * scale,
      scale: 0.8 * scale,
      life: 0.5,
    });
  }

  shake(amount: number): void {
    this.shaker.add(amount);
  }

  flash(tone: 'chain' | 'gameOver'): void {
    const k = this.reduced ? 0.4 : 1;
    if (tone === 'chain') this.flashOverlay.flash(this.palette.ui.accent2, 0.22 * k, 0.3);
    else this.flashOverlay.flash(this.palette.ui.danger, 0.45 * k, 0.6);
  }

  /** Reduced motion: no screen shake, fewer particles, softer flashes. */
  set reducedMotion(on: boolean) {
    this.reduced = on;
    this.shaker.enabled = !on;
    this.bolts.reduced = on;
  }

  get reducedMotion(): boolean {
    return this.reduced;
  }

  /** Switch the block / effect palette (e.g. the high-contrast accessibility setting). */
  setPalette(palette: Palette): void {
    if (palette === this.palette) return;
    this.palette = palette;
    this.board.setPalette(palette);
    this.opponentView?.setPalette(palette);
  }

  get paletteName(): string {
    return this.palette.name;
  }

  /** Hide the board and its effects (menus show only the backdrop). */
  setBoardVisible(visible: boolean): void {
    this.world.visible = visible;
  }

  /** Live particles / popups (perf probe). */
  get effectCounts(): { particles: number; popups: number } {
    return { particles: this.particles.activeCount, popups: this.popups.activeCount };
  }

  clearEffects(): void {
    this.particles.clear();
    this.popups.clear();
    this.bolts.clear();
    this.excitement = 0;
  }
}
