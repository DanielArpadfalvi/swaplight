import { describe, expect, it } from 'vitest';
import { step } from '../../../../src/core/sim';
import {
  CURSES,
  createRun,
  createStageSim,
  evaluateStage,
  goalValue,
  stageConfig,
  type GoalType,
  type RunState,
} from '../../../../src/core/run';
import {
  botInputs,
  casualInputs,
  casualMemory,
  playRun,
  type BotMemory,
  type BotOptions,
} from './bot';
import { atStage } from './fixtures';

/**
 * Balance sanity report: `BALANCE=1 npx vitest run tests/unit/core/run/balance.test.ts`.
 * 1. Value a relic-less bot reaches by each goal's time limit vs the goal target.
 * 2. Full-run win rates (bot + greedy shop) per brightness and per-slot value/target ratios.
 * 3. Act 1 with a casual single-swap bot (`casualInputs`): win rate per slot, goal type and
 *    act-1 boss curse. Target: ≥ 60 % on act-1 stages, ≥ 40 % on the act-1 boss.
 * Human-like bot: 2 swaps/s max, 2-ply lookahead, raises while the stack is low.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const ENABLED = env?.BALANCE === '1';
const HUMAN: BotOptions = { raiseBelow: 6, lookahead: true, cooldown: 30 };
const FAST: BotOptions = { raiseBelow: 7, lookahead: true };
const SEEDS = 8;

function valueAtLimit(run: RunState, bot: BotOptions): number {
  const setup = stageConfig(run);
  const sim = createStageSim(setup);
  const mem: BotMemory = { held: false, lastMove: -1000 };
  const opts = setup.goal.type === 'survive' ? { ...bot, raiseBelow: 4 } : bot;
  while (sim.tick < setup.goal.timeLimit && !sim.gameOver) {
    step(sim, botInputs(sim, opts, mem), setup.hooks, null);
  }
  return goalValue(setup.goal, sim);
}

/** Play a stage with the casual bot; true if won. */
function casualWin(run: RunState, reaction: number): boolean {
  const setup = stageConfig(run);
  const sim = createStageSim(setup);
  const mem = casualMemory(reaction);
  for (let t = 0; t < 60 * 200; t++) {
    step(sim, casualInputs(sim, reaction, mem), setup.hooks, null);
    const p = evaluateStage(setup.goal, sim);
    if (p.finished) return p.won;
  }
  return false;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

describe.skipIf(!ENABLED)('balance report', () => {
  it('goal targets vs relic-less bot', () => {
    const types: GoalType[] = ['scoreInTime', 'clearBlocks', 'survive', 'chainTarget'];
    const lines = ['type         slot  lvl  target   bot-median  ratio'];
    for (const type of types) {
      for (let act = 1; act <= 3; act++) {
        for (let stage = 0; stage < 4; stage++) {
          if (stage === 3 && type !== 'scoreInTime') continue;
          const values: number[] = [];
          let target = 0;
          let level = 0;
          for (let i = 0; i < SEEDS; i++) {
            const run = atStage(createRun(`bal${i}`), act, stage, { goalType: type, curses: [] });
            run.charms = [];
            const goal = stageConfig(run).goal;
            target = goal.target;
            level = goal.startLevel;
            values.push(valueAtLimit(run, HUMAN));
          }
          const m = median(values);
          const unit = type === 'survive' ? 60 : 1;
          lines.push(
            `${type.padEnd(12)} a${act}s${stage}  ${String(level).padStart(3)}  ${String(target / unit).padStart(6)}  ${String(m / unit).padStart(11)}  ${(m / target).toFixed(2)}`,
          );
        }
      }
    }
    console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(1);
  }, 600_000);

  it('full runs: win rate per brightness and per-slot value/target', () => {
    const lines: string[] = [];
    for (const [name, bot] of [
      ['fast', FAST],
      ['human', HUMAN],
    ] as const) {
      for (const b of [1, 4, 8]) {
        let wins = 0;
        const reached: number[] = [];
        const ratios = new Map<string, number[]>();
        for (let i = 0; i < 16; i++) {
          const log = playRun(createRun(`run${i}`, 'neon', b), { bot, useCharms: true });
          if (log.run.phase === 'won') wins++;
          reached.push(log.stages.length);
          for (const s of log.stages) {
            const key = `a${s.run.history.at(-1)!.act}s${s.run.history.at(-1)!.stage}`;
            ratios.set(key, [...(ratios.get(key) ?? []), s.result.ratio]);
          }
        }
        const slots = [...ratios.entries()]
          .sort()
          .map(([k, v]) => `${k}:${median(v).toFixed(2)}`)
          .join(' ');
        lines.push(
          `${name} B${b}: wins ${wins}/16, mean stages ${(reached.reduce((a, c) => a + c, 0) / 16).toFixed(1)}`,
        );
        lines.push(`  median value/target at finish: ${slots}`);
      }
    }
    console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  }, 600_000);

  it('act 1: casual single-swap bot', () => {
    const N = 16;
    const types: GoalType[] = ['scoreInTime', 'clearBlocks', 'survive', 'chainTarget'];
    const act1Curses = CURSES.filter((c) => (c.minAct ?? 1) <= 1).map((c) => c.id);
    const lines = ['slot  goal                lvl  target   r120    r75'];
    const rates: Record<string, number[]> = { stage: [], boss: [] };
    const variants: [number, string, GoalType, string[]][] = [];
    for (let stage = 0; stage < 3; stage++) {
      for (const type of types) variants.push([stage, type, type, []]);
    }
    for (const c of act1Curses) variants.push([3, `boss+${c}`, 'scoreInTime', [c]]);
    for (const [stage, name, goalType, curses] of variants) {
      const cells: string[] = [];
      let goal = stageConfig(atStage(createRun('x'), 1, stage, { goalType, curses })).goal;
      for (const reaction of [120, 75]) {
        let wins = 0;
        for (let i = 0; i < N; i++) {
          const run = atStage(createRun(`bal-${i + 1}`), 1, stage, { goalType, curses });
          run.charms = [];
          goal = stageConfig(run).goal;
          if (casualWin(run, reaction)) wins++;
        }
        cells.push(`${String(wins).padStart(2)}/${N}`.padStart(6));
        if (reaction === 75) rates[stage === 3 ? 'boss' : 'stage']!.push(wins / N);
      }
      const target = goal.type === 'survive' ? `${goal.target / 60} s` : String(goal.target);
      lines.push(
        `a1s${stage}  ${name.padEnd(18)}  ${String(goal.startLevel).padStart(3)}  ${target.padStart(6)}  ${cells.join('  ')}`,
      );
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    lines.push(
      `r75 mean: stages ${(mean(rates.stage!) * 100).toFixed(0)} %, boss ${(mean(rates.boss!) * 100).toFixed(0)} %`,
    );
    console.log(lines.join('\n'));
    expect(mean(rates.stage!)).toBeGreaterThanOrEqual(0.6);
    expect(mean(rates.boss!)).toBeGreaterThanOrEqual(0.4);
  }, 1_200_000);
});
