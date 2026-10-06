import { TICKS_PER_SECOND, type SimConfig } from './config';
import { queueGarbage } from './garbage';
import { hashString, recordInputs, stableStringify, type InputLogEntry } from './replay';
import type { Seed } from './rng';
import { createSim, step, type SimHooks } from './sim';
import type { SimEvent, SimInput, SimMode, SimModifiers, SimState } from './types';

/**
 * Versus: two sims stepped in lockstep with a deterministic garbage exchange.
 *
 * Attack table (Panel de Pon style):
 * - combo (one match of n blocks, any chain level): 4→3-wide, 5→4, 6→5, 7→6 (×1 row);
 *   n ≥ 8 → (n−1) cells split into ⌈(n−1)/cols⌉ balanced slabs (8→3+4, 9→4+4, 13→6+6, …).
 *   Sent at once (on the `matched` event).
 * - chain of length n ≥ 2 → one cols-wide slab of n−1 rows, sent when the chain ends
 *   (`chainEnd`).
 *
 * Exchange: each tick both sims step first; then each side's new attacks first cancel
 * its own *incoming* queue (front first, by cells; leftovers are sent reduced), and only
 * then are both sides' remaining attacks queued to the opponent with `attackDelay`.
 * Cancelling against the pre-tick queues makes the exchange symmetric (A/B order never
 * matters). The receiver's `sim.garbageQueue` is the "incoming" preview.
 */

export interface AttackSlab {
  width: number;
  height: number;
  fromChain: boolean;
}

/** Garbage sent by a single match of `combo` blocks. */
export function comboGarbage(combo: number, cols = 6): AttackSlab[] {
  if (combo < 4) return [];
  const total = combo - 1;
  if (total <= cols) return [{ width: total, height: 1, fromChain: false }];
  const n = Math.ceil(total / cols);
  const base = Math.floor(total / n);
  const extra = total - base * n;
  const out: AttackSlab[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ width: base + (i >= n - extra ? 1 : 0), height: 1, fromChain: false });
  }
  return out;
}

/** Garbage sent when a chain of `length` ends. */
export function chainGarbage(length: number, cols = 6): AttackSlab[] {
  if (length < 2) return [];
  return [{ width: cols, height: length - 1, fromChain: true }];
}

/** Total cells of a list of slabs. */
export function attackCells(slabs: readonly AttackSlab[]): number {
  let n = 0;
  for (const s of slabs) n += s.width * s.height;
  return n;
}

/** Outgoing garbage produced by one tick's events. */
export function attacksFromEvents(events: readonly SimEvent[], cols = 6): AttackSlab[] {
  const out: AttackSlab[] = [];
  for (const e of events) {
    if (e.type === 'matched') out.push(...comboGarbage(e.combo, cols));
    else if (e.type === 'chainEnd') out.push(...chainGarbage(e.length, cols));
  }
  return out;
}

/**
 * Per-side attack handicap (used to make low CPU levels gentler). Applied to what a side
 * *sends* after cancelling; cancelling its own incoming garbage is never handicapped.
 */
export interface VersusSideRules {
  /**
   * Percentage (0–100) of this side's outgoing garbage that is actually sent. Whole slabs are
   * dropped deterministically: each attack adds `cells × percent / 100` credit and a slab is
   * sent only while the credit covers its cells (so 50 % sends about every other slab).
   */
  attackPercent: number;
  /** This side's attacks are discarded before this versus tick (warm-up, 0 = none). */
  attackFromTick: number;
  /** Extra ticks added to `attackDelay` for this side's attacks. */
  extraDelay: number;
}

export const DEFAULT_SIDE_RULES: Readonly<VersusSideRules> = Object.freeze({
  attackPercent: 100,
  attackFromTick: 0,
  extraDelay: 0,
});

export interface VersusRules {
  /** Ticks between sending garbage and it being allowed to drop (default 1 s). */
  attackDelay: number;
  /** Attacks first cancel the sender's own incoming queue (default true). */
  cancel: boolean;
  /** Both sides get the same board/preview seed (default true). */
  sameBoards: boolean;
  /** Per-side attack handicaps ([side A, side B]). */
  sides: [VersusSideRules, VersusSideRules];
}

/** Rules for `createVersus`: like `VersusRules`, with partial per-side rules. */
export type VersusRulesInput = Partial<Omit<VersusRules, 'sides'>> & {
  sides?: readonly [Partial<VersusSideRules>?, Partial<VersusSideRules>?];
};

export const DEFAULT_VERSUS_RULES: Readonly<VersusRules> = Object.freeze({
  attackDelay: TICKS_PER_SECOND,
  cancel: true,
  sameBoards: true,
  sides: Object.freeze([DEFAULT_SIDE_RULES, DEFAULT_SIDE_RULES]) as unknown as [
    VersusSideRules,
    VersusSideRules,
  ],
});

