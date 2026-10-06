import type { ScoreModifier } from '../scoring';
import type { SimHooks } from '../sim';
import type { SimState } from '../types';
import { getCurse } from './bosses';
import { activeBrightness, getDeck } from './decks';
import {
  CHARM_FREEZE_UNTIL,
  CHARM_OVERCHARGE_UNTIL,
  STAGE_LAST_MATCH,
  chainKey,
  relicPrefix,
} from './keys';
import { getRelic } from './relics';
import type {
  EconomyMods,
  EffectClearCtx,
  EffectScoreCtx,
  EffectSimCtx,
  EffectState,
  RunEffect,
  RunState,
  StageInfo,
} from './types';

/** An effect plus the `sim.modifiers` namespace of its state. */
export interface ActiveEffect {
  source: 'core' | 'deck' | 'brightness' | 'relic' | 'curse';
  id: string;
  effect: RunEffect;
  prefix: string;
}

/**
 * Built-in run rules (always first): stage chain counters, charm timers.
 * - every match with chain L ≥ 2 increments `stage.chain.L` (chainTarget goals);
 * - Overcharge: +3 mult while active; Cryo: auto-rise 0 while active.
 */
export const CORE_EFFECT: RunEffect = Object.freeze({
  onMatch: (c: EffectScoreCtx) => {
    const mods = c.sim.modifiers;
    if (c.score.chain >= 2) {
      const key = chainKey(c.score.chain);
      mods[key] = (mods[key] ?? 0) + 1;
    }
    mods[STAGE_LAST_MATCH] = c.sim.tick;
  },
  mult: (c: EffectScoreCtx) =>
    c.sim.tick < (c.sim.modifiers[CHARM_OVERCHARGE_UNTIL] ?? 0) ? 3 : 0,
  riseSpeed: (s: number, c: EffectSimCtx) =>
    c.sim.tick < (c.sim.modifiers[CHARM_FREEZE_UNTIL] ?? 0) ? 0 : s,
});

/**
 * Effects of a run in application order:
 * core → deck → brightness levels (ascending) → relics (slot order, left to right) → curses.
 */
export function activeEffects(run: RunState, curses: readonly string[] = []): ActiveEffect[] {
  const list: ActiveEffect[] = [
    { source: 'core', id: 'core', effect: CORE_EFFECT, prefix: 'core.' },
  ];
  list.push({ source: 'deck', id: run.deckId, effect: getDeck(run.deckId), prefix: `deck.` });
  for (const b of activeBrightness(run.brightness)) {
    list.push({
      source: 'brightness',
      id: String(b.level),
      effect: b,
      prefix: `bright.${b.level}.`,
    });
  }
  for (const r of run.relics) {
    list.push({ source: 'relic', id: r.id, effect: getRelic(r.id), prefix: relicPrefix(r.id) });
  }
  for (const id of curses) {
    list.push({ source: 'curse', id, effect: getCurse(id), prefix: `curse.${id}.` });
  }
  return list;
}

export const BASE_ECONOMY: Readonly<EconomyMods> = Object.freeze({
  interestCap: 5,
  relicSlots: 5,
  charmSlots: 2,
  freeRerolls: 0,
  stageBonus: 0,
  bossBonus: 0,
  overachieveMult: 1,
  timeBonusMult: 1,
  charmUseBonus: 0,
});

/** Economy of the run: additive fields are summed, `*Mult` fields multiplied. */
export function runEconomy(run: RunState): EconomyMods {
  const eco: EconomyMods = { ...BASE_ECONOMY };
  for (const { effect } of activeEffects(run)) {
    const e = effect.economy;
    if (!e) continue;
    for (const key of Object.keys(e) as (keyof EconomyMods)[]) {
      const v = e[key] as number;
      if (key === 'overachieveMult' || key === 'timeBonusMult') eco[key] *= v;
      else eco[key] += v;
    }
  }
  eco.interestCap = Math.max(0, eco.interestCap);
  eco.relicSlots = Math.max(1, eco.relicSlots);
  eco.charmSlots = Math.max(0, eco.charmSlots);
  return eco;
}

function stateView(sim: SimState, prefix: string): EffectState {
  const mods = sim.modifiers;
  return {
    get: (key) => mods[prefix + key] ?? 0,
    set: (key, value) => {
      mods[prefix + key] = value;
    },
  };
}

/**
 * Compose the stage's `SimHooks` from the active effects. Hooks read and write only the
 * sim they are given (all state lives in `sim.modifiers`), so they are safe for AI
 * rollouts on cloned sims and deterministic for replays.
 *
 * Score order per match (Balatro-like):
 *   0. `onMatch` of every effect (state updates, reactions)
 *   1. base  += Σ effect.base   (core, deck, brightness, relics L→R, curses)
 *   2. mult  += Σ effect.mult   (same order)
 *   3. mult  ×= Π effect.xmult  (same order)
 * after the engine's built-ins (base = 10/block + combo bonus, mult = chain level).
 */
export function buildHooks(effects: readonly ActiveEffect[], info: StageInfo): SimHooks {
  const has = (key: keyof RunEffect) => effects.filter((a) => a.effect[key] !== undefined);
  const scorers = effects.filter(
    (a) => a.effect.onMatch || a.effect.base || a.effect.mult || a.effect.xmult,
  );
  const stoppers = has('stopTicks');
  const risers = has('riseSpeed');
  const clearers = has('onClear');

  const runScore: ScoreModifier = (score) => {
    const sim = score.sim;
    if (!sim) return;
    const ctxs: EffectScoreCtx[] = scorers.map((a) => ({
      score,
      sim,
      info,
      ...stateView(sim, a.prefix),
    }));
    scorers.forEach((a, k) => a.effect.onMatch?.(ctxs[k] as EffectScoreCtx));
    scorers.forEach((a, k) => {
      if (a.effect.base) score.base += a.effect.base(ctxs[k] as EffectScoreCtx);
    });
    scorers.forEach((a, k) => {
      if (a.effect.mult) score.mult += a.effect.mult(ctxs[k] as EffectScoreCtx);
    });
    scorers.forEach((a, k) => {
      if (a.effect.xmult) score.mult *= a.effect.xmult(ctxs[k] as EffectScoreCtx);
    });
  };

  const hooks: SimHooks = { scoreModifiers: [runScore] };
  if (stoppers.length > 0) {
    hooks.stopTicks = (base, ctx) => {
      const sim = ctx.sim as SimState;
      let t = base;
      for (const a of stoppers) {
        t = a.effect.stopTicks!(t, {
          sim,
          info,
          combo: ctx.combo,
          chain: ctx.chain,
          ...stateView(sim, a.prefix),
        });
      }
      return t;
    };
  }
  if (risers.length > 0) {
    hooks.riseSpeed = (base, readonlySim) => {
      const sim = readonlySim as SimState;
      let s = base;
      for (const a of risers)
        s = a.effect.riseSpeed!(s, { sim, info, ...stateView(sim, a.prefix) });
      return s;
    };
  }
  if (clearers.length > 0) {
    hooks.onClear = ({ sim, group, colors }) => {
      for (const a of clearers) {
        const c: EffectClearCtx = {
          sim,
          info,
          combo: group.size,
          chain: group.chain,
          colors,
          ...stateView(sim, a.prefix),
        };
        a.effect.onClear!(c);
      }
    };
  }
  return hooks;
}
