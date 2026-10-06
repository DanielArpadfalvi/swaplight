import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../../src/core/invariants';
import {
  createInputLog,
  hashState,
  hashString,
  recordInputs,
  replay,
  stableStringify,
  stepRecorded,
} from '../../../src/core/replay';
import { createRng, nextFloat, randInt } from '../../../src/core/rng';
import { cloneSim, createSim, step, type SimHooks } from '../../../src/core/sim';
import type { SimInput, SimState } from '../../../src/core/types';

function randomInputs(sim: SimState, rng: ReturnType<typeof createRng>): SimInput[] {
  const inputs: SimInput[] = [];
  if (nextFloat(rng) < 0.3) {
    // Bias swaps toward the lower half where blocks live; include out-of-range cols.
    const row = sim.config.rows - 1 - randInt(rng, 8);
    inputs.push({ type: 'swap', row, col: randInt(rng, sim.config.cols) });
  }
  if (!sim.raiseHeld && nextFloat(rng) < 0.004) inputs.push({ type: 'raise', active: true });
  else if (sim.raiseHeld && nextFloat(rng) < 0.2) inputs.push({ type: 'raise', active: false });
  return inputs;
}

describe('replay', () => {
  for (const seed of ['alpha', 'beta', 1234]) {
    it(`fuzz seed ${seed}: 3000 random ticks replay to the same hash, invariants hold`, () => {
      const hooks: SimHooks = { scoreModifiers: [(ctx) => (ctx.mult += ctx.combo >= 4 ? 1 : 0)] };
      const config = { levelUpTicks: 600 };
      const sim = createSim(seed, config);
      const log = createInputLog();
      const rng = createRng(`fuzz-${seed}`);
      let matches = 0;
      for (let t = 0; t < 3000; t++) {
        let events;
        expect(() => {
          events = stepRecorded(sim, log, randomInputs(sim, rng), hooks);
        }).not.toThrow();
        matches += (events ?? []).filter((e: { type: string }) => e.type === 'matched').length;
        const errors = checkInvariants(sim);
        if (errors.length) throw new Error(`tick ${sim.tick}: ${errors.join('; ')}`);
      }
      expect(matches).toBeGreaterThan(0);
      expect(log.entries.length).toBeGreaterThan(100);
      const replayed = replay(seed, config, log, { hooks });
      expect(replayed.tick).toBe(sim.tick);
      expect(replayed.score).toBe(sim.score);
      expect(hashState(replayed)).toBe(hashState(sim));
      // A run without the hook diverges in score (if any combo happened) but never throws.
      const plain = replay(seed, config, log);
      expect(plain.tick).toBe(sim.tick);
    });
  }

  it('different inputs give a different hash', () => {
    const a = createSim('h');
    const b = createSim('h');
    expect(hashState(a)).toBe(hashState(b));
    step(a, [{ type: 'swap', row: 11, col: 0 }]);
    step(b, []);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('a cloned sim continues identically', () => {
    const sim = createSim('lookahead');
    const rng = createRng('clone-inputs');
    for (let i = 0; i < 300; i++) step(sim, randomInputs(sim, rng));
    const copy = cloneSim(sim);
    const inputs: SimInput[][] = [];
    for (let i = 0; i < 300; i++) inputs.push(randomInputs(sim, rng));
    for (const inp of inputs) {
      step(sim, inp);
      step(copy, inp);
    }
    expect(hashState(copy)).toBe(hashState(sim));
  });

  it('replay honours onStep, mode, and merges entries recorded for the same tick', () => {
    const log = createInputLog();
    recordInputs(log, 0, [{ type: 'swap', row: 11, col: 0 }]);
    recordInputs(log, 0, [{ type: 'swap', row: 11, col: 2 }]);
    recordInputs(log, 9, []);
    expect(log.ticks).toBe(10);
    expect(log.entries).toHaveLength(2);
    let steps = 0;
    const r = replay('m', {}, log, { mode: 'static', onStep: () => steps++ });
    expect(steps).toBe(10);
    expect(r.mode).toBe('static');
    expect(r.stats.swaps).toBeGreaterThanOrEqual(1);
  });

  it('stepRecorded does not record after game over', () => {
    const sim = createSim('over');
    sim.gameOver = true;
    const log = createInputLog();
    expect(stepRecorded(sim, log, [{ type: 'raise', active: true }])).toEqual([]);
    expect(log.ticks).toBe(0);
  });

  it('stableStringify ignores key order; hashString is stable', () => {
    expect(stableStringify({ b: 1, a: [1, { d: null, c: 'x' }] })).toBe(
      stableStringify({ a: [1, { c: 'x', d: null }], b: 1 }),
    );
    expect(stableStringify(undefined)).toBe('null');
    expect(hashString('swaplight')).toBe(hashString('swaplight'));
    expect(hashString('swaplight')).not.toBe(hashString('swaplighT'));
    expect(hashString('x')).toMatch(/^[0-9a-f]{14}$/);
  });
});
