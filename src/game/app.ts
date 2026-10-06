import { AudioEngine } from '../audio';
import { cloneSim } from '../core/sim';
import type { SimState } from '../core/types';
import { dangerColumns } from '../core/view';
import { t, initI18n } from '../i18n';
import { bindKeyboardInput, bindPointerInput } from '../input/dom';
import { geometryForSim, type BoardGeometry } from '../input/geometry';
import { createPlatform, type Platform } from '../platform';
import { cellCenter, computeLayout, readSafeInsets, type GameLayout } from '../render/board/layout';
import { GameScene } from '../render/scene';
import { mountUi } from '../ui/mount';
import { feedbackForEvents, musicIntensity, type Feedback } from './feedback';
import { GameLoop } from './loop';
import { EndlessSession } from './session';
import { INITIAL_UI_STATE, type GameActions, type GameUiState } from './state';
import { createStore, type Store } from './store';
import type { SwaplightTestApi } from './testApi';

export const BEST_SCORE_KEY = 'endless.best';
/** Delay between the top-out and the game over panel (lets the flash/shake play). */
const GAME_OVER_PANEL_DELAY_MS = 750;

function randomSeed(): string {
  return Math.floor(Math.random() * 0x7fffffff).toString(36);
}

/** Boot the Endless game: canvas scene, input, audio, platform services, HUD and test hooks. */
export async function bootGame(stage: HTMLElement, uiRoot: HTMLElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const testMode = params.has('test') || import.meta.env.DEV;
  const fixedSeed = params.get('seed');
  const nextSeed = (): string => fixedSeed ?? randomSeed();

  const platform: Platform = createPlatform();
  await initI18n(platform.storage).catch(() => undefined);
  const scene = await GameScene.create(stage);
  const audio = new AudioEngine();
  audio.installUnlockListeners();

  const store: Store<GameUiState> = createStore({ ...INITIAL_UI_STATE });
  let layout: GameLayout | null = null;
  const geometry = (): BoardGeometry | null =>
    layout ? geometryForSim(layout, session.sim) : null;
  const session = new EndlessSession(nextSeed(), geometry);

  let frozen = false;
  let gameOverTimer: number | undefined;

  const relayout = (): void => {
    const { width, height } = scene.app.screen;
    const { rows, cols } = session.sim.config;
    layout = computeLayout(width, height, readSafeInsets(), { rows, cols });
    scene.setLayout(layout, cols);
    store.set({
      hudTop: layout.hudTop,
      hudHeight: layout.hudHeight,
      boardLeft: layout.originX - layout.framePad,
      boardWidth: layout.boardWidth + 2 * layout.framePad,
    });
  };
  relayout();
  scene.app.renderer.on('resize', relayout);

  void platform.storage
    .get<number>(BEST_SCORE_KEY)
    .then((v) => {
      if (typeof v === 'number' && Number.isFinite(v)) store.set({ best: v });
    })
    .catch(() => undefined);

  let flashKey = 0;
  const applyFeedback = (list: readonly Feedback[], sim: SimState): void => {
    for (const f of list) {
      switch (f.kind) {
        case 'sfx':
          audio.play(f.sfx, f.a ?? 0, f.b ?? 0);
          break;
        case 'haptic':
          platform.haptics.impact(f.strength);
          break;
        case 'popup':
          scene.popup(sim, f.text, f.row, f.col, f.tone, f.scale);
          break;
        case 'burst':
          scene.burst(sim, f.row, f.col, f.color, f.chain);
          break;
        case 'shake':
          scene.shake(f.amount);
          break;
        case 'flash':
          scene.flash(f.tone);
          break;
        case 'excite':
          scene.excite(f.amount);
          break;
        case 'scored':
          store.set({ scoreFlash: { ...f, key: ++flashKey } });
          break;
      }
    }
  };

  const publish = (sim: SimState): void => {
    store.set({
      score: sim.score,
      level: sim.level,
      seconds: Math.floor(sim.tick / 60),
      maxChain: sim.stats.maxChain,
      danger: sim.danger,
    });
  };

  const enterGameOver = (): void => {
    loop.pause();
    const sim = session.sim;
    const best = store.get().best;
    const newBest = sim.score > best;
    if (newBest) {
      store.set({ best: sim.score });
      void platform.storage.set(BEST_SCORE_KEY, sim.score).catch(() => undefined);
    }
    store.set({ newBest });
    audio.setIntensity(0.15);
    window.clearTimeout(gameOverTimer);
    gameOverTimer = window.setTimeout(() => {
      if (session.sim === sim && sim.gameOver) store.set({ screen: 'gameOver' });
    }, GAME_OVER_PANEL_DELAY_MS);
  };

  let lastIntensity = -1;
  const onTick = (): void => {
    if (store.get().screen !== 'playing') return;
    const sim = session.sim;
    if (sim.gameOver) return;
    const events = session.tick(performance.now());
    scene.board.captureTick(sim);
    const nearTop = dangerColumns(sim).length > 0;
    applyFeedback(
      feedbackForEvents(events, {
        tick: sim.tick,
        danger: sim.danger,
        rows: sim.config.rows,
        cols: sim.config.cols,
        translate: t,
      }),
      sim,
    );
    const intensity = Math.round(musicIntensity(sim.level, sim.danger, nearTop) * 20) / 20;
    if (intensity !== lastIntensity) {
      lastIntensity = intensity;
      audio.setIntensity(intensity);
    }
    publish(sim);
    if (sim.gameOver) enterGameOver();
  };

  const loop = new GameLoop({
    onTick,
    onRender(alpha, dt) {
      const sim = session.sim;
      const hints = session.gesture.hints;
      const danger = sim.danger ? 1 : dangerColumns(sim).length > 0 ? 0.35 : 0;
      scene.render(
        sim,
        alpha,
        dt,
        {
          heldBlockId: hints.heldBlockId,
          cursor: session.keyboardActive && !sim.gameOver ? session.keyboard.cursor : null,
          raising: hints.raising,
        },
        store.get().screen === 'title' ? 0 : danger,
      );
    },
  });
  scene.app.ticker.add((ticker) => loop.frame(ticker.deltaMS));

  const startGame = (): void => {
    window.clearTimeout(gameOverTimer);
    session.restart(nextSeed());
    scene.board.resetTracking();
    scene.board.captureTick(session.sim);
    scene.clearEffects();
    loop.reset();
    lastIntensity = -1;
    publish(session.sim);
    store.set({ screen: 'playing', newBest: false, scoreFlash: null });
    audio.playMusic('game', { seed: session.sim.rng.a >>> 0, intensity: 0.2 });
    if (!frozen) loop.resume();
  };

  const pauseGame = (): void => {
    if (store.get().screen !== 'playing' || session.sim.gameOver) return;
    loop.pause();
    session.gesture.reset();
    session.keyboard.releaseAll();
    store.set({ screen: 'paused' });
  };

  const resumeGame = (): void => {
    if (store.get().screen !== 'paused') return;
    store.set({ screen: 'playing' });
    if (!frozen) loop.resume();
  };

  const toMenu = (): void => {
    window.clearTimeout(gameOverTimer);
    loop.pause();
    session.restart(nextSeed());
    scene.board.resetTracking();
    scene.board.captureTick(session.sim);
    scene.clearEffects();
    publish(session.sim);
    store.set({ screen: 'title', scoreFlash: null });
    audio.playMusic('menu');
  };

  const actions: GameActions = {
    play() {
      void audio.unlock();
      audio.uiConfirm();
      startGame();
    },
    pause() {
      audio.uiTap();
      pauseGame();
    },
    resume() {
      void audio.unlock();
      audio.uiTap();
      resumeGame();
    },
    retry() {
      void audio.unlock();
      audio.uiConfirm();
      startGame();
    },
    menu() {
      audio.uiTap();
      toMenu();
    },
  };

  bindPointerInput(scene.canvas, session.gesture, () => {
    const geo = geometry();
    if (!geo) throw new Error('layout not ready');
    return geo;
  });
  bindKeyboardInput(window, session.keyboard);

  platform.lifecycle.onPause(() => {
    pauseGame();
    void audio.suspend();
  });
  platform.lifecycle.onResume(() => {
    void audio.resume();
  });
  platform.lifecycle.onBackButton(() => {
    const screen = store.get().screen;
    if (screen === 'playing') actions.pause();
    else if (screen === 'paused') actions.resume();
  });

  scene.board.captureTick(session.sim);
  audio.playMusic('menu');
  mountUi(uiRoot, store, actions);

  if (testMode) {
    const api: SwaplightTestApi = {
      ready: true,
      start: () => startGame(),
      pause() {
        frozen = true;
        loop.pause();
      },
      resume() {
        frozen = false;
        if (store.get().screen === 'playing' && !session.sim.gameOver) loop.resume();
      },
      stepTicks(n: number) {
        loop.stepTicks(Math.max(0, Math.floor(n)));
      },
      swap(row: number, col: number) {
        session.queue({ type: 'swap', row, col });
      },
      getState() {
        const sim = session.sim;
        return {
          screen: store.get().screen,
          seed: session.seed,
          tick: sim.tick,
          score: sim.score,
          level: sim.level,
          chain: sim.chain,
          danger: sim.danger,
          gameOver: sim.gameOver,
          frozen,
          stats: { ...sim.stats },
          eventCounts: { ...session.eventCounts } as Record<string, number>,
          sprites: scene.board.spriteCount,
          layout: layout
            ? { cellSize: layout.cellSize, originX: layout.originX, originY: layout.originY }
            : { cellSize: 0, originX: 0, originY: 0 },
        };
      },
      getSim: () => cloneSim(session.sim),
      stopRendering: () => scene.app.ticker.stop(),
      startRendering: () => scene.app.ticker.start(),
      renderFrames(n: number, dtMs = 1000 / 60) {
        for (let i = 0; i < n; i++) loop.frame(dtMs);
        scene.app.render();
      },
      cellCenter(row: number, col: number) {
        if (!layout) return { x: 0, y: 0 };
        const geo = geometryForSim(layout, session.sim);
        return cellCenter(layout, row, col, geo.riseOffsetPx / layout.cellSize);
      },
    };
    window.__swaplight = api;
  }
}