/** Merge rule overrides onto the defaults (fresh plain object, JSON safe). */
export function makeVersusRules(rules: VersusRulesInput = {}): VersusRules {
  const { sides, ...rest } = rules;
  return {
    ...DEFAULT_VERSUS_RULES,
    ...rest,
    sides: [
      { ...DEFAULT_SIDE_RULES, ...sides?.[0] },
      { ...DEFAULT_SIDE_RULES, ...sides?.[1] },
    ],
  };
}

export interface VersusSideConfig {
  config?: Partial<SimConfig>;
  /** Default 'endless'. */
  mode?: SimMode;
  modifiers?: SimModifiers;
}

export interface VersusSideStats {
  /** Garbage cells sent to the opponent (after cancelling). */
  sent: number;
  /** Garbage cells of own incoming queue cancelled by own attacks. */
  cancelled: number;
  /** Garbage cells received into the queue. */
  received: number;
  /** Number of slabs sent. */
  slabsSent: number;
}

export interface VersusSide {
  sim: SimState;
  stats: VersusSideStats;
  /** Attack credit for `VersusSideRules.attackPercent` (cells × percent; plain number). */
  attackCredit: number;
}

export type VersusSideIndex = 0 | 1;

/** Plain data (JSON safe). */
export interface VersusState {
  seed: Seed;
  rules: VersusRules;
  tick: number;
  sides: [VersusSide, VersusSide];
  over: boolean;
  /** 0 / 1 = that side won; null while playing or on a draw. */
  winner: VersusSideIndex | null;
  draw: boolean;
}

export function versusSeed(seed: Seed, side: VersusSideIndex, rules: VersusRules): string {
  return rules.sameBoards ? `${seed}|vs` : `${seed}|vs|${side === 0 ? 'A' : 'B'}`;
}

export function createVersus(
  seed: Seed,
  configA: VersusSideConfig = {},
  configB: VersusSideConfig = {},
  rules: VersusRulesInput = {},
): VersusState {
  const r = makeVersusRules(rules);
  const side = (cfg: VersusSideConfig, index: VersusSideIndex): VersusSide => ({
    sim: createSim(versusSeed(seed, index, r), cfg.config, cfg.mode ?? 'endless', {
      modifiers: cfg.modifiers,
    }),
    stats: { sent: 0, cancelled: 0, received: 0, slabsSent: 0 },
    attackCredit: 0,
  });
  return {
    seed,
    rules: r,
    tick: 0,
    sides: [side(configA, 0), side(configB, 1)],
    over: false,
    winner: null,
    draw: false,
  };
}

export interface VersusStepResult {
  events: [SimEvent[], SimEvent[]];
  /** Garbage each side sent this tick (after cancelling). */
  sent: [AttackSlab[], AttackSlab[]];
}

/** Cancel attacks against the sender's own incoming queue; returns what is left to send. */
function cancelIncoming(side: VersusSide, attacks: readonly AttackSlab[]): AttackSlab[] {
  const sim = side.sim;
  const queue = sim.garbageQueue;
  const cols = sim.config.cols;
  const out: AttackSlab[] = [];
  for (const a of attacks) {
    const full = a.width * a.height;
    let power = full;
    while (power > 0 && queue.length > 0) {
      const q = queue[0] as (typeof queue)[number];
      const cells = q.width * q.height;
      if (power >= cells) {
        queue.shift();
        power -= cells;
        side.stats.cancelled += cells;
        continue;
      }
      const rows = Math.floor(power / q.width);
      if (rows > 0) {
        q.height -= rows;
        power -= rows * q.width;
        side.stats.cancelled += rows * q.width;
      }
      break;
    }
    if (power === full) out.push(a);
    else if (a.fromChain) {
      const rows = Math.floor(power / a.width);
      if (rows > 0) out.push({ width: a.width, height: rows, fromChain: true });
    } else if (power >= 3) {
      out.push({ width: Math.min(power, cols), height: 1, fromChain: false });
    }
  }
  return out;
}

/** Apply a side's attack handicap to what it is about to send (deterministic). */
function handicap(
  side: VersusSide,
  rules: VersusSideRules | undefined,
  tick: number,
  attacks: AttackSlab[],
): AttackSlab[] {
  if (!rules || attacks.length === 0) return attacks;
  if (tick < rules.attackFromTick) return [];
  const percent = Math.max(0, Math.min(100, rules.attackPercent));
  if (percent >= 100) return attacks;
  const out: AttackSlab[] = [];
  for (const a of attacks) {
    const cells = a.width * a.height;
    side.attackCredit = (side.attackCredit ?? 0) + cells * percent;
    if (side.attackCredit >= cells * 100) {
      side.attackCredit -= cells * 100;
      out.push(a);
    }
  }
  return out;
}

/**
 * Step both sides one tick (same inputs/hook semantics as `step`) and exchange
 * garbage. After the game is over this is a no-op.
 */
