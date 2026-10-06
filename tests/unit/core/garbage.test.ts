import { describe, expect, it } from 'vitest';
import { boardToAscii } from '../../../src/core/ascii';
import {
  findSlab,
  placeGarbage,
  queueGarbage,
  queuedGarbageCells,
} from '../../../src/core/garbage';
import { quickHash } from '../../../src/core/hash';
import { checkInvariants } from '../../../src/core/invariants';
import { createInputLog, hashState, replay, stepRecorded } from '../../../src/core/replay';
import { randInt, createRng } from '../../../src/core/rng';
import { canSwap, cloneSim, createSim, step } from '../../../src/core/sim';
import type { SimEvent, SimInput, SimState } from '../../../src/core/types';
import { slabRenderPositions } from '../../../src/core/view';
import { ofType, run, simFromAscii } from './helpers';

function runChecked(sim: SimState, n: number, inputs: (t: number) => SimInput[] = () => []) {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    events.push(...step(sim, inputs(i)));
    const errors = checkInvariants(sim);
    if (errors.length > 0) throw new Error(`tick ${sim.tick}: ${errors.join('; ')}`);
  }
  return events;
}

function garbageCells(sim: SimState): number {
  return sim.cells.filter((b) => b?.kind === 'garbage').length;
}

describe('garbage queue and drop', () => {
  it('queues, drops after the delay, falls as a unit and lands', () => {
    const sim = simFromAscii(`
      RGBYRG
      GBYRGB`);
    const queued: SimEvent[] = [];
    queueGarbage(sim, 6, 1, { delay: 5 }, queued);
    expect(queued).toEqual([{ type: 'garbageQueued', id: 1, width: 6, height: 1, delay: 5 }]);
    expect(queuedGarbageCells(sim)).toBe(6);
    const before = runChecked(sim, 4);
    expect(ofType(before, 'garbageDropped')).toHaveLength(0);
    const events = runChecked(sim, 30);
    const dropped = ofType(events, 'garbageDropped');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ row: 0, col: 0, width: 6, height: 1 });
    const landed = ofType(events, 'garbageLanded');
    expect(landed).toHaveLength(1);
    expect(landed[0]).toMatchObject({ row: 9, col: 0, width: 6, height: 1 });
    expect(sim.garbageQueue).toHaveLength(0);
    expect(boardToAscii(sim)).toBe(['######', 'RGBYRG', 'GBYRGB'].join('\n'));
    // Landing state is mirrored into every cell, then the slab rests.
    run(sim, 20);
    expect(sim.garbage[0]?.state).toBe('idle');
    expect(sim.cells.filter((b) => b?.slab).every((b) => b?.state === 'idle')).toBe(true);
  });

  it('narrow slabs alternate right / left', () => {
    const sim = createSim('drops', {}, 'static');
    sim.cells.fill(null);
    queueGarbage(sim, 3, 1);
    queueGarbage(sim, 4, 1);
    const events = runChecked(sim, 40);
    const cols = ofType(events, 'garbageDropped').map((e) => e.col);
    expect(cols).toEqual([3, 0]);
  });

  it('tall slabs drop in parts when the free space is short', () => {
    const sim = simFromAscii(`
      RGBYRG
      GBYRGB
      RGBYRG
      GBYRGB
      RGBYRG
      GBYRGB
      RGBYRG
      GBYRGB
      RGBYRG
      GBYRGB`);
    queueGarbage(sim, 6, 4);
    const first = runChecked(sim, 3);
    expect(ofType(first, 'garbageDropped')[0]).toMatchObject({ height: 2 });
    expect(sim.garbageQueue[0]?.height).toBe(2);
    // No room left: the rest waits.
    runChecked(sim, 30);
    expect(sim.garbageQueue[0]?.height).toBe(2);
  });

  it('does not drop while a chain is in progress or a group is clearing', () => {
    const sim = simFromAscii(`
      RR.R..
      GBYRGB`);
    queueGarbage(sim, 6, 1, { delay: 6 });
    step(sim, [{ type: 'swap', row: 10, col: 2 }]); // RRR forms when the swap ends
    const events = runChecked(sim, 10);
    expect(sim.groups.length).toBe(1);
    expect(ofType(events, 'garbageDropped')).toHaveLength(0);
    const later = runChecked(sim, 80);
    expect(ofType(later, 'garbageDropped')).toHaveLength(1);
  });
});

