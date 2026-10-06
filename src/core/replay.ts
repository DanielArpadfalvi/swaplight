import type { SimConfig } from './config';
import type { Seed } from './rng';
import { createSim, step, type SimHooks } from './sim';
import type { SimEvent, SimInput, SimMode, SimState } from './types';

/**
 * Sparse input log. `tick` is the value of `sim.tick` *before* the step that
 * consumed the inputs (i.e. the 0-based step index). `ticks` = steps recorded.
 */
export interface InputLogEntry {
  tick: number;
  inputs: SimInput[];
}

export interface InputLog {
  ticks: number;
  entries: InputLogEntry[];
}

export function createInputLog(): InputLog {
  return { ticks: 0, entries: [] };
}

/** Record the inputs consumed by step number `tick` (empty input lists are not stored). */
export function recordInputs(log: InputLog, tick: number, inputs: readonly SimInput[]): void {
  if (inputs.length > 0) log.entries.push({ tick, inputs: inputs.map((i) => ({ ...i })) });
  log.ticks = Math.max(log.ticks, tick + 1);
}

/** Step the sim and record its inputs in one call. */
export function stepRecorded(
  sim: SimState,
  log: InputLog,
  inputs: readonly SimInput[] = [],
  hooks?: SimHooks,
): SimEvent[] {
  if (sim.gameOver) return [];
  recordInputs(log, sim.tick, inputs);
  return step(sim, inputs, hooks);
}

export interface ReplayOptions {
  mode?: SimMode;
  hooks?: SimHooks;
  /** Called after every step (e.g. to collect events). */
  onStep?: (sim: SimState, events: SimEvent[]) => void;
}

/** Re-run a game from seed + config + input log. Returns the final state. */
export function replay(
  seed: Seed,
  config: Partial<SimConfig>,
  log: InputLog,
  options: ReplayOptions = {},
): SimState {
  const sim = createSim(seed, config, options.mode);
  const byTick = new Map<number, SimInput[]>();
  for (const entry of log.entries) {
    const list = byTick.get(entry.tick) ?? [];
    list.push(...entry.inputs);
    byTick.set(entry.tick, list);
  }
  for (let t = 0; t < log.ticks && !sim.gameOver; t++) {
    const events = step(sim, byTick.get(t) ?? [], options.hooks);
    options.onStep?.(sim, events);
  }
  return sim;
}

/** JSON with object keys sorted, so equal states serialize identically. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** cyrb53 string hash → 14 hex chars. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

/** Stable hash of the complete simulation state. */
export function hashState(sim: SimState): string {
  return hashString(stableStringify(sim));
}
