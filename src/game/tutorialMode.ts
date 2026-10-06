import { loadAscii } from '../core/ascii';
import {
  createPuzzleSession,
  puzzleCanSwap,
  puzzleIsSettled,
  puzzleSwap,
  puzzleTick,
  PUZZLE_CONFIG,
  rows,
  type PuzzleSession,
} from '../core/puzzles';
import { createSim } from '../core/sim';
import type { SimEvent, SimInput } from '../core/types';
import { t } from '../i18n';
import { coachTarget, type PuzzleModeHost } from './puzzleMode';
import type { TutorialActions, TutorialUiState } from './puzzleState';
import {
  nextCoachMove,
  TUTORIAL_STEPS,
  tutorialGoalMet,
  tutorialPuzzleDef,
  tutorialShouldRetry,
  type TutorialStep,
} from './tutorial';

/** Success flash before the next step starts. */
const ADVANCE_DELAY_MS = 1100;
/** Pause before a failed board step resets. */
const RETRY_DELAY_MS = 700;
const MAX_SETTLE_TICKS = 2000;
/** Decorative board behind the final card. */
const CARD_BOARD = rows('..P...', '.CBY..', 'RGPCB.', 'YRBGYC');

export interface TutorialModeHost extends PuzzleModeHost {
  /** Back to the main menu (after finishing / quitting). */
  toMenu(): void;
}

/** Test hooks of the tutorial (`window.__swaplight.tutorial`). */
export interface TutorialTestApi {
  start(): void;
  /** Jump to a step (0-based). */
  goTo(step: number): void;
  /** Play the coach-marked moves of the current board step with real swaps (or raise). */
  playScript(): boolean;
  /** Advance immediately when the current step is complete (skips the success delay). */
  flush(): void;
  /** Step until the board is at rest. */
  settle(): void;
  state(): { step: number; id: string; kind: string; done: boolean; success: boolean };
}

export interface TutorialMode {
  readonly actions: TutorialActions;
  open(): void;
  afterTick(events: readonly SimEvent[]): void;
  leave(): void;
  readonly testApi: TutorialTestApi;
}

