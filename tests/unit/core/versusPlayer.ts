import { TICKS_PER_SECOND } from '../../../src/core/config';
import { topRow } from '../../../src/core/run';
import type { SimInput, SimState } from '../../../src/core/types';
import { VersusMatch } from '../../../src/game/versus';
import { bestSwap, isQuiet } from './run/bot';

/**
 * Scripted "human" player for versus balance checks: greedy on a colour-grid model with a
 * 2-ply lookahead (a setup swap + a clearing swap ≈ a 2-cell drag), acting only on a quiet
 * board, at most one *match* per `matchTicks` (a setup swap only costs `setupTicks`).
 */
export interface PlayerModel {
  /** Ticks after a clearing swap before the next move (60 / matches per second). */
  matchTicks: number;
  /** Ticks after a non-clearing setup swap before the next move. */
  setupTicks: number;
  /** Hold raise while the stack is lower than this and nothing is incoming. */
  raiseBelow: number;
}

export function playerModel(secondsPerMatch: number): PlayerModel {
  return {
    matchTicks: Math.round(secondsPerMatch * TICKS_PER_SECOND),
    setupTicks: Math.round(0.3 * TICKS_PER_SECOND),
    raiseBelow: 4,
  };
}

export interface PlayerMemory {
  next: number;
  raising: boolean;
}

export function playerInputs(sim: SimState, model: PlayerModel, mem: PlayerMemory): SimInput[] {
  const out: SimInput[] = [];
  const height = sim.config.rows - topRow(sim);
  const wantRaise =
    height < model.raiseBelow && sim.groups.length === 0 && sim.garbageQueue.length === 0;
  if (wantRaise !== mem.raising) {
    mem.raising = wantRaise;
    out.push({ type: 'raise', active: wantRaise });
  }
  if (sim.tick >= mem.next && isQuiet(sim)) {
    const move = bestSwap(sim, { raiseBelow: model.raiseBelow, lookahead: true });
    if (move) {
      out.push({ type: 'swap', row: move.row, col: move.col });
      mem.next = sim.tick + (move.clears ? model.matchTicks : model.setupTicks);
    }
  }
  return out;
}

export interface CpuMatchResult {
  /** 0 = player, 1 = CPU, null = draw / time limit. */
  winner: 0 | 1 | null;
  seconds: number;
  sent: [number, number];
  cpuSwaps: number;
  /** Blocks the player cleared. */
  pBlocks: number;
}

/** One round against a CPU level through the real game glue (`VersusMatch`, incl. handicaps). */
export function playCpuRound(
  seed: string,
  level: number,
  model: PlayerModel | null,
  maxSeconds = 300,
  /** Tuning experiments: adjust the fresh match (e.g. its CPU profile) before play. */
  tweak?: (match: VersusMatch) => void,
): CpuMatchResult {
  const match = new VersusMatch(seed, Math.max(1, Math.min(5, level)) as 1 | 2 | 3 | 4 | 5);
  tweak?.(match);
  const mem: PlayerMemory = { next: 0, raising: false };
  const limit = maxSeconds * TICKS_PER_SECOND;
  while (!match.vs.over && match.vs.tick < limit) {
    match.step(model ? playerInputs(match.player, model, mem) : []);
  }
  const vs = match.vs;
  return {
    winner: vs.over && !vs.draw ? vs.winner : null,
    seconds: Math.round(vs.tick / TICKS_PER_SECOND),
    sent: [vs.sides[0].stats.sent, vs.sides[1].stats.sent],
    cpuSwaps: match.cpu.stats.swaps,
    pBlocks: match.player.stats.blocksCleared,
  };
}
