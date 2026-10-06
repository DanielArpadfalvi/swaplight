import type { AudioEngine } from '../audio';
import type { CpuLevel } from '../core/ai';
import { TICKS_PER_SECOND } from '../core/config';
import { riseFraction } from '../core/sim';
import type { SimEvent, SimState } from '../core/types';
import type { AttackSlab, VersusStepResult } from '../core/versus';
import { attackCells } from '../core/versus';
import { dangerColumns } from '../core/view';
import { t } from '../i18n';
import type { Haptics } from '../platform/types';
import type { VersusLayout } from '../render/board/versusLayout';
import type { GameScene } from '../render/scene';
import type { GameLoop } from './loop';
import { recordGame } from './progress';
import type { SaveManager } from './save';
import type { EndlessSession } from './session';
import type { GameUiState, VersusActions, VersusHudState, VersusResultUi } from './state';
import type { Store } from './store';
import {
  BIG_INCOMING_CELLS,
  VersusMatch,
  garbageIcons,
  isCpuLevel,
  queuedCells,
  recordVersusMatch,
  versusLevelAvailable,
  versusRecord,
  type VersusFormat,
} from './versus';

/** Pause between the top-out and the result panel (lets the flash land). */
const ROUND_END_DELAY_MS = 1100;
const PLAYER_BOLT = 0x1ec8ff;
const PLAYER_CHAIN_BOLT = 0xff4fbf;
const CPU_BOLT = 0xff8a3d;

export interface VersusModeHost {
  store: Store<GameUiState>;
  save: SaveManager;
  audio: AudioEngine;
  haptics: Haptics;
  scene: GameScene;
  session: EndlessSession;
  loop: GameLoop;
  isFrozen(): boolean;
  showToast(text: string): void;
  /** Open the Full Version sheet (locked CPU level); falls back to a toast. */
  openPaywall?(reason: 'versus'): void;
  setLayoutMode(mode: 'versus'): void;
  /** Current versus layout (after `setLayoutMode('versus')`). */
  versusLayout(): VersusLayout | null;
  /** New sim loaded: reset interpolation / effects. */
  resetBoard(): void;
  randomSeed(): string;
  toMenu(): void;
}

/** Test hooks (`window.__swaplight.versus`). */
export interface VersusTestApi {
  /** Start a match right away (skips the difficulty select). */
  start(opts?: { seed?: string; level?: number; format?: VersusFormat }): void;
  state(): VersusTestState;
  /** Queue garbage onto the player (default) or the CPU, as if the other side attacked. */
  sendGarbage(width: number, height?: number, to?: 'player' | 'cpu'): void;
  /** End the current round as won / lost. */
  forceWin(): void;
  forceLose(): void;
  nextRound(): void;
  rematch(): void;
}

export interface VersusTestState {
  active: boolean;
  screen: string;
  level: number;
  format: VersusFormat;
  round: number;
  wins: [number, number];
  roundOver: boolean;
  matchOver: boolean;
  tick: number;
  /** Incoming queue entries / slabs on the board, per side. */
  playerQueue: number;
  playerSlabs: number;
  cpuQueue: number;
  cpuSlabs: number;
  sent: [number, number];
  cpuSwaps: number;
  record: { played: number; won: number; lost: number };
}

export interface VersusMode {
  readonly actions: VersusActions;
  /** Menu card: open the difficulty select. */
  open(): void;
  /** One fixed tick of the match (steps both boards); returns the player's events. */
  tick(now: number): SimEvent[];
  afterTick(): void;
  /** The CPU board to draw, or null outside a match. */
  readonly opponentSim: SimState | null;
  /** Leaving to the menu: drop the match (an unfinished match is not recorded). */
  leave(): void;
  readonly testApi: VersusTestApi;
}

