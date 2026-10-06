/// <reference types="node" />
/**
 * Regenerates the puzzle packs (src/core/puzzles/packs/packN.ts).
 *
 *   npx tsx scripts/gen-puzzles.ts [pack...]          (when tsx is available)
 *   GEN_PUZZLES=1 [PACKS=1,3] npx vitest run tests/unit/core/puzzles/generate.test.ts
 *
 * Deterministic: the same recipes (src/core/puzzles/build.ts) and the same other
 * packs give the same output. Packs 3–4 take minutes (exhaustive 4–5 move solves).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPack, packSource, PACK_COUNT } from '../src/core/puzzles/build';
import { PUZZLE_PACKS } from '../src/core/puzzles/packs';

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/core/puzzles/packs');

export function writePacks(
  packs: readonly number[],
  log: (msg: string) => void = console.log,
): void {
  for (const pack of packs) {
    const exclude = new Set<string>();
    PUZZLE_PACKS.forEach((defs, i) => {
      if (i + 1 !== pack) for (const d of defs) exclude.add(d.board);
    });
    const start = performance.now();
    const defs = buildPack(pack, exclude, log);
    const file = join(PACK_DIR, `pack${pack}.ts`);
    writeFileSync(file, packSource(pack, defs));
    log(
      `pack ${pack}: ${defs.length} puzzles → ${file} (${Math.round(performance.now() - start)} ms)`,
    );
  }
}

export function parsePacks(args: readonly string[]): number[] {
  const all = Array.from({ length: PACK_COUNT }, (_, i) => i + 1);
  const picked = args
    .flatMap((a) => a.split(','))
    .map(Number)
    .filter((n) => all.includes(n));
  return picked.length > 0 ? picked : all;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  writePacks(parsePacks(process.argv.slice(2)));
}
