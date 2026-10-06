import { describe, expect, it } from 'vitest';
import { cellAt, newBlock, pushRow } from '../../../src/core/board';
import { applyGravity } from '../../../src/core/gravity';
import { checkInvariants } from '../../../src/core/invariants';
import { quickHash } from '../../../src/core/hash';
import { hashState } from '../../../src/core/replay';
import { cloneSim, createSim, step, type SimHooks } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/types';
import { ofType, run, settle, simFromAscii, swap } from './helpers';

describe('chain propagation through a swapping block', () => {
  // RRR clears on row 11. B is mid-swap above (11,2) when the group clears: it
  // takes the chain flag, hovers when its swap ends and lands into BBB → x2.
  const BOARD = `
    GB....
    RRRBB.
  `;
  function clearTick(): number {
    const sim = simFromAscii(BOARD);
    for (let i = 0; i < 500; i++) {
      step(sim);
      if (sim.tick > 1 && sim.groups.length === 0) return sim.tick;
    }
    throw new Error('no clear');
  }

  it('a block swapping above a cleared cell carries the chain flag', () => {
    const t = clearTick();
    const sim = simFromAscii(BOARD);
    const events: SimEvent[] = [];
    while (sim.tick < t - 2) events.push(...step(sim));
    // Swap B from (10,1) right to (10,2): it is still swapping at the clear tick.
    events.push(...swap(sim, 10, 1));
    const b = cellAt(sim, 10, 2)!;
    expect(b.state).toBe('swapping');
    events.push(...step(sim)); // clear tick
    expect(sim.groups).toHaveLength(0);
    expect(b.state).toBe('swapping');
    expect(b.chain).toBe(true);
    expect(cellAt(sim, 10, 0)!.state).toBe('hovering');
    expect(sim.chain).toBe(1);
    events.push(...settle(sim));
    expect(ofType(events, 'matched').map((m) => m.chain)).toEqual([1, 2]);
    expect(checkInvariants(sim)).toEqual([]);
  });
});

describe('gravity', () => {
  it('a resting block above a cell vacated this tick falls along instead of hovering', () => {
    const sim = simFromAscii('......', { fallSpeed: 1 });
    const f = newBlock(sim, 0);
    f.state = 'falling';
    f.fall = 15;
    const x = newBlock(sim, 1);
    sim.cells[9 * 6] = f;
    sim.cells[8 * 6] = x;
    applyGravity(sim, null);
    expect(cellAt(sim, 10, 0)).toBe(f);
    expect(x.state).toBe('falling');
    expect(x.fall).toBe(1);
  });

  it('a block entering a cell above a hovering block waits at fall 0', () => {
    const sim = simFromAscii('......', { fallSpeed: 5 });
    const f = newBlock(sim, 0);
    f.state = 'falling';
    f.fall = 14;
    const h = newBlock(sim, 1);
    h.state = 'hovering';
    h.timer = 5;
    sim.cells[8 * 6] = f;
    sim.cells[10 * 6] = h;
    applyGravity(sim, null);
    expect(cellAt(sim, 9, 0)).toBe(f);
    expect(f.fall).toBe(0);
    expect(f.state).toBe('falling');
  });

  it('falling blocks never move up and never overlap (fuzz, fractional fall speed)', () => {
    for (const fallSpeed of [3, 5, 7, 16, 20]) {
      const sim = createSim(`fall-${fallSpeed}`, { fallSpeed, levelUpTicks: 0 }, 'static');
      const pos = new Map<number, number>();
      for (let t = 0; t < 1500; t++) {
        const col = (t * 7) % 5;
        const row = sim.config.rows - 1 - ((t * 3) % 7);
        step(sim, t % 3 === 0 ? [{ type: 'swap', row, col }] : [], undefined, null);
        expect(checkInvariants(sim)).toEqual([]);
        sim.cells.forEach((b, i) => {
          if (!b) return;
          const y = Math.floor(i / 6) * 16 + b.fall;
          const prev = pos.get(b.id);
          if (prev !== undefined) expect(y).toBeGreaterThanOrEqual(prev);
          pos.set(b.id, y);
        });
      }
    }
  });
});

describe('raise input during a clear', () => {
  it('holding raise through the end of a clear starts a manual raise afterwards', () => {
    const sim = simFromAscii('RRRR..\nGBGBGB', { levelUpTicks: 0, levelUpBlocks: 0 }, 'endless');
    step(sim);
    step(sim, [{ type: 'raise', active: true }]);
    expect(sim.manualRaising).toBe(false);
    while (sim.groups.length > 0) step(sim);
    step(sim);
    expect(sim.manualRaising).toBe(true);
    expect(sim.stopTicks).toBe(0);
  });
});

