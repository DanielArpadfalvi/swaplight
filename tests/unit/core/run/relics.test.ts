import { describe, expect, it } from 'vitest';
import { step } from '../../../../src/core/sim';
import {
  CHARM_LAST_USE,
  RELICS,
  buyCharm,
  completeStage,
  computeRewards,
  getRelic,
  relicStateFrom,
  reroll,
  runEconomy,
  sellRelic,
  stageConfig,
  useCharm,
  type RunState,
  type StageResult,
} from '../../../../src/core/run';
import { relicScore, runWith, scoreOf, stageSim } from './fixtures';

const covered = new Set<string>();
const cover = (...ids: string[]) => ids.forEach((id) => covered.add(id));

const R = 0;
const G = 1;
const B = 2;
const Y = 3;
const P = 4;

/** Tall 6-wide board: 30 blocks, top block in row 6. */
const BOARD_30 = `
  RGBYPR
  GBYPRG
  BYPRGB
  RGBYPR
  GBYPRG
`;

describe('relic catalogue', () => {
  it('has at least 40 relics with unique ids, valid rarities and prices', () => {
    expect(RELICS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(RELICS.map((r) => r.id)).size).toBe(RELICS.length);
    const priceRange = { common: [4, 5], uncommon: [6, 7], rare: [8, 9], legendary: [12, 12] };
    for (const r of RELICS) {
      const [lo, hi] = priceRange[r.rarity];
      expect(r.price, r.id).toBeGreaterThanOrEqual(lo!);
      expect(r.price, r.id).toBeLessThanOrEqual(hi!);
      expect(r.i18nKey).toBe(`relic.${r.id}`);
      expect(r.desc.length).toBeGreaterThan(5);
    }
    for (const rarity of ['common', 'uncommon', 'rare', 'legendary'] as const) {
      expect(RELICS.some((r) => r.rarity === rarity)).toBe(true);
    }
  });

  it('baseline without relics is the engine pipeline', () => {
    expect(relicScore([], { combo: 3 })).toMatchObject({ base: 30, mult: 1, total: 30 });
    expect(relicScore([], { combo: 4, chain: 2 })).toMatchObject({ base: 50, mult: 2 });
  });
});

describe('additive base relics', () => {
  it.each([
    ['spark_plug', { combo: 3 }, 45],
    ['heavy_hand', { combo: 4 }, 90],
    ['heavy_hand', { combo: 3 }, 30],
    ['ruby_ember', { colors: [R, R, R] }, 60],
    ['ruby_ember', { colors: [G, G, G] }, 30],
    ['cascade_coil', { combo: 3, chain: 3 }, 80],
    ['cascade_coil', { combo: 3, chain: 1 }, 30],
  ] as const)('%s %o → base %d', (id, spec, base) => {
    cover(id);
    expect(
      relicScore([id], { ...spec, colors: 'colors' in spec ? [...spec.colors] : undefined }).base,
    ).toBe(base);
  });

  it('packed_stack: +1 base per block on the board', () => {
    cover('packed_stack');
    expect(relicScore(['packed_stack'], {}, BOARD_30).base).toBe(60);
    expect(relicScore(['packed_stack'], {}, '').base).toBe(30);
  });
});

