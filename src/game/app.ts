import type { Container } from 'pixi.js';
import { AudioEngine } from '../audio';
import { cloneSim } from '../core/sim';
import type { SimState } from '../core/types';
import { dangerColumns } from '../core/view';
import { t, initI18n, getLanguage, onLanguageChange, setLanguage } from '../i18n';
import { bindKeyboardInput, bindPointerInput } from '../input/dom';
import { geometryForSim, type BoardGeometry } from '../input/geometry';
import { createPlatform, MockPurchases, type Platform } from '../platform';
import { cellCenter, computeLayout, readSafeInsets, type GameLayout } from '../render/board/layout';
import { computeVersusLayout, type VersusLayout } from '../render/board/versusLayout';
import { GameScene } from '../render/scene';
import { HIGH_CONTRAST_PALETTE, NEON_PALETTE } from '../render/style/palette';
import { mountUi } from '../ui/mount';
import { createDailyMode } from './dailyMode';
import { chainShake, feedbackForEvents, musicIntensity, type Feedback } from './feedback';
import { GameLoop } from './loop';
import { startMode, type ModeHost, type ModeId } from './modes';
import { createPaywall } from './paywall';
import { summarizeSamples, type FrameSample } from './perf';
import {
  backAction,
  popOverlay,
  pushOverlay,
  showsBoard,
  versusNeedsLeaveConfirm,
  type Overlay,
} from './nav';
import { recordGame } from './progress';
import { createPuzzleMode } from './puzzleMode';
import { createTutorialMode } from './tutorialMode';
import { createRunMode } from './runMode';
import { SaveManager } from './save';
import { EndlessSession } from './session';
import { applySettings, sanitizeSettings, type Settings, type SettingsTargets } from './settings';
import {
  INITIAL_UI_STATE,
  type GameActions,
  type GameUiState,
  type PaywallReason,
  type PlayMode,
} from './state';
import { createStore, type Store } from './store';
import type { SwaplightTestApi } from './testApi';
import { createVersusMode } from './versusMode';

/** Board layout flavour (HUD height, versus split; 'static' = no preview strip). */
type LayoutMode = Exclude<PlayMode, 'puzzle' | 'tutorial'> | 'static';

/** Context line of the Full Version sheet when a locked menu mode is tapped. */
const PAYWALL_REASON_BY_MODE: Partial<Record<ModeId, PaywallReason>> = {
  versus: 'versus',
  daily: 'daily',
  puzzles: 'puzzles',
};

/** Delay between the top-out and the game over panel (lets the flash/shake play). */
const GAME_OVER_PANEL_DELAY_MS = 750;

function randomSeed(): string {
  return Math.floor(Math.random() * 0x7fffffff).toString(36);
}

/** Minimum play time (ticks) for a quit-to-menu game to count in the stats. */
const MIN_RECORDED_TICKS = 5 * 60;
const TOAST_MS = 2600;
const HINT_MS = 5200;
/** Space below the board for the RAISE button (56 px + gaps). */
const CONTROLS_HEIGHT = 80;
const CONTROLS_HINT_ID = 'endless.controls';

/**
 * Boot the app: platform services, save, canvas scene, input, audio, the Preact UI (menu, HUD,
 * settings…) and the test hooks.
 */
