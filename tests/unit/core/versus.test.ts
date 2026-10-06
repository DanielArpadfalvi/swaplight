import { describe, expect, it } from 'vitest';
import { loadAscii } from '../../../src/core/ascii';
import { queueGarbage } from '../../../src/core/garbage';
import { checkInvariants } from '../../../src/core/invariants';
import { createRng, randInt } from '../../../src/core/rng';
import type { SimEvent, SimInput } from '../../../src/core/types';
import {
  attackCells,
  attacksFromEvents,
  chainGarbage,
  comboGarbage,
  createVersus,
  createVersusLog,
  hashVersus,
  replayVersus,
  stepVersus,
  stepVersusRecorded,
  versusLeader,
  type VersusSideConfig,
} from '../../../src/core/versus';
import { ofType } from './helpers';

const widths = (n: number) => comboGarbage(n).map((s) => s.width);

/** Swap (10,2): column 2 becomes RRRR (combo 4). */
const COMBO4 = `
  ..R...
  ..R...
  ..GR..
  BYRYBG`;

/** Swap (11,2): column 2 RRR clears, the B above falls next to BB → chain ×2. */
const CHAIN2 = `
  ..B...
  ..R...
  ..R...
  BBYR..`;

const STATIC: VersusSideConfig = { mode: 'static' };

describe('attack table', () => {
  it('combos', () => {
    expect(widths(3)).toEqual([]);
    expect(widths(4)).toEqual([3]);
    expect(widths(5)).toEqual([4]);
    expect(widths(6)).toEqual([5]);
    expect(widths(7)).toEqual([6]);
    expect(widths(8)).toEqual([3, 4]);
    expect(widths(9)).toEqual([4, 4]);
    expect(widths(13)).toEqual([6, 6]);
    expect(widths(14)).toEqual([4, 4, 5]);
    expect(comboGarbage(5).every((s) => s.height === 1 && !s.fromChain)).toBe(true);
  });

  it('chains', () => {
    expect(chainGarbage(1)).toEqual([]);
    expect(chainGarbage(2)).toEqual([{ width: 6, height: 1, fromChain: true }]);
    expect(chainGarbage(3)).toEqual([{ width: 6, height: 2, fromChain: true }]);
    expect(chainGarbage(6)).toEqual([{ width: 6, height: 5, fromChain: true }]);
    expect(attackCells(chainGarbage(4))).toBe(18);
  });

  it('reads matched / chainEnd events', () => {
    const events: SimEvent[] = [
      { type: 'matched', groupId: 1, blocks: [], combo: 5, chain: 2, stopTicks: 0 },
      { type: 'chainEnd', length: 3 },
    ];
    expect(attacksFromEvents(events)).toEqual([
      { width: 4, height: 1, fromChain: false },
      { width: 6, height: 2, fromChain: true },
    ]);
  });
});

function play(
  vs: ReturnType<typeof createVersus>,
  n: number,
  a: SimInput[][] = [],
  b: SimInput[][] = [],
) {
  const events: [SimEvent[], SimEvent[]] = [[], []];
  for (let i = 0; i < n; i++) {
    const r = stepVersus(vs, a[i] ?? [], b[i] ?? []);
    events[0].push(...r.events[0]);
    events[1].push(...r.events[1]);
  }
  return events;
}

