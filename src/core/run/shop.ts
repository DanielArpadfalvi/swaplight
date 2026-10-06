import { nextFloat, randInt, type RngState } from '../rng';
import { CHARMS, getCharm } from './charms';
import { getDeck } from './decks';
import { runEconomy } from './effects';
import { RELICS, getRelic } from './relics';
import type { Rarity, RunState, ShopOffer, ShopState } from './types';

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

/** Relic rarity weights per act (index = act − 1). */
export const RARITY_WEIGHTS: readonly Readonly<Record<Rarity, number>>[] = [
  { common: 70, uncommon: 25, rare: 5, legendary: 0 },
  { common: 55, uncommon: 32, rare: 11, legendary: 2 },
  { common: 45, uncommon: 33, rare: 17, legendary: 5 },
];

export const BASE_SHOP_RELICS = 3;
export const BASE_SHOP_CHARMS = 2;
export const BASE_REROLL_COST = 2;

export interface ActionResult {
  ok: boolean;
  run: RunState;
  /** Why the action was refused (ok = false). */
  reason?: 'phase' | 'index' | 'sold' | 'funds' | 'slots' | 'noSim' | 'noEffect';
}

/** Price of a relic in this run (deck and brightness surcharges). */
export function relicPrice(run: RunState, id: string): number {
  const deck = getDeck(run.deckId);
  return getRelic(id).price + deck.relicPriceDelta + (run.brightness >= 5 ? 1 : 0);
}

export function charmPrice(run: RunState, id: string): number {
  return getCharm(id).price + (run.brightness >= 5 ? 1 : 0);
}

/** Sell value: half the price paid, rounded down, at least 1. */
export function sellValue(paid: number): number {
  return Math.max(1, Math.floor(paid / 2));
}

export function rerollCost(run: RunState): number {
  const shop = run.shop;
  if (!shop) return BASE_REROLL_COST;
  return shop.freeRerolls > 0 ? 0 : BASE_REROLL_COST + shop.rerolls;
}

function pickRarity(rng: RngState, act: number): Rarity {
  const weights = RARITY_WEIGHTS[Math.min(3, Math.max(1, act)) - 1] as Record<Rarity, number>;
  const total = RARITIES.reduce((s, r) => s + weights[r], 0);
  let x = nextFloat(rng) * total;
  for (const r of RARITIES) {
    x -= weights[r];
    if (x < 0) return r;
  }
  return 'common';
}

/**
 * Draw one relic id: rarity by the act's weights, then uniform among the relics of that
 * rarity not in `exclude`. Falls back to the other rarities (by descending weight) when
 * that rarity is exhausted. Returns null when nothing is left.
 */
export function drawRelic(rng: RngState, act: number, exclude: ReadonlySet<string>): string | null {
  const rarity = pickRarity(rng, act);
  const weights = RARITY_WEIGHTS[Math.min(3, Math.max(1, act)) - 1] as Record<Rarity, number>;
  const order = [
    rarity,
    ...RARITIES.filter((r) => r !== rarity).sort((a, b) => weights[b] - weights[a]),
  ];
  for (const r of order) {
    const pool = RELICS.filter((d) => d.rarity === r && !exclude.has(d.id));
    if (pool.length > 0) return (pool[randInt(rng, pool.length)] as (typeof pool)[number]).id;
  }
  return null;
}

function drawOffers(run: RunState): Pick<ShopState, 'relics' | 'charms'> {
  const deck = getDeck(run.deckId);
  const exclude = new Set(run.relics.map((r) => r.id));
  const relics: ShopOffer[] = [];
  for (let k = 0; k < BASE_SHOP_RELICS + deck.shopRelics; k++) {
    const id = drawRelic(run.rng, run.act, exclude);
    if (!id) break;
    exclude.add(id);
    relics.push({ id, price: relicPrice(run, id), sold: false });
  }
  const charms: ShopOffer[] = [];
  const charmPool = CHARMS.map((c) => c.id);
  for (let k = 0; k < BASE_SHOP_CHARMS + deck.shopCharms && charmPool.length > 0; k++) {
    const [id] = charmPool.splice(randInt(run.rng, charmPool.length), 1) as [string];
    charms.push({ id, price: charmPrice(run, id), sold: false });
  }
  return { relics, charms };
}