export function stepVersus(
  vs: VersusState,
  inputsA: readonly SimInput[] = [],
  inputsB: readonly SimInput[] = [],
  hooks: readonly [SimHooks?, SimHooks?] = [],
): VersusStepResult {
  const result: VersusStepResult = { events: [[], []], sent: [[], []] };
  if (vs.over) return result;
  const [a, b] = vs.sides;
  step(a.sim, inputsA, hooks[0], result.events[0]);
  step(b.sim, inputsB, hooks[1], result.events[1]);
  vs.tick++;
  const raw: [AttackSlab[], AttackSlab[]] = [
    attacksFromEvents(result.events[0], b.sim.config.cols),
    attacksFromEvents(result.events[1], a.sim.config.cols),
  ];
  for (const i of [0, 1] as const) {
    const side = vs.sides[i];
    const out = vs.rules.cancel ? cancelIncoming(side, raw[i]) : raw[i];
    result.sent[i] = handicap(side, vs.rules.sides?.[i], vs.tick, out);
  }
  for (const i of [0, 1] as const) {
    const from = vs.sides[i];
    const to = vs.sides[i === 0 ? 1 : 0];
    if (to.sim.gameOver) continue;
    const delay = vs.rules.attackDelay + (vs.rules.sides?.[i]?.extraDelay ?? 0);
    for (const slab of result.sent[i]) {
      queueGarbage(
        to.sim,
        slab.width,
        slab.height,
        { delay, fromChain: slab.fromChain },
        result.events[i === 0 ? 1 : 0],
      );
      const cells = slab.width * slab.height;
      from.stats.sent += cells;
      from.stats.slabsSent++;
      to.stats.received += cells;
    }
  }
  const overA = a.sim.gameOver;
  const overB = b.sim.gameOver;
  if (overA || overB) {
    vs.over = true;
    if (overA && overB) vs.draw = true;
    else vs.winner = overA ? 1 : 0;
  }
  return result;
}

/**
 * Judge an unfinished match (time limit): more net garbage (sent − received) wins,
 * then the lower stack. Returns null when still level.
 */
export function versusLeader(vs: VersusState): VersusSideIndex | null {
  if (vs.over) return vs.winner;
  const net = (s: VersusSide) => s.stats.sent - s.stats.received;
  const [a, b] = vs.sides;
  if (net(a) !== net(b)) return net(a) > net(b) ? 0 : 1;
  const top = (sim: SimState) => {
    const i = sim.cells.findIndex((x) => x !== null);
    return i < 0 ? sim.config.rows : Math.floor(i / sim.config.cols);
  };
  const ta = top(a.sim);
  const tb = top(b.sim);
  if (ta !== tb) return ta > tb ? 0 : 1;
  return null;
}

// ---- Replays -------------------------------------------------------------

export interface VersusLog {
  ticks: number;
  a: InputLogEntry[];
  b: InputLogEntry[];
}

export function createVersusLog(): VersusLog {
  return { ticks: 0, a: [], b: [] };
}

/** `stepVersus` + record both sides' inputs keyed by the versus tick. */
export function stepVersusRecorded(
  vs: VersusState,
  log: VersusLog,
  inputsA: readonly SimInput[] = [],
  inputsB: readonly SimInput[] = [],
  hooks: readonly [SimHooks?, SimHooks?] = [],
): VersusStepResult {
  if (vs.over) return { events: [[], []], sent: [[], []] };
  const tick = vs.tick;
  const la = { ticks: log.ticks, entries: log.a };
  const lb = { ticks: log.ticks, entries: log.b };
  recordInputs(la, tick, inputsA);
  recordInputs(lb, tick, inputsB);
  log.ticks = Math.max(la.ticks, lb.ticks);
  return stepVersus(vs, inputsA, inputsB, hooks);
}

export interface ReplayVersusOptions {
  rules?: VersusRulesInput;
  hooks?: readonly [SimHooks?, SimHooks?];
  onStep?: (vs: VersusState, result: VersusStepResult) => void;
}

/** Re-run a versus match from seed + side configs + log. */
export function replayVersus(
  seed: Seed,
  configA: VersusSideConfig,
  configB: VersusSideConfig,
  log: VersusLog,
  options: ReplayVersusOptions = {},
): VersusState {
  const vs = createVersus(seed, configA, configB, options.rules);
  const index = (entries: InputLogEntry[]) => {
    const map = new Map<number, SimInput[]>();
    for (const e of entries) {
      const list = map.get(e.tick) ?? [];
      list.push(...e.inputs);
      map.set(e.tick, list);
    }
    return map;
  };
  const ia = index(log.a);
  const ib = index(log.b);
  for (let t = 0; t < log.ticks && !vs.over; t++) {
    const result = stepVersus(vs, ia.get(t) ?? [], ib.get(t) ?? [], options.hooks);
    options.onStep?.(vs, result);
  }
  return vs;
}

/** Stable hash of the whole versus state (both sims, stats, result). */
export function hashVersus(vs: VersusState): string {
  return hashString(stableStringify(vs));
}
