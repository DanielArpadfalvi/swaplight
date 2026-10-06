import { TICKS_PER_SECOND } from '../core/config';
import { queueGarbage } from '../core/garbage';
import { cpuStep, createCpu, type CpuLevel, type CpuState } from '../core/ai';
import {
  createVersus,
  stepVersus,
  type VersusSideIndex,
  type VersusState,
  type VersusStepResult,
} from '../core/versus';
import type { SimInput, SimState } from '../core/types';
import type { SaveData, VersusRecord } from './save';

/**
 * Versus CPU glue (pure, no DOM / Pixi): a match of one or more rounds against a CPU level, stepped
 * in lockstep (`stepVersus`) with the CPU's inputs from `cpuStep`. Side 0 is the player.
 */

export const VERSUS_LEVELS: readonly CpuLevel[] = [1, 2, 3, 4, 5];

/** Difficulties playable without the Full Version (Easy, Normal). */
export const FREE_VERSUS_LEVELS: readonly CpuLevel[] = [1, 2];

/** i18n id of a level (`versus.level.<id>`, `versus.cpu.<id>`). */
export const VERSUS_LEVEL_IDS: Readonly<Record<CpuLevel, string>> = Object.freeze({
  1: 'easy',
  2: 'normal',
  3: 'hard',
  4: 'expert',
  5: 'insane',
});

export type VersusFormat = 'single' | 'bo3';

export function isCpuLevel(n: unknown): n is CpuLevel {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;
}

export function versusLevelAvailable(level: number, fullVersion: boolean): boolean {
  if (!isCpuLevel(level)) return false;
  return fullVersion || FREE_VERSUS_LEVELS.includes(level);
}

/** Round wins needed to take the match. */
export function roundsToWin(format: VersusFormat): number {
  return format === 'bo3' ? 2 : 1;
}

export interface VersusRoundResult {
  round: number;
  /** 0 = player, 1 = CPU, null = draw. */
  winner: VersusSideIndex | null;
  ticks: number;
  /** Garbage cells sent by [player, CPU]. */
  sent: [number, number];
  maxChain: number;
  maxCombo: number;
  score: number;
  blocksCleared: number;
}

/** A best-of-N match against one CPU level. */
export class VersusMatch {
  readonly seed: string;
  readonly level: CpuLevel;
  readonly format: VersusFormat;
  round = 1;
  wins: [number, number] = [0, 0];
  readonly rounds: VersusRoundResult[] = [];
  vs!: VersusState;
  cpu!: CpuState;
  private roundDone = false;

  constructor(seed: string, level: CpuLevel, format: VersusFormat = 'single') {
    this.seed = seed;
    this.level = level;
    this.format = format;
    this.startRound();
  }

  get player(): SimState {
    return this.vs.sides[0].sim;
  }

  get opponent(): SimState {
    return this.vs.sides[1].sim;
  }

  /** Seed of the current round's boards (both sides share it). */
  get roundSeed(): string {
    return `${this.seed}|r${this.round}`;
  }

  private startRound(): void {
    this.vs = createVersus(this.roundSeed);
    this.cpu = createCpu(this.level, { seed: `${this.roundSeed}|cpu` });
    this.roundDone = false;
  }

  /** One tick: the CPU decides, then both sims step and exchange garbage. */
  step(playerInputs: readonly SimInput[]): VersusStepResult {
    const cpuInputs = this.vs.over ? [] : cpuStep(this.cpu, this.opponent);
    return stepVersus(this.vs, playerInputs, cpuInputs);
  }

  /** The current round ended (top-out or forced) and has not been scored yet. */
  get roundOver(): boolean {
    return this.vs.over && !this.roundDone;
  }

  /** Force the current round's result (test hooks / quitting). */
  forceRound(winner: VersusSideIndex | null): void {
    if (this.vs.over) return;
    this.vs.over = true;
    this.vs.winner = winner;
    this.vs.draw = winner === null;
  }