describe('additive mult relics', () => {
  it.each([
    ['jade_echo', { colors: [G, G, G] }, 4],
    ['jade_echo', { colors: [R, R, R] }, 1],
    ['steady_hand', { combo: 3 }, 3],
    ['steady_hand', { combo: 3, chain: 2 }, 2],
    ['steady_hand', { combo: 4 }, 1],
    ['lucky_four', { combo: 4 }, 5],
    ['lucky_four', { combo: 5 }, 1],
    ['overclock', { level: 4 }, 4],
    ['refractor', { chain: 2 }, 4],
    ['refractor', { chain: 1 }, 1],
    ['violet_fever', { colors: [P, P, P, P] }, 5],
    ['violet_fever', { colors: [R, R, R] }, 1],
    ['infinity_loop', { chain: 3 }, 9],
    ['infinity_loop', { chain: 4 }, 16],
    ['infinity_loop', { chain: 1 }, 1],
  ] as const)('%s %o → mult %d', (id, spec, mult) => {
    cover(id);
    const s = relicScore([id], {
      ...spec,
      colors: 'colors' in spec ? [...spec.colors] : undefined,
    });
    expect(s.mult).toBe(mult);
  });

  it('early_bird: +3 mult only during the first 20 s', () => {
    cover('early_bird');
    const { setup, sim } = stageSim(runWith(['early_bird']));
    expect(scoreOf(setup, sim).mult).toBe(4);
    sim.tick = 20 * 60;
    expect(scoreOf(setup, sim).mult).toBe(1);
  });

  it('constellation: +1 mult per relic owned', () => {
    cover('constellation');
    expect(relicScore(['constellation']).mult).toBe(2);
    expect(relicScore(['constellation', 'spark_plug', 'piggy_bank']).mult).toBe(4);
  });

  it('minimalist: +3 mult per empty relic slot', () => {
    cover('minimalist');
    expect(relicScore(['minimalist']).mult).toBe(13);
    expect(
      relicScore(['minimalist', 'spark_plug', 'piggy_bank', 'slow_tide', 'clockwork']).mult,
    ).toBe(1);
  });

  it('stasis_field: +4 mult while stop time is active', () => {
    cover('stasis_field');
    const { setup, sim } = stageSim(runWith(['stasis_field']));
    expect(scoreOf(setup, sim).mult).toBe(1);
    sim.stopTicks = 10;
    expect(scoreOf(setup, sim).mult).toBe(5);
  });

  it('afterglow: +4 mult for 10 s after a charm', () => {
    cover('afterglow');
    const { setup, sim } = stageSim(runWith(['afterglow']));
    expect(scoreOf(setup, sim).mult).toBe(1);
    sim.tick = 1000;
    sim.modifiers[CHARM_LAST_USE] = 500;
    expect(scoreOf(setup, sim).mult).toBe(5);
    sim.modifiers[CHARM_LAST_USE] = 300;
    expect(scoreOf(setup, sim).mult).toBe(1);
  });

  it('gold_leaf: +1 mult per 5 Szikra held at stage start (max 10)', () => {
    cover('gold_leaf');
    expect(relicScore(['gold_leaf'], {}, '', { szikra: 27 }).mult).toBe(6);
    expect(relicScore(['gold_leaf'], {}, '', { szikra: 400 }).mult).toBe(11);
  });

  it('zenith: +2 mult per level of the run’s best chain', () => {
    cover('zenith');
    const { setup, sim } = stageSim(runWith(['zenith']));
    expect(scoreOf(setup, sim).mult).toBe(1 + 2);
    expect(scoreOf(setup, sim, { chain: 4 }).mult).toBe(4 + 8);
    expect(scoreOf(setup, sim, { chain: 1 }).mult).toBe(1 + 8);
  });
});

describe('multiplicative relics', () => {
  it.each([
    ['supernova', { combo: 6 }, 2],
    ['supernova', { combo: 5 }, 1],
    ['chain_reactor', { chain: 3 }, 4.5],
    ['chain_reactor', { chain: 1 }, 1],
    ['glass_cannon', {}, 2],
    ['rainbow_bridge', { colors: [R, G, B] }, 3],
    ['rainbow_bridge', { colors: [R, R, G] }, 1.5],
    ['rainbow_bridge', { colors: [R, R, R] }, 1],
    ['black_hole', { combo: 5 }, 2],
    ['black_hole', { combo: 3 }, 1],
  ] as const)('%s %o → mult %d', (id, spec, mult) => {
    cover(id);
    const s = relicScore([id], {
      ...spec,
      colors: 'colors' in spec ? [...spec.colors] : undefined,
    });
    expect(s.mult).toBeCloseTo(mult, 10);
  });

  it('last_stand: ×2 while a block sits in the top two rows', () => {
    cover('last_stand');
    expect(relicScore(['last_stand'], {}, BOARD_30).mult).toBe(1);
    const tall = `R.....\nG.....\n${BOARD_30}\nRGBYPR\nGBYPRG\nBYPRGB\nRGBYPR\nGBYPRG`;
    expect(relicScore(['last_stand'], {}, tall).mult).toBe(2);
  });

  it('clean_sweep: ×1.5 when at most 18 blocks remain after the clear', () => {
    cover('clean_sweep');
    expect(relicScore(['clean_sweep'], {}, BOARD_30).mult).toBe(1);
    expect(relicScore(['clean_sweep'], {}, 'RGBYPR\nGBYPRG\nBYPRGB').mult).toBe(1.5);
  });

  it('midas_engine: ×1.25 + 0.25 per boss defeated', () => {
    cover('midas_engine');
    expect(relicScore(['midas_engine']).mult).toBe(1.25);
    expect(relicScore(['midas_engine'], {}, '', { bossesDefeated: 2 }).mult).toBe(1.75);
  });

  it('applies base → mult → xmult in that order regardless of slot order', () => {
    // (30 + 15) × ((1 + 1 chain) + 2 refractor) × 2 glass = 45 × 8
    for (const order of [
      ['glass_cannon', 'refractor', 'spark_plug'],
      ['spark_plug', 'refractor', 'glass_cannon'],
    ]) {
      const s = relicScore(order, { chain: 2 });
      expect(s).toMatchObject({ base: 45, mult: 8, total: 360 });
    }
  });
});