/** Fresh shop for the current run position. Advances `run.rng` (mutates `run`). */
export function generateShop(run: RunState): ShopState {
  const eco = runEconomy(run);
  return { ...drawOffers(run), rerolls: 0, freeRerolls: eco.freeRerolls };
}

function inShop(run: RunState): run is RunState & { shop: ShopState } {
  return run.phase === 'shop' && run.shop !== null;
}

const copy = (run: RunState): RunState => structuredClone(run);

export function buyRelic(run: RunState, offerIndex: number): ActionResult {
  if (!inShop(run)) return { ok: false, run, reason: 'phase' };
  const offer = run.shop.relics[offerIndex];
  if (!offer) return { ok: false, run, reason: 'index' };
  if (offer.sold) return { ok: false, run, reason: 'sold' };
  if (run.szikra < offer.price) return { ok: false, run, reason: 'funds' };
  if (run.relics.length >= runEconomy(run).relicSlots) return { ok: false, run, reason: 'slots' };
  const next = copy(run);
  const o = next.shop!.relics[offerIndex] as ShopOffer;
  o.sold = true;
  next.szikra -= o.price;
  next.relics.push({ id: o.id, paid: o.price, state: { ...getRelic(o.id).initialState } });
  next.stats.relicsBought++;
  return { ok: true, run: next };
}

export function buyCharm(run: RunState, offerIndex: number): ActionResult {
  if (!inShop(run)) return { ok: false, run, reason: 'phase' };
  const offer = run.shop.charms[offerIndex];
  if (!offer) return { ok: false, run, reason: 'index' };
  if (offer.sold) return { ok: false, run, reason: 'sold' };
  if (run.szikra < offer.price) return { ok: false, run, reason: 'funds' };
  if (run.charms.length >= runEconomy(run).charmSlots) return { ok: false, run, reason: 'slots' };
  const next = copy(run);
  const o = next.shop!.charms[offerIndex] as ShopOffer;
  o.sold = true;
  next.szikra -= o.price;
  next.charms.push({ id: o.id, paid: o.price });
  return { ok: true, run: next };
}

/** Sell a relic (shop only). Refused if the remaining relics would not fit the slots. */
export function sellRelic(run: RunState, slot: number): ActionResult {
  if (!inShop(run)) return { ok: false, run, reason: 'phase' };
  const owned = run.relics[slot];
  if (!owned) return { ok: false, run, reason: 'index' };
  const next = copy(run);
  next.relics.splice(slot, 1);
  if (next.relics.length > runEconomy(next).relicSlots) return { ok: false, run, reason: 'slots' };
  next.szikra += sellValue(owned.paid);
  return { ok: true, run: next };
}

export function sellCharm(run: RunState, slot: number): ActionResult {
  if (!inShop(run)) return { ok: false, run, reason: 'phase' };
  const owned = run.charms[slot];
  if (!owned) return { ok: false, run, reason: 'index' };
  const next = copy(run);
  next.charms.splice(slot, 1);
  next.szikra += sellValue(owned.paid);
  return { ok: true, run: next };
}

/** Replace all offers. Cost: free rerolls first, then 2, 3, 4 … (resets every shop). */
export function reroll(run: RunState): ActionResult {
  if (!inShop(run)) return { ok: false, run, reason: 'phase' };
  const cost = rerollCost(run);
  if (run.szikra < cost) return { ok: false, run, reason: 'funds' };
  const next = copy(run);
  const shop = next.shop!;
  if (shop.freeRerolls > 0) shop.freeRerolls--;
  else shop.rerolls++;
  next.szikra -= cost;
  Object.assign(shop, drawOffers(next));
  return { ok: true, run: next };
}