describe('garbage gravity', () => {
  it('is supported if any cell under it is', () => {
    const sim = simFromAscii(`
      ......
      R.....`);
    placeGarbage(sim, 10, 0, 4, 1);
    runChecked(sim, 40);
    expect(findSlab(sim, 1)?.row).toBe(10);
    expect(findSlab(sim, 1)?.state).toBe('idle');
  });

  it('hovers and falls as a unit when its support is swapped away, carrying blocks on top', () => {
    const sim = simFromAscii(`
      ......
      ......
      .R....`);
    const slab = placeGarbage(sim, 10, 0, 2, 1);
    const rider = sim.cells[9 * 6] ?? null;
    expect(rider).toBeNull();
    // Put a block on top of the slab.
    sim.cells[9 * 6] = {
      ...(sim.cells[11 * 6 + 1] as NonNullable<(typeof sim.cells)[number]>),
      id: sim.nextBlockId++,
      color: 1,
    };
    runChecked(sim, 2);
    expect(slab.state).toBe('idle');
    const events = runChecked(sim, 1, () => [{ type: 'swap', row: 11, col: 1 }]);
    expect(ofType(events, 'swapped')).toHaveLength(1);
    runChecked(sim, sim.config.swapTicks + 1);
    expect(slab.state).toBe('hovering');
    expect(sim.cells[9 * 6]?.state).toBe('hovering');
    const more = runChecked(sim, 40);
    expect(ofType(more, 'garbageLanded')).toHaveLength(1);
    expect(slab.row).toBe(11);
    expect(sim.cells[10 * 6]?.color).toBe(1);
    expect(boardToAscii(sim)).toBe(['G.....', '##R...'].join('\n'));
  });

  it('falls onto the stack below without overlapping', () => {
    const sim = simFromAscii(`
      ......
      ......
      ......
      GB....
      RGB...`);
    placeGarbage(sim, 0, 0, 6, 2);
    const events = runChecked(sim, 60);
    const landed = ofType(events, 'garbageLanded');
    expect(landed).toHaveLength(1);
    expect(landed[0]).toMatchObject({ row: 8, height: 2 });
    expect(slabRenderPositions(sim)[0]).toMatchObject({ row: 8, col: 0, width: 6, height: 2 });
  });

  it('can not be swapped and never matches by color', () => {
    const sim = simFromAscii(`
      ......
      RR....
      GBYRGB`);
    const slab = placeGarbage(sim, 10, 2, 3, 1);
    // Garbage cells have color 0 (= R) internally but never complete a run.
    for (const b of sim.cells) if (b?.slab === slab.id) expect(b.color).toBe(0);
    const events = runChecked(sim, 30);
    expect(ofType(events, 'matched')).toHaveLength(0);
    expect(canSwap(sim, 10, 2)).toBe('locked');
    expect(canSwap(sim, 10, 1)).toBe('locked');
    expect(canSwap(sim, 10, 0)).toBeNull();
    const rejected = step(sim, [{ type: 'swap', row: 10, col: 4 }]);
    expect(ofType(rejected, 'swapRejected')).toHaveLength(1);
  });
});

/**
 * rows 8..11:
 *   ......   ← slab 3×1 at (8,0)
 *   YR....   swap (9,0) → col 0 = RRR (rows 9..11) touching the slab
 *   RG....
 *   RB.B..
 */
const CONVERT_BOARD = `
  ......
  YR....
  RG....
  RB.B..`;