  /** Score the finished round once; returns its result. */
  finishRound(): VersusRoundResult | null {
    if (!this.vs.over || this.roundDone) return null;
    this.roundDone = true;
    const winner = this.vs.draw ? null : this.vs.winner;
    if (winner !== null) this.wins[winner]++;
    const p = this.player;
    const result: VersusRoundResult = {
      round: this.round,
      winner,
      ticks: this.vs.tick,
      sent: [this.vs.sides[0].stats.sent, this.vs.sides[1].stats.sent],
      maxChain: p.stats.maxChain,
      maxCombo: p.stats.maxCombo,
      score: p.score,
      blocksCleared: p.stats.blocksCleared,
    };
    this.rounds.push(result);
    return result;
  }

  get matchOver(): boolean {
    const need = roundsToWin(this.format);
    return this.wins[0] >= need || this.wins[1] >= need;
  }

  /** 0 = player won the match, 1 = CPU, null while undecided. */
  get matchWinner(): VersusSideIndex | null {
    const need = roundsToWin(this.format);
    if (this.wins[0] >= need) return 0;
    if (this.wins[1] >= need) return 1;
    return null;
  }

  /** Start the next round of an undecided match (a draw replays the round number). */
  nextRound(): void {
    if (this.matchOver) return;
    this.round++;
    this.startRound();
  }

  /** Queue garbage onto a side directly (scripted attacks in tests / tutorials). */
  sendGarbage(to: VersusSideIndex, width: number, height = 1): void {
    const q = queueGarbage(this.vs.sides[to].sim, width, height, {
      delay: this.vs.rules.attackDelay,
      fromChain: height > 1,
    });
    const cells = q.width * q.height;
    this.vs.sides[to].stats.received += cells;
    this.vs.sides[to === 0 ? 1 : 0].stats.sent += cells;
  }

  /** Match totals over the scored rounds. */
  totals(): { ticks: number; sent: number; received: number; maxChain: number; maxCombo: number } {
    let ticks = 0;
    let sent = 0;
    let received = 0;
    let maxChain = 1;
    let maxCombo = 0;
    for (const r of this.rounds) {
      ticks += r.ticks;
      sent += r.sent[0];
      received += r.sent[1];
      maxChain = Math.max(maxChain, r.maxChain);
      maxCombo = Math.max(maxCombo, r.maxCombo);
    }
    return { ticks, sent, received, maxChain, maxCombo };
  }
}

export const EMPTY_VERSUS_RECORD: Readonly<VersusRecord> = Object.freeze({
  played: 0,
  won: 0,
  lost: 0,
  fastestWin: 0,
  garbageSent: 0,
});

export function versusRecord(save: SaveData, level: number): VersusRecord {
  return { ...EMPTY_VERSUS_RECORD, ...save.versus[String(level)] };
}

/** Fold a finished match into the per-difficulty record (mutates `save`; use in `update`). */
export function recordVersusMatch(
  save: SaveData,
  level: number,
  winner: VersusSideIndex | null,
  ticks: number,
  garbageSent: number,
): VersusRecord {
  const prev = versusRecord(save, level);
  const seconds = Math.max(1, Math.round(ticks / TICKS_PER_SECOND));
  const won = winner === 0;
  const next: VersusRecord = {
    played: prev.played + 1,
    won: prev.won + (won ? 1 : 0),
    lost: prev.lost + (winner === 1 ? 1 : 0),
    fastestWin: won
      ? prev.fastestWin > 0
        ? Math.min(prev.fastestWin, seconds)
        : seconds
      : prev.fastestWin,
    garbageSent: prev.garbageSent + Math.max(0, Math.floor(garbageSent)),
  };
  save.versus[String(level)] = next;
  return next;
}

/** Incoming-garbage preview entry for the HUD. */
export interface GarbageIcon {
  id: number;
  width: number;
  height: number;
  chain: boolean;
}

export function garbageIcons(sim: SimState, max = 6): GarbageIcon[] {
  return sim.garbageQueue
    .slice(0, max)
    .map((q) => ({ id: q.id, width: q.width, height: q.height, chain: q.fromChain }));
}

/** Total queued garbage cells. */
export function queuedCells(sim: SimState): number {
  let n = 0;
  for (const q of sim.garbageQueue) n += q.width * q.height;
  return n;
}

/** Incoming garbage this large (cells) triggers the big-warning shake. */
export const BIG_INCOMING_CELLS = 12;
