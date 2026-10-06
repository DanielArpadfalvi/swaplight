import { DECKS, MAX_BRIGHTNESS, getDeck, isDeckId } from '../core/run';

/**
 * Run-mode access rules (pure):
 * - decks: the free deck (Neon) always; the others with the Full Version;
 * - Brightness: level 1 always; level n > 1 once a run was won at level n − 1 (tracked in
 *   `save.unlocks` as `brightness.<n>`, earned in the free version too) and with the Full Version.
 */

export const brightnessUnlockKey = (level: number): string => `brightness.${level}`;

export function deckAvailable(deckId: string, fullVersion: boolean): boolean {
  return isDeckId(deckId) && (getDeck(deckId).free || fullVersion);
}

/** Highest Brightness level earned by play (1 when none). */
export function brightnessEarned(unlocks: readonly string[]): number {
  let level = 1;
  while (level < MAX_BRIGHTNESS && unlocks.includes(brightnessUnlockKey(level + 1))) level++;
  return level;
}

export function brightnessAvailable(
  level: number,
  unlocks: readonly string[],
  fullVersion: boolean,
): boolean {
  if (level === 1) return true;
  return fullVersion && level <= brightnessEarned(unlocks);
}

/** Unlock keys earned by winning a run at `brightness` (not yet in `unlocks`). */
export function unlocksForWin(brightness: number, unlocks: readonly string[]): string[] {
  if (brightness >= MAX_BRIGHTNESS) return [];
  const key = brightnessUnlockKey(brightness + 1);
  return unlocks.includes(key) ? [] : [key];
}

/** Clamp a remembered deck / brightness choice to what is playable. */
export function sanitizeRunChoice(
  deckId: string,
  brightness: number,
  unlocks: readonly string[],
  fullVersion: boolean,
): { deckId: string; brightness: number } {
  const deck = deckAvailable(deckId, fullVersion)
    ? deckId
    : (DECKS.find((d) => d.free)?.id ?? 'neon');
  const b = brightnessAvailable(brightness, unlocks, fullVersion) ? brightness : 1;
  return { deckId: deck, brightness: b };
}