export function createVersusMode(host: VersusModeHost): VersusMode {
  const { store, save, audio, haptics, scene, session, loop } = host;
  let match: VersusMatch | null = null;
  let endTimer: number | undefined;
  let warnKey = 0;
  let lastHudKey = '';

  const syncRecords = (): void => store.set({ versusRecords: { ...save.data.versus } });

  const publishMatch = (): void => {
    if (!match) {
      store.set({ versus: null });
      return;
    }
    store.set({
      versus: {
        level: match.level,
        format: match.format,
        round: match.round,
        wins: [match.wins[0], match.wins[1]],
      },
    });
  };

  const publishHud = (force = false): void => {
    if (!match) return;
    const p = match.player;
    const o = match.opponent;
    const queue = garbageIcons(p);
    const oppQueue = garbageIcons(o);
    const oppDanger = o.danger || dangerColumns(o).length > 0;
    const sent = match.vs.sides[0].stats.sent;
    const oppSent = match.vs.sides[1].stats.sent;
    const key = [
      sent,
      oppSent,
      oppDanger,
      warnKey,
      queue.map((q) => `${q.id}:${q.width}x${q.height}`).join(','),
      oppQueue.map((q) => `${q.id}:${q.width}x${q.height}`).join(','),
    ].join('|');
    if (!force && key === lastHudKey) return;
    lastHudKey = key;
    const hud: VersusHudState = {
      sent,
      oppSent,
      queue,
      oppQueue,
      queueCells: queuedCells(p),
      oppDanger,
      armMs: Math.round((match.vs.rules.attackDelay / TICKS_PER_SECOND) * 1000),
      warnKey,
    };
    store.set({ versusHud: hud });
  };

  /** Canvas point of a grid cell on the player's / CPU's board. */
  const cellPoint = (side: 0 | 1, row: number, col: number): { x: number; y: number } | null => {
    const vl = host.versusLayout();
    if (!vl || !match) return null;
    const l = side === 0 ? vl.main : vl.mini;
    const sim = side === 0 ? match.player : match.opponent;
    return {
      x: l.originX + (col + 0.5) * l.cellSize,
      y: l.originY + (row - riseFraction(sim) + 0.5) * l.cellSize,
    };
  };

  /** Where an attack leaves the sender's board: the last match of the tick, else mid-board. */
  const attackOrigin = (
    side: 0 | 1,
    events: readonly SimEvent[],
  ): { x: number; y: number } | null => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i] as SimEvent;
      if (e.type === 'matched' && e.blocks.length > 0) {
        let r = 0;
        let c = 0;
        for (const b of e.blocks) {
          r += b.row;
          c += b.col;
        }
        return cellPoint(side, r / e.blocks.length, c / e.blocks.length);
      }
    }
    if (!match) return null;
    const sim = side === 0 ? match.player : match.opponent;
    return cellPoint(side, sim.config.rows * 0.45, (sim.config.cols - 1) / 2);
  };

  const fireAttacks = (from: 0 | 1, slabs: AttackSlab[], events: readonly SimEvent[]): void => {
    const vl = host.versusLayout();
    const origin = attackOrigin(from, events);
    if (!vl || !origin) return;
    const strip = from === 0 ? vl.miniQueue : vl.queue;
    const cells = attackCells(slabs);
    const chain = slabs.some((s) => s.fromChain);
    const tx = strip.x + Math.min(strip.w - 12, 14 + (from === 0 ? 0 : 40));
    const ty = strip.y + strip.h / 2;
    const color = from === 0 ? (chain ? PLAYER_CHAIN_BOLT : PLAYER_BOLT) : CPU_BOLT;
    const width = Math.min(9, 3.5 + cells * 0.18);
    audio.play('attack');
    scene.bolt(origin.x, origin.y, tx, ty, color, {
      width,
      life: 0.48,
      onArrive: () => {
        scene.sparks(tx, ty, color, 8 + Math.min(12, cells), from === 0 ? 0.6 : 0.8);
        if (from === 1) {
          audio.play('incoming');
          haptics.impact(cells >= BIG_INCOMING_CELLS ? 'heavy' : 'light');
          if (cells >= BIG_INCOMING_CELLS) {
            scene.shake(Math.min(0.6, 0.25 + cells * 0.01));
            warnKey++;
            publishHud(true);
          }
        }
      },
    });
  };

  const tick = (now: number): SimEvent[] => {
    const m = match;
    if (!m) return session.tick(now);
    const inputs = session.collectInputs(now);
    const res: VersusStepResult = m.step(inputs);
    const events = session.acceptEvents(res.events[0]);
    scene.opponent?.captureTick(m.opponent);
    for (const e of res.events[1]) {
      if (e.type === 'popped' && e.index % 2 === 0) {
        scene.burstOpponent(m.opponent, e.row, e.col, e.color);
      }
    }
    if (res.sent[0].length > 0) fireAttacks(0, res.sent[0], res.events[0]);
    if (res.sent[1].length > 0) fireAttacks(1, res.sent[1], res.events[1]);
    return events;
  };

  const resultFor = (winner: 0 | 1 | null): VersusResultUi | null => {
    if (!match) return null;
    const totals = match.totals();
    const last = match.rounds[match.rounds.length - 1];
    return {
      level: match.level,
      winner,
      matchOver: match.matchOver,
      matchWinner: match.matchWinner,
      round: match.round,
      wins: [match.wins[0], match.wins[1]],
      format: match.format,
      sent: match.matchOver ? totals.sent : (last?.sent[0] ?? 0),
      received: match.matchOver ? totals.received : (last?.sent[1] ?? 0),
      seconds: Math.round((match.matchOver ? totals.ticks : (last?.ticks ?? 0)) / TICKS_PER_SECOND),
      maxChain: match.matchOver ? totals.maxChain : (last?.maxChain ?? 1),
      record: versusRecord(save.data, match.level),
    };
  };

  const onRoundEnd = (): void => {
    const m = match;
    if (!m) return;
    const round = m.finishRound();
    if (!round) return;
    loop.pause();
    session.setRaiseButton(false);
    store.set({ raiseHeld: false });
    const won = round.winner === 0;
    if (m.matchOver) {
      const totals = m.totals();
      save.update((d) => {
        recordVersusMatch(d, m.level, m.matchWinner, totals.ticks, totals.sent);
        let blocks = 0;
        for (const r of m.rounds) blocks += r.blocksCleared;
        // Versus has no score record: the per-difficulty record lives in `save.versus`.
        recordGame(d, 'versus', {
          score: 0,
          maxChain: totals.maxChain,
          maxCombo: totals.maxCombo,
          blocksCleared: blocks,
          seconds: Math.floor(totals.ticks / TICKS_PER_SECOND),
        });
      });
      void save.flush();
      syncRecords();
    }
    publishMatch();
    if (won) {
      audio.stageClear();
      haptics.notify('success');
      scene.flash('chain');
      scene.excite(1);
    } else {
      scene.flash('gameOver');
      haptics.notify('warning');
      if (round.winner === 1) audio.gameOver();
    }
    audio.setIntensity(0.15);
    const result = resultFor(round.winner);
    window.clearTimeout(endTimer);
    endTimer = window.setTimeout(() => {
      if (match === m) store.set({ screen: 'versusResult', versusResult: result });
    }, ROUND_END_DELAY_MS);
  };

  const loadRound = (): void => {
    const m = match;
    if (!m) return;
    host.setLayoutMode('versus');
    session.load(m.player);
    host.resetBoard();
    const opp = scene.opponent;
    opp?.resetTracking();
    opp?.captureTick(m.opponent);
    lastHudKey = '';
    publishMatch();
    publishHud(true);
  };

  const beginPlay = (): void => {
    const m = match;
    if (!m) return;
    store.set({ screen: 'playing', mode: 'versus', overlays: [], versusResult: null });
    const sim = m.player;
    const mid = (sim.config.cols - 1) / 2;
    const label = m.format === 'bo3' ? t('versus.round', { number: m.round }) : t('versus.fight');
    scene.popup(sim, label.toUpperCase(), sim.config.rows * 0.38, mid, 'level', 0.95);
    audio.playMusic(m.level >= 4 ? 'boss' : 'game', { seed: sim.rng.a >>> 0, intensity: 0.3 });
    audio.uiConfirm();
    if (!host.isFrozen()) loop.resume();
  };

  const startMatch = (seed: string, level: CpuLevel, format: VersusFormat): void => {
    window.clearTimeout(endTimer);
    match = new VersusMatch(seed, level, format);
    store.set({ versusSetup: { level, format }, versusResult: null });
    loadRound();
    beginPlay();
  };

  const open = (): void => {
    window.clearTimeout(endTimer);
    match = null;
    const { level, format } = store.get().versusSetup;
    const lvl = versusLevelAvailable(level, store.get().fullVersion) ? level : 1;
    syncRecords();
    store.set({
      screen: 'versusSetup',
      mode: 'versus',
      overlays: [],
      versus: null,
      versusHud: null,
      versusResult: null,
      versusSetup: { level: lvl, format },
    });
    audio.playMusic('menu');
  };

  /** A Full-Version-only CPU level was picked: offer the unlock. */
  const lockedLevel = (): void => {
    if (host.openPaywall) {
      host.openPaywall('versus');
      return;
    }
    haptics.notify('warning');
    host.showToast(t('versus.needsFull'));
  };

  const actions: VersusActions = {
    selectLevel(level) {
      audio.uiTap();
      if (!isCpuLevel(level)) return;
      if (!versusLevelAvailable(level, store.get().fullVersion)) {
        lockedLevel();
        return;
      }
      haptics.selection();
      store.set({ versusSetup: { ...store.get().versusSetup, level } });
    },
    selectFormat(format) {
      audio.uiTap();
      haptics.selection();
      store.set({ versusSetup: { ...store.get().versusSetup, format } });
    },
    start() {
      void audio.unlock();
      const { level, format } = store.get().versusSetup;
      if (!versusLevelAvailable(level, store.get().fullVersion)) {
        lockedLevel();
        return;
      }
      startMatch(host.randomSeed(), level, format);
    },
    nextRound() {
      const m = match;
      if (!m || m.matchOver) return;
      m.nextRound();
      loadRound();
      beginPlay();
    },
    rematch() {
      const m = match;
      const { level, format } = m ?? store.get().versusSetup;
      startMatch(host.randomSeed(), level, format);
    },
    changeOpponent() {
      audio.uiTap();
      host.toMenu();
      open();
    },
  };

  const api: VersusTestApi = {
    start(opts = {}) {
      const level = isCpuLevel(opts.level) ? opts.level : 1;
      startMatch(opts.seed ?? host.randomSeed(), level, opts.format ?? 'single');
    },
    state() {
      const m = match;
      const rec = versusRecord(save.data, m?.level ?? store.get().versusSetup.level);
      return {
        active: m !== null,
        screen: store.get().screen,
        level: m?.level ?? store.get().versusSetup.level,
        format: m?.format ?? store.get().versusSetup.format,
        round: m?.round ?? 0,
        wins: m ? [m.wins[0], m.wins[1]] : [0, 0],
        roundOver: m?.vs.over ?? false,
        matchOver: m?.matchOver ?? false,
        tick: m?.vs.tick ?? 0,
        playerQueue: m?.player.garbageQueue.length ?? 0,
        playerSlabs: m?.player.garbage.length ?? 0,
        cpuQueue: m?.opponent.garbageQueue.length ?? 0,
        cpuSlabs: m?.opponent.garbage.length ?? 0,
        sent: m ? [m.vs.sides[0].stats.sent, m.vs.sides[1].stats.sent] : [0, 0],
        cpuSwaps: m?.cpu.stats.swaps ?? 0,
        record: { played: rec.played, won: rec.won, lost: rec.lost },
      };
    },
    sendGarbage(width, height = 1, to = 'player') {
      const m = match;
      if (!m) return;
      const side = to === 'player' ? 0 : 1;
      m.sendGarbage(side, width, height);
      fireAttacks(side === 0 ? 1 : 0, [{ width, height, fromChain: height > 1 }], []);
      publishHud(true);
    },
    forceWin() {
      match?.forceRound(0);
      onRoundEnd();
    },
    forceLose() {
      match?.forceRound(1);
      onRoundEnd();
    },
    nextRound: () => actions.nextRound(),
    rematch: () => actions.rematch(),
  };

  return {
    actions,
    open,
    tick,
    afterTick() {
      if (!match) return;
      publishHud();
      if (match.roundOver) onRoundEnd();
    },
    get opponentSim() {
      return match ? match.opponent : null;
    },
    leave() {
      window.clearTimeout(endTimer);
      match = null;
      store.set({ versus: null, versusHud: null, versusResult: null });
    },
    testApi: api,
  };
}
