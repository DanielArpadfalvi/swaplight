import { EMPTY_MODE_STATS, type ModeStats, type SaveData } from './save';

/** Outcome of one finished (or quit) game, as recorded into the save. */
export interface GameResult {
  score: number;
  maxChain: number;
  maxCombo: number;
  blocksCleared: number;
  /** Whole seconds played. */
  seconds: number;
}

/**
 * Fold a game result into the per-mode stats (mutates `save`, use inside `SaveManager.update`).
 * Returns true when the score is a new best for the mode.
 */
export function recordGame(save: SaveData, mode: string, result: GameResult): boolean {
  const prev = save.modes[mode] ?? { ...EMPTY_MODE_STATS };
  const score = Math.max(0, Math.floor(result.score));
  const newBest = score > prev.best;
  save.modes[mode] = {
    played: prev.played + 1,
    best: Math.max(prev.best, score),
    bestChain: Math.max(prev.bestChain, Math.floor(result.maxChain)),
    bestCombo: Math.max(prev.bestCombo, Math.floor(result.maxCombo)),
    blocksCleared: prev.blocksCleared + Math.max(0, Math.floor(result.blocksCleared)),
    playTime: prev.playTime + Math.max(0, Math.floor(result.seconds)),
  };
  return newBest;
}

export interface StatTotals {
  gamesPlayed: number;
  /** Longest chain across modes (0 = none yet). */
  longestChain: number;
  biggestCombo: number;
  blocksCleared: number;
  playTime: number;
}

export function statTotals(modes: Readonly<Record<string, ModeStats>>): StatTotals {
  const t: StatTotals = {
    gamesPlayed: 0,
    longestChain: 0,
    biggestCombo: 0,
    blocksCleared: 0,
    playTime: 0,
  };
  for (const m of Object.values(modes)) {
    t.gamesPlayed += m.played;
    t.longestChain = Math.max(t.longestChain, m.bestChain);
    t.biggestCombo = Math.max(t.biggestCombo, m.bestCombo);
    t.blocksCleared += m.blocksCleared;
    t.playTime += m.playTime;
  }
  return t;
}
