import { describe, expect, it } from 'vitest';
import { playCpuRound, playerModel } from './versusPlayer';

/**
 * Versus difficulty ladder report (opt-in, a few minutes):
 *   BALANCE=1 npx vitest run tests/unit/core/versusBalance.test.ts
 *   BALANCE_SEEDS=24 … for more matches per cell.
 * A scripted player (`versusPlayer.ts`) making at most one match per N seconds plays single
 * rounds against every CPU level through the real game glue (`VersusMatch`, incl. the low-level
 * attack handicaps). Targets: a 2.5 s/match player beats Easy ≥ 70 %, a 1.25 s/match player
 * beats Normal about half the time, Hard → Expert → Insane get progressively harder.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const ENABLED = env?.BALANCE === '1';
const SEEDS = Number(env?.BALANCE_SEEDS ?? 12);

/** Seconds per match of the scripted player (0 = idle). */
const PACES = [0, 3.5, 2.5, 1.25, 0.8];

function winRate(level: number, pace: number): { rate: number; line: string } {
  let wins = 0;
  let seconds = 0;
  let blocks = 0;
  for (let i = 1; i <= SEEDS; i++) {
    const r = playCpuRound(`bal-${i}`, level, pace > 0 ? playerModel(pace) : null, 300);
    if (r.winner === 0) wins++;
    seconds += r.seconds;
    blocks += r.pBlocks;
  }
  const rate = wins / SEEDS;
  const line = `L${level} ${pace === 0 ? 'idle ' : `${pace.toFixed(2)}s`}  ${String(wins).padStart(2)}/${SEEDS} (${Math.round(
    rate * 100,
  )
    .toString()
    .padStart(
      3,
    )} %)  mean ${Math.round(seconds / SEEDS)} s  player ${(blocks / seconds).toFixed(2)} blocks/s`;
  return { rate, line };
}

describe.skipIf(!ENABLED)('versus difficulty ladder', () => {
  it('player win rates per CPU level and pace', () => {
    const rates = new Map<string, number>();
    const lines = ['level pace    wins        mean round  player speed'];
    for (let level = 1; level <= 5; level++) {
      for (const pace of PACES) {
        const { rate, line } = winRate(level, pace);
        rates.set(`${level}@${pace}`, rate);
        lines.push(line);
      }
    }
    console.log(lines.join('\n'));
    const r = (level: number, pace: number) => rates.get(`${level}@${pace}`) ?? 0;
    expect(r(1, 0)).toBe(0); // idling still loses
    expect(r(1, 2.5)).toBeGreaterThanOrEqual(0.7);
    expect(r(2, 1.25)).toBeGreaterThanOrEqual(0.4);
    expect(r(2, 1.25)).toBeLessThanOrEqual(0.75);
    expect(r(3, 1.25)).toBeLessThanOrEqual(r(2, 1.25));
    expect(r(4, 0.8)).toBeLessThanOrEqual(r(3, 0.8));
    expect(r(5, 0.8)).toBeLessThanOrEqual(r(4, 0.8));
  }, 3_600_000);
});
