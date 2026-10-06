/**
 * `sim.modifiers` keys used by the run layer (plain numbers, cloned and hashed with the sim).
 * Engine-level keys (`swapLockUntil`, `lockedColumns`) live in sim.ts.
 */
export { MOD_LOCKED_COLUMNS, MOD_SWAP_LOCK_UNTIL } from '../sim';

/** `stage.chain.<L>` = number of chains that reached length L this stage (L ≥ 2). */
export const STAGE_CHAIN_PREFIX = 'stage.chain.';
/** Blocks removed by charms this stage (count towards clearBlocks goals). */
export const STAGE_CHARM_CLEARED = 'stage.charmCleared';
/** Tick of the last match this stage. */
export const STAGE_LAST_MATCH = 'stage.lastMatch';
/** Auto-rise frozen while `sim.tick < charm.freezeUntil`. */
export const CHARM_FREEZE_UNTIL = 'charm.freezeUntil';
/** +3 mult while `sim.tick < charm.overchargeUntil`. */
export const CHARM_OVERCHARGE_UNTIL = 'charm.overchargeUntil';
/** Tick of the last charm use (-1 / absent = none). */
export const CHARM_LAST_USE = 'charm.lastUse';
/** Renderer flag: color index drawn invisible (The Veil). Absent = none. */
export const MOD_HIDDEN_COLOR = 'hiddenColor';

export const chainKey = (length: number): string => `${STAGE_CHAIN_PREFIX}${length}`;

/** Namespace of a relic's state inside `sim.modifiers`. */
export const relicPrefix = (id: string): string => `relic.${id}.`;
/** Set by the Skeleton Key: swap-lock curses are disabled for the rest of the stage. */
export const CHARM_UNLOCKED = 'charm.unlocked';