describe('stateful relics', () => {
  it('snowball: +5 base per combo of 5+ for the rest of the run', () => {
    cover('snowball');
    const run = runWith(['snowball']);
    const { setup, sim } = stageSim(run);
    expect(scoreOf(setup, sim, { combo: 5 }).base).toBe(80 + 5);
    expect(scoreOf(setup, sim, { combo: 3 }).base).toBe(30 + 5);
    expect(scoreOf(setup, sim, { combo: 6 }).base).toBe(120 + 10);
    // carried into the run state, and into the next stage
    const state = relicStateFrom(sim.modifiers, 'snowball');
    expect(state).toEqual({ stacks: 2 });
  });

  it('momentum: ×0.1 per chain reaching ×3, persisted through completeStage', () => {
    cover('momentum');
    const run = runWith(['momentum']);
    const { setup, sim } = stageSim(run);
    expect(scoreOf(setup, sim, { chain: 2 }).mult).toBe(2);
    expect(scoreOf(setup, sim, { chain: 3 }).mult).toBeCloseTo(3 * 1.1, 10);
    expect(scoreOf(setup, sim, { chain: 4 }).mult).toBeCloseTo(4 * 1.1, 10);
    sim.score = 100000;
    const result: StageResult = {
      won: true,
      value: sim.score,
      target: 700,
      ratio: 2,
      ticks: 100,
      ticksLeft: 0,
      score: sim.score,
      blocksCleared: 0,
      maxChain: 4,
      maxCombo: 3,
      modifiers: { ...sim.modifiers },
    };
    const next = completeStage(run, result).run;
    expect(next.relics[0]!.state).toEqual({ chains: 1 });
    // next stage starts with the stack
    const s2 = stageConfig({ ...next, phase: 'stage', stage: 1 });
    expect(s2.modifiers['relic.momentum.chains']).toBe(1);
  });

  it('hot_streak: clears within 2.5 s build a streak, resets after a gap and per stage', () => {
    cover('hot_streak');
    const { setup, sim } = stageSim(runWith(['hot_streak']));
    const mults: number[] = [];
    for (const t of [0, 100, 200, 340, 600, 650]) {
      sim.tick = t;
      mults.push(scoreOf(setup, sim).mult);
    }
    expect(mults).toEqual([1, 2, 3, 4, 1, 2]);
    // stage-scoped: reset at the next stage
    const run = runWith(['hot_streak']);
    run.relics[0]!.state = { streak: 5, last: 10 };
    expect(stageConfig(run).modifiers['relic.hot_streak.streak']).toBe(0);
  });

  it('amber_bank: +1 Szikra per 10 yellow blocks in the stage (max 4)', () => {
    cover('amber_bank');
    const run = runWith(['amber_bank']);
    const { setup, sim } = stageSim(run);
    for (let k = 0; k < 7; k++) scoreOf(setup, sim, { colors: [Y, Y, Y] });
    scoreOf(setup, sim, { colors: [R, R, R] });
    expect(relicStateFrom(sim.modifiers, 'amber_bank')).toEqual({ yellow: 21 });
    expect(getRelic('amber_bank').stageEnd!({ yellow: 21 }, {} as StageResult, setup.info)).toBe(2);
    expect(getRelic('amber_bank').stageEnd!({ yellow: 99 }, {} as StageResult, setup.info)).toBe(4);
  });
});

