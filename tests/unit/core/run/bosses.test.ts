import { describe, expect, it } from 'vitest';
import { canSwap, step } from '../../../../src/core/sim';
import {
  CURSES,
  DECKS,
  MOD_HIDDEN_COLOR,
  MOD_LOCKED_COLUMNS,
  MOD_SWAP_LOCK_UNTIL,
  activeBrightness,
  computeRewards,
  createRun,
  getDeck,
  makePlan,
  relicPrice,
  runEconomy,
  stageConfig,
  type StageResult,
} from '../../../../src/core/run';
import { createRng } from '../../../../src/core/rng';
import { atStage, runWith, scoreOf, stageSim } from './fixtures';

const boss = (curses: string[], deckId = 'neon') =>
  atStage(runWith([], { deckId }), 1, 3, { curses });

describe('boss curses', () => {
  it('has 8 curses with unique ids', () => {
    expect(CURSES).toHaveLength(8);
    expect(new Set(CURSES.map((c) => c.id)).size).toBe(8);
  });

  it('surge: rise speed ×1.6', () => {
    const { setup, sim } = stageSim(boss(['surge']));
    expect(setup.hooks.riseSpeed!(100, sim)).toBeCloseTo(160, 10);
  });

  it('veil: a deterministic hidden color flag for the renderer', () => {
    const a = stageConfig(boss(['veil'])).modifiers[MOD_HIDDEN_COLOR];
    const b = stageConfig(boss(['veil'])).modifiers[MOD_HIDDEN_COLOR];
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(5);
  });

  it('lock: one middle column is frozen in the engine', () => {
    const { sim } = stageSim(boss(['lock']), 'RGBYPR');
    const mask = sim.modifiers[MOD_LOCKED_COLUMNS]!;
    expect([4, 8]).toContain(mask);
    const col = Math.log2(mask);
    expect(canSwap(sim, 11, col)).toBe('locked');
    expect(canSwap(sim, 11, col - 1)).toBe('locked');
    expect(canSwap(sim, 11, col === 2 ? 3 : 0)).toBeNull();
  });

  it('spectrum: one extra color (never on 6-color decks)', () => {
    expect(stageConfig(boss(['spectrum'])).config.colors).toBe(6);
    for (let i = 0; i < 20; i++) {
      const plan = makePlan(createRng(`p${i}`), 'prism', 8);
      expect(plan.flatMap((p) => p.curses)).not.toContain('spectrum');
    }
  });

  it('drought: no stop time', () => {
    const { setup, sim } = stageSim(boss(['drought']));
    expect(setup.hooks.stopTicks!(150, { sim, combo: 6, chain: 3 })).toBe(0);
    // curses come last: even with Chronoglass
    const withRelic = atStage(runWith(['chronoglass']), 1, 3, { curses: ['drought'] });
    const s2 = stageSim(withRelic);
    expect(s2.setup.hooks.stopTicks!(150, { sim: s2.sim, combo: 6, chain: 3 })).toBe(0);
  });

  it('judge: half score unless the clear is a chain link', () => {
    const { setup, sim } = stageSim(boss(['judge']));
    expect(scoreOf(setup, sim).total).toBe(15);
    expect(scoreOf(setup, sim, { chain: 2 }).total).toBe(60);
  });

  it('stagger: every chain link locks swaps for 1 s', () => {
    const { setup, sim } = stageSim(boss(['stagger']), 'RGBYPR');
    sim.tick = 100;
    scoreOf(setup, sim, { chain: 1 });
    expect(sim.modifiers[MOD_SWAP_LOCK_UNTIL]).toBeUndefined();
    scoreOf(setup, sim, { chain: 2 });
    expect(sim.modifiers[MOD_SWAP_LOCK_UNTIL]).toBe(160);
    expect(canSwap(sim, 11, 0)).toBe('locked');
    sim.tick = 160;
    expect(canSwap(sim, 11, 0)).toBeNull();
  });

  it('shiver: hover time cut to a third (min 3)', () => {
    expect(stageConfig(boss(['shiver'])).config.hoverTicks).toBe(4);
    const feather = atStage(runWith(['featherweight']), 1, 3, { curses: ['shiver'] });
    expect(stageConfig(feather).config.hoverTicks).toBe(6);
  });

  it('curses only apply on their boss stage', () => {
    const run = createRun('c1');
    const plan = run.plan;
    for (const p of plan) expect(p.curses.length > 0).toBe(p.stage === 3);
    expect(stageConfig(run).curses).toEqual([]);
  });

  it('a cursed stage plays deterministically in the sim', () => {
    const play = () => {
      const run = atStage(createRun('det'), 2, 3, { curses: ['surge', 'stagger'] });
      const { setup, sim } = stageSim(run, undefined, 'endless');
      for (let i = 0; i < 600; i++)
        step(sim, i % 7 === 0 ? [{ type: 'swap', row: 11, col: i % 5 }] : [], setup.hooks);
      return JSON.stringify(sim);
    };
    expect(play()).toBe(play());
  });

  it('boss stages pay a bigger base reward', () => {
    const result = { won: true, ratio: 1, ticksLeft: 0, modifiers: {} } as unknown as StageResult;
    const run = runWith([], { szikra: 0 });
    expect(computeRewards(run, result).base).toBe(3);
    expect(computeRewards(atStage(run, 1, 3), result).base).toBe(8);
  });
});

