import { Application, Container } from 'pixi.js';
import type { SimState } from '../core/types';
import { riseFraction } from '../core/sim';
import { BoardView, type BoardRenderHints } from './board/BoardView';
import { cellCenter, type GameLayout } from './board/layout';
import { NeonBackground } from './style/background';
import { mixColor } from './style/colorMath';
import { FlashOverlay, FloatingTextPool, ParticleBurstPool, ScreenShake } from './style/effects';
import { NEON_PALETTE, type Palette } from './style/palette';

export type PopupToneName = 'chain' | 'combo' | 'score' | 'level';

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
  private layout: GameLayout | null = null;
  private excitement = 0;
  private readonly palette: Palette = NEON_PALETTE;

  private constructor(app: Application) {
    this.app = app;
    const { width, height } = app.screen;
    this.bg = new NeonBackground({ width, height, seed: 3, horizon: 0.62 });
    this.board = new BoardView(app.renderer, this.palette);
    this.particles = new ParticleBurstPool({ seed: 11 });
    this.popups = new FloatingTextPool(16, Math.max(2, app.renderer.resolution));
    this.flashOverlay = new FlashOverlay(width, height);
    this.world.addChild(this.board, this.particles, this.popups);
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

  render(sim: SimState, alpha: number, dt: number, hints: BoardRenderHints, danger: number): void {
    this.excitement = Math.max(0, this.excitement - dt * 0.8);
    this.bg.setIntensity(Math.max(danger, this.excitement));
    this.bg.update(dt);
    this.board.render(sim, alpha, dt, hints);
    this.particles.update(dt);
    this.popups.update(dt);
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
    this.particles.burst(p.x, p.y, base, {
      count: 12 + Math.min(10, (chain - 1) * 3),
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
    this.popups.spawn(text, x, p.y, color, {
      scale: scale * k,
      life: tone === 'score' ? 0.95 : 1.25,
      rise: layout.cellSize * (tone === 'score' ? 0.9 : 1.2),
    });
  }

  shake(amount: number): void {
    this.shaker.add(amount);
  }

  flash(tone: 'chain' | 'gameOver'): void {
    if (tone === 'chain') this.flashOverlay.flash(this.palette.ui.accent2, 0.22, 0.3);
    else this.flashOverlay.flash(this.palette.ui.danger, 0.45, 0.6);
  }

  set reducedMotion(on: boolean) {
    this.shaker.enabled = !on;
  }

  clearEffects(): void {
    this.particles.clear();
    this.excitement = 0;
  }
}
