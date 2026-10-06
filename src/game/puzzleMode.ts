import type { AudioEngine } from '../audio';
import {
  createPuzzleSession,
  nextPuzzle,
  puzzleById,
  puzzleCanSwap,
  puzzleIsSettled,
  puzzleMovesLeft,
  puzzleRestart,
  puzzleSwap,
  puzzleTick,
  puzzleUndo,
  type PuzzleDef,
  type PuzzleMove,
  type PuzzleSession,
  type PuzzleSwapReject,
} from '../core/puzzles';
import type { SimEvent, SimInput, SimState } from '../core/types';
import { t } from '../i18n';
import type { BoardGeometry } from '../input/geometry';
import type { Haptics } from '../platform/types';
import type { GameScene } from '../render/scene';
import type { GameLoop } from './loop';
import {
  computeStars,
  isPuzzleUnlocked,
  puzzlePackAvailable,
  recordPuzzleSolve,
} from './puzzleProgress';
import type { CoachTarget, PuzzleActions, PuzzleUiState } from './puzzleState';
import type { SaveManager } from './save';
import type { EndlessSession } from './session';
import type { GameUiState } from './state';
import type { Store } from './store';

/** Pause between the solve / last move and the result panel (lets the clear play out). */
const RESULT_DELAY_WON_MS = 1000;
const RESULT_DELAY_LOST_MS = 650;
/** Safety limit when fast-forwarding a board to rest (test hooks). */
const MAX_SETTLE_TICKS = 2000;

/** Board layout: 'static' = no preview strip (puzzle / tutorial boards never rise). */
export type BoardLayoutMode = 'endless' | 'run' | 'static';

/** Services of the app controller the Puzzle mode (and the tutorial) use. */
export interface PuzzleModeHost {
  store: Store<GameUiState>;
  save: SaveManager;
  audio: AudioEngine;
  haptics: Haptics;
  scene: GameScene;
  session: EndlessSession;
  loop: GameLoop;
  isFrozen(): boolean;
  showToast(text: string): void;
  setLayoutMode(mode: BoardLayoutMode): void;
  geometry(): BoardGeometry | null;
  /** New / replaced sim: reset interpolation and effects. */
  resetBoard(): void;
}

export interface PuzzleTestState {
  screen: string;
  id: string | null;
  status: string | null;
  movesUsed: number;
  movesLeft: number;
  settled: boolean;
  hintsUsed: number;
  highlight: PuzzleMove | null;
  solution: PuzzleMove[];
  records: Record<string, { stars: number; moves: number }>;
}

/** Test hooks of the Puzzle mode (`window.__swaplight.puzzle`). */
export interface PuzzleTestApi {
  /** Open the pack select (like the menu card). */
  openMenu(): void;
  /** Start a puzzle by id (ignores locks). */
  open(id: string): boolean;
  /** Queue a real swap through the puzzle runner (applied on the next tick). */
  swap(row: number, col: number): void;
  /** Step until the board is at rest (returns the ticks run). */
  settle(): number;
  /** Play the stored solution with real swaps, settling between moves. */
  solve(): boolean;
  state(): PuzzleTestState;
}

export interface PuzzleMode {
  readonly actions: PuzzleActions;
  /** The menu's Puzzles card. */
  open(): void;
  afterTick(events: readonly SimEvent[]): void;
  /** Leaving to the main menu. */
  leave(): void;
  /** Hardware back on the result screen. */
  backFromResult(): void;
  readonly testApi: PuzzleTestApi;
}

function samePrefix(moves: readonly PuzzleMove[], solution: readonly PuzzleMove[]): boolean {
  return (
    moves.length <= solution.length &&
    moves.every((m, i) => m.row === solution[i]!.row && m.col === solution[i]!.col)
  );
}

/**
 * Coach-mark / hint target of swap (row, col)↔(row, col+1) in canvas CSS px. `sim` picks the
 * drag direction: when the left cell is empty the right block is dragged left.
 */
