import {
  isPuzzlePackFree,
  PUZZLE_PACKS,
  puzzlePack,
  type PuzzleDef,
  type PuzzleGoal,
} from '../core/puzzles';
import type { TranslationKey, TranslationParams } from '../i18n';
import type { PuzzleRecord, SaveData } from './save';

/**
 * Puzzle-mode glue between the core packs and the save: pack access, sequential level unlocks,
 * star ratings and progress bookkeeping. Pure (no DOM), unit tested.
 */

export const MAX_STARS = 3;

/** Star rating of a solve: 3 = no solution hint and within par; each shortfall costs one star. */
export function computeStars(opts: { movesUsed: number; par: number; hintsUsed: number }): number {
  let stars = MAX_STARS;
  if (opts.movesUsed > opts.par) stars--;
  if (opts.hintsUsed > 0) stars--;
  if (opts.hintsUsed > 1) stars--;
  return Math.max(1, stars);
}

/** Can the pack be opened (free pack, or the Full Version)? */
export function puzzlePackAvailable(pack: number, fullVersion: boolean): boolean {
  return isPuzzlePackFree(pack) || fullVersion;
}

export type LevelState = 'locked' | 'open' | 'solved';

/** Levels unlock one after another inside a pack: a level opens once the previous one is solved. */
export function levelState(
  defs: readonly PuzzleDef[],
  index: number,
  records: Readonly<Record<string, PuzzleRecord>>,
): LevelState {
  const def = defs[index];
  if (!def) return 'locked';
  if (records[def.id]) return 'solved';
  if (index === 0) return 'open';
  const prev = defs[index - 1];
  return prev && records[prev.id] ? 'open' : 'locked';
}

export function isPuzzleUnlocked(
  def: PuzzleDef,
  records: Readonly<Record<string, PuzzleRecord>>,
  fullVersion: boolean,
): boolean {
  if (!puzzlePackAvailable(def.pack, fullVersion)) return false;
  return levelState(puzzlePack(def.pack), def.index, records) !== 'locked';
}

export interface PackSummary {
  pack: number;
  total: number;
  solved: number;
  stars: number;
  maxStars: number;
  available: boolean;
  /** Index of the first unsolved level (total when the pack is complete). */
  nextIndex: number;
}

export function packSummary(
  pack: number,
  records: Readonly<Record<string, PuzzleRecord>>,
  fullVersion: boolean,
): PackSummary {
  const defs = puzzlePack(pack);
  let solved = 0;
  let stars = 0;
  let nextIndex = defs.length;
  defs.forEach((d, i) => {
    const r = records[d.id];
    if (r) {
      solved++;
      stars += r.stars;
    } else if (nextIndex === defs.length) {
      nextIndex = i;
    }
  });
  return {
    pack,
    total: defs.length,
    solved,
    stars,
    maxStars: defs.length * MAX_STARS,
    available: puzzlePackAvailable(pack, fullVersion),
    nextIndex,
  };
}

export function allPackSummaries(
  records: Readonly<Record<string, PuzzleRecord>>,
  fullVersion: boolean,
): PackSummary[] {
  return PUZZLE_PACKS.map((_, i) => packSummary(i + 1, records, fullVersion));
}

export interface RecordOutcome {
  stars: number;
  prevStars: number;
  /** First solve of this puzzle. */
  firstSolve: boolean;
}

/** Fold a solve into the save (mutates `save`; use inside `SaveManager.update`). Keeps the best. */
export function recordPuzzleSolve(
  save: SaveData,
  id: string,
  stars: number,
  movesUsed: number,
): RecordOutcome {
  const prev = save.puzzles[id];
  save.puzzles[id] = {
    stars: Math.max(prev?.stars ?? 0, stars),
    moves: prev && prev.moves > 0 ? Math.min(prev.moves, movesUsed) : movesUsed,
  };
  return { stars, prevStars: prev?.stars ?? 0, firstSolve: !prev };
}

/** "01".."30" */
export function levelNumber(index: number): string {
  const n = index + 1;
  return n < 10 ? `0${n}` : String(n);
}

/** i18n key + params of a goal ("Clear every block", "Make a ×3 chain", "Clear 5 at once"). */
export function goalText(goal: PuzzleGoal): { key: TranslationKey; params?: TranslationParams } {
  if (goal === 'clearAll') return { key: 'puzzle.goalClearAll' };
  if (goal.type === 'chain') return { key: 'puzzle.goalChain', params: { n: goal.length } };
  return { key: 'puzzle.goalCombo', params: { n: goal.size } };
}