export async function bootGame(stage: HTMLElement, uiRoot: HTMLElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const testMode = params.has('test') || import.meta.env.DEV;
  const fixedSeed = params.get('seed');
  const nextSeed = (): string => fixedSeed ?? randomSeed();

  const platform: Platform = createPlatform();
  await initI18n(platform.storage).catch(() => undefined);
  const save = new SaveManager(platform.storage);
  await save.load();
  // Entitlement: render from the cached flag, refresh when the store answers.
  const purchasesReady = platform.purchases
    .init()
    .then(() => setFullVersion(platform.purchases.isFullVersion()))
    .catch(() => undefined);
  const scene = await GameScene.create(stage);
  const audio = new AudioEngine();
  audio.installUnlockListeners();

  const store: Store<GameUiState> = createStore({
    ...INITIAL_UI_STATE,
    settings: save.data.settings,
    modeStats: save.data.modes,
    fullVersion: save.data.fullVersion,
    best: save.data.modes.endless?.best ?? 0,
    language: getLanguage(),
    unlocks: [...save.data.unlocks],
    collectionSeen: save.data.collectionSeen,
    versusRecords: { ...save.data.versus },
    canShare: platform.clipboard.available,
    puzzleRecords: save.data.puzzles,
    tutorialDone: save.data.tutorialDone,
  });
  save.subscribe((data) =>
    store.set({
      settings: data.settings,
      modeStats: data.modes,
      fullVersion: data.fullVersion,
      unlocks: data.unlocks,
      collectionSeen: data.collectionSeen,
      versusRecords: data.versus,
      dailySave: { records: data.daily, streak: data.dailyStreak },
      puzzleRecords: data.puzzles,
      tutorialDone: data.tutorialDone,
    }),
  );

  function setFullVersion(value: boolean): void {
    if (save.data.fullVersion !== value) {
      save.update((d) => {
        d.fullVersion = value;
      });
    }
  }

  const settingsTargets: SettingsTargets = {
    setVolume: (channel, v) => audio.setVolume(channel, v),
    setHaptics: (on) => platform.haptics.setEnabled(on),
    setReducedMotion: (on) => {
      scene.reducedMotion = on;
    },
    setHighContrast: (on) => scene.setPalette(on ? HIGH_CONTRAST_PALETTE : NEON_PALETTE),
    setLanguage: (lang) => {
      void setLanguage(lang).catch(() => undefined);
    },
  };
  applySettings(save.data.settings, settingsTargets);
  onLanguageChange((language) => store.set({ language }));
  store.set({ language: getLanguage() });

  let toastKey = 0;
  let toastTimer: number | undefined;
  /** Screen the current toast belongs to: a screen change clears it (it never covers the next one). */
  let toastScreen: GameUiState['screen'] | null = null;
  const showToast = (text: string, ms = TOAST_MS): void => {
    toastScreen = store.get().screen;
    store.set({ toast: { text, ms, key: ++toastKey } });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => store.set({ toast: null }), ms);
  };
  store.subscribe((state) => {
    if (state.toast && state.screen !== toastScreen) {
      window.clearTimeout(toastTimer);
      store.set({ toast: null });
    }
  });

  const paywall = createPaywall({
    store,
    purchases: platform.purchases,
    ready: purchasesReady,
    setFullVersion,
    show: () => setOverlays(pushOverlay(store.get().overlays, 'paywall')),
    feedback: {
      tap: () => audio.uiTap(),
      celebrate() {
        audio.purchase();
        window.setTimeout(() => audio.itemUnlock(), 420);
        platform.haptics.notify('success');
      },
      warn: () => platform.haptics.notify('warning'),
    },
  });

  platform.purchases.onEntitlementChange((full) => {
    setFullVersion(full);
    paywall.entitlementChanged(full);
  });

  void purchasesReady.then(() => {
    if (!store.get().fullVersion) paywall.prefetch();
  });

  const flushSave = (): Promise<void> => save.flush();
  window.addEventListener('pagehide', () => {
    if (store.get().mode === 'run') runMode.persist();
    void flushSave();
  });

  let layout: GameLayout | null = null;
  const geometry = (): BoardGeometry | null =>
    layout ? geometryForSim(layout, session.sim) : null;
  const session = new EndlessSession(nextSeed(), geometry);

  let frozen = false;
  let gameOverTimer: number | undefined;
  let layoutMode: LayoutMode = 'endless';
  let versusLayout: VersusLayout | null = null;

  /** Board layout of a mode at the current screen size (Versus also returns its mini board). */
  const layoutFor = (mode: LayoutMode): { main: GameLayout; versus: VersusLayout | null } => {
    const { width, height } = scene.app.screen;
    const { rows, cols } = session.sim.config;
    const insets = readSafeInsets();
    if (mode === 'versus') {
      const v = computeVersusLayout(width, height, insets, {
        rows,
        cols,
        bottomMargin: CONTROLS_HEIGHT,
      });
      return { main: v.main, versus: v };
    }
    const main = computeLayout(width, height, insets, {
      rows,
      cols,
      bottomMargin: CONTROLS_HEIGHT,
      // The Run / Daily HUD adds the goal bar and the relic / twist row.
      ...(mode === 'run' || mode === 'daily'
        ? { hudFraction: 0.235, minHud: 176, maxHud: 214 }
        : {}),
      // Puzzle / tutorial boards never rise: no preview strip. Their HUD (title + pause row,
      // goal card + moves / coach card) needs a taller band than Endless.
      ...(mode === 'static'
        ? { previewCells: 0, hudFraction: 0.25, minHud: 164, maxHud: 214 }
        : {}),
    });
    return { main, versus: null };
  };

  /** Bake every mode's block textures in idle menu frames (see `GameScene.prewarm`). */
  const prewarmLayouts = (): void => {
    const all = (['endless', 'run', 'static', 'versus'] as const).map(layoutFor);
    const versus = all.find((l) => l.versus)?.versus;
    scene.prewarm(
      all.map((l) => l.main.cellSize),
      versus ? { main: versus.main.cellSize, opponent: versus.mini.cellSize } : undefined,
    );
  };

  const relayout = (): void => {
    const { cols } = session.sim.config;
    const next = layoutFor(layoutMode);
    versusLayout = next.versus;
    layout = next.main;
    if (versusLayout) {
      const { mini, queue, miniQueue, card } = versusLayout;
      store.set({
        versusLayout: {
          queue,
          miniQueue,
          card,
          mini: {
            x: mini.originX - mini.framePad,
            y: mini.originY - mini.framePad,
            w: mini.boardWidth + 2 * mini.framePad,
            h: mini.boardHeight + mini.previewHeight + 2 * mini.framePad,
          },
        },
      });
    } else {
      store.set({ versusLayout: null });
    }
    scene.setLayout(layout, cols);
    scene.setOpponentLayout(versusLayout?.mini ?? null, cols);
    store.set({
      controlsTop:
        layout.originY + layout.boardHeight + layout.previewHeight + layout.framePad + 10,
      hudTop: layout.hudTop,
      hudHeight: layout.hudHeight,
      boardLeft: layout.originX - layout.framePad,
      boardWidth: layout.boardWidth + 2 * layout.framePad,
    });
  };
  relayout();
  prewarmLayouts();
  scene.app.renderer.on('resize', () => {
    relayout();
    prewarmLayouts();
  });
  const setLayoutMode = (mode: LayoutMode): void => {
    layoutMode = mode;
    relayout();
  };

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
        case 'garbageBurst':
          scene.burst(sim, f.row, f.col, f.color, 2);
          break;
        case 'scored':
          if (store.get().settings.showBreakdown || store.get().mode === 'run') {
            store.set({ scoreFlash: { ...f, key: ++flashKey } });
          }
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

  /** Fold the current game into the save; returns whether it set a new best. */
  const recordCurrentGame = (): boolean => {
    const sim = session.sim;
    let newBest = false;
    save.update((d) => {
      newBest = recordGame(d, 'endless', {
        score: sim.score,
        maxChain: sim.stats.maxChain,
        maxCombo: sim.stats.maxCombo,
        blocksCleared: sim.stats.blocksCleared,
        seconds: Math.floor(sim.tick / 60),
      });
    });
    return newBest;
  };

  const enterGameOver = (): void => {
    loop.pause();
    session.setRaiseButton(false);
    store.set({ raiseHeld: false });
    const sim = session.sim;
    const newBest = recordCurrentGame();
    store.set({ newBest, best: save.data.modes.endless?.best ?? sim.score });
    void flushSave();
    audio.setIntensity(0.15);
    window.clearTimeout(gameOverTimer);
    gameOverTimer = window.setTimeout(() => {
      if (session.sim === sim && sim.gameOver) store.set({ screen: 'gameOver' });
    }, GAME_OVER_PANEL_DELAY_MS);
  };

  let lastIntensity = -1;
  const onTick = (): void => {
    if (store.get().screen !== 'playing') return;
    const mode = store.get().mode;
    if (mode === 'versus' && !versusMode.opponentSim) return;
    const sim = session.sim;
    if (sim.gameOver) return;
    const events =
      mode === 'versus' ? versusMode.tick(performance.now()) : session.tick(performance.now());
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
    if (mode === 'run') runMode.afterTick(events);
    else if (mode === 'versus') versusMode.afterTick();
    else if (mode === 'daily') dailyMode.afterTick();
    else if (mode === 'puzzle') puzzleMode.afterTick(events);
    else if (mode === 'tutorial') tutorialMode.afterTick(events);
    else if (sim.gameOver) enterGameOver();
  };

  /** Perf probe (`api.perf`): time spent in `onTick` during the current frame. */
  let profiling = false;
  let tickMs = 0;
  const loop = new GameLoop({
    onTick: () => {
      if (!profiling) return onTick();
      const t = performance.now();
      onTick();
      tickMs += performance.now() - t;
    },
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
        store.get().screen === 'menu' ? 0 : danger,
      );
      const opp = versusMode.opponentSim;
      if (opp && store.get().mode === 'versus') scene.renderOpponent(opp, alpha, dt);
    },
  });
  scene.app.ticker.add((ticker) => loop.frame(ticker.deltaMS));

  const startGame = (): void => {
    window.clearTimeout(gameOverTimer);
    leaveCurrentMode();
    store.set({ mode: 'endless' });
    session.restart(nextSeed());
    setLayoutMode('endless');
    scene.board.resetTracking();
    scene.board.captureTick(session.sim);
    scene.clearEffects();
    loop.reset();
    lastIntensity = -1;
    publish(session.sim);
    store.set({
      screen: 'playing',
      raiseHeld: false,
      overlays: [],
      newBest: false,
      scoreFlash: null,
      best: save.data.modes.endless?.best ?? 0,
    });
    audio.playMusic('game', { seed: session.sim.rng.a >>> 0, intensity: 0.2 });
    if (!frozen) loop.resume();
    if (!save.data.hintsSeen.includes(CONTROLS_HINT_ID)) {
      save.update((d) => {
        d.hintsSeen.push(CONTROLS_HINT_ID);
      });
      showToast(t('hud.controlsHint'), HINT_MS);
    }
  };

  const setRaise = (active: boolean): void => {
    const on = active && store.get().screen === 'playing';
    session.setRaiseButton(on);
    store.set({ raiseHeld: on });
  };

  const pauseGame = (): void => {
    if (store.get().screen !== 'playing' || session.sim.gameOver) return;
    loop.pause();
    session.gesture.reset();
    session.keyboard.releaseAll();
    setRaise(false);
    store.set({ screen: 'paused', charmMenu: null, targeting: null });
    if (store.get().mode === 'run') runMode.persist();
  };

  const resumeGame = (): void => {
    if (store.get().screen !== 'paused') return;
    store.set({ screen: 'playing' });
    if (!frozen) loop.resume();
  };

  const toMenu = (): void => {
    window.clearTimeout(gameOverTimer);
    loop.pause();
    const sim = session.sim;
    const screen = store.get().screen;
    const mode = store.get().mode;
    if (mode !== 'endless') {
      // Run is kept saved; Versus / Daily / Puzzle / Tutorial are closed (nothing to record here).
      leaveCurrentMode();
    } else if ((screen === 'playing' || screen === 'paused') && !sim.gameOver) {
      if (sim.tick >= MIN_RECORDED_TICKS) recordCurrentGame();
    }
    session.restart(nextSeed());
    setLayoutMode('endless');
    scene.board.resetTracking();
    scene.board.captureTick(session.sim);
    scene.clearEffects();
    publish(session.sim);
    store.set({
      screen: 'menu',
      mode: 'endless',
      overlays: [],
      scoreFlash: null,
      charmMenu: null,
      targeting: null,
      danger: false,
      raiseHeld: false,
    });
    audio.playMusic('menu');
  };

  const setOverlays = (overlays: Overlay[]): void => store.set({ overlays });

  const updateSettings = (patch: Partial<Settings>): void => {
    const prev = save.data.settings;
    const next = sanitizeSettings({ ...prev, ...patch });
    save.update((d) => {
      d.settings = next;
    });
    applySettings(next, settingsTargets, prev);
  };

  const runMode = createRunMode({
    store,
    save,
    audio,
    haptics: platform.haptics,
    scene,
    session,
    loop,
    isFrozen: () => frozen,
    showToast: (text) => showToast(text),
    openPaywall: (reason) => paywall.open(reason),
    setLayoutMode,
    geometry,
    resetBoard() {
      scene.board.resetTracking();
      scene.board.captureTick(session.sim);
      scene.clearEffects();
      loop.reset();
      lastIntensity = -1;
      publish(session.sim);
      store.set({ scoreFlash: null, raiseHeld: false });
    },
    randomSeed: nextSeed,
    toMenu: () => toMenu(),
  });

  /** Services shared by the board modes (Puzzle, Tutorial, Versus, Daily). */
  const boardModeHost = {
    store,
    save,
    audio,
    haptics: platform.haptics,
    scene,
    session,
    loop,
    isFrozen: () => frozen,
    showToast: (text: string) => showToast(text),
    openPaywall: (reason: PaywallReason) => paywall.open(reason),
    setLayoutMode,
    geometry,
    resetBoard() {
      scene.board.resetTracking();
      scene.board.captureTick(session.sim);
      scene.clearEffects();
      loop.reset();
      lastIntensity = -1;
      publish(session.sim);
      store.set({ scoreFlash: null, raiseHeld: false });
    },
  };

  const versusMode = createVersusMode({
    ...boardModeHost,
    versusLayout: () => versusLayout,
    randomSeed: nextSeed,
    toMenu: () => toMenu(),
  });

  const dailyMode = createDailyMode({
    ...boardModeHost,
    clipboard: platform.clipboard,
    toMenu: () => toMenu(),
  });
  // The menu's daily countdown rolls over at midnight.
  window.setInterval(() => dailyMode.syncToday(), 30_000);

  const puzzleMode = createPuzzleMode(boardModeHost);
  const tutorialMode = createTutorialMode({
    ...boardModeHost,
    toMenu: () => toMenu(),
    startRun: () => runMode.open(),
  });

  /**
   * Leave the mode that owns the board before another flow takes over: Run is kept saved, Versus /
   * Daily / Puzzle / Tutorial are closed. Endless has nothing to clean up.
   */
  function leaveCurrentMode(): void {
    const mode = store.get().mode;
    if (mode === 'run') runMode.suspend();
    else if (mode === 'versus') versusMode.leave();
    else if (mode === 'daily') dailyMode.leave();
    else if (mode === 'puzzle') puzzleMode.leave();
    else if (mode === 'tutorial') tutorialMode.leave();
  }

  const modeHost: ModeHost = {
    startEndless: () => startGame(),
    startRun: () => runMode.open(),
    startVersus: () => {
      leaveCurrentMode();
      versusMode.open();
    },
    startDaily: () => {
      leaveCurrentMode();
      dailyMode.open();
    },
    startPuzzles: () => {
      leaveCurrentMode();
      puzzleMode.open();
    },
    startTutorial: () => {
      leaveCurrentMode();
      tutorialMode.open();
    },
  };

  const handleBack = (): void => {
    const { screen, overlays, mode, charmMenu, targeting, puzzle } = store.get();
    const charmOpen = mode === 'run' && (charmMenu !== null || targeting !== null);
    const hintOpen = mode === 'puzzle' && puzzle.hintCard !== null;
    const cardOpen = charmOpen || hintOpen;
    const action = backAction(screen, overlays, cardOpen);
    switch (action.type) {
      case 'closeOverlay':
        audio.uiTap();
        setOverlays(popOverlay(overlays));
        break;
      case 'closeCard':
        if (charmOpen) runMode.actions.cancelCharm();
        else puzzleMode.actions.closeHint();
        break;
      case 'pause':
        actions.pause();
        break;
      case 'resume':
        actions.resume();
        break;
      case 'toMenu':
        // Leaving an undecided Versus match forfeits it: confirm first.
        if (versusNeedsLeaveConfirm(store.get())) {
          audio.uiTap();
          setOverlays(pushOverlay(overlays, 'leaveConfirm'));
        } else {
          actions.menu();
        }
        break;
      case 'toRunMap':
        runMode.backToMap();
        break;
      case 'toPuzzlePacks':
        puzzleMode.actions.toPacks();
        break;
      case 'toPuzzleLevels':
        puzzleMode.backFromResult();
        break;
      case 'confirmExit':
        audio.uiTap();
        setOverlays(pushOverlay(overlays, 'exitConfirm'));
        break;
      case 'none':
        break;
    }
  };

  /**
   * A Full-Version mode card tapped while locked. When that paywall closes (close button, "Let's
   * play" or back) with the Full Version owned and the menu still showing, the mode starts.
   */
  let lockedModeTapped: ModeId | null = null;
  let paywallShown = false;
  store.subscribe((s) => {
    const shown = s.overlays.includes('paywall');
    if (shown === paywallShown) return;
    paywallShown = shown;
    if (shown) return;
    const id = lockedModeTapped;
    lockedModeTapped = null;
    if (!id || !s.fullVersion) return;
    queueMicrotask(() => {
      const now = store.get();
      if (now.screen !== 'menu' || now.overlays.length > 0) return;
      if (startMode(id, modeHost, true) === 'playable') audio.uiConfirm();
    });
  });

  const actions: GameActions = {
    play() {
      void audio.unlock();
      audio.uiConfirm();
      startGame();
    },
    startMode(id) {
      void audio.unlock();
      const status = startMode(id, modeHost, store.get().fullVersion);
      if (status === 'playable') {
        audio.uiConfirm();
      } else {
        audio.uiTap();
        platform.haptics.notify('warning');
        if (status === 'locked') {
          lockedModeTapped = id;
          paywall.open(PAYWALL_REASON_BY_MODE[id] ?? 'menu');
        } else if (status === 'soon') showToast(t('menu.soonHint'));
      }
    },
    pause() {
      audio.uiTap();
      pauseGame();
    },
    setRaise(active) {
      setRaise(active);
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
    openOverlay(overlay) {
      void audio.unlock();
      audio.uiTap();
      setOverlays(pushOverlay(store.get().overlays, overlay));
    },
    closeOverlay() {
      audio.uiTap();
      setOverlays(popOverlay(store.get().overlays));
    },
    updateSettings(patch) {
      updateSettings(patch);
    },
    restorePurchases() {
      void paywall.restore();
    },
    openPaywall(reason) {
      void audio.unlock();
      audio.uiTap();
      paywall.open(reason);
    },
    buyFullVersion() {
      void audio.unlock();
      void paywall.buy();
    },
    back() {
      handleBack();
    },
    exitApp() {
      void flushSave();
      setOverlays(popOverlay(store.get().overlays, 'exitConfirm'));
      platform.lifecycle.exitApp();
    },
    run: runMode.actions,
    versus: versusMode.actions,
    daily: dailyMode.actions,
    puzzle: puzzleMode.actions,
    tutorial: tutorialMode.actions,
  };

  bindPointerInput(scene.canvas, session.gesture, () => {
    const geo = geometry();
    if (!geo) throw new Error('layout not ready');
    return geo;
  });
  bindKeyboardInput(window, session.keyboard);

  platform.lifecycle.onPause(() => {
    pauseGame();
    void flushSave();
    void audio.suspend();
  });
  platform.lifecycle.onResume(() => {
    void audio.resume();
  });
  platform.lifecycle.onBackButton(handleBack);

  // Menus show only the backdrop; the board appears with the game.
  let boardShown: boolean | null = null;
  const syncBoard = (state: GameUiState): void => {
    const show = showsBoard(state.screen);
    if (show === boardShown) return;
    boardShown = show;
    scene.setBoardVisible(show);
  };
  syncBoard(store.get());
  store.subscribe(syncBoard);

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
          mode: store.get().mode,
          overlays: [...store.get().overlays],
          raiseButton: session.raiseButtonHeld,
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
      getSave: () => structuredClone(save.data),
      flushSave,
      back: () => handleBack(),
      getRenderInfo: () => ({
        boardVisible: boardShown === true,
        palette: scene.paletteName,
        reducedMotion: scene.reducedMotion,
      }),
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
    /** Worst-case feedback a big chain produces (bursts, popups, shake, flash), every 20 frames. */
    const injectStress = (frame: number): void => {
      const sim = session.sim;
      const { rows, cols, colors } = sim.config;
      const big = frame % 20 === 0;
      if (!big && frame % 7 !== 0) return;
      const chain = big ? 5 : 1;
      for (let k = 0; k < (big ? 4 : 3); k++) {
        const row = (frame + k * 3) % rows;
        const col = (frame + k) % cols;
        scene.burst(sim, row, col, (frame + k) % colors, chain);
      }
      if (big) {
        scene.popup(sim, 'CHAIN ×5', rows / 2, cols / 2, 'chain', 1);
        scene.popup(sim, '+12 345', rows / 2 - 1, cols / 2, 'score', 0.7);
        scene.shake(chainShake(chain));
        scene.flash('chain');
        scene.excite(1);
      }
    };
    const countObjects = (c: Container): number =>
      c.children.reduce((n, ch) => n + 1 + countObjects(ch), 0);
    api.perf = {
      async profile({ frames = 600, stress = false } = {}) {
        const samples: FrameSample[] = [];
        let peakParticles = 0;
        let peakPopups = 0;
        const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        profiling = true;
        try {
          for (let i = 0; i < frames; i++) {
            await nextFrame();
            if (stress) injectStress(i);
            tickMs = 0;
            const t0 = performance.now();
            loop.frame(1000 / 60);
            const t1 = performance.now();
            scene.app.render();
            const t2 = performance.now();
            // Preact flushes renders queued during the tick in a microtask; this runs after it.
            await Promise.resolve();
            const t3 = performance.now();
            samples.push({ sim: tickMs, update: t1 - t0 - tickMs, draw: t2 - t1, ui: t3 - t2 });
            const fx = scene.effectCounts;
            peakParticles = Math.max(peakParticles, fx.particles);
            peakPopups = Math.max(peakPopups, fx.popups);
          }
        } finally {
          profiling = false;
        }
        return summarizeSamples(samples, {
          peakParticles,
          peakPopups,
          displayObjects: countObjects(scene.app.stage),
        });
      },
    };
    api.run = runMode.testApi;
    api.versus = versusMode.testApi;
    api.daily = dailyMode.testApi;
    api.setFullVersion = (on: boolean) => setFullVersion(on);
    api.puzzle = puzzleMode.testApi;
    api.tutorial = tutorialMode.testApi;
    const mock = platform.purchases instanceof MockPurchases ? platform.purchases : null;
    if (mock) {
      api.purchases = {
        setNextOutcome: (outcome) => mock.setNextOutcome(outcome),
        setLatency: (ms) => mock.setLatency(ms),
        ownedElsewhere: () => mock.simulateOwnedElsewhere(),
        setFullVersion: (value) => mock.setFullVersion(value),
      };
    }
    window.__swaplight = api;
  }
}