describe('versus exchange', () => {
  it('a combo sends a slab to the opponent with a delay', () => {
    const vs = createVersus('combo', STATIC, STATIC, { attackDelay: 30 });
    loadAscii(vs.sides[0].sim, COMBO4);
    const [ea, eb] = play(vs, 10, [[{ type: 'swap', row: 10, col: 2 }]]);
    expect(ofType(ea, 'matched')[0]?.combo).toBe(4);
    const queued = ofType(eb, 'garbageQueued');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ width: 3, height: 1, delay: 30 });
    expect(vs.sides[1].sim.garbageQueue).toHaveLength(1);
    expect(vs.sides[0].stats).toMatchObject({ sent: 3, slabsSent: 1 });
    expect(vs.sides[1].stats.received).toBe(3);
    // It drops once the delay ran out, then lands on B's board.
    const [, later] = play(vs, 60);
    expect(ofType(later, 'garbageDropped')).toHaveLength(1);
    expect(ofType(later, 'garbageLanded')).toHaveLength(1);
    expect(vs.sides[1].sim.garbage).toHaveLength(1);
    expect(checkInvariants(vs.sides[1].sim)).toEqual([]);
  });

  it('a chain sends a 6-wide slab when it ends', () => {
    const vs = createVersus('chain', STATIC, STATIC);
    loadAscii(vs.sides[0].sim, CHAIN2);
    const [ea, eb] = play(vs, 200, [[{ type: 'swap', row: 11, col: 2 }]]);
    expect(ofType(ea, 'chainEnd')).toEqual([{ type: 'chainEnd', length: 2 }]);
    const queued = ofType(eb, 'garbageQueued');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ width: 6, height: 1 });
    expect(vs.sides[0].stats).toMatchObject({ sent: 6, slabsSent: 1 });
  });

  it('own attacks cancel incoming garbage first', () => {
    const vs = createVersus('cancel', STATIC, STATIC);
    loadAscii(vs.sides[0].sim, COMBO4);
    queueGarbage(vs.sides[0].sim, 3, 1, { delay: 600 });
    const [, eb] = play(vs, 10, [[{ type: 'swap', row: 10, col: 2 }]]);
    expect(vs.sides[0].sim.garbageQueue).toHaveLength(0);
    expect(vs.sides[0].stats).toMatchObject({ cancelled: 3, sent: 0 });
    expect(ofType(eb, 'garbageQueued')).toHaveLength(0);
  });

  it('cancel takes whole rows of a tall slab and sends the rest', () => {
    const vs = createVersus('cancel2', STATIC, STATIC);
    loadAscii(vs.sides[0].sim, CHAIN2);
    queueGarbage(vs.sides[0].sim, 3, 1, { delay: 600 });
    play(vs, 200, [[{ type: 'swap', row: 11, col: 2 }]]);
    // Chain ×2 = 6 cells: cancels the 3-wide (3 cells), 3 left → less than a 6-wide row → nothing.
    expect(vs.sides[0].stats).toMatchObject({ cancelled: 3, sent: 0 });
    const noCancel = createVersus('cancel2', STATIC, STATIC, { cancel: false });
    loadAscii(noCancel.sides[0].sim, CHAIN2);
    queueGarbage(noCancel.sides[0].sim, 3, 1, { delay: 600 });
    play(noCancel, 200, [[{ type: 'swap', row: 11, col: 2 }]]);
    expect(noCancel.sides[0].stats).toMatchObject({ cancelled: 0, sent: 6 });
  });

  it('side rules: warm-up discards early attacks, extra delay arms later', () => {
    const early = createVersus('combo', STATIC, STATIC, {
      sides: [{ attackFromTick: 120 }, {}],
    });
    loadAscii(early.sides[0].sim, COMBO4);
    const [, eb] = play(early, 10, [[{ type: 'swap', row: 10, col: 2 }]]);
    expect(ofType(eb, 'garbageQueued')).toHaveLength(0);
    expect(early.sides[0].stats.sent).toBe(0);

    const slow = createVersus('combo', STATIC, STATIC, {
      attackDelay: 30,
      sides: [{ extraDelay: 45 }, {}],
    });
    loadAscii(slow.sides[0].sim, COMBO4);
    const [, eb2] = play(slow, 10, [[{ type: 'swap', row: 10, col: 2 }]]);
    expect(ofType(eb2, 'garbageQueued')[0]).toMatchObject({ width: 3, delay: 75 });
    expect(slow.rules.sides[1]).toEqual({ attackPercent: 100, attackFromTick: 0, extraDelay: 0 });
  });

  it('side rules: attackPercent 50 sends every other slab (deterministic)', () => {
    // Credit carried between attacks: 3 cells × 50 → 150; a 3-cell slab needs 300.
    let credit = 0;
    const sent: boolean[] = [];
    for (let k = 0; k < 4; k++) {
      const vs = createVersus('combo', STATIC, STATIC, { sides: [{ attackPercent: 50 }, {}] });
      vs.sides[0].attackCredit = credit;
      loadAscii(vs.sides[0].sim, COMBO4);
      const [, eb] = play(vs, 10, [[{ type: 'swap', row: 10, col: 2 }]]);
      sent.push(ofType(eb, 'garbageQueued').length === 1);
      credit = vs.sides[0].attackCredit;
    }
    expect(sent).toEqual([false, true, false, true]);
    const none = createVersus('combo', STATIC, STATIC, { sides: [{ attackPercent: 0 }, {}] });
    loadAscii(none.sides[0].sim, COMBO4);
    play(none, 10, [[{ type: 'swap', row: 10, col: 2 }]]);
    expect(none.sides[0].stats.sent).toBe(0);
  });

  it('a handicapped side still cancels its own incoming garbage', () => {
    const vs = createVersus('cancel', STATIC, STATIC, { sides: [{ attackPercent: 0 }, {}] });
    loadAscii(vs.sides[0].sim, COMBO4);
    queueGarbage(vs.sides[0].sim, 3, 1, { delay: 600 });
    play(vs, 10, [[{ type: 'swap', row: 10, col: 2 }]]);
    expect(vs.sides[0].stats).toMatchObject({ cancelled: 3, sent: 0 });
  });

  it('the side that tops out loses; the match then stops', () => {
    const vs = createVersus('topout', STATIC, { config: { graceTicks: 20 } });
    for (let i = 0; i < 8; i++) queueGarbage(vs.sides[1].sim, 6, 2);
    for (let i = 0; i < 4000 && !vs.over; i++) stepVersus(vs);
    expect(vs.over).toBe(true);
    expect(vs.winner).toBe(0);
    expect(vs.draw).toBe(false);
    expect(versusLeader(vs)).toBe(0);
    const tick = vs.tick;
    stepVersus(vs);
    expect(vs.tick).toBe(tick);
  });

  it('both sides start from the same board by default', () => {
    const vs = createVersus('same');
    expect(vs.sides[0].sim.cells.map((b) => b?.color)).toEqual(
      vs.sides[1].sim.cells.map((b) => b?.color),
    );
    const diff = createVersus('same', {}, {}, { sameBoards: false });
    expect(diff.sides[0].sim.cells.map((b) => b?.color)).not.toEqual(
      diff.sides[1].sim.cells.map((b) => b?.color),
    );
  });
});

