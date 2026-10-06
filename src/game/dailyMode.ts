import type { AudioEngine } from '../audio';
import { MOD_SWAP_LOCK_UNTIL } from '../core/sim';
import { t } from '../i18n';
import type { Clipboard } from '../platform/clipboard';
import type { Haptics } from '../platform/types';
import type { GameScene } from '../render/scene';
import {
  beginDailyAttempt,
  createDailySim,
  currentStreak,
  dailyChallenge,
  dailyFinished,
  dailyHistory,
  dailyResult,
  dailySecondsLeft,
  dailySetup,
  finishDailyAttempt,
  groupDigits,
  isDateKey,
  localDateKey,
  officialAvailable,
  type DailyChallenge,
} from './daily';
import type { GameLoop } from './loop';
import { recordGame } from './progress';
import type { SaveManager } from './save';
import type { EndlessSession } from './session';
import type { DailyActions, DailyResultUi, GameUiState } from './state';
import type { Store } from './store';

/** Pause between the end of the attempt and the result panel. */
const END_DELAY_MS = 900;

export interface DailyModeHost {
  store: Store<GameUiState>;
  save: SaveManager;
  audio: AudioEngine;
  haptics: Haptics;
  scene: GameScene;
  session: EndlessSession;
  loop: GameLoop;
  clipboard: Clipboard;
  isFrozen(): boolean;
  showToast(text: string): void;
  setLayoutMode(mode: 'daily'): void;
  resetBoard(): void;
  toMenu(): void;
}

/** Test hooks (`window.__swaplight.daily`). */
export interface DailyTestApi {
  /** Pretend today is `date` (`YYYY-MM-DD`); null = the real clock. */
  setToday(date: string | null): void;
  /** Open the intro of `date`'s challenge (default today) and start the attempt. */
  start(opts?: { date?: string }): void;
  /** End the attempt now (as if time ran out). */
  finish(): void;
  state(): DailyTestState;
}

export interface DailyTestState {
  screen: string;
  today: string;
  active: boolean;
  date: string | null;
  official: boolean;
  twists: string[];
  secondsLeft: number;
  score: number;
  /** Official still available today. */
  officialAvailable: boolean;
  streak: number;
  shareText: string | null;
}

export interface DailyMode {
  readonly actions: DailyActions;
  /** Menu card: today's challenge intro. */
  open(): void;
  afterTick(): void;
  /** Leaving mid-attempt: the attempt counts with the current score. */
  leave(): void;
  /** Refresh today's date (menu countdown rolls over at midnight). */
  syncToday(): void;
  readonly testApi: DailyTestApi;
}

