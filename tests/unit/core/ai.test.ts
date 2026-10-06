/**
 * CPU opponent tests. The long strength / speed checks are opt-in:
 *   AI_LONG=1 npx vitest run tests/unit/core/ai.test.ts   (more seeds, all level pairs)
 *   BENCH=1   npx vitest run tests/unit/core/ai.test.ts   (ms per tick per level)
 */
import { describe, expect, it } from 'vitest';
import {
  CPU_PROFILES,
  EMPTY,
  applyDrag,
  cpuProfile,
  cpuStep,
  createCpu,
  createGrid,
  gridFromSim,
  resolve,
  type CpuLevel,
  type CpuState,
} from '../../../src/core/ai';
import { checkInvariants } from '../../../src/core/invariants';
import { step } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/types';
import {
  createVersus,
  createVersusLog,
  hashVersus,
  replayVersus,
  stepVersusRecorded,
  versusLeader,
  type VersusSideConfig,
  type VersusState,
} from '../../../src/core/versus';
import { ofType, simFromAscii } from './helpers';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const LONG = env?.AI_LONG === '1';
const BENCH = env?.BENCH === '1';

interface MatchResult {
  vs: VersusState;
  cpus: [CpuState, CpuState];
  rejected: [number, number];
  leader: 0 | 1 | null;
}

function cpuMatch(
  seed: string,
  a: number,
  b: number,
  maxTicks: number,
  cfg: VersusSideConfig,
): MatchResult {
  const vs = createVersus(seed, cfg, cfg);
  const cpus: [CpuState, CpuState] = [
    createCpu(a, { seed: `${seed}|A` }),
    createCpu(b, { seed: `${seed}|B` }),
  ];
  const rejected: [number, number] = [0, 0];
  const log = createVersusLog();
  for (let t = 0; t < maxTicks && !vs.over; t++) {
    const ia = cpuStep(cpus[0], vs.sides[0].sim);
    const ib = cpuStep(cpus[1], vs.sides[1].sim);
    const r = stepVersusRecorded(vs, log, ia, ib);
    rejected[0] += ofType(r.events[0], 'swapRejected').length;
    rejected[1] += ofType(r.events[1], 'swapRejected').length;
  }
  return { vs, cpus, rejected, leader: versusLeader(vs) };
}

describe('static grid model', () => {
  it('counts chains only through blocks that fell', () => {
    const sim = simFromAscii(`
      ..B...
      ..R...
      ..R...
      BBRY..`);
    const g = gridFromSim(sim, createGrid(12, 6));
    const res = resolve(g, 1, {
      chain: 0,
      cleared: 0,
      comboCells: 0,
      garbageTouched: 0,
      rounds: 0,
    });
    expect(res).toMatchObject({ chain: 2, cleared: 6, rounds: 2 });
    expect(g.v[11 * 6 + 2]).toBe(EMPTY);
  });

  it('drags stop at gaps and at early matches', () => {
    const sim = simFromAscii(`
      R.....
      GRR.B.`);
    const base = gridFromSim(sim, createGrid(12, 6));
    const g = createGrid(12, 6);
    g.v.set(base.v);
    g.movable.set(base.movable);
    // Dragging R (10,0) right by 1: it rests on (11,1).
    expect(applyDrag(g, 10, 0, 1, 1)).toBe(true);
    g.v.set(base.v);
    g.movable.set(base.movable);
    // By 3 it ends over the gap at (11,3) and falls there – fine as the last step…
    expect(applyDrag(g, 10, 0, 1, 3)).toBe(true);
    g.v.set(base.v);
    g.movable.set(base.movable);
    // …but by 4 it would have to cross the gap.
    expect(applyDrag(g, 10, 0, 1, 4)).toBe(false);
    g.v.set(base.v);
    g.movable.set(base.movable);
    // Empty start cells are not draggable.
    expect(applyDrag(g, 10, 1, 1, 1)).toBe(false); // (10,1) is empty
  });
});

