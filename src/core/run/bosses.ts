import { DEFAULT_CONFIG } from '../config';
import { randInt } from '../rng';
import { CHARM_UNLOCKED, MOD_HIDDEN_COLOR, MOD_LOCKED_COLUMNS, MOD_SWAP_LOCK_UNTIL } from './keys';
import type { CurseDef } from './types';

function curse(d: Omit<CurseDef, 'i18nKey'>): CurseDef {
  return { ...d, i18nKey: `boss.${d.id}` };
}

/**
 * Boss curses. A boss stage carries one curse (two from Brightness 8). Curses are
 * applied after the deck, brightness and relics, so they have the final word.
 */
export const CURSES: readonly CurseDef[] = Object.freeze([
  curse({
    id: 'surge',
    desc: 'The Surge: the stack rises 60% faster.',
    riseSpeed: (s) => s * 1.6,
  }),
  curse({
    id: 'veil',
    desc: 'The Veil: one color is invisible (shapes only flicker on match).',
    modifiers: (mods, _info, rng) => {
      mods[MOD_HIDDEN_COLOR] = randInt(rng, 5);
    },
  }),
  curse({
    id: 'lock',
    desc: 'The Lock: one of the middle columns is frozen – its blocks cannot be swapped.',
    modifiers: (mods, _info, rng) => {
      mods[MOD_LOCKED_COLUMNS] = 1 << (2 + randInt(rng, 2));
    },
  }),
  curse({
    id: 'spectrum',
    desc: 'The Spectrum: one extra block color.',
    maxDeckColors: 5,
    minAct: 2,
    config: (cfg) => {
      cfg.colors = Math.min(6, (cfg.colors ?? DEFAULT_CONFIG.colors) + 1);
    },
  }),
  curse({
    id: 'drought',
    desc: 'The Drought: combos and chains earn no stop time.',
    minAct: 2,
    stopTicks: () => 0,
  }),
  curse({
    id: 'judge',
    desc: 'The Judge: clears score half unless they are part of a chain.',
    xmult: (c) => (c.score.chain >= 2 ? 1 : 0.5),
  }),
  curse({
    id: 'stagger',
    desc: 'The Stagger: every chain link locks swapping for 1 second.',
    onMatch: (c) => {
      if (c.score.chain >= 2 && !c.sim.modifiers[CHARM_UNLOCKED])
        c.sim.modifiers[MOD_SWAP_LOCK_UNTIL] = c.sim.tick + 60;
    },
  }),
  curse({
    id: 'shiver',
    desc: 'The Shiver: blocks hover only a third as long before falling.',
    config: (cfg) => {
      const hover = cfg.hoverTicks ?? DEFAULT_CONFIG.hoverTicks;
      cfg.hoverTicks = Math.max(3, Math.floor(hover / 3));
    },
  }),
]);

const BY_ID = new Map(CURSES.map((c) => [c.id, c]));

export function getCurse(id: string): CurseDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown curse '${id}'`);
  return def;
}

export function isCurseId(id: string): boolean {
  return BY_ID.has(id);
}
