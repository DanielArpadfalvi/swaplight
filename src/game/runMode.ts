import type { AudioEngine } from '../audio';
import {
  CHARM_FREEZE_UNTIL,
  CHARM_OVERCHARGE_UNTIL,
  getCharm,
  getRelic,
  type ActionResult,
} from '../core/run';
import { TICKS_PER_SECOND } from '../core/config';
import type { SimEvent } from '../core/types';
import { t, type TranslationKey } from '../i18n';
import type { BoardGeometry } from '../input/geometry';
import type { Haptics, JsonValue } from '../platform/types';
import type { GameScene } from '../render/scene';
import type { GameLoop } from './loop';
import { recordGame } from './progress';
import { RunController, charmTargetKind, type FinishedStage, type RunBlob } from './runController';
import {
  brightnessAvailable,
  brightnessUnlockKey,
  deckAvailable,
  sanitizeRunChoice,
  unlocksForWin,
} from './runUnlocks';
import type { SaveManager } from './save';
import type { EndlessSession } from './session';
import type { GameUiState, RunActions, RunEndSummary, RunHudState, SavedRunInfo } from './state';
import type { Store } from './store';

/** Pause between the stage end and the result / summary panel (lets the fanfare land). */
const STAGE_END_DELAY_MS = 900;

/** Services of the app controller the Run mode uses. */
export interface RunModeHost {
  store: Store<GameUiState>;
  save: SaveManager;
  audio: AudioEngine;
  haptics: Haptics;
  scene: GameScene;
  session: EndlessSession;
  loop: GameLoop;
  /** Test hooks froze real-time stepping. */
  isFrozen(): boolean;
  showToast(text: string): void;
  /** Switch the board layout (the Run HUD is taller). */
  setLayoutMode(mode: 'endless' | 'run'): void;
  geometry(): BoardGeometry | null;
  /** New sim loaded: reset interpolation / effects. */
  resetBoard(): void;
  randomSeed(): string;
  /** Leave to the main menu (Endless backdrop). */
  toMenu(): void;
}

/** Test hooks for the Run mode (`window.__swaplight.run`). */
export interface RunTestApi {
  /** Start a new run immediately (skips the deck select) and show the map. */
  start(opts?: { seed?: string; deck?: string; brightness?: number }): void;
  state(): RunTestState;
  playStage(): void;
  beginStage(): void;
  /** Complete the stage in progress as won / lost (no need to reach the goal). */
  forceWin(): void;
  forceLose(): void;
  continueFromResult(): void;
  buyRelic(i: number): boolean;
  buyCharm(i: number): boolean;
  sellRelic(slot: number): boolean;
  reroll(): boolean;
  leaveShop(): void;
  /** Use a charm directly (with an optional board target). */
  useCharm(slot: number, target?: { row?: number; col?: number }): boolean;
  grantSzikra(n: number): void;
  grantCharm(id: string): void;
  grantRelic(id: string): void;
  persist(): void;
  abandon(): void;
}

export interface RunTestState {
  active: boolean;
  screen: string;
  phase: string | null;
  act: number;
  stage: number;
  szikra: number;
  relics: string[];
  charms: string[];
  shopRelics: { id: string; price: number; sold: boolean }[];
  shopCharms: { id: string; price: number; sold: boolean }[];
  goal: string | null;
  value: number;
  target: number;
  hiddenColor: number | null;
  saved: boolean;
}

export interface RunMode {
  readonly actions: RunActions;
  /** The menu's Run card: continue the saved run or open the deck select. */
  open(): void;
  /** After every sim tick of a Run stage. */
  afterTick(events: readonly SimEvent[]): void;
  /** Save the run (incl. the stage in progress) into the save document. */
  persist(): void;
  /** Leaving to the menu mid-run: keep it saved. */
  suspend(): void;
  /** Stage intro → back to the run map (the stage is not started). */
  backToMap(): void;
  readonly testApi: RunTestApi;
}

function savedInfo(blob: unknown): SavedRunInfo | null {
  const c = RunController.fromBlob(blob);
  if (!c) return null;
  return {
    act: c.run.act,
    stage: c.run.stage,
    deckId: c.run.deckId,
    brightness: c.run.brightness,
    at: c.resumePoint,
  };
}