describe('stop time, rise and board relics', () => {
  it('sapphire_tide: blue clears grant at least 1 s of stop time', () => {
    cover('sapphire_tide');
    const { setup, sim } = stageSim(runWith(['sapphire_tide']));
    scoreOf(setup, sim, { colors: [R, R, R] });
    expect(sim.stopTicks).toBe(0);
    scoreOf(setup, sim, { colors: [B, B, B] });
    expect(sim.stopTicks).toBe(60);
  });

  it('chronoglass: stop time +50%', () => {
    cover('chronoglass');
    const { setup, sim } = stageSim(runWith(['chronoglass']));
    expect(setup.hooks.stopTicks!(90, { sim, combo: 3, chain: 2 })).toBe(135);
  });

  it.each([
    ['slow_tide', 80],
    ['glass_cannon', 125],
  ] as const)('%s: rise speed 100 → %d', (id, speed) => {
    cover(id);
    const { setup, sim } = stageSim(runWith([id]));
    expect(setup.hooks.riseSpeed!(100, sim)).toBeCloseTo(speed, 10);
  });

  it('safety_net: half speed when the stack is within 3 rows of the top', () => {
    cover('safety_net');
    const { setup, sim } = stageSim(runWith(['safety_net']), BOARD_30);
    expect(setup.hooks.riseSpeed!(100, sim)).toBe(100);
    const tall = stageSim(runWith(['safety_net']), `..R...\n..G...\n${BOARD_30}\n${BOARD_30}`);
    expect(tall.setup.hooks.riseSpeed!(100, tall.sim)).toBe(50);
  });

  it('featherweight: hover time +6', () => {
    cover('featherweight');
    expect(stageConfig(runWith(['featherweight'])).config.hoverTicks).toBe(18);
    expect(stageConfig(runWith([])).config.hoverTicks).toBeUndefined();
  });

  it('domino: every 3rd combo turns a random block into a bomb (deterministic)', () => {
    cover('domino');
    const make = () => stageSim(runWith(['domino']), BOARD_30);
    const { setup, sim } = make();
    const clear = (size: number) =>
      setup.hooks.onClear!({
        sim,
        group: { id: 1, size, age: 0, chain: 1, cells: [] },
        colors: [],
      });
    const bombs = () => sim.cells.filter((b) => b?.kind === 'bomb').length;
    clear(4);
    clear(3);
    clear(5);
    expect(bombs()).toBe(0);
    clear(4);
    expect(bombs()).toBe(1);
    const other = make();
    for (const size of [4, 3, 5, 4]) {
      other.setup.hooks.onClear!({
        sim: other.sim,
        group: { id: 1, size, age: 0, chain: 1, cells: [] },
        colors: [],
      });
    }
    expect(other.sim.cells.map((b) => b?.kind)).toEqual(sim.cells.map((b) => b?.kind));
  });

  it('joker_seed: chain links ×3+ turn a random block into a wild', () => {
    cover('joker_seed');
    const { setup, sim } = stageSim(runWith(['joker_seed']), BOARD_30);
    const clear = (chain: number) =>
      setup.hooks.onClear!({
        sim,
        group: { id: 1, size: 3, age: 0, chain, cells: [] },
        colors: [],
      });
    clear(2);
    expect(sim.cells.some((b) => b?.kind === 'wild')).toBe(false);
    clear(3);
    expect(sim.cells.filter((b) => b?.kind === 'wild')).toHaveLength(1);
  });
});

