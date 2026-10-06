/**
 * Dev-only visual review page for the neon style kit (served at /gallery.html).
 * Shows every block variant, the animated backdrop and buttons that fire each effect.
 */
import '../../ui/styles.css';
import { Application, Container, Sprite, Text } from 'pixi.js';
import { NeonBackground } from './background';
import { BlockTextureFactory, createBlockSprite } from './blockTextures';
import type { BlockKind, BlockState, BlockTextureSet } from './blockTextures';
import {
  FlashOverlay,
  FloatingTextPool,
  ParticleBurstPool,
  ScreenShake,
  neonTextStyle,
} from './effects';
import { HIGH_CONTRAST_PALETTE, NEON_PALETTE } from './palette';
import type { Palette } from './palette';

const TILE = 48;
const GAP = 8;
const BIG = 72;

interface GalleryApi {
  ready: boolean;
  trigger(name: 'pop' | 'chain' | 'shake' | 'flash' | 'danger' | 'palette'): void;
}

declare global {
  interface Window {
    __gallery?: GalleryApi;
  }
}

async function boot(): Promise<void> {
  const host = document.getElementById('stage');
  const controls = document.getElementById('gallery-controls');
  if (!host || !controls) throw new Error('Missing gallery roots');

  const app = new Application();
  await app.init({
    resizeTo: window,
    // Tiles are baked with antialiasing; MSAA on the main canvas only costs fill rate.
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    background: NEON_PALETTE.background.top,
    preference: 'webgl',
  });
  host.appendChild(app.canvas);

  let palette: Palette = NEON_PALETTE;
  const textures = new BlockTextureFactory(app.renderer, { palette });
  const bg = new NeonBackground({ width: app.screen.width, height: app.screen.height, seed: 3 });
  const world = new Container(); // shaken as a whole
  const content = new Container();
  const particles = new ParticleBurstPool({ seed: 11 });
  const popups = new FloatingTextPool(12, Math.max(2, app.renderer.resolution));
  const flash = new FlashOverlay(app.screen.width, app.screen.height);
  const shake = new ScreenShake();
  world.addChild(content, particles, popups);
  app.stage.addChild(bg, world, flash);

  let boardCenter = { x: 0, y: 0 };
  let boardTiles: { x: number; y: number; color: number }[] = [];

  const build = (): void => {
    content.removeChildren().forEach((c) => c.destroy({ children: true }));
    boardTiles = [];
    const w = app.screen.width;
    const cols = 6;
    const rowW = cols * TILE + (cols - 1) * GAP;
    const left = Math.round((w - rowW) / 2) + TILE / 2;
    let y = 34;

    const title = new Text({ text: 'SWAPLIGHT', style: neonTextStyle(palette.ui.accent, 30) });
    title.anchor.set(0.5);
    title.position.set(w / 2, y);
    content.addChild(title);
    y += 30;

    const caption = (label: string): void => {
      const t = new Text({
        text: label,
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 2.5,
          fill: palette.ui.textDim,
        },
      });
      t.position.set(left - TILE / 2, y);
      content.addChild(t);
      y += 16 + TILE / 2;
    };

    const glowLayer = new Container();
    const bodyLayer = new Container();
    content.addChild(glowLayer, bodyLayer);
    const place = (set: BlockTextureSet, x: number, yy: number): void => {
      const glow = new Sprite(set.glow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.position.set(x, yy);
      const body = new Sprite(set.body);
      body.anchor.set(0.5);
      body.position.set(x, yy);
      glowLayer.addChild(glow);
      bodyLayer.addChild(body);
    };

    const states: [BlockState, string][] = [
      ['normal', 'BLOCKS'],
      ['flash', 'FLASHING'],
      ['dimmed', 'PREVIEW ROW'],
    ];
    for (const [state, label] of states) {
      caption(label);
      for (let c = 0; c < cols; c++) {
        place(textures.getColor(c, TILE, state), left + c * (TILE + GAP), y);
      }
      y += TILE / 2 + 10;
    }

    caption('GARBAGE · WILD · BOMB');
    const specials: BlockKind[] = ['garbage', 'wild', 'bomb'];
    specials.forEach((kind, i) => {
      place(textures.get({ kind, size: TILE }), left + i * (TILE + GAP), y);
      place(textures.get({ kind, size: TILE, state: 'flash' }), left + (i + 3) * (TILE + GAP), y);
    });
    y += TILE + GAP + 2;
    // Garbage slab mock: three garbage tiles side by side, plus dimmed specials.
    specials.forEach((kind, i) => {
      place(textures.get({ kind, size: TILE, state: 'dimmed' }), left + (i + 3) * (TILE + GAP), y);
      place(textures.get({ kind: 'garbage', size: TILE }), left + i * (TILE + GAP), y);
    });
    y += TILE / 2 + 12;

    caption('DETAIL');
    const bigLeft = w / 2 - (BIG + 14);
    [0, 2, 'wild' as const].forEach((v, i) => {
      const set =
        v === 'wild'
          ? textures.get({ kind: 'wild', size: BIG })
          : textures.getColor(v, BIG, 'normal');
      const s = createBlockSprite(set);
      s.position.set(bigLeft + i * (BIG + 14), y + BIG / 2 - TILE / 2);
      content.addChild(s);
    });
    y += BIG + 8;

    caption('BOARD');
    // A tight 6×4 board mock (no gaps, like gameplay) with the preview row at the bottom.
    const layout = [
      [2, 0, 4, 1, 3, 2],
      [1, 'g', 'g', 'g', 0, 4],
      [3, 2, 'w', 0, 'b', 1],
      [0, 4, 1, 5, 2, 3],
    ] as const;
    const boardTop = y - TILE / 2;
    const boardLeft = Math.round(w / 2 - (cols * TILE) / 2);
    const well = new Container();
    content.addChildAt(well, content.getChildIndex(glowLayer));
    layout.forEach((row, r) => {
      row.forEach((cell, c) => {
        const x = boardLeft + c * TILE + TILE / 2;
        const yy = boardTop + r * TILE + TILE / 2;
        const state: BlockState = r === layout.length - 1 ? 'dimmed' : 'normal';
        const set =
          cell === 'g'
            ? textures.get({ kind: 'garbage', size: TILE, state })
            : cell === 'w'
              ? textures.get({ kind: 'wild', size: TILE, state })
              : cell === 'b'
                ? textures.get({ kind: 'bomb', size: TILE, state })
                : textures.getColor(cell, TILE, state);
        place(set, x, yy);
        if (typeof cell === 'number' && state === 'normal')
          boardTiles.push({ x, y: yy, color: cell });
      });
    });
    boardCenter = { x: w / 2, y: boardTop + TILE * 2 };
  };

  build();

  let danger = false;
  let step = 0;
  const api: GalleryApi = {
    ready: false,
    trigger(name) {
      step++;
      switch (name) {
        case 'pop': {
          const picks = boardTiles.filter((_, i) => (i + step) % 5 === 0).slice(0, 3);
          for (const t of picks) {
            const color = palette.blocks[t.color]?.base ?? 0xffffff;
            particles.burst(t.x, t.y, color, { radius: TILE * 0.3 });
          }
          const first = picks[0];
          if (first)
            popups.spawn('+1 240', first.x, first.y - 10, palette.ui.gold, { scale: 0.42 });
          break;
        }
        case 'chain': {
          const n = 2 + (step % 4);
          popups.spawn(`CHAIN ×${n}`, boardCenter.x, boardCenter.y, palette.ui.accent2, {
            scale: 0.55 + n * 0.05,
            life: 1.3,
          });
          for (const t of boardTiles.slice(0, 6)) {
            particles.burst(t.x, t.y, palette.blocks[t.color]?.base ?? 0xffffff, { count: 14 });
          }
          shake.add(0.25 + n * 0.08);
          bg.setIntensity(Math.min(1, n * 0.2));
          window.setTimeout(() => {
            if (!danger) bg.setIntensity(0);
          }, 900);
          break;
        }
        case 'shake':
          shake.add(0.7);
          break;
        case 'flash':
          flash.flash(palette.ui.accent, 0.45, 0.4);
          break;
        case 'danger':
          danger = !danger;
          bg.setIntensity(danger ? 1 : 0);
          break;
        case 'palette':
          palette = palette === NEON_PALETTE ? HIGH_CONTRAST_PALETTE : NEON_PALETTE;
          textures.setPalette(palette);
          bg.setPalette(palette);
          build();
          break;
      }
    },
  };

  const buttons: [Parameters<GalleryApi['trigger']>[0], string][] = [
    ['pop', 'Pop'],
    ['chain', 'Chain'],
    ['shake', 'Shake'],
    ['flash', 'Flash'],
    ['danger', 'Danger'],
    ['palette', 'Palette'],
  ];
  for (const [name, label] of buttons) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.fx = name;
    b.addEventListener('click', () => api.trigger(name));
    controls.appendChild(b);
  }
  const style = document.createElement('style');
  style.textContent = `
    #gallery-controls { position: absolute; left: 0; right: 0; bottom: calc(14px + env(safe-area-inset-bottom));
      display: flex; flex-wrap: nowrap; gap: 6px; justify-content: center; padding: 0 10px; }
    #gallery-controls button { font: 700 10px/1 system-ui, sans-serif; letter-spacing: .03em; flex: 1 1 0; min-width: 0; text-transform: uppercase;
      color: #eeeaff; background: rgba(20, 14, 44, .72); border: 1px solid rgba(30, 200, 255, .7);
      border-radius: 999px; padding: 8px 2px; box-shadow: 0 0 12px rgba(30, 200, 255, .35), inset 0 0 8px rgba(30, 200, 255, .2);
      cursor: pointer; touch-action: manipulation; }
    #gallery-controls button:active { background: rgba(30, 200, 255, .25); }`;
  document.head.appendChild(style);

  app.renderer.on('resize', (w: number, h: number) => {
    bg.resize(w, h);
    flash.resize(w, h);
    build();
  });

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    bg.update(dt);
    particles.update(dt);
    popups.update(dt);
    flash.update(dt);
    const o = shake.update(dt);
    world.pivot.set(app.screen.width / 2, app.screen.height / 2);
    world.position.set(app.screen.width / 2 + o.x, app.screen.height / 2 + o.y);
    world.rotation = o.rotation;
  });

  (globalThis as unknown as { __PIXI_APP__?: Application }).__PIXI_APP__ = app; // Pixi devtools
  api.ready = true;
  window.__gallery = api;
}

void boot();
