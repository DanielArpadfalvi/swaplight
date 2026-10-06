import { describe, expect, it } from 'vitest';
import { makeConfig } from '../../../src/core/config';
import {
  BASE_SCORE_PIPELINE,
  comboBonus,
  scoreClear,
  type ScoreModifier,
} from '../../../src/core/scoring';
import { ofType, run, simFromAscii } from './helpers';

const cfg = makeConfig();
const clear = (blocks: number, chain = 1, colors: number[] = new Array(blocks).fill(0)) => ({
  blocks,
  combo: blocks,
  chain,
  level: 1,
  colors,
});

describe('scoring', () => {
  it('progressive combo bonus', () => {
    expect([3, 4, 5, 6, 7].map((n) => comboBonus(n, 10))).toEqual([0, 10, 30, 60, 100]);
  });

  it('base × mult breakdown', () => {
    expect(scoreClear(clear(3), cfg)).toEqual({
      blocks: 3,
      combo: 3,
      chain: 1,
      base: 30,
      mult: 1,
      total: 30,
    });
    expect(scoreClear(clear(4), cfg)).toMatchObject({ base: 50, mult: 1, total: 50 });
    expect(scoreClear(clear(5), cfg)).toMatchObject({ base: 80, mult: 1, total: 80 });
    expect(scoreClear(clear(3, 2), cfg)).toMatchObject({ base: 30, mult: 2, total: 60 });
    expect(scoreClear(clear(4, 3), cfg)).toMatchObject({ base: 50, mult: 3, total: 150 });
    expect(BASE_SCORE_PIPELINE).toHaveLength(3);
  });

  it('modifier hooks run after the built-ins, in order', () => {
    const plusMult: ScoreModifier = (ctx) => {
      ctx.mult += 1;
    };
    const purpleFever: ScoreModifier = (ctx) => {
      ctx.mult += 3 * ctx.colors.filter((c) => c === 4).length;
    };
    const double: ScoreModifier = (ctx) => {
      ctx.base *= 2;
    };
    const r = scoreClear(clear(3, 2, [4, 4, 4]), cfg, [plusMult, purpleFever, double]);
    expect(r).toMatchObject({ base: 60, mult: 2 + 1 + 9, total: 720 });
    const negative: ScoreModifier = (ctx) => {
      ctx.mult = -1;
    };
    expect(scoreClear(clear(3), cfg, [negative]).total).toBe(0);
  });

  it('hooks cannot mutate the caller colors array', () => {
    const colors = [1, 1, 1];
    scoreClear(clear(3, 1, colors), cfg, [(ctx) => ctx.colors.push(9)]);
    expect(colors).toEqual([1, 1, 1]);
  });

  it('sim emits scored events and accumulates score, honoring hooks', () => {
    const sim = simFromAscii('RRRR..');
    const events = run(sim, 1, { scoreModifiers: [(ctx) => (ctx.mult += 1)] });
    const scored = ofType(events, 'scored');
    expect(scored).toHaveLength(1);
    expect(scored[0]!.breakdown).toMatchObject({ base: 50, mult: 2, total: 100, combo: 4 });
    expect(scored[0]!.score).toBe(100);
    expect(sim.score).toBe(100);
  });
});
