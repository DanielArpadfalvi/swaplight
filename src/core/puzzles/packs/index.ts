import type { PuzzleDef } from '../types';
import { PACK_1 } from './pack1';
import { PACK_2 } from './pack2';
import { PACK_3 } from './pack3';
import { PACK_4 } from './pack4';

/** The four puzzle packs (30 puzzles each, increasing difficulty). */
export const PUZZLE_PACKS: readonly (readonly PuzzleDef[])[] = [PACK_1, PACK_2, PACK_3, PACK_4];

/** Packs playable without the full version (PLAN §1.5). */
export const FREE_PUZZLE_PACKS: readonly number[] = [1];

export function isPuzzlePackFree(pack: number): boolean {
  return FREE_PUZZLE_PACKS.includes(pack);
}

export function puzzlePack(pack: number): readonly PuzzleDef[] {
  return PUZZLE_PACKS[pack - 1] ?? [];
}

export function allPuzzles(): PuzzleDef[] {
  return PUZZLE_PACKS.flat();
}

export function puzzleById(id: string): PuzzleDef | undefined {
  for (const pack of PUZZLE_PACKS) {
    const def = pack.find((p) => p.id === id);
    if (def) return def;
  }
  return undefined;
}

/** The puzzle after `id` in its pack (undefined at the end of the pack). */
export function nextPuzzle(id: string): PuzzleDef | undefined {
  const def = puzzleById(id);
  return def ? puzzlePack(def.pack)[def.index + 1] : undefined;
}