describe('versus determinism', () => {
  it('lockstep play replays exactly from the log (both sides)', () => {
    const cfg: VersusSideConfig = { config: { startLevel: 6 } };
    const vs = createVersus('replay', cfg, cfg);
    const log = createVersusLog();
    const rng = createRng('replay|inputs');
    const randomInputs = (): SimInput[] => {
      const roll = randInt(rng, 8);
      if (roll < 3) return [{ type: 'swap', row: 4 + randInt(rng, 8), col: randInt(rng, 5) }];
      if (roll === 3) return [{ type: 'raise', active: randInt(rng, 3) === 0 }];
      return [];
    };
    let garbageEvents = 0;
    for (let t = 0; t < 4000 && !vs.over; t++) {
      const r = stepVersusRecorded(vs, log, randomInputs(), randomInputs());
      garbageEvents +=
        ofType(r.events[0], 'garbageQueued').length + ofType(r.events[1], 'garbageQueued').length;
      if (t % 50 === 0) {
        expect(checkInvariants(vs.sides[0].sim)).toEqual([]);
        expect(checkInvariants(vs.sides[1].sim)).toEqual([]);
      }
    }
    expect(garbageEvents).toBeGreaterThan(0);
    const again = replayVersus('replay', cfg, cfg, log);
    expect(hashVersus(again)).toBe(hashVersus(vs));
    expect(again.winner).toBe(vs.winner);
    expect(again.tick).toBe(vs.tick);
  });
});
