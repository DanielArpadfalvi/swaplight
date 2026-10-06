/**
 * Micro-benchmarks for the AI / per-frame hot paths. The detailed report only
 * runs with `BENCH=1 npx vitest run tests/unit/core/bench.test.ts`; the always-on
 * test uses a relative bound (hand-written clone vs structuredClone) so it does
 * not flake on slow CI machines.
 */
import { describe, expect, it } from 'vitest';
import { quickHash } from '../../../src/core/hash';
import { hashState } from '../../../src/core/replay';
import { cloneSim, createSim, step } from '../../../src/core/sim';
import type { SimInput, SimState } from '../../../src/core/types';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const BENCH = env?.BENCH === '1';

function busySim(): SimState {
  const sim = createSim('bench', { levelUpTicks: 0 }, 'static');
  for (let i = 0; i < 200; i++) step(sim, inputsFor(i));
  return sim;
}

function inputsFor(i: number): SimInput[] {
  return i % 7 === 0 ? [{ type: 'swap', row: 11 - (i % 3), col: i % 5 }] : [];
}

function usPerOp(n: number, fn: () => void): number {
  const t = performance.now();
  for (let i = 0; i < n; i++) fn();
  return ((performance.now() - t) / n) * 1000;
}

describe('performance', () => {
  it('cloneSim is much faster than structuredClone', () => {
    const sim = busySim();
    usPerOp(500, () => cloneSim(sim)); // warm up
    usPerOp(100, () => structuredClone(sim));
    const fast = usPerOp(2000, () => cloneSim(sim));
    const slow = usPerOp(2000, () => structuredClone(sim));
    expect(fast).toBeLessThan(slow);
  });

  it.skipIf(!BENCH)('report', () => {
    const sim = busySim();
    const results = {
      cloneSim: usPerOp(20000, () => cloneSim(sim)),
      structuredClone: usPerOp(5000, () => structuredClone(sim)),
      hashState: usPerOp(2000, () => hashState(sim)),
      quickHash: usPerOp(20000, () => quickHash(sim)),
    };
    const a = cloneSim(sim);
    const b = cloneSim(sim);
    let k = 0;
    const stepEvents = usPerOp(50000, () => step(a, inputsFor(k++)));
    k = 0;
    const stepSilent = usPerOp(50000, () => step(b, inputsFor(k++), undefined, null));
    const table = { ...results, stepEvents, stepSilent };
    console.log(
      Object.entries(table)
        .map(([name, us]) => `${name.padEnd(16)} ${us.toFixed(2)} µs`)
        .join('\n'),
    );
    expect(results.quickHash).toBeLessThan(results.hashState);
  });
});