describe('CPU basics', () => {
  it('profiles match the requested input speeds', () => {
    expect([1, 2, 3, 4, 5].map((l) => cpuProfile(l).actionsPerSecond)).toEqual([1.5, 2.5, 4, 6, 8]);
    expect(CPU_PROFILES[1].actionTicks).toBe(40);
    expect(CPU_PROFILES[5].actionTicks).toBe(8);
    expect(cpuProfile(0).level).toBe(1);
    expect(cpuProfile(9).level).toBe(5);
  });

  it('finds a one-swap match', () => {
    const sim = simFromAscii(`
      RGBYRG
      GBYRGB
      RRBRYG`);
    const cpu = createCpu(3);
    const events: SimEvent[] = [];
    for (let t = 0; t < 200; t++) events.push(...step(sim, cpuStep(cpu, sim)));
    expect(ofType(events, 'matched').length).toBeGreaterThan(0);
    expect(ofType(events, 'swapRejected')).toHaveLength(0);
  });

  it('prefers a chain over a plain clear', () => {
    // Swap (11,2) chains ×2; swap (8,4)… (RR.R row 8) is a plain clear.
    const sim = simFromAscii(`
      ..B.RR
      ..R.GR
      ..R.BG
      BBYRGB`);
    const cpu = createCpu(5);
    const events: SimEvent[] = [];
    for (let t = 0; t < 300; t++) events.push(...step(sim, cpuStep(cpu, sim)));
    expect(sim.stats.maxChain).toBeGreaterThanOrEqual(2);
    expect(ofType(events, 'swapRejected')).toHaveLength(0);
  });

  it('raises a low stack', () => {
    const sim = simFromAscii(
      `
      RGBYRG
      GBYRGB`,
      {},
      'endless',
    );
    const cpu = createCpu(3);
    let raised = false;
    for (let t = 0; t < 200; t++) {
      const inputs = cpuStep(cpu, sim);
      if (inputs.some((i) => i.type === 'raise' && i.active)) raised = true;
      step(sim, inputs);
    }
    expect(raised).toBe(true);
    expect(sim.stats.rowsRisen).toBeGreaterThan(0);
  });

  it('is deterministic and replayable in versus', () => {
    const cfg: VersusSideConfig = { config: { startLevel: 5 } };
    const a = cpuMatch('det', 4, 2, 1500, cfg);
    const b = cpuMatch('det', 4, 2, 1500, cfg);
    expect(hashVersus(a.vs)).toBe(hashVersus(b.vs));
    const log = createVersusLog();
    const vs = createVersus('det', cfg, cfg);
    const cpus = [createCpu(4, { seed: 'det|A' }), createCpu(2, { seed: 'det|B' })];
    for (let t = 0; t < 1500 && !vs.over; t++) {
      stepVersusRecorded(
        vs,
        log,
        cpuStep(cpus[0] as CpuState, vs.sides[0].sim),
        cpuStep(cpus[1] as CpuState, vs.sides[1].sim),
      );
    }
    expect(hashVersus(replayVersus('det', cfg, cfg, log))).toBe(hashVersus(vs));
  });

  it('keeps the per-tick search work within its budget', () => {
    const vs = createVersus('budget', { config: { startLevel: 4 } }, { config: { startLevel: 4 } });
    const cpus = [createCpu(5, { seed: 'x' }), createCpu(3, { seed: 'y' })] as const;
    const maxUnits = [0, 0];
    for (let t = 0; t < 1500 && !vs.over; t++) {
      const ia = cpuStep(cpus[0], vs.sides[0].sim);
      maxUnits[0] = Math.max(maxUnits[0] as number, cpus[0].ctx.units);
      const ib = cpuStep(cpus[1], vs.sides[1].sim);
      maxUnits[1] = Math.max(maxUnits[1] as number, cpus[1].ctx.units);
      stepVersusRecorded(vs, createVersusLog(), ia, ib);
    }
    cpus.forEach((cpu, i) => {
      const p = cpu.profile;
      // Rollouts pause mid-way: at most one work step (2 units) of overshoot. Regression (perf
      // pass): a whole rollout used to run past the budget, stalling frames on slow phones.
      expect(maxUnits[i]).toBeLessThanOrEqual(p.budget + 1);
      expect(cpu.stats.units).toBeGreaterThan(0);
    });
  });
});

