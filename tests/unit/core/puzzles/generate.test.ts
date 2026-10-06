/**
 * Opt-in pack regeneration (writes src/core/puzzles/packs/*.ts):
 *   GEN_PUZZLES=1 [PACKS=1,2] npx vitest run tests/unit/core/puzzles/generate.test.ts
 */
import { describe, it } from 'vitest';
import { parsePacks, writePacks } from '../../../../scripts/gen-puzzles';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;

describe.skipIf(env?.GEN_PUZZLES !== '1')('puzzle pack generation', () => {
  it('regenerates the packs', () => {
    writePacks(parsePacks([env?.PACKS ?? '']));
  }, 3_600_000);
});
