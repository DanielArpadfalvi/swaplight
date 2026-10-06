import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../src/core/rng';
import {
  RARITY_WEIGHTS,
  buyCharm,
  buyRelic,
  completeStage,
  drawRelic,
  generateShop,
  getRelic,
  leaveShop,
  rerollCost,
  reroll,
  runHash,
  sellCharm,
  sellRelic,
  sellValue,
  type RunState,
  type StageResult,
} from '../../../../src/core/run';
import { runWith } from './fixtures';

const WIN: StageResult = {
  won: true,
  value: 1000,
  target: 700,
  ratio: 1.4,
  ticks: 1200,
  ticksLeft: 0,
  score: 1000,
  blocksCleared: 40,
  maxChain: 2,
  maxCombo: 4,
  modifiers: {},
};

function shopRun(szikra = 50, relics: string[] = [], deckId = 'neon'): RunState {
  const run = completeStage(runWith(relics, { deckId }), WIN).run;
  run.szikra = szikra;
  return run;
}

describe('shop generation', () => {
  it('is deterministic per seed and uses the run RNG (not the sim)', () => {
    const a = shopRun();
    const b = shopRun();
    expect(a.shop).toEqual(b.shop);
    expect(runHash(a)).toBe(runHash(b));
    expect(a.shop!.relics).toHaveLength(3);
    expect(a.shop!.charms).toHaveLength(2);
    // different run seed → (almost surely) different offers
    const other = completeStage(
      { ...runWith(), seed: 'other', rng: createRng('other|run') },
      WIN,
    ).run;
    expect(other.shop!.relics.map((o) => o.id)).not.toEqual(a.shop!.relics.map((o) => o.id));
  });

  it('never offers owned relics or duplicates', () => {
    const owned = ['spark_plug', 'jade_echo', 'ruby_ember', 'piggy_bank'];
    for (let i = 0; i < 30; i++) {
      const run = runWith(owned);
      run.rng = createRng(`dup${i}`);
      const shop = generateShop(run);
      const ids = shop.relics.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of owned) expect(ids).not.toContain(id);
      expect(new Set(shop.charms.map((o) => o.id)).size).toBe(shop.charms.length);
    }
  });

  it('rarity follows the act weights (no legendaries in act 1)', () => {
    const rng = createRng('rarity');
    const count = (act: number) => {
      const c = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
      for (let i = 0; i < 4000; i++) c[getRelic(drawRelic(rng, act, new Set())!).rarity]++;
      return c;
    };
    const a1 = count(1);
    const a3 = count(3);
    expect(a1.legendary).toBe(0);
    expect(a1.common / 4000).toBeCloseTo(RARITY_WEIGHTS[0]!.common / 100, 1);
    expect(a3.rare).toBeGreaterThan(a1.rare * 2);
    expect(a3.legendary).toBeGreaterThan(100);
  });

  it('falls back to other rarities when one is exhausted', () => {
    const rng = createRng('fallback');
    const all = new Set<string>();
    let id: string | null;
    while ((id = drawRelic(rng, 1, all))) all.add(id);
    expect(all.size).toBeGreaterThanOrEqual(40);
  });

  it('gambler decks see 4 relics and 3 charms', () => {
    const run = shopRun(50, [], 'gambler');
    expect(run.shop!.relics).toHaveLength(4);
    expect(run.shop!.charms).toHaveLength(3);
    expect(run.shop!.relics[0]!.price).toBe(getRelic(run.shop!.relics[0]!.id).price + 1);
  });
});

describe('buying and selling', () => {
  it('buys a relic: pays, marks sold, keeps initial state', () => {
    const run = shopRun(50);
    const offer = run.shop!.relics[0]!;
    const r = buyRelic(run, 0);
    expect(r.ok).toBe(true);
    expect(r.run.szikra).toBe(50 - offer.price);
    expect(r.run.relics.map((x) => x.id)).toEqual([offer.id]);
    expect(r.run.shop!.relics[0]!.sold).toBe(true);
    expect(r.run.stats.relicsBought).toBe(1);
    expect(buyRelic(r.run, 0)).toMatchObject({ ok: false, reason: 'sold' });
    expect(run.relics).toHaveLength(0); // immutable
  });

  it('refuses without funds, slots, or outside the shop', () => {
    expect(buyRelic(shopRun(0), 0)).toMatchObject({ ok: false, reason: 'funds' });
    const full = shopRun(99, ['spark_plug', 'jade_echo', 'ruby_ember', 'piggy_bank', 'clockwork']);
    expect(buyRelic(full, 0)).toMatchObject({ ok: false, reason: 'slots' });
    expect(buyRelic(runWith(), 0)).toMatchObject({ ok: false, reason: 'phase' });
    expect(buyRelic(shopRun(), 9)).toMatchObject({ ok: false, reason: 'index' });
  });

  it('charms: max 2 held', () => {
    let run = shopRun(99);
    run.charms = [{ id: 'cryo', paid: 3 }];
    const r = buyCharm(run, 0);
    expect(r.ok).toBe(true);
    run = r.run;
    expect(run.charms).toHaveLength(2);
    expect(buyCharm(run, 1)).toMatchObject({ ok: false, reason: 'slots' });
  });

  it('sells for half the price paid (min 1)', () => {
    expect([1, 3, 4, 5, 12].map(sellValue)).toEqual([1, 1, 2, 2, 6]);
    const run = shopRun(10, ['heavy_hand']);
    const r = sellRelic(run, 0);
    expect(r.ok).toBe(true);
    expect(r.run.szikra).toBe(12);
    expect(r.run.relics).toHaveLength(0);
    const c = { ...shopRun(10), charms: [{ id: 'vanish', paid: 6 }] };
    expect(sellCharm(c, 0).run.szikra).toBe(13);
    expect(sellRelic(runWith(['heavy_hand']), 0)).toMatchObject({ ok: false, reason: 'phase' });
  });
});

describe('reroll', () => {
  it('replaces offers, costs 2, 3, 4 … and resets next shop', () => {
    let run = shopRun(20);
    expect(rerollCost(run)).toBe(2);
    const before = run.shop!.relics.map((o) => o.id);
    const r1 = reroll(run);
    expect(r1.run.szikra).toBe(18);
    expect(r1.run.shop!.relics.map((o) => o.id)).not.toEqual(before);
    expect(rerollCost(r1.run)).toBe(3);
    const r2 = reroll(r1.run);
    expect(r2.run.szikra).toBe(15);
    expect(rerollCost(r2.run)).toBe(4);
    run = leaveShop(r2.run);
    run = completeStage(run, WIN).run;
    expect(rerollCost(run)).toBe(2);
  });

  it('refuses without funds; is deterministic', () => {
    expect(reroll(shopRun(1))).toMatchObject({ ok: false, reason: 'funds' });
    expect(reroll(shopRun(20)).run.shop).toEqual(reroll(shopRun(20)).run.shop);
  });
});