export function coachTarget(
  geo: BoardGeometry | null,
  move: PuzzleMove | null,
  key: number,
  sim?: SimState,
): CoachTarget | null {
  if (!geo || !move) return null;
  const leftEmpty = sim ? !sim.cells[move.row * sim.config.cols + move.col] : false;
  return {
    row: move.row,
    col: move.col,
    x: geo.originX + (move.col + 0.5) * geo.cellSize,
    y: geo.originY + (move.row + 0.5) * geo.cellSize - geo.riseOffsetPx,
    cellSize: geo.cellSize,
    fromRight: leftEmpty,
    key,
  };
}

export function createPuzzleMode(host: PuzzleModeHost): PuzzleMode {
  const { store, save, audio, haptics, scene, session, loop } = host;
  let ps: PuzzleSession | null = null;
  let hintsUsed = 0;
  let highlightMove: PuzzleMove | null = null;
  let resultTimer: number | undefined;
  /** The result panel is due but the game was paused meanwhile (shown on resume). */
  let resultDue = false;
  let finished = false;
  let lastKey = '';
  let coachKey = 0;

  const ui = (): PuzzleUiState => store.get().puzzle;
  const setUi = (patch: Partial<PuzzleUiState>): void =>
    store.set({ puzzle: { ...ui(), ...patch } });
  const syncRecords = (): void => store.set({ puzzleRecords: save.data.puzzles });

  const publish = (): void => {
    if (!ps) return;
    const def = ps.def;
    lastKey = `${ps.moves.length}|${ps.status}|${ps.undoStack.length}`;
    setUi({
      id: def.id,
      pack: def.pack,
      index: def.index,
      goal: def.goal,
      moveBudget: def.moves,
      movesUsed: ps.moves.length,
      par: def.par ?? def.moves,
      status: ps.status,
      canUndo: ps.undoStack.length > 0,
      hintsUsed,
      hasTextHint: !!def.hint,
      hintKey: def.hint ?? null,
    });
  };

  const showHighlight = (move: PuzzleMove | null): void => {
    highlightMove = move;
    setUi({ highlight: coachTarget(host.geometry(), move, ++coachKey, ps?.sim) });
  };

  const gate = (row: number, col: number): boolean => {
    if (!ps) return true;
    const reason = puzzleCanSwap(ps, row, col);
    if (reason === 'notSettled' && !ui().waiting) {
      // Gentle feedback: the drag waits; the moves counter shows a "settling" note.
      setUi({ waiting: true });
    }
    return reason === null;
  };

  const rejected = (reason: PuzzleSwapReject): void => {
    if (reason === 'notSettled') setUi({ waiting: true });
    else if (reason === 'noMoves') haptics.notify('warning');
  };

  const stepper = (inputs: readonly SimInput[], events: SimEvent[]): void => {
    if (!ps) return;
    const swap = inputs.find((i) => i.type === 'swap');
    if (swap && swap.type === 'swap') {
      const reason = puzzleSwap(ps, swap.row, swap.col, events);
      if (reason === null) {
        if (highlightMove) showHighlight(null);
        return;
      }
      rejected(reason);
    }
    puzzleTick(ps, events);
  };

  /** Point the session at the puzzle sim (after load / undo / restart). */
  const attach = (fresh: boolean): void => {
    if (!ps) return;
    if (fresh) {
      host.setLayoutMode('static');
      session.load(ps.sim);
      session.swapGate = gate;
      session.stepper = stepper;
    } else {
      session.sim = ps.sim;
      session.gesture.reset();
    }
    host.resetBoard();
    publish();
  };

  const clearTimers = (): void => {
    window.clearTimeout(resultTimer);
    resultTimer = undefined;
    resultDue = false;
  };

  const showResult = (): void => {
    if (store.get().mode !== 'puzzle' || !ps) return;
    if (store.get().screen !== 'playing') {
      resultDue = store.get().screen === 'paused';
      return;
    }
    resultDue = false;
    loop.pause();
    store.set({ screen: 'puzzleResult' });
  };

  const backToPlay = (): void => {
    finished = false;
    clearTimers();
    setUi({ result: null, hintCard: null, waiting: false });
    store.set({ screen: 'playing', mode: 'puzzle', overlays: [] });
    if (!host.isFrozen()) loop.resume();
  };

  const load = (def: PuzzleDef): void => {
    clearTimers();
    ps = createPuzzleSession(def);
    hintsUsed = 0;
    finished = false;
    highlightMove = null;
    setUi({ result: null, hintCard: null, highlight: null, waiting: false });
    attach(true);
    store.set({ screen: 'playing', mode: 'puzzle', overlays: [], scoreFlash: null });
    audio.playMusic('game', { seed: def.index * 7919 + def.pack, intensity: 0.12 });
    if (!host.isFrozen()) loop.resume();
  };

  const finish = (): void => {
    if (!ps || finished) return;
    finished = true;
    const def = ps.def;
    const won = ps.status === 'won';
    const movesUsed = ps.moves.length;
    const par = def.par ?? def.moves;
    let stars = 0;
    let prevStars = save.data.puzzles[def.id]?.stars ?? 0;
    if (won) {
      stars = computeStars({ movesUsed, par, hintsUsed });
      save.update((d) => {
        prevStars = recordPuzzleSolve(d, def.id, stars, movesUsed).prevStars;
      });
      syncRecords();
      void save.flush();
      audio.stageClear();
      haptics.notify('success');
      scene.flash('chain');
      scene.excite(1);
    } else {
      haptics.notify('warning');
    }
    if (highlightMove) showHighlight(null);
    setUi({
      result: {
        won,
        stars,
        prevStars,
        movesUsed,
        hintsUsed,
        withinPar: movesUsed <= par,
        nextId: nextPuzzle(def.id)?.id ?? null,
      },
      hintCard: null,
    });
    clearTimers();
    resultTimer = window.setTimeout(
      () => {
        resultTimer = undefined;
        showResult();
      },
      won ? RESULT_DELAY_WON_MS : RESULT_DELAY_LOST_MS,
    );
  };

  const afterTick = (): void => {
    if (!ps) return;
    const key = `${ps.moves.length}|${ps.status}|${ps.undoStack.length}`;
    if (key !== lastKey) publish();
    if (ui().waiting && puzzleIsSettled(ps)) setUi({ waiting: false });
    if (ps.status !== 'playing' && !finished) finish();
    else if (resultDue) showResult();
  };

  const showPacks = (): void => {
    clearTimers();
    loop.pause();
    syncRecords();
    store.set({ screen: 'puzzlePacks', mode: 'puzzle', overlays: [] });
    audio.playMusic('menu');
  };

  const showLevels = (pack: number): void => {
    clearTimers();
    loop.pause();
    syncRecords();
    if (ps) {
      ps = null;
      session.stepper = undefined;
      session.swapGate = undefined;
    }
    setUi({ pack, result: null, hintCard: null, highlight: null, waiting: false });
    store.set({ screen: 'puzzleLevels', mode: 'puzzle', overlays: [] });
    audio.playMusic('menu');
  };

  const play = (id: string, force = false): boolean => {
    const def = puzzleById(id);
    if (!def) return false;
    if (!force && !isPuzzleUnlocked(def, save.data.puzzles, store.get().fullVersion)) {
      audio.uiTap();
      haptics.notify('warning');
      host.showToast(
        puzzlePackAvailable(def.pack, store.get().fullVersion)
          ? t('puzzle.levelLocked')
          : t('puzzle.packLocked'),
      );
      return false;
    }
    load(def);
    return true;
  };

  /** Re-place the hint highlight after a resize. */
  scene.app.renderer.on('resize', () => {
    if (highlightMove) showHighlight(highlightMove);
  });

  const actions: PuzzleActions = {
    openPack(pack) {
      void audio.unlock();
      if (!puzzlePackAvailable(pack, store.get().fullVersion)) {
        audio.uiTap();
        haptics.notify('warning');
        host.showToast(t('puzzle.packLocked'));
        return;
      }
      audio.uiConfirm();
      showLevels(pack);
    },
    play(id) {
      void audio.unlock();
      if (play(id)) audio.uiConfirm();
    },
    toPacks() {
      audio.uiTap();
      showPacks();
    },
    toLevels() {
      audio.uiTap();
      showLevels(ps?.def.pack ?? ui().pack);
    },
    undo() {
      if (!ps) return;
      if (!puzzleUndo(ps)) {
        haptics.notify('warning');
        return;
      }
      audio.uiTap();
      haptics.selection();
      if (highlightMove) showHighlight(null);
      attach(false);
      if (store.get().screen === 'puzzleResult' || finished) backToPlay();
    },
    restart() {
      if (!ps) return;
      audio.uiTap();
      haptics.selection();
      puzzleRestart(ps);
      if (highlightMove) showHighlight(null);
      attach(false);
      backToPlay();
    },
    hint() {
      if (!ps || ps.status !== 'playing') return;
      audio.uiTap();
      if (ps.def.hint) setUi({ hintCard: 'text' });
      else if (ps.def.solution?.length) setUi({ hintCard: 'confirm' });
    },
    confirmHint() {
      const solution = ps?.def.solution;
      if (!ps || !solution?.length) return;
      audio.uiConfirm();
      hintsUsed++;
      if (!samePrefix(ps.moves, solution) || ps.status !== 'playing') {
        puzzleRestart(ps);
        attach(false);
      }
      setUi({ hintCard: null, hintsUsed });
      showHighlight(solution[ps.moves.length] ?? null);
    },
    closeHint() {
      audio.uiTap();
      setUi({ hintCard: null });
    },
    next() {
      const nextId = ui().result?.nextId;
      if (nextId && play(nextId, true)) {
        audio.uiConfirm();
        return;
      }
      audio.uiTap();
      showLevels(ps?.def.pack ?? ui().pack);
    },
  };

  const settle = (): number => {
    let n = 0;
    while (ps && !puzzleIsSettled(ps) && n < MAX_SETTLE_TICKS) {
      loop.stepTicks(1);
      n++;
    }
    return n;
  };

  const testApi: PuzzleTestApi = {
    openMenu: () => showPacks(),
    open: (id) => play(id, true),
    swap(row, col) {
      session.queue({ type: 'swap', row, col });
    },
    settle,
    solve() {
      const solution = ps?.def.solution;
      if (!ps || !solution) return false;
      for (const m of solution) {
        settle();
        session.queue({ type: 'swap', row: m.row, col: m.col });
        loop.stepTicks(1);
      }
      settle();
      return ps?.status === 'won';
    },
    state() {
      return {
        screen: store.get().screen,
        id: ps?.def.id ?? null,
        status: ps?.status ?? null,
        movesUsed: ps?.moves.length ?? 0,
        movesLeft: ps ? puzzleMovesLeft(ps) : 0,
        settled: ps ? puzzleIsSettled(ps) : true,
        hintsUsed,
        highlight: highlightMove,
        solution: [...(ps?.def.solution ?? [])],
        records: structuredClone(save.data.puzzles),
      };
    },
  };

  syncRecords();

  return {
    actions,
    open() {
      void audio.unlock();
      showPacks();
    },
    afterTick,
    leave() {
      clearTimers();
      ps = null;
      finished = false;
      highlightMove = null;
      setUi({ id: null, result: null, hintCard: null, highlight: null, waiting: false });
    },
    backFromResult() {
      actions.toLevels();
    },
    testApi,
  };
}