describe('economy relics', () => {
  const result = (over: Partial<StageResult> = {}): StageResult => ({
    won: true,
    value: 700,
    target: 700,
    ratio: 1,
    ticks: 600,
    ticksLeft: 0,
    score: 700,
    blocksCleared: 30,
    maxChain: 1,
    maxCombo: 3,
    modifiers: {},
    ...over,
  });

  it('piggy_bank: +2 Szikra per won stage', () => {
    cover('piggy_bank');
    expect(computeRewards(runWith(['piggy_bank'], { szikra: 0 }), result()).relics).toBe(2);
  });

  it('bounty_hunter: +5 Szikra on boss stages only', () => {
    cover('bounty_hunter');
    const run = runWith(['bounty_hunter'], { szikra: 0 });
    expect(computeRewards(run, result()).relics).toBe(0);
    expect(computeRewards({ ...run, stage: 3 }, result()).relics).toBe(5);
  });

  it('overachiever / clockwork double their bonus', () => {
    cover('overachiever', 'clockwork');
    const r = result({ ratio: 1.6, ticksLeft: 40 * 60 });
    const plain = computeRewards(runWith([], { szikra: 0 }), r);
    expect(plain).toMatchObject({ overachieve: 2, time: 2 });
    expect(computeRewards(runWith(['overachiever'], { szikra: 0 }), r).overachieve).toBe(4);
    expect(computeRewards(runWith(['clockwork'], { szikra: 0 }), r).time).toBe(4);
  });

  it('compound_interest: interest cap +5', () => {
    cover('compound_interest');
    expect(computeRewards(runWith([], { szikra: 60 }), result()).interest).toBe(5);
    expect(computeRewards(runWith(['compound_interest'], { szikra: 60 }), result()).interest).toBe(
      10,
    );
  });

  const inShop = (run: RunState): RunState => {
    const won = completeStage(run, result({ score: 1000, value: 1000 })).run;
    expect(won.phase).toBe('shop');
    return won;
  };

  it('coupon_book: first reroll per shop is free', () => {
    cover('coupon_book');
    const shop = inShop(runWith(['coupon_book'], { szikra: 0 }));
    const before = shop.szikra;
    const r1 = reroll(shop);
    expect(r1.ok).toBe(true);
    expect(r1.run.szikra).toBe(before);
    const r2 = reroll(r1.run);
    expect(r2.run.szikra).toBe(before - 2);
  });

  it('talisman_pouch: +1 charm slot; expansion_rack: +2 relic slots', () => {
    cover('talisman_pouch', 'expansion_rack');
    expect(runEconomy(runWith(['talisman_pouch'])).charmSlots).toBe(3);
    expect(runEconomy(runWith(['expansion_rack'])).relicSlots).toBe(7);
    // selling the rack while holding 7 relics would overflow the slots → refused
    const seven = [
      'expansion_rack',
      'spark_plug',
      'piggy_bank',
      'slow_tide',
      'clockwork',
      'jade_echo',
      'ruby_ember',
    ];
    const shop = inShop(runWith(seven, { szikra: 0 }));
    expect(sellRelic(shop, 0)).toMatchObject({ ok: false, reason: 'slots' });
    expect(sellRelic(shop, 1).ok).toBe(true);
  });

  it('recycler: +2 Szikra per charm used', () => {
    cover('recycler');
    let shop = inShop(runWith(['recycler'], { szikra: 50 }));
    const idx = shop.shop!.charms.findIndex(() => true);
    shop = buyCharm(shop, idx).run;
    const { sim } = stageSim({ ...shop, phase: 'stage', shop: null }, 'RGBYPR');
    const run = { ...shop, phase: 'stage' as const, shop: null };
    // use a charm that always works
    run.charms = [{ id: 'cryo', paid: 3 }];
    const used = useCharm(run, 0, sim);
    expect(used.ok).toBe(true);
    expect(used.run.szikra).toBe(run.szikra + 2);
    expect(sim.modifiers[CHARM_LAST_USE]).toBe(sim.tick);
  });
});

describe('relic hooks in a real stage', () => {
  it('a relic-boosted stage scores more than a plain one on the same seed and inputs', () => {
    const play = (relics: string[]) => {
      const { setup, sim } = stageSim(runWith(relics), 'RRGRBY');
      for (let i = 0; i < 300; i++) {
        step(sim, i === 1 ? [{ type: 'swap', row: 11, col: 2 }] : [], setup.hooks);
      }
      return sim.score;
    };
    const plain = play([]);
    expect(plain).toBeGreaterThan(0);
    expect(play(['spark_plug', 'glass_cannon'])).toBeGreaterThan(plain * 2);
  });
});

describe('coverage', () => {
  it('every relic has an effect test', () => {
    expect(RELICS.map((r) => r.id).filter((id) => !covered.has(id))).toEqual([]);
  });
});