export function createRunMode(host: RunModeHost): RunMode {
  const { store, save, audio, haptics, scene, session, loop } = host;
  let ctrl: RunController | null = null;
  let endTimer: number | undefined;
  let pulseKey = 0;
  let lastHudKey = '';

  const syncSaved = (): void => {
    store.set({ savedRun: savedInfo(save.data.runInProgress), unlocks: [...save.data.unlocks] });
  };

  const persist = (): void => {
    if (!ctrl) return;
    const blob: RunBlob = ctrl.toBlob();
    const json = JSON.parse(JSON.stringify(blob)) as JsonValue;
    save.update((d) => {
      d.runInProgress = json;
    });
    syncSaved();
  };

  const clearSaved = (): void => {
    save.update((d) => {
      d.runInProgress = null;
    });
    syncSaved();
  };

  const markSeen = (ids: string[]): void => {
    const fresh = ids.filter((id) => !save.data.collectionSeen.includes(id));
    if (fresh.length === 0) return;
    save.update((d) => {
      d.collectionSeen.push(...fresh);
    });
  };

  const markRunSeen = (): void => {
    if (!ctrl) return;
    const r = ctrl.run;
    markSeen([
      ...r.relics.map((x) => `relic.${x.id}`),
      ...r.charms.map((x) => `charm.${x.id}`),
      ...(r.shop?.relics ?? []).map((x) => `relic.${x.id}`),
      ...(r.shop?.charms ?? []).map((x) => `charm.${x.id}`),
      ...r.plan.flatMap((p) => p.curses.map((c) => `boss.${c}`)),
    ]);
  };

  const publishRun = (): void => {
    if (!ctrl) {
      store.set({ run: null });
      return;
    }
    const eco = ctrl.economy;
    store.set({
      run: ctrl.run,
      runRerollCost: ctrl.rerollCost,
      runRelicSlots: eco.relicSlots,
      runCharmSlots: eco.charmSlots,
    });
  };

  const publishHud = (force = false): void => {
    const c = ctrl;
    const sim = c?.sim;
    const setup = c?.setup;
    const p = c?.progress();
    if (!c || !sim || !setup || !p) return;
    const goal = setup.goal;
    const secondsLeft = Math.ceil(Math.max(0, goal.timeLimit - sim.tick) / TICKS_PER_SECOND);
    const frozen = sim.tick < (sim.modifiers[CHARM_FREEZE_UNTIL] ?? 0);
    const overcharged = sim.tick < (sim.modifiers[CHARM_OVERCHARGE_UNTIL] ?? 0);
    const value = goal.type === 'survive' ? Math.floor(p.value / TICKS_PER_SECOND) : p.value;
    const target = goal.type === 'survive' ? Math.round(p.target / TICKS_PER_SECOND) : p.target;
    const key = `${value}|${target}|${secondsLeft}|${p.won}|${frozen}|${overcharged}`;
    if (!force && key === lastHudKey) return;
    lastHudKey = key;
    const hud: RunHudState = {
      goal,
      value,
      target,
      progress: p.progress,
      secondsLeft,
      won: p.won,
      act: setup.info.act,
      stage: setup.info.stage,
      isBoss: setup.info.isBoss,
      curses: setup.curses,
      frozen,
      overcharged,
    };
    store.set({ runHud: hud });
  };

  const musicFor = (boss: boolean): void => {
    const seed = session.sim.rng.a >>> 0;
    audio.playMusic(boss ? 'boss' : 'game', { seed, intensity: 0.25 });
  };

  /** Load the controller's stage sim into the session and the board. */
  const loadStage = (): void => {
    if (!ctrl?.sim) return;
    host.setLayoutMode('run');
    session.load(ctrl.sim, ctrl.hooks ?? undefined);
    host.resetBoard();
    lastHudKey = '';
    publishHud(true);
  };

  const showMap = (): void => {
    store.set({
      screen: 'runMap',
      mode: 'run',
      overlays: [],
      charmMenu: null,
      targeting: null,
      runFinished: null,
    });
    audio.playMusic('menu');
  };

  const showShop = (): void => {
    markRunSeen();
    store.set({ screen: 'shop', mode: 'run', overlays: [], charmMenu: null, targeting: null });
    audio.playMusic('menu');
  };

  const resume = (): void => {
    if (!ctrl) return;
    publishRun();
    switch (ctrl.resumePoint) {
      case 'stage':
        loadStage();
        store.set({ screen: 'paused', mode: 'run', overlays: [], scoreFlash: null });
        musicFor(ctrl.plan.stage === 3);
        break;
      case 'shop':
        showShop();
        break;
      case 'map':
        showMap();
        break;
    }
  };

  const openSetup = (): void => {
    const { deckId, brightness } = store.get().runSetup;
    const choice = sanitizeRunChoice(
      deckId,
      brightness,
      save.data.unlocks,
      store.get().fullVersion,
    );
    syncSaved();
    store.set({ screen: 'runSetup', mode: 'run', overlays: [], runSetup: choice, runEnd: null });
    audio.playMusic('menu');
  };

  const startNew = (seed: string, deckId: string, brightness: number): void => {
    window.clearTimeout(endTimer);
    ctrl = RunController.create(seed, deckId, brightness);
    persist();
    markRunSeen();
    publishRun();
    store.set({ runEnd: null, runFinished: null });
    showMap();
  };

  const playStage = (): void => {
    if (!ctrl || ctrl.run.phase !== 'stage') return;
    if (!ctrl.sim) ctrl.beginStage();
    loadStage();
    const boss = ctrl.plan.stage === 3;
    store.set({ screen: 'stageIntro', mode: 'run', scoreFlash: null, relicPulse: null });
    if (boss) {
      audio.bossIntro();
      haptics.impact('heavy');
      scene.shake(0.35);
      musicFor(true);
    } else {
      audio.uiConfirm();
    }
  };

  const beginStage = (): void => {
    if (!ctrl?.sim || store.get().screen !== 'stageIntro') return;
    audio.uiConfirm();
    store.set({ screen: 'playing' });
    if (ctrl.plan.stage !== 3) musicFor(false);
    if (!host.isFrozen()) loop.resume();
    persist();
  };

  const endRun = (reason: RunEndSummary['reason']): void => {
    const c = ctrl;
    if (!c) return;
    const r = c.run;
    const won = r.phase === 'won';
    const last = c.last;
    const unlocked = won ? unlocksForWin(r.brightness, save.data.unlocks) : [];
    save.update((d) => {
      recordGame(d, 'run', {
        score: r.stats.totalScore,
        maxChain: r.stats.maxChain,
        maxCombo: r.stats.maxCombo,
        blocksCleared: r.stats.blocksCleared,
        seconds: Math.floor(c.playTicks / TICKS_PER_SECOND),
      });
      for (const key of unlocked) if (!d.unlocks.includes(key)) d.unlocks.push(key);
      d.runInProgress = null;
    });
    const summary: RunEndSummary = {
      won,
      act: last?.plan.act ?? r.act,
      stage: last?.plan.stage ?? r.stage,
      reason,
      deckId: r.deckId,
      brightness: r.brightness,
      stagesCleared: c.stagesCleared,
      bestChain: r.stats.maxChain,
      bestClear: c.bestClear,
      totalScore: r.stats.totalScore,
      sparksEarned: r.stats.szikraEarned,
      relics: r.relics.map((x) => x.id),
      unlockedBrightness: unlocked.map((k) => Number(k.split('.')[1])),
    };
    ctrl = null;
    syncSaved();
    store.set({
      runEnd: summary,
      screen: 'runEnd',
      overlays: [],
      charmMenu: null,
      targeting: null,
    });
    if (won) {
      audio.stageClear();
      if (unlocked.length > 0) window.setTimeout(() => audio.itemUnlock(), 700);
      haptics.notify('success');
    }
    audio.playMusic('menu');
    void save.flush();
  };

  const onStageEnd = (fin: FinishedStage): void => {
    loop.pause();
    session.setRaiseButton(false);
    store.set({ raiseHeld: false, charmMenu: null, targeting: null, runFinished: fin });
    publishRun();
    window.clearTimeout(endTimer);
    if (fin.won) {
      audio.stageClear();
      haptics.notify('success');
      scene.flash('chain');
      scene.excite(1);
      if (fin.victory) {
        // Keep the run alive for the result screen; the summary records it.
      } else {
        persist();
      }
      endTimer = window.setTimeout(() => {
        if (store.get().runFinished === fin) store.set({ screen: 'stageResult' });
      }, STAGE_END_DELAY_MS);
    } else {
      scene.flash('gameOver');
      haptics.notify('warning');
      endTimer = window.setTimeout(() => endRun(fin.reason), STAGE_END_DELAY_MS);
    }
  };

  const afterTick = (events: readonly SimEvent[]): void => {
    if (!ctrl?.sim) return;
    for (const e of events) if (e.type === 'scored') ctrl.noteScored(e.score);
    const fired = ctrl.takeFiredRelics();
    if (fired.length > 0) store.set({ relicPulse: { ids: fired, key: ++pulseKey } });
    publishHud();
    const fin = ctrl.checkFinished();
    if (fin) onStageEnd(fin);
  };

  const refusal = (res: ActionResult): void => {
    const key: TranslationKey | null =
      res.reason === 'funds'
        ? 'run.notEnoughSparks'
        : res.reason === 'slots'
          ? 'run.slotsFull'
          : res.reason === 'noEffect'
            ? 'run.charmNoEffect'
            : res.reason === 'phase' || res.reason === 'noSim'
              ? 'run.charmStageOnly'
              : null;
    audio.uiTap();
    haptics.notify('warning');
    if (key) host.showToast(t(key));
  };

  const shopAction = (res: ActionResult, kind: 'buy' | 'sell' | 'reroll'): boolean => {
    if (!res.ok) {
      refusal(res);
      return false;
    }
    if (kind === 'buy') {
      audio.purchase();
      haptics.impact('medium');
    } else if (kind === 'sell') {
      audio.purchase();
      haptics.impact('light');
    } else {
      audio.uiConfirm();
      haptics.selection();
    }
    store.set({ charmMenu: null });
    markRunSeen();
    publishRun();
    persist();
    return true;
  };

  const inStage = (): boolean => {
    const s = store.get().screen;
    return ctrl?.sim != null && (s === 'playing' || s === 'paused');
  };

  const resumeStage = (): void => {
    store.set({ charmMenu: null, targeting: null });
    if (store.get().screen === 'playing' && !host.isFrozen()) loop.resume();
  };

  const applyCharm = (slot: number, target?: { row?: number; col?: number }): boolean => {
    if (!ctrl) return false;
    const owned = ctrl.run.charms[slot];
    if (!owned) return false;
    const sim = ctrl.sim;
    const res = ctrl.useCharm(slot, target);
    if (!res.ok) {
      refusal(res);
      return false;
    }
    audio.uiConfirm();
    haptics.impact('medium');
    const name = t(`charm.${owned.id}.name` as TranslationKey);
    if (sim && inStage()) {
      for (const c of res.removed) scene.burst(sim, c.row, c.col, c.color, 2);
      scene.popup(
        sim,
        name.toUpperCase(),
        sim.config.rows * 0.4,
        (sim.config.cols - 1) / 2,
        'level',
        0.9,
      );
      scene.flash('chain');
      scene.board.captureTick(sim);
      publishHud(true);
    } else {
      host.showToast(t('run.charmUsed', { name }));
    }
    publishRun();
    persist();
    return true;
  };

  const actions: RunActions = {
    continueRun() {
      void audio.unlock();
      ctrl = ctrl ?? RunController.fromBlob(save.data.runInProgress);
      if (!ctrl) {
        syncSaved();
        openSetup();
        return;
      }
      audio.uiConfirm();
      resume();
    },
    newRun() {
      audio.uiTap();
      openSetup();
    },
    selectDeck(id) {
      audio.uiTap();
      if (!deckAvailable(id, store.get().fullVersion)) {
        haptics.notify('warning');
        host.showToast(t('run.deckNeedsFull'));
        return;
      }
      haptics.selection();
      store.set({ runSetup: { ...store.get().runSetup, deckId: id } });
    },
    selectBrightness(level) {
      audio.uiTap();
      const full = store.get().fullVersion;
      if (!brightnessAvailable(level, save.data.unlocks, full)) {
        haptics.notify('warning');
        const earned = save.data.unlocks.includes(brightnessUnlockKey(level));
        host.showToast(
          earned || level === 1
            ? t('run.brightnessNeedsFull')
            : t('run.brightnessLocked', { level: level - 1 }),
        );
        return;
      }
      haptics.selection();
      store.set({ runSetup: { ...store.get().runSetup, brightness: level } });
    },
    start() {
      void audio.unlock();
      audio.uiConfirm();
      const { deckId, brightness } = store.get().runSetup;
      startNew(host.randomSeed(), deckId, brightness);
    },
    playStage() {
      void audio.unlock();
      playStage();
    },
    beginStage() {
      beginStage();
    },
    continueFromResult() {
      const fin = store.get().runFinished;
      audio.uiConfirm();
      if (!ctrl || !fin) return;
      if (fin.victory) {
        endRun('goal');
        return;
      }
      showShop();
    },
    buyRelic(i) {
      if (ctrl) shopAction(ctrl.buyRelic(i), 'buy');
    },
    buyCharm(i) {
      if (ctrl) shopAction(ctrl.buyCharm(i), 'buy');
    },
    sellRelic(slot) {
      if (ctrl) shopAction(ctrl.sellRelic(slot), 'sell');
    },
    sellCharm(slot) {
      if (ctrl) shopAction(ctrl.sellCharm(slot), 'sell');
    },
    reroll() {
      if (ctrl) shopAction(ctrl.reroll(), 'reroll');
    },
    leaveShop() {
      if (!ctrl || ctrl.run.phase !== 'shop') return;
      audio.uiConfirm();
      ctrl.leaveShop();
      persist();
      publishRun();
      showMap();
    },
    openCharm(slot) {
      if (!ctrl) return;
      audio.uiTap();
      if (slot === null || store.get().charmMenu === slot) {
        if (inStage()) resumeStage();
        else store.set({ charmMenu: null });
        return;
      }
      if (!ctrl.run.charms[slot]) return;
      if (store.get().screen === 'playing') loop.pause();
      store.set({ charmMenu: slot, targeting: null });
    },
    useCharm(slot) {
      if (!ctrl) return;
      const owned = ctrl.run.charms[slot];
      if (!owned) return;
      const kind = charmTargetKind(owned.id);
      if (kind && inStage()) {
        const geo = host.geometry();
        if (!geo) return;
        loop.pause();
        audio.uiTap();
        store.set({
          charmMenu: null,
          targeting: {
            slot,
            charmId: owned.id,
            kind,
            originX: geo.originX,
            originY: geo.originY,
            cellSize: geo.cellSize,
            rows: geo.rows,
            cols: geo.cols,
            riseOffsetPx: geo.riseOffsetPx,
          },
        });
        return;
      }
      applyCharm(slot);
      if (inStage()) resumeStage();
      else store.set({ charmMenu: null });
    },
    target(row, col) {
      const tg = store.get().targeting;
      if (!tg) return;
      const target = tg.kind === 'column' ? { col } : tg.kind === 'row' ? { row } : { row, col };
      applyCharm(tg.slot, target);
      resumeStage();
    },
    cancelCharm() {
      audio.uiTap();
      if (inStage()) resumeStage();
      else store.set({ charmMenu: null, targeting: null });
    },
    abandon() {
      audio.uiTap();
      const overlays = store.get().overlays.filter((o) => o !== 'abandonConfirm');
      store.set({ overlays: [...overlays, 'abandonConfirm'] });
    },
    confirmAbandon() {
      audio.uiTap();
      window.clearTimeout(endTimer);
      loop.pause();
      const c = ctrl ?? RunController.fromBlob(save.data.runInProgress);
      if (c && c.run.history.length > 0) {
        save.update((d) => {
          recordGame(d, 'run', {
            score: c.run.stats.totalScore,
            maxChain: c.run.stats.maxChain,
            maxCombo: c.run.stats.maxCombo,
            blocksCleared: c.run.stats.blocksCleared,
            seconds: Math.floor(c.playTicks / TICKS_PER_SECOND),
          });
        });
      }
      ctrl = null;
      clearSaved();
      store.set({ run: null, runHud: null, runFinished: null, charmMenu: null, targeting: null });
      void save.flush();
      host.toMenu();
    },
    finish() {
      audio.uiTap();
      store.set({ runEnd: null, run: null, runHud: null, runFinished: null });
      host.toMenu();
    },
  };

  const api: RunTestApi = {
    start(opts = {}) {
      startNew(opts.seed ?? host.randomSeed(), opts.deck ?? 'neon', opts.brightness ?? 1);
    },
    state() {
      const r = ctrl?.run ?? null;
      const p = ctrl?.progress() ?? null;
      const hidden = ctrl?.sim?.modifiers.hiddenColor;
      return {
        active: ctrl !== null,
        screen: store.get().screen,
        phase: r?.phase ?? null,
        act: r?.act ?? 0,
        stage: r?.stage ?? 0,
        szikra: r?.szikra ?? 0,
        relics: r?.relics.map((x) => x.id) ?? [],
        charms: r?.charms.map((x) => x.id) ?? [],
        shopRelics: r?.shop?.relics.map((o) => ({ ...o })) ?? [],
        shopCharms: r?.shop?.charms.map((o) => ({ ...o })) ?? [],
        goal: ctrl?.setup?.goal.type ?? null,
        value: p?.value ?? 0,
        target: p?.target ?? 0,
        hiddenColor: hidden === undefined ? null : hidden,
        saved: save.data.runInProgress !== null,
      };
    },
    playStage: () => playStage(),
    beginStage: () => beginStage(),
    forceWin() {
      if (ctrl?.sim) onStageEnd(ctrl.finishStage({ won: true }));
    },
    forceLose() {
      if (ctrl?.sim) onStageEnd(ctrl.finishStage({ won: false }));
    },
    continueFromResult: () => actions.continueFromResult(),
    buyRelic: (i) => (ctrl ? shopAction(ctrl.buyRelic(i), 'buy') : false),
    buyCharm: (i) => (ctrl ? shopAction(ctrl.buyCharm(i), 'buy') : false),
    sellRelic: (i) => (ctrl ? shopAction(ctrl.sellRelic(i), 'sell') : false),
    reroll: () => (ctrl ? shopAction(ctrl.reroll(), 'reroll') : false),
    leaveShop: () => actions.leaveShop(),
    useCharm: (slot, target) => applyCharm(slot, target),
    grantSzikra(n) {
      if (!ctrl) return;
      ctrl.run = { ...ctrl.run, szikra: ctrl.run.szikra + n };
      publishRun();
    },
    grantCharm(id) {
      if (!ctrl) return;
      getCharm(id);
      ctrl.run = { ...ctrl.run, charms: [...ctrl.run.charms, { id, paid: 0 }] };
      publishRun();
    },
    grantRelic(id) {
      if (!ctrl) return;
      const def = getRelic(id);
      ctrl.run = {
        ...ctrl.run,
        relics: [...ctrl.run.relics, { id, paid: 0, state: { ...def.initialState } }],
      };
      publishRun();
    },
    persist: () => persist(),
    abandon: () => actions.confirmAbandon(),
  };

  syncSaved();

  return {
    actions,
    open() {
      void audio.unlock();
      if (ctrl || save.data.runInProgress !== null) actions.continueRun();
      else openSetup();
    },
    afterTick,
    persist,
    suspend() {
      window.clearTimeout(endTimer);
      persist();
      ctrl = null;
      store.set({ run: null, runHud: null, charmMenu: null, targeting: null });
    },
    backToMap() {
      audio.uiTap();
      loop.pause();
      ctrl?.discardStage();
      showMap();
    },
    testApi: api,
  };
}