describe('garbage conversion', () => {
  it('a touching match converts the bottom row into chain-flagged normal blocks', () => {
    const sim = simFromAscii(CONVERT_BOARD);
    const slab = placeGarbage(sim, 8, 0, 3, 1);
    const ids = sim.cells.filter((b) => b?.slab === slab.id).map((b) => b?.id);
    const events = runChecked(sim, 6, (t) => (t === 0 ? [{ type: 'swap', row: 9, col: 0 }] : []));
    const converting = ofType(events, 'garbageConverting');
    expect(converting).toHaveLength(1);
    expect(converting[0]?.slabIds).toEqual([slab.id]);
    expect(slab.state).toBe('converting');
    expect(sim.cells[8 * 6]?.state).toBe('matched');
    expect(sim.cells[8 * 6]?.group).toBe(0);
    const ticks = converting[0]?.ticks ?? 0;
    expect(ticks).toBe(sim.config.flashTicks + 3 * sim.config.garbagePopTicks);

    const more: SimEvent[] = [];
    let convertedAt = -1;
    for (let i = 0; i < ticks + 5; i++) {
      const ev = step(sim, []);
      more.push(...ev);
      if (convertedAt < 0 && ofType(ev, 'garbageConverted').length > 0) {
        convertedAt = i;
        // Right after conversion: normal blocks with the chain flag; the unsupported one hovers.
        expect(sim.cells[8 * 6 + 2]?.kind).toBe('normal');
        expect(sim.cells[8 * 6 + 2]?.chain).toBe(true);
        expect(sim.cells[8 * 6 + 2]?.state).toBe('hovering');
      }
      expect(checkInvariants(sim)).toEqual([]);
    }
    const converted = ofType(more, 'garbageConverted');
    expect(converted).toHaveLength(1);
    expect(converted[0]?.remaining).toBe(0);
    expect(converted[0]?.blocks.map((b) => b.id)).toEqual(ids);
    expect(sim.garbage).toHaveLength(0);
    expect(garbageCells(sim)).toBe(0);
  });

  it('converted blocks continue the chain', () => {
    const sim = simFromAscii(CONVERT_BOARD);
    placeGarbage(sim, 8, 0, 3, 1);
    step(sim, [{ type: 'swap', row: 9, col: 0 }]);
    const events: SimEvent[] = [];
    for (let i = 0; i < 400; i++) {
      const ev = step(sim, []);
      events.push(...ev);
      if (ofType(ev, 'garbageConverted').length > 0) {
        // Make the falling converted block complete B·B at the bottom (B at (11,1), (11,3)).
        const b = sim.cells[8 * 6 + 2];
        expect(b?.chain).toBe(true);
        if (b) b.color = 2;
        // Avoid accidental matches of the other two converted blocks.
        const b0 = sim.cells[8 * 6];
        const b1 = sim.cells[8 * 6 + 1];
        if (b0) b0.color = 3;
        if (b1) b1.color = 4;
      }
      expect(checkInvariants(sim)).toEqual([]);
    }
    const chains = ofType(events, 'matched').map((e) => e.chain);
    expect(chains).toContain(2);
    expect(ofType(events, 'chainEnd')[0]?.length).toBeGreaterThanOrEqual(2);
  });

  it('a multi-row slab shrinks by one row', () => {
    const sim = simFromAscii(CONVERT_BOARD);
    const slab = placeGarbage(sim, 6, 0, 3, 3);
    const events = runChecked(sim, 200, (t) => (t === 0 ? [{ type: 'swap', row: 9, col: 0 }] : []));
    const converted = ofType(events, 'garbageConverted');
    expect(converted).toHaveLength(1);
    expect(converted[0]?.remaining).toBe(2);
    expect(slab.height).toBe(2);
    expect(garbageCells(sim)).toBe(6);
  });

  it('touching slabs chain-convert together', () => {
    const sim = simFromAscii(`
      ......
      YR..GY
      RG..YG
      RB.BGY`);
    const low = placeGarbage(sim, 8, 0, 3, 1);
    const high = placeGarbage(sim, 7, 0, 3, 1); // on top of `low`
    const side = placeGarbage(sim, 8, 3, 3, 1); // right of `low`, resting on G·Y
    const top = placeGarbage(sim, 6, 0, 6, 1); // on `high` only through... `high` and nothing else
    const events = runChecked(sim, 6, (t) => (t === 0 ? [{ type: 'swap', row: 9, col: 0 }] : []));
    const converting = ofType(events, 'garbageConverting');
    expect(converting).toHaveLength(1);
    expect(new Set(converting[0]?.slabIds)).toEqual(new Set([low.id, high.id, side.id, top.id]));
    const all = runChecked(sim, 400);
    expect(ofType(all, 'garbageConverted')).toHaveLength(4);
    expect(sim.garbage).toHaveLength(0);
  });

  it('a non-touching slab stays garbage', () => {
    const sim = simFromAscii(CONVERT_BOARD);
    const far = placeGarbage(sim, 10, 4, 2, 1);
    const events = runChecked(sim, 200, (t) => (t === 0 ? [{ type: 'swap', row: 9, col: 0 }] : []));
    expect(ofType(events, 'matched')).toHaveLength(1);
    expect(ofType(events, 'garbageConverting')).toHaveLength(0);
    expect(findSlab(sim, far.id)).toBeDefined();
  });

  it('freezes the rise while converting', () => {
    const sim = simFromAscii(CONVERT_BOARD, {}, 'endless');
    placeGarbage(sim, 7, 0, 6, 2);
    step(sim, [{ type: 'swap', row: 9, col: 0 }]);
    run(sim, 6);
    expect(sim.garbage[0]?.state).toBe('converting');
    // Let the match group finish while the 6-wide slab is still converting.
    const g = sim.config.flashTicks + 3 * sim.config.popTicksPerBlock;
    run(sim, g);
    expect(sim.groups).toHaveLength(0);
    expect(sim.garbage[0]?.state).toBe('converting');
    expect(sim.garbage[0]?.timer).toBeGreaterThan(5);
    const offset = sim.riseOffset * 1000 + sim.riseAccum;
    step(sim, [{ type: 'raise', active: true }]);
    expect(sim.riseOffset * 1000 + sim.riseAccum).toBe(offset);
  });
});