export function createTutorialMode(host: TutorialModeHost): TutorialMode {
  const { store, save, audio, haptics, scene, session, loop } = host;
  let index = 0;
  let ps: PuzzleSession | null = null;
  let success = false;
  let timer: number | undefined;
  let coachKey = 0;
  let uiKey = 0;
  let lastMoves = -1;

  const step = (): TutorialStep => TUTORIAL_STEPS[index]!;

  const publish = (patch: Partial<TutorialUiState> = {}): void => {
    const s = step();
    const moves = ps?.moves ?? [];
    const coach =
      s.kind === 'board' && !success
        ? coachTarget(host.geometry(), nextCoachMove(s, moves), coachKey, session.sim)
        : null;
    store.set({
      tutorial: {
        step: index,
        total: TUTORIAL_STEPS.length,
        id: s.id,
        kind: s.kind,
        moves: moves.length,
        coach,
        success,
        key: uiKey,
        ...patch,
      },
    });
  };

  const clearTimer = (): void => {
    window.clearTimeout(timer);
    timer = undefined;
  };

  const gate = (row: number, col: number): boolean =>
    !ps || (!success && puzzleCanSwap(ps, row, col) === null);

  const stepper = (inputs: readonly SimInput[], events: SimEvent[]): void => {
    if (!ps) return;
    const swap = inputs.find((i) => i.type === 'swap');
    if (swap && swap.type === 'swap' && !success) {
      if (puzzleSwap(ps, swap.row, swap.col, events) === null) return;
    }
    puzzleTick(ps, events);
  };

  const begin = (i: number): void => {
    clearTimer();
    index = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, i));
    success = false;
    lastMoves = -1;
    coachKey++;
    uiKey++;
    const s = step();
    ps = null;
    if (s.kind === 'board') {
      ps = createPuzzleSession(tutorialPuzzleDef(s, index));
      host.setLayoutMode('static');
      session.load(ps.sim);
      session.swapGate = gate;
      session.stepper = stepper;
    } else if (s.kind === 'card') {
      // A still board behind the card (static: nothing moves while it is open).
      const sim = createSim(`tutorial:${s.id}`, PUZZLE_CONFIG, 'static');
      loadAscii(sim, CARD_BOARD);
      host.setLayoutMode('static');
      session.load(sim);
    } else if (s.kind === 'raise') {
      const sim = createSim(`tutorial:${s.id}`, {}, 'endless');
      loadAscii(sim, s.board ?? '');
      host.setLayoutMode('endless');
      session.load(sim);
    }
    host.resetBoard();
    publish();
    store.set({ screen: 'playing', mode: 'tutorial', overlays: [], scoreFlash: null });
    if (s.kind === 'card') loop.pause();
    else if (!host.isFrozen()) loop.resume();
  };

  const complete = (): void => {
    clearTimer();
    ps = null;
    if (!save.data.tutorialDone) {
      save.update((d) => {
        d.tutorialDone = true;
      });
      void save.flush();
    }
    store.set({ tutorialDone: true, tutorial: null });
    host.showToast(t('tutorial.complete'));
    host.toMenu();
  };

  const advance = (): void => {
    if (index + 1 >= TUTORIAL_STEPS.length) complete();
    else begin(index + 1);
  };

  const succeed = (): void => {
    if (success) return;
    success = true;
    audio.stageClear();
    haptics.notify('success');
    scene.excite(0.6);
    publish();
    clearTimer();
    timer = window.setTimeout(() => {
      timer = undefined;
      if (store.get().mode === 'tutorial' && store.get().screen === 'playing') advance();
    }, ADVANCE_DELAY_MS);
  };

  const retry = (): void => {
    clearTimer();
    host.showToast(t('tutorial.retry'));
    haptics.notify('warning');
    timer = window.setTimeout(() => {
      timer = undefined;
      if (store.get().mode === 'tutorial') begin(index);
    }, RETRY_DELAY_MS);
  };

  const afterTick = (): void => {
    const s = step();
    if (success || s.kind === 'card') return;
    const sim = session.sim;
    const moves = ps?.moves ?? [];
    if (moves.length !== lastMoves) {
      lastMoves = moves.length;
      coachKey++;
      publish();
    }
    if (tutorialGoalMet(s.goal, sim, moves.length)) {
      // A swap step finishes once the swapped blocks are at rest.
      if (s.goal.type !== 'swap' || !ps || puzzleIsSettled(ps)) succeed();
      return;
    }
    if (ps && timer === undefined && puzzleIsSettled(ps) && tutorialShouldRetry(s, moves)) retry();
  };

  scene.app.renderer.on('resize', () => {
    if (store.get().mode === 'tutorial' && store.get().tutorial) {
      coachKey++;
      publish();
    }
  });

  const actions: TutorialActions = {
    skip() {
      audio.uiTap();
      advance();
    },
    next() {
      audio.uiConfirm();
      advance();
    },
  };

  const settle = (): void => {
    for (let n = 0; ps && !puzzleIsSettled(ps) && n < MAX_SETTLE_TICKS; n++) loop.stepTicks(1);
  };

  const testApi: TutorialTestApi = {
    start: () => begin(0),
    goTo: (i) => begin(i),
    playScript() {
      const s = step();
      if (s.kind === 'raise') {
        session.setRaiseButton(true);
        for (let n = 0; n < 600 && !tutorialGoalMet(s.goal, session.sim, 0); n++) {
          loop.stepTicks(1);
        }
        session.setRaiseButton(false);
        loop.stepTicks(1);
        return success;
      }
      if (s.kind !== 'board' || !ps) return false;
      const done = ps.moves.length;
      for (const m of s.script.slice(done)) {
        settle();
        session.queue({ type: 'swap', row: m.row, col: m.col });
        loop.stepTicks(1);
      }
      settle();
      loop.stepTicks(1);
      return success;
    },
    flush() {
      if (success || step().kind === 'card') advance();
    },
    settle: () => settle(),
    state: () => ({
      step: index,
      id: step().id,
      kind: step().kind,
      done: save.data.tutorialDone,
      success,
    }),
  };

  return {
    actions,
    open() {
      void audio.unlock();
      audio.playMusic('game', { seed: 7, intensity: 0.1 });
      begin(0);
    },
    afterTick,
    leave() {
      clearTimer();
      ps = null;
      success = false;
      store.set({ tutorial: null });
    },
    testApi,
  };
}