describe('event sink', () => {
  it('silent mode builds no events and ends in the same state', () => {
    const a = createSim('sink');
    const b = cloneSim(a);
    const into: SimEvent[] = [];
    for (let t = 0; t < 600; t++) {
      const inputs = t % 5 === 0 ? [{ type: 'swap' as const, row: 11 - (t % 4), col: t % 5 }] : [];
      const ret = step(a, inputs, undefined, into);
      expect(ret).toBe(into);
      const silent = step(b, inputs, undefined, null);
      expect(silent).toHaveLength(0);
    }
    expect(into.length).toBeGreaterThan(0);
    expect(hashState(a)).toBe(hashState(b));
    a.gameOver = true;
    expect(step(a, [], undefined, null)).toHaveLength(0);
  });

  it('skips the match scan when nothing became matchable', () => {
    const sim = simFromAscii('RGB...');
    expect(sim.matchScanPending).toBe(true);
    step(sim);
    expect(sim.matchScanPending).toBe(false);
  });
});

describe('hooks and modifiers', () => {
  it('stopTicks, onClear and riseSpeed hooks are applied', () => {
    const cleared: number[][] = [];
    const hooks: SimHooks = {
      stopTicks: (base, ctx) => base + ctx.combo * 100 + ctx.chain,
      onClear: (ctx) => {
        cleared.push([...ctx.colors]);
        ctx.sim.modifiers.clears = (ctx.sim.modifiers.clears ?? 0) + 1;
      },
      riseSpeed: (base, sim) => base * (sim.modifiers.riseMult ?? 1),
    };
    const sim = simFromAscii(
      'RRR...\nGBGBGB',
      { levelUpTicks: 0, levelUpBlocks: 0, riseSpeedBase: 10 },
      'endless',
    );
    sim.modifiers.riseMult = 3;
    const ev = step(sim, [], hooks);
    expect(ofType(ev, 'matched')[0]!.stopTicks).toBe(301);
    expect(sim.stopTicks).toBe(301);
    run(sim, 200, hooks);
    expect(cleared).toEqual([[0, 0, 0]]);
    expect(sim.modifiers.clears).toBe(1);
    sim.stopTicks = 0;
    const accum = sim.riseAccum + sim.riseOffset * 1000;
    step(sim, [], hooks);
    expect(sim.riseAccum + sim.riseOffset * 1000 - accum).toBe(30);
  });

  it('modifiers are copied on create, cloned and hashed', () => {
    const mods = { relicA: 2 };
    const sim = createSim('mods', {}, 'endless', { modifiers: mods });
    expect(sim.modifiers).toEqual({ relicA: 2 });
    expect(sim.modifiers).not.toBe(mods);
    const copy = cloneSim(sim);
    copy.modifiers.relicA = 3;
    expect(sim.modifiers.relicA).toBe(2);
    expect(quickHash(copy)).not.toBe(quickHash(sim));
    expect(hashState(copy)).not.toBe(hashState(sim));
  });

  it('a hook may step another sim', () => {
    const other = createSim('other', {}, 'static');
    const hooks: SimHooks = { onClear: () => void step(other) };
    const sim = simFromAscii('RRR...');
    run(sim, 200, hooks);
    expect(other.tick).toBe(1);
  });
});

describe('cloneSim', () => {
  it('shares the frozen config and deep-copies everything else', () => {
    const sim = simFromAscii('RRR...\nGBY...');
    step(sim);
    expect(Object.isFrozen(sim.config)).toBe(true);
    const copy = cloneSim(sim);
    expect(copy.config).toBe(sim.config);
    expect(copy).toEqual(sim);
    expect(copy.groups[0]!.cells).not.toBe(sim.groups[0]!.cells);
    expect(copy.cells[66]).not.toBe(sim.cells[66]);
    expect(copy.rng).not.toBe(sim.rng);
    expect(copy.stats).not.toBe(sim.stats);
    expect(hashState(copy)).toBe(hashState(sim));
    expect(quickHash(copy)).toBe(quickHash(sim));
  });
});

describe('quickHash', () => {
  it('is deterministic and sensitive to state changes', () => {
    const a = createSim('q');
    const b = createSim('q');
    expect(quickHash(a)).toBe(quickHash(b));
    expect(Number.isSafeInteger(quickHash(a))).toBe(true);
    step(a, [{ type: 'swap', row: 11, col: 0 }]);
    step(b);
    expect(quickHash(a)).not.toBe(quickHash(b));
    const c = cloneSim(b);
    c.score += 2 ** 33;
    expect(quickHash(c)).not.toBe(quickHash(b));
  });

  it('ignores modifier key order', () => {
    const a = createSim('m', {}, 'endless', { modifiers: { x: 1, y: 2.5 } });
    const b = createSim('m', {}, 'endless', { modifiers: { y: 2.5, x: 1 } });
    expect(quickHash(a)).toBe(quickHash(b));
  });
});

describe('pushRow', () => {
  it('keeps group cell indices pointing at their blocks', () => {
    const sim = simFromAscii('RRR...\nGBYGBY');
    step(sim);
    expect(sim.groups[0]!.cells).toEqual([60, 61, 62]);
    pushRow(sim);
    expect(sim.groups[0]!.cells).toEqual([54, 55, 56]);
    expect(checkInvariants(sim)).toEqual([]);
  });
});