describe('decks', () => {
  it('has 6 decks; only neon is free', () => {
    expect(DECKS).toHaveLength(6);
    expect(DECKS.filter((d) => d.free).map((d) => d.id)).toEqual(['neon']);
  });

  it('neon starts with 4 Szikra and an Hourglass', () => {
    const run = createRun('d', 'neon');
    expect(run.szikra).toBe(4);
    expect(run.charms.map((c) => c.id)).toEqual(['hourglass']);
  });

  it('prism: 6 colors and ×2 mult', () => {
    const run = createRun('d', 'prism');
    run.charms = [];
    const { setup, sim } = stageSim(run);
    expect(setup.config.colors).toBe(6);
    expect(scoreOf(setup, sim).total).toBe(60);
  });

  it('zen: slower rise, −1 stage reward, interest cap 3', () => {
    const run = createRun('d', 'zen');
    const { setup, sim } = stageSim(run);
    expect(setup.hooks.riseSpeed!(100, sim)).toBeCloseTo(70, 10);
    const result = { won: true, ratio: 1, ticksLeft: 0, modifiers: {} } as unknown as StageResult;
    expect(computeRewards({ ...run, szikra: 100 }, result)).toMatchObject({ base: 2, interest: 3 });
  });

  it('gambler: more offers, relics +1 Szikra', () => {
    const run = createRun('d', 'gambler');
    expect(run.szikra).toBe(6);
    expect(relicPrice(run, 'spark_plug')).toBe(5);
    expect(getDeck('gambler').shopRelics).toBe(1);
  });

  it('cascade: chain ×n gives 2n−1 mult, no combo bonus', () => {
    const { setup, sim } = stageSim(createRun('d', 'cascade'));
    expect(scoreOf(setup, sim, { chain: 3 }).mult).toBe(5);
    expect(scoreOf(setup, sim, { combo: 5 }).base).toBe(50);
  });

  it('collector: 6 relic slots, 1 charm slot and a random common relic', () => {
    const run = createRun('d', 'collector');
    expect(runEconomy(run)).toMatchObject({ relicSlots: 6, charmSlots: 1 });
    expect(run.relics).toHaveLength(1);
    expect(createRun('d', 'collector').relics[0]!.id).toBe(run.relics[0]!.id);
  });

  it('rejects unknown decks and brightness out of range', () => {
    expect(() => createRun('x', 'nope')).toThrow();
    expect(() => createRun('x', 'neon', 0)).toThrow();
    expect(() => createRun('x', 'neon', 9)).toThrow();
  });
});

describe('brightness', () => {
  const result = { won: true, ratio: 1, ticksLeft: 0, modifiers: {} } as unknown as StageResult;

  it('levels are cumulative', () => {
    expect(activeBrightness(1).map((b) => b.level)).toEqual([1]);
    expect(activeBrightness(8).map((b) => b.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('B2 raises goals', () => {
    expect(stageConfig(createRun('b', 'neon', 2)).goal.target).toBeGreaterThan(
      stageConfig(createRun('b', 'neon', 1)).goal.target,
    );
  });

  it('B3: no base reward for the first stage of an act', () => {
    expect(computeRewards({ ...createRun('b', 'neon', 3), szikra: 0 }, result).base).toBe(0);
    expect(
      computeRewards(atStage({ ...createRun('b', 'neon', 3), szikra: 0 }, 1, 1), result).base,
    ).toBe(4);
  });

  it('B4: faster rise', () => {
    const { setup, sim } = stageSim(createRun('b', 'neon', 4));
    expect(setup.hooks.riseSpeed!(100, sim)).toBeCloseTo(115, 10);
  });

  it('B5: shop prices +1', () => {
    expect(relicPrice(createRun('b', 'neon', 5), 'spark_plug')).toBe(5);
  });

  it('B6: steeper score goals in acts 2–3', () => {
    const at = (b: number) =>
      stageConfig(atStage(createRun('b', 'neon', b), 3, 0, { goalType: 'scoreInTime' })).goal
        .target;
    expect(at(6) / at(5)).toBeGreaterThan(1.3);
  });

  it('B7: less stop time and interest', () => {
    const run = createRun('b', 'neon', 7);
    const { setup, sim } = stageSim(run);
    expect(setup.hooks.stopTicks!(100, { sim, combo: 4, chain: 1 })).toBe(75);
    expect(runEconomy(run).interestCap).toBe(3);
  });

  it('B8: bosses carry two curses', () => {
    const run = createRun('b', 'neon', 8);
    for (const p of run.plan.filter((x) => x.stage === 3)) expect(p.curses).toHaveLength(2);
    const curses = run.plan.flatMap((p) => p.curses);
    expect(new Set(curses).size).toBe(curses.length);
  });
});