export function createDailyMode(host: DailyModeHost): DailyMode {
  const { store, save, audio, haptics, scene, session, loop } = host;
  let todayOverride: string | null = null;
  let challenge: DailyChallenge | null = null;
  /** An attempt is being played (started and not yet recorded). */
  let playing = false;
  let official = false;
  let endTimer: number | undefined;
  let lastSeconds = -1;

  const today = (): string => todayOverride ?? localDateKey(new Date());

  const syncSave = (): void => {
    store.set({
      dailySave: { records: { ...save.data.daily }, streak: { ...save.data.dailyStreak } },
      dailyToday: today(),
    });
  };

  const publish = (): void => {
    if (!challenge) {
      store.set({ daily: null });
      return;
    }
    const seconds = dailySecondsLeft(session.sim, challenge.timeLimit);
    lastSeconds = seconds;
    store.set({ daily: { challenge, official, secondsLeft: seconds } });
  };

  /** Load a fresh board of the challenge (intro shows it before the clock starts). */
  const prepare = (date: string): void => {
    window.clearTimeout(endTimer);
    challenge = dailyChallenge(date);
    const setup = dailySetup(challenge);
    host.setLayoutMode('daily');
    session.load(createDailySim(challenge, setup), setup.hooks);
    host.resetBoard();
    playing = false;
    official = officialAvailable(save.data, date);
    syncSave();
    publish();
    store.set({ screen: 'dailyIntro', mode: 'daily', overlays: [], dailyResult: null });
    audio.playMusic('menu');
  };

  const begin = (): void => {
    if (!challenge || playing || store.get().screen !== 'dailyIntro') return;
    const date = challenge.date;
    let res = { official: false };
    save.update((d) => {
      res = beginDailyAttempt(d, date);
    });
    official = res.official;
    playing = true;
    void save.flush();
    syncSave();
    publish();
    store.set({ screen: 'playing', mode: 'daily' });
    audio.uiConfirm();
    audio.playMusic('game', { seed: session.sim.rng.a >>> 0, intensity: 0.25 });
    if (!host.isFrozen()) loop.resume();
  };

  /** Record the attempt; returns the result panel data. */
  const record = (reason: DailyResultUi['reason']): DailyResultUi | null => {
    const ch = challenge;
    if (!ch || !playing) return null;
    playing = false;
    const sim = session.sim;
    const score = sim.score;
    let newBest = false;
    save.update((d) => {
      newBest = finishDailyAttempt(d, ch.date, score, official).newBest;
      if (official) {
        recordGame(d, 'daily', {
          score,
          maxChain: sim.stats.maxChain,
          maxCombo: sim.stats.maxCombo,
          blocksCleared: sim.stats.blocksCleared,
          seconds: Math.floor(sim.tick / 60),
        });
      }
    });
    void save.flush();
    syncSave();
    const r = dailyResult(save.data, ch.date);
    const streak = currentStreak(save.data, ch.date);
    const shareScore = r.official ? r.score : score;
    return {
      date: ch.date,
      score,
      official,
      reason,
      newBest,
      streak,
      bestStreak: save.data.dailyStreak.best,
      todayScore: r.official ? r.score : null,
      practiceBest: r.practiceBest,
      history: dailyHistory(save.data, ch.date),
      shareText: t('daily.shareText', {
        date: ch.date,
        score: groupDigits(shareScore),
        streak,
      }),
    };
  };

  const end = (reason: DailyResultUi['reason']): void => {
    const result = record(reason);
    if (!result) return;
    loop.pause();
    session.setRaiseButton(false);
    store.set({ raiseHeld: false });
    if (reason === 'time') {
      audio.stageClear();
      haptics.notify('success');
      scene.flash('chain');
      scene.excite(1);
    } else {
      scene.flash('gameOver');
      haptics.notify('warning');
    }
    audio.setIntensity(0.15);
    window.clearTimeout(endTimer);
    const ch = challenge;
    endTimer = window.setTimeout(() => {
      if (challenge === ch) store.set({ screen: 'dailyResult', dailyResult: result });
    }, END_DELAY_MS);
  };

  const actions: DailyActions = {
    begin() {
      void audio.unlock();
      begin();
    },
    practiceAgain() {
      audio.uiTap();
      prepare(challenge?.date ?? today());
    },
    share() {
      const text = store.get().dailyResult?.shareText;
      if (!text) return;
      audio.uiTap();
      void host.clipboard.writeText(text).then((ok) => {
        host.showToast(t(ok ? 'daily.copied' : 'daily.copyFailed'));
        if (ok) haptics.selection();
      });
    },
  };

  const api: DailyTestApi = {
    setToday(date) {
      todayOverride = date !== null && isDateKey(date) ? date : null;
      syncSave();
    },
    start(opts = {}) {
      prepare(opts.date && isDateKey(opts.date) ? opts.date : today());
      begin();
    },
    finish() {
      if (playing) end('time');
    },
    state() {
      const d = today();
      return {
        screen: store.get().screen,
        today: d,
        active: playing,
        date: challenge?.date ?? null,
        official,
        twists: challenge ? [...challenge.twists] : [],
        secondsLeft: challenge ? dailySecondsLeft(session.sim, challenge.timeLimit) : 0,
        score: session.sim.score,
        officialAvailable: officialAvailable(save.data, d),
        streak: currentStreak(save.data, d),
        shareText: store.get().dailyResult?.shareText ?? null,
      };
    },
  };

  syncSave();

  return {
    actions,
    open() {
      prepare(today());
    },
    afterTick() {
      const ch = challenge;
      if (!ch || !playing) return;
      const sim = session.sim;
      if (dailySecondsLeft(sim, ch.timeLimit) !== lastSeconds) publish();
      // Time's up: no more swaps, a chain in progress still finishes and counts.
      const lockUntil = ch.timeLimit + 3600;
      if (sim.tick >= ch.timeLimit && (sim.modifiers[MOD_SWAP_LOCK_UNTIL] ?? 0) < lockUntil) {
        sim.modifiers[MOD_SWAP_LOCK_UNTIL] = lockUntil;
      }
      if (dailyFinished(sim, ch.timeLimit)) end(sim.gameOver ? 'topOut' : 'time');
    },
    leave() {
      window.clearTimeout(endTimer);
      if (playing) record(session.sim.gameOver ? 'topOut' : 'time');
      challenge = null;
      playing = false;
      store.set({ daily: null, dailyResult: null });
    },
    syncToday() {
      if (store.get().dailyToday !== today()) syncSave();
    },
    testApi: api,
  };
}