describe('garbage top-out and determinism', () => {
  it('garbage resting in the top row tops the player out', () => {
    const sim = createSim('topout', { graceTicks: 30 });
    for (let i = 0; i < 6; i++) queueGarbage(sim, 6, 2);
    const events = runChecked(sim, 2000);
    expect(sim.gameOver).toBe(true);
    expect(ofType(events, 'gameOver')).toHaveLength(1);
    const top = sim.cells.slice(0, 6);
    expect(top.some((b) => b?.kind === 'garbage')).toBe(true);
  });

  it('cloneSim / quickHash / hashState cover the garbage state', () => {
    const sim = simFromAscii(CONVERT_BOARD);
    placeGarbage(sim, 6, 0, 3, 2);
    queueGarbage(sim, 4, 1, { delay: 50 });
    step(sim, [{ type: 'swap', row: 9, col: 0 }]);
    run(sim, 10);
    const copy = cloneSim(sim);
    expect(hashState(copy)).toBe(hashState(sim));
    expect(quickHash(copy)).toBe(quickHash(sim));
    (copy.garbage[0] as { timer: number }).timer++;
    expect(quickHash(copy)).not.toBe(quickHash(sim));
    expect(hashState(copy)).not.toBe(hashState(sim));
    const copy2 = cloneSim(sim);
    (copy2.garbageQueue[0] as { delay: number }).delay++;
    expect(quickHash(copy2)).not.toBe(quickHash(sim));
    // Independent copies.
    const c3 = cloneSim(sim);
    run(c3, 300);
    run(sim, 300);
    expect(hashState(c3)).toBe(hashState(sim));
  });

  it('fuzz: random swaps, raises and incoming garbage keep the invariants and replay', () => {
    for (const seed of ['g1', 'g2', 'g3']) {
      const sim = createSim(seed, { levelUpTicks: 600 });
      const log = createInputLog();
      const rng = createRng(`${seed}|fuzz`);
      const garbageAt = new Map<number, [number, number]>();
      for (let t = 0; t < 3000 && !sim.gameOver; t++) {
        const inputs: SimInput[] = [];
        const roll = randInt(rng, 10);
        if (roll < 4) inputs.push({ type: 'swap', row: randInt(rng, 12), col: randInt(rng, 5) });
        else if (roll === 4) inputs.push({ type: 'raise', active: randInt(rng, 2) === 0 });
        if (randInt(rng, 120) === 0) {
          const w = 3 + randInt(rng, 4);
          const h = w === 6 ? 1 + randInt(rng, 3) : 1;
          garbageAt.set(sim.tick, [w, h]);
          queueGarbage(sim, w, h, { delay: 30 });
        }
        stepRecorded(sim, log, inputs);
        const errors = checkInvariants(sim);
        if (errors.length > 0) throw new Error(`${seed} tick ${sim.tick}: ${errors.join('; ')}`);
      }
      expect(sim.stats.swaps).toBeGreaterThan(0);
      // Replay with the same garbage injected at the same ticks.
      const again = createSim(seed, { levelUpTicks: 600 });
      const byTick = new Map<number, SimInput[]>();
      for (const e of log.entries) byTick.set(e.tick, e.inputs);
      for (let t = 0; t < log.ticks && !again.gameOver; t++) {
        const g = garbageAt.get(again.tick);
        if (g) queueGarbage(again, g[0], g[1], { delay: 30 });
        step(again, byTick.get(t) ?? []);
      }
      expect(hashState(again)).toBe(hashState(sim));
      // Plain replay (no garbage) still works for garbage-free games.
      expect(replay(seed, {}, createInputLog()).tick).toBe(0);
    }
  });
});
