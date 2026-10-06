import { loadAscii } from '../../../src/core/ascii';
import type { SimConfig } from '../../../src/core/config';
import { createSim, step, type SimHooks } from '../../../src/core/sim';
import type { SimEvent, SimInput, SimMode, SimState } from '../../../src/core/types';

/** Build a sim from an ASCII board (static mode by default: no rise, no levels). */
export function simFromAscii(
  ascii: string,
  config: Partial<SimConfig> = {},
  mode: SimMode = 'static',
): SimState {
  const sim = createSim('ascii', config, mode);
  loadAscii(sim, ascii);
  return sim;
}

/** Step `n` ticks with no input, collecting all events. */
export function run(sim: SimState, n: number, hooks?: SimHooks): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(sim, [], hooks));
  return events;
}

/** Step until the board is fully settled (no groups, no moving/locked blocks). */
export function settle(sim: SimState, max = 2000, hooks?: SimHooks): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    if (isSettled(sim)) return events;
    events.push(...step(sim, [], hooks));
  }
  throw new Error('board did not settle');
}

export function isSettled(sim: SimState): boolean {
  return (
    sim.groups.length === 0 && sim.cells.every((b) => !b || b.state === 'idle') && sim.chain === 1
  );
}

export function swap(sim: SimState, row: number, col: number, hooks?: SimHooks): SimEvent[] {
  const input: SimInput = { type: 'swap', row, col };
  return step(sim, [input], hooks);
}

export function ofType<T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}
