import { DEFAULT_CONFIG } from '../config';
import { convertRandom, countBlocks, topRow } from './boardOps';
import { CHARM_LAST_USE } from './keys';
import type { EffectScoreCtx, Rarity, RelicDef } from './types';

/** Block color indices (see ascii.ts COLOR_CHARS = 'RGBYPC'). */
export const RED = 0;
export const GREEN = 1;
export const BLUE = 2;
export const YELLOW = 3;
export const PURPLE = 4;

const colorCount = (c: EffectScoreCtx, color: number) =>
  c.score.colors.reduce((n, k) => (k === color ? n + 1 : n), 0);
const distinctColors = (c: EffectScoreCtx) => new Set(c.score.colors).size;
const isPlain = (c: EffectScoreCtx) => c.score.combo === 3 && c.score.chain === 1;

/** 2.5 s window for Hot Streak. */
const STREAK_WINDOW = 150;

function relic(d: Omit<RelicDef, 'i18nKey'>): RelicDef {
  return { ...d, i18nKey: `relic.${d.id}` };
}

/**
 * Relic catalogue (order = collection order). Prices: common 4–5, uncommon 6–7,
 * rare 8–9, legendary 12. All effects are deterministic; random board edits use `sim.rng`.
 */
export const RELICS: readonly RelicDef[] = Object.freeze([
  /* ------------------------------------------------ common ------------------------------- */
  relic({
    id: 'spark_plug',
    rarity: 'common',
    price: 4,
    desc: '+15 base on every clear.',
    base: () => 15,
  }),
  relic({
    id: 'heavy_hand',
    rarity: 'common',
    price: 5,
    desc: 'Combos (4+ blocks): +10 base per block.',
    base: (c) => (c.score.combo >= 4 ? 10 * c.score.combo : 0),
  }),
  relic({
    id: 'ruby_ember',
    rarity: 'common',
    price: 4,
    desc: '+10 base for every red block cleared.',
    base: (c) => 10 * colorCount(c, RED),
  }),
  relic({
    id: 'jade_echo',
    rarity: 'common',
    price: 4,
    desc: 'Clears with a green block: +3 mult.',
    mult: (c) => (colorCount(c, GREEN) > 0 ? 3 : 0),
  }),
  relic({
    id: 'sapphire_tide',
    rarity: 'common',
    price: 5,
    desc: 'Clearing blue blocks grants at least 1 s of stop time.',
    onMatch: (c) => {
      if (colorCount(c, BLUE) > 0 && c.sim.stopTicks < 60) c.sim.stopTicks = 60;
    },
  }),
  relic({
    id: 'steady_hand',
    rarity: 'common',
    price: 4,
    desc: 'Plain clears (3 blocks, no chain): +2 mult.',
    mult: (c) => (isPlain(c) ? 2 : 0),
  }),
  relic({
    id: 'lucky_four',
    rarity: 'common',
    price: 4,
    desc: 'Combos of exactly 4: +4 mult.',
    mult: (c) => (c.score.combo === 4 ? 4 : 0),
  }),
  relic({
    id: 'slow_tide',
    rarity: 'common',
    price: 5,
    desc: 'The stack rises 20% slower.',
    riseSpeed: (s) => s * 0.8,
  }),
  relic({
    id: 'chronoglass',
    rarity: 'common',
    price: 5,
    desc: 'Stop time earned +50%.',
    stopTicks: (t) => t * 1.5,
  }),
  relic({
    id: 'piggy_bank',
    rarity: 'common',
    price: 4,
    desc: '+2 Szikra after every won stage.',
    economy: { stageBonus: 2 },
  }),
  relic({
    id: 'overclock',
    rarity: 'common',
    price: 5,
    desc: '+1 mult per speed level above 1.',
    mult: (c) => Math.max(0, c.score.level - 1),
  }),
  relic({
    id: 'packed_stack',
    rarity: 'common',
    price: 4,
    desc: '+1 base per block on the board.',
    base: (c) => countBlocks(c.sim),
  }),
  relic({
    id: 'early_bird',
    rarity: 'common',
    price: 4,
    desc: '+3 mult during the first 20 seconds of a stage.',
    mult: (c) => (c.sim.tick < 20 * 60 ? 3 : 0),
  }),
  relic({
    id: 'constellation',
    rarity: 'common',
    price: 5,
    desc: '+1 mult per relic owned.',
    mult: (c) => c.info.relicCount,
  }),
  relic({
    id: 'recycler',
    rarity: 'common',
    price: 4,
    desc: 'Using a charm gives +2 Szikra.',
    economy: { charmUseBonus: 2 },
  }),
  relic({
    id: 'overachiever',
    rarity: 'common',
    price: 4,
    desc: 'Overachievement Szikra is doubled.',
    economy: { overachieveMult: 2 },
  }),
  relic({
    id: 'clockwork',
    rarity: 'common',
    price: 4,
    desc: 'Remaining-time Szikra is doubled.',
    economy: { timeBonusMult: 2 },
  }),
  relic({
    id: 'bounty_hunter',
    rarity: 'common',
    price: 5,
    desc: '+5 Szikra for every boss defeated.',
    economy: { bossBonus: 5 },
  }),

  /* ------------------------------------------------ uncommon ----------------------------- */
  relic({
    id: 'refractor',
    rarity: 'uncommon',
    price: 6,
    desc: 'Chain links: +2 mult.',
    mult: (c) => (c.score.chain >= 2 ? 2 : 0),
  }),
  relic({
    id: 'cascade_coil',
    rarity: 'uncommon',
    price: 6,
    desc: 'Chain links: +25 base per chain level above 1.',
    base: (c) => 25 * Math.max(0, c.score.chain - 1),
  }),
  relic({
    id: 'violet_fever',
    rarity: 'uncommon',
    price: 6,
    desc: '+1 mult for every purple block cleared.',
    mult: (c) => colorCount(c, PURPLE),
  }),
  relic({
    id: 'amber_bank',
    rarity: 'uncommon',
    price: 6,
    desc: '+1 Szikra per 10 yellow blocks cleared in a stage (max 4).',
    stageStart: (s) => {
      s.yellow = 0;
    },
    onMatch: (c) => c.set('yellow', c.get('yellow') + colorCount(c, YELLOW)),
    stageEnd: (s) => Math.min(4, Math.floor((s.yellow ?? 0) / 10)),
  }),
  relic({
    id: 'hot_streak',
    rarity: 'uncommon',
    price: 6,
    desc: 'Clears within 2.5 s of each other build a streak: +1 mult per step (max +8).',
    stageStart: (s) => {
      s.streak = 0;
      s.last = -1000;
    },
    onMatch: (c) => {
      const near = c.sim.tick - c.get('last') <= STREAK_WINDOW;
      c.set('streak', near ? Math.min(8, c.get('streak') + 1) : 0);
      c.set('last', c.sim.tick);
    },
    mult: (c) => c.get('streak'),
  }),
  relic({
    id: 'snowball',
    rarity: 'uncommon',
    price: 6,
    desc: 'Gains +5 base for the rest of the run with every combo of 5+.',
    initialState: { stacks: 0 },
    onMatch: (c) => {
      if (c.score.combo >= 5) c.set('stacks', c.get('stacks') + 1);
    },
    base: (c) => 5 * c.get('stacks'),
  }),
  relic({
    id: 'last_stand',
    rarity: 'uncommon',
    price: 7,
    desc: '×2 mult while any block sits in the top two rows.',
    xmult: (c) => (topRow(c.sim) <= 1 ? 2 : 1),
  }),
  relic({
    id: 'featherweight',
    rarity: 'uncommon',
    price: 6,
    desc: 'Blocks hover 6 ticks longer before falling (easier chains).',
    config: (cfg) => {
      cfg.hoverTicks = (cfg.hoverTicks ?? DEFAULT_CONFIG.hoverTicks) + 6;
    },
  }),
  relic({
    id: 'safety_net',
    rarity: 'uncommon',
    price: 6,
    desc: 'The stack rises at half speed while it is within 3 rows of the top.',
    riseSpeed: (s, c) => (topRow(c.sim) < 3 ? s * 0.5 : s),
  }),
  relic({
    id: 'compound_interest',
    rarity: 'uncommon',
    price: 6,
    desc: 'Interest cap +5.',
    economy: { interestCap: 5 },
  }),
  relic({
    id: 'coupon_book',
    rarity: 'uncommon',
    price: 6,
    desc: 'The first reroll in every shop is free.',
    economy: { freeRerolls: 1 },
  }),
  relic({
    id: 'talisman_pouch',
    rarity: 'uncommon',
    price: 6,
    desc: '+1 charm slot.',
    economy: { charmSlots: 1 },
  }),
  relic({
    id: 'expansion_rack',
    rarity: 'uncommon',
    price: 7,
    desc: '+2 relic slots (net +1).',
    economy: { relicSlots: 2 },
  }),
  relic({
    id: 'afterglow',
    rarity: 'uncommon',
    price: 6,
    desc: 'For 10 s after using a charm: +4 mult.',
    mult: (c) => {
      const last = c.sim.modifiers[CHARM_LAST_USE];
      return last !== undefined && last >= 0 && c.sim.tick - last < 600 ? 4 : 0;
    },
  }),
  relic({
    id: 'minimalist',
    rarity: 'uncommon',
    price: 6,
    desc: '+3 mult per empty relic slot.',
    mult: (c) => 3 * Math.max(0, c.info.relicSlots - c.info.relicCount),
  }),
  relic({
    id: 'domino',
    rarity: 'uncommon',
    price: 7,
    desc: 'Every 3rd combo (4+) turns a random block into a bomb.',
    stageStart: (s) => {
      s.combos = 0;
    },
    onClear: (c) => {
      if (c.combo < 4) return;
      const n = c.get('combos') + 1;
      c.set('combos', n);
      if (n % 3 === 0) convertRandom(c.sim, 'bomb', 1);
    },
  }),
  relic({
    id: 'clean_sweep',
    rarity: 'uncommon',
    price: 6,
    desc: '×1.5 mult when at most 18 blocks remain after the clear.',
    xmult: (c) => (countBlocks(c.sim) - c.score.blocks <= 18 ? 1.5 : 1),
  }),
  relic({
    id: 'stasis_field',
    rarity: 'uncommon',
    price: 7,
    desc: '+4 mult while stop time is active.',
    mult: (c) => (c.sim.stopTicks > 0 ? 4 : 0),
  }),

  /* ------------------------------------------------ rare --------------------------------- */
  relic({
    id: 'supernova',
    rarity: 'rare',
    price: 8,
    desc: 'Combos of 6+: ×2 mult.',
    xmult: (c) => (c.score.combo >= 6 ? 2 : 1),
  }),
  relic({
    id: 'chain_reactor',
    rarity: 'rare',
    price: 8,
    desc: 'Chain links: ×(1 + 0.25 per chain level above 1) mult.',
    xmult: (c) => 1 + 0.25 * Math.max(0, c.score.chain - 1),
  }),
  relic({
    id: 'glass_cannon',
    rarity: 'rare',
    price: 8,
    desc: '×2 mult, but the stack rises 25% faster.',
    xmult: () => 2,
    riseSpeed: (s) => s * 1.25,
  }),
  relic({
    id: 'rainbow_bridge',
    rarity: 'rare',
    price: 8,
    desc: 'Clears with 2 colors: ×1.5 mult; 3+ colors: ×3 mult.',
    xmult: (c) => {
      const n = distinctColors(c);
      return n >= 3 ? 3 : n === 2 ? 1.5 : 1;
    },
  }),
  relic({
    id: 'momentum',
    rarity: 'rare',
    price: 9,
    desc: 'Gains ×0.1 mult for the rest of the run with every chain that reaches ×3.',
    initialState: { chains: 0 },
    onMatch: (c) => {
      if (c.score.chain === 3) c.set('chains', c.get('chains') + 1);
    },
    xmult: (c) => 1 + 0.1 * c.get('chains'),
  }),
  relic({
    id: 'joker_seed',
    rarity: 'rare',
    price: 8,
    desc: 'Chain links of ×3 or more turn a random block into a wild block.',
    onClear: (c) => {
      if (c.chain >= 3) convertRandom(c.sim, 'wild', 1);
    },
  }),
  relic({
    id: 'gold_leaf',
    rarity: 'rare',
    price: 8,
    desc: '+1 mult per 5 Szikra held when the stage started (max +10).',
    mult: (c) => Math.min(10, Math.floor(c.info.szikra / 5)),
  }),

  /* ------------------------------------------------ legendary ---------------------------- */
  relic({
    id: 'infinity_loop',
    rarity: 'legendary',
    price: 12,
    desc: 'Chain ×n gives n² mult instead of n.',
    mult: (c) => (c.score.chain >= 2 ? c.score.chain * c.score.chain - c.score.chain : 0),
  }),
  relic({
    id: 'midas_engine',
    rarity: 'legendary',
    price: 12,
    desc: '×1.25 mult, +×0.25 for every boss defeated this run.',
    xmult: (c) => 1.25 + 0.25 * c.info.bossesDefeated,
  }),
  relic({
    id: 'black_hole',
    rarity: 'legendary',
    price: 12,
    desc: 'Combos: ×(1 + 0.5 per block above 3) mult.',
    xmult: (c) => (c.score.combo >= 4 ? 1 + 0.5 * (c.score.combo - 3) : 1),
  }),
  relic({
    id: 'zenith',
    rarity: 'legendary',
    price: 12,
    desc: '+2 mult per level of the longest chain made this run.',
    initialState: { best: 1 },
    onMatch: (c) => {
      if (c.score.chain > c.get('best')) c.set('best', c.score.chain);
    },
    mult: (c) => 2 * c.get('best'),
  }),
]);

const BY_ID = new Map(RELICS.map((r) => [r.id, r]));

export function getRelic(id: string): RelicDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown relic '${id}'`);
  return def;
}

export function isRelicId(id: string): boolean {
  return BY_ID.has(id);
}

export function relicsByRarity(rarity: Rarity): RelicDef[] {
  return RELICS.filter((r) => r.rarity === rarity);
}