describe('CPU in versus', () => {
  const cfg: VersusSideConfig = { config: { startLevel: 3 } };

  it('never issues illegal swaps and never throws (fuzz over levels)', { timeout: 120000 }, () => {
    const pairs: [number, number][] = LONG
      ? [
          [1, 5],
          [2, 4],
          [3, 3],
          [5, 5],
          [4, 1],
        ]
      : [
          [1, 5],
          [3, 4],
        ];
    for (const [a, b] of pairs) {
      const r = cpuMatch(`fuzz${a}${b}`, a, b, LONG ? 8000 : 2500, { config: { startLevel: 6 } });
      expect(r.rejected).toEqual([0, 0]);
      expect(r.cpus[0].stats.swaps + r.cpus[1].stats.swaps).toBeGreaterThan(0);
      expect(checkInvariants(r.vs.sides[0].sim)).toEqual([]);
      expect(checkInvariants(r.vs.sides[1].sim)).toEqual([]);
    }
  });

  it('Hard beats Easy in most matches', { timeout: 120000 }, () => {
    const seeds = LONG ? 12 : 4;
    let hard = 0;
    for (let s = 0; s < seeds; s++) {
      const r = cpuMatch(`hve${s}`, 3, 1, LONG ? 12000 : 5000, cfg);
      if (r.leader === 0) hard++;
    }
    expect(hard).toBeGreaterThan(seeds / 2);
  });

  it.skipIf(!LONG)(
    'stronger levels beat weaker ones (opt-in)',
    () => {
      const levels: [CpuLevel, CpuLevel][] = [
        [2, 1],
        [3, 2],
        [4, 3],
        [5, 3],
      ];
      const table: string[] = [];
      const results: number[] = [];
      for (const [strong, weak] of levels) {
        let wins = 0;
        for (let s = 0; s < 8; s++) {
          if (cpuMatch(`lv${strong}${weak}${s}`, strong, weak, 12000, cfg).leader === 0) wins++;
        }
        table.push(`level ${strong} vs ${weak}: ${wins}/8`);
        results.push(wins);
      }
      console.log(table.join('\n'));
      for (const wins of results) expect(wins).toBeGreaterThan(4);
    },
    600000,
  );

  it.skipIf(!BENCH)(
    'benchmark: CPU decision time per tick (report)',
    () => {
      const lines: string[] = [];
      for (const level of [1, 2, 3, 4, 5]) {
        let total = 0;
        let ticks = 0;
        let worst = 0;
        for (let s = 0; s < 3; s++) {
          const vs = createVersus(`bench${s}`, cfg, cfg);
          const cpu = createCpu(level, { seed: `b${s}` });
          const other = createCpu(3, { seed: `o${s}` });
          for (let t = 0; t < 6000 && !vs.over; t++) {
            const t0 = performance.now();
            const ia = cpuStep(cpu, vs.sides[0].sim);
            const dt = performance.now() - t0;
            if (t > 120) {
              total += dt;
              ticks++;
              worst = Math.max(worst, dt);
            }
            stepVersusRecorded(vs, createVersusLog(), ia, cpuStep(other, vs.sides[1].sim));
          }
        }
        const avg = total / ticks;
        lines.push(
          `level ${level}: avg ${avg.toFixed(3)} ms/tick, worst ${worst.toFixed(2)} ms over ${ticks} ticks`,
        );
        expect(avg).toBeLessThan(4);
      }
      console.log(lines.join('\n'));
    },
    300000,
  );
});
