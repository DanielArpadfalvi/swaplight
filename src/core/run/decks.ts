import { comboBonus } from '../scoring';
import type { BrightnessDef, DeckDef } from './types';

function deck(d: Omit<DeckDef, 'i18nKey'>): DeckDef {
  return { ...d, i18nKey: `deck.${d.id}` };
}

const DECK_DEFAULTS = {
  free: false,
  startSzikra: 4,
  shopRelics: 0,
  shopCharms: 0,
  relicPriceDelta: 0,
  stageRewardDelta: 0,
  startRelics: [] as string[],
  startCharms: [] as string[],
};

/** Starting loadouts / rule sets. `neon` is the free default deck. */
export const DECKS: readonly DeckDef[] = Object.freeze([
  deck({
    ...DECK_DEFAULTS,
    id: 'neon',
    free: true,
    desc: 'Neon: the standard rules. 4 Szikra, a Hourglass charm.',
    startCharms: ['hourglass'],
  }),
  deck({
    ...DECK_DEFAULTS,
    id: 'prism',
    desc: 'Prism: 6 block colors, but every clear scores ×2 mult.',
    config: (cfg) => {
      cfg.colors = 6;
    },
    xmult: () => 2,
  }),
  deck({
    ...DECK_DEFAULTS,
    id: 'zen',
    desc: 'Zen: the stack rises 30% slower; stage rewards −1 Szikra, interest cap −2.',
    stageRewardDelta: -1,
    riseSpeed: (s) => s * 0.7,
    economy: { interestCap: -2 },
  }),
  deck({
    ...DECK_DEFAULTS,
    id: 'gambler',
    desc: 'Gambler: shops offer one more relic and charm, relics cost +1. Starts with 6 Szikra.',
    startSzikra: 6,
    shopRelics: 1,
    shopCharms: 1,
    relicPriceDelta: 1,
  }),
  deck({
    ...DECK_DEFAULTS,
    id: 'cascade',
    desc: 'Cascade: chain ×n gives 2n−1 mult, but combos earn no combo bonus.',
    base: (c) => -comboBonus(c.score.combo, c.score.config.comboBonusUnit),
    mult: (c) => Math.max(0, c.score.chain - 1),
  }),
  deck({
    ...DECK_DEFAULTS,
    id: 'collector',
    desc: 'Collector: 6 relic slots and a random common relic, but only 1 charm slot.',
    startRelics: ['random-common'],
    economy: { relicSlots: 1, charmSlots: -1 },
  }),
]);

const BY_ID = new Map(DECKS.map((d) => [d.id, d]));

export function getDeck(id: string): DeckDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown deck '${id}'`);
  return def;
}

export function isDeckId(id: string): boolean {
  return BY_ID.has(id);
}

export const MAX_BRIGHTNESS = 8;

/**
 * Brightness (difficulty) levels, cumulative like Balatro stakes: playing at
 * brightness b applies every level ≤ b. Levels without hooks are handled where noted.
 */
export const BRIGHTNESS: readonly BrightnessDef[] = Object.freeze([
  { level: 1, i18nKey: 'brightness.1', desc: 'Glow: the standard run.' },
  { level: 2, i18nKey: 'brightness.2', desc: 'Dim: goals +15% (score) / +10% (blocks).' },
  {
    level: 3,
    i18nKey: 'brightness.3',
    desc: 'Flicker: the first stage of each act pays no base Szikra.',
  },
  {
    level: 4,
    i18nKey: 'brightness.4',
    desc: 'Pressure: the stack rises 15% faster.',
    riseSpeed: (s) => s * 1.15,
  },
  { level: 5, i18nKey: 'brightness.5', desc: 'Scarcity: everything in the shop costs +1.' },
  {
    level: 6,
    i18nKey: 'brightness.6',
    desc: 'Escalation: score goals grow faster in acts 2 and 3.',
  },
  {
    level: 7,
    i18nKey: 'brightness.7',
    desc: 'Haste: stop time −25%, interest cap −2.',
    stopTicks: (t) => t * 0.75,
    economy: { interestCap: -2 },
  },
  { level: 8, i18nKey: 'brightness.8', desc: 'Eclipse: every boss carries two curses.' },
]);

/** Brightness definitions active at `brightness`. */
export function activeBrightness(brightness: number): BrightnessDef[] {
  return BRIGHTNESS.filter((b) => b.level <= brightness);
}
