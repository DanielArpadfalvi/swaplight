import { describe, expect, it } from 'vitest';
import { hashState } from '../../../../src/core/replay';
import { step } from '../../../../src/core/sim';
import type { SimState } from '../../../../src/core/types';
import {
  completeStage,
  computeRewards,
  createRun,
  createStageSim,
  deserializeRun,
  evaluateStage,
  leaveShop,
  runHash,
  serializeRun,
  stageConfig,
  stageResult,
  type StageResult,
} from '../../../../src/core/run';
import { botInputs, playRun, playStage, type BotMemory } from './bot';
import { atStage, runWith } from './fixtures';

const FAST_BOT = { raiseBelow: 7, lookahead: true };

const result = (over: Partial<StageResult> = {}): StageResult => ({
  won: true,
  value: 700,
  target: 700,
  ratio: 1,
  ticks: 600,
  ticksLeft: 0,
  score: 700,
  blocksCleared: 30,
  maxChain: 2,
  maxCombo: 4,
  modifiers: {},
  ...over,
});

describe('createRun', () => {
  it('is deterministic per seed, deck and brightness', () => {
    expect(runHash(createRun('s'))).toBe(runHash(createRun('s')));
    expect(runHash(createRun('s'))).not.toBe(runHash(createRun('t')));
    expect(runHash(createRun('s', 'neon', 1))).not.toBe(runHash(createRun('s', 'neon', 2)));
    expect(createRun(42).seed).toBe('42');
  });

  it('plans 3 acts × (3 stages + boss); first stage is a score stage; no repeats in a row', () => {
    for (let i = 0; i < 25; i++) {
      const run = createRun(`plan${i}`);
      expect(run.plan).toHaveLength(12);
      expect(run.plan[0]!.goalType).toBe('scoreInTime');
      for (let act = 1; act <= 3; act++) {
        const stages = run.plan.filter((p) => p.act === act);
        expect(stages.map((p) => p.stage)).toEqual([0, 1, 2, 3]);
        expect(stages[3]!.curses).toHaveLength(1);
        for (let s = 1; s < 3; s++) expect(stages[s]!.goalType).not.toBe(stages[s - 1]!.goalType);
      }
      const curses = run.plan.flatMap((p) => p.curses);
      expect(new Set(curses).size).toBe(3);
    }
  });

  it('stageConfig is pure and does not consume the run RNG', () => {
    const run = createRun('pure');
    const h = runHash(run);
    const a = stageConfig(run);
    const b = stageConfig(run);
    expect(runHash(run)).toBe(h);
    expect(a.seed).toBe(b.seed);
    expect(a.config).toEqual(b.config);
    expect(a.modifiers).toEqual(b.modifiers);
    expect(a.goal).toEqual(b.goal);
    expect(a.seed).not.toContain('|run');
  });
});

describe('rewards', () => {
  it('base by stage + overachievement + time + interest', () => {
    const run = runWith([], { szikra: 17 });
    const r = computeRewards(run, result({ ratio: 1.8, ticksLeft: 50 * 60 }));
    expect(r).toEqual({ base: 3, overachieve: 3, time: 3, interest: 3, relics: 0, total: 12 });
    expect(computeRewards(atStage(run, 2, 2), result()).base).toBe(5);
    expect(computeRewards({ ...run, szikra: 400 }, result()).interest).toBe(5);
  });

  it('survive stages earn no overachievement / time bonus', () => {
    const run = atStage(runWith([], { szikra: 0 }), 1, 1, { goalType: 'survive' });
    expect(computeRewards(run, result({ ratio: 3, ticksLeft: 9999 }))).toMatchObject({
      overachieve: 0,
      time: 0,
    });
  });
});

describe('run flow', () => {
  it('won stage → shop → next stage; boss → next act; last boss → won', () => {
    let run = createRun('flow');
    const start = run.szikra;
    const done = completeStage(run, result({ ratio: 1.3 }));
    expect(done.rewards!.total).toBeGreaterThan(0);
    run = done.run;
    expect(run.phase).toBe('shop');
    expect(run.szikra).toBe(start + done.rewards!.total);
    expect(run.history).toHaveLength(1);
    expect(() => completeStage(run, result())).toThrow();
    run = leaveShop(run);
    expect([run.phase, run.act, run.stage]).toEqual(['stage', 1, 1]);
    for (let k = 0; k < 10; k++) {
      run = completeStage(run, result()).run;
      if (run.phase === 'shop') run = leaveShop(run);
    }
    expect([run.act, run.stage, run.bossesDefeated]).toEqual([3, 3, 2]);
    run = completeStage(run, result()).run;
    expect(run.phase).toBe('won');
    expect(run.bossesDefeated).toBe(3);
    expect(run.shop).toBeNull();
    expect(() => leaveShop(run)).toThrow();
  });

  it('a lost stage ends the run', () => {
    const done = completeStage(createRun('lose'), result({ won: false, ratio: 0.5 }));
    expect(done.rewards).toBeNull();
    expect(done.run.phase).toBe('lost');
    expect(done.run.history[0]!.won).toBe(false);
  });
});

describe('persistence', () => {
  it('serializes to JSON and back with the same hash', () => {
    let run = createRun('save', 'gambler', 3);
    run = completeStage(run, result()).run;
    const text = serializeRun(run);
    const back = deserializeRun(text);
    expect(back).toEqual(run);
    expect(runHash(back)).toBe(runHash(run));
  });

  it('rejects unknown versions and ids', () => {
    const run = createRun('bad');
    expect(() => deserializeRun(JSON.stringify({ ...run, version: 2 }))).toThrow();
    expect(() => deserializeRun(JSON.stringify({ ...run, deckId: 'x' }))).toThrow();
    expect(() =>
      deserializeRun(JSON.stringify({ ...run, relics: [{ id: 'nope', paid: 1, state: {} }] })),
    ).toThrow();
    expect(() =>
      deserializeRun(JSON.stringify({ ...run, charms: [{ id: 'nope', paid: 1 }] })),
    ).toThrow();
  });

  it('a stage can be saved mid-play (run + sim JSON) and resumed identically', () => {
    const run = createRun('resume');
    const play = (sim: SimState, mem: BotMemory, from: number, to: number) => {
      const setup = stageConfig(run);
      for (let t = from; t < to; t++) step(sim, botInputs(sim, FAST_BOT, mem), setup.hooks, null);
    };
    const straight = createStageSim(stageConfig(run));
    const mem1: BotMemory = { held: false, lastMove: -1000 };
    play(straight, mem1, 0, 1200);

    const first = createStageSim(stageConfig(run));
    const mem2: BotMemory = { held: false, lastMove: -1000 };
    play(first, mem2, 0, 500);
    const saved = JSON.stringify({ run: serializeRun(run), sim: first, mem: mem2 });
    const loaded = JSON.parse(saved) as { run: string; sim: SimState; mem: BotMemory };
    const resumedRun = deserializeRun(loaded.run);
    expect(runHash(resumedRun)).toBe(runHash(run));
    play(loaded.sim, loaded.mem, 500, 1200);
    expect(hashState(loaded.sim)).toBe(hashState(straight));
  });
});

describe('simulated runs (bot)', () => {
  it('a greedy bot wins a full run at brightness 1', () => {
    const log = playRun(createRun('win10'), { bot: FAST_BOT, useCharms: true });
    expect(log.run.phase).toBe('won');
    expect(log.stages).toHaveLength(12);
    expect(log.run.history.every((h) => h.won)).toBe(true);
    expect(log.run.relics.length).toBeGreaterThan(0);
    expect(log.run.stats.totalScore).toBeGreaterThan(0);
    // every goal type showed up along the way
    expect(new Set(log.stages.map((s) => s.goal.type)).size).toBeGreaterThanOrEqual(3);
  });

  it('full runs are deterministic (same seed → same final hash)', () => {
    const a = playRun(createRun('det7'), { bot: FAST_BOT, useCharms: true });
    const b = playRun(createRun('det7'), { bot: FAST_BOT, useCharms: true });
    expect(runHash(a.run)).toBe(runHash(b.run));
    expect(a.stages.map((s) => s.result.score)).toEqual(b.stages.map((s) => s.result.score));
  });

  it('an idle player loses the first stage', () => {
    const played = playStage(createRun('idle'), { bot: null, useCharms: false });
    expect(played.result.won).toBe(false);
    expect(played.run.phase).toBe('lost');
  });

  it('stage progress is reported while playing', () => {
    const run = createRun('progress');
    const setup = stageConfig(run);
    const sim = createStageSim(setup);
    const mem: BotMemory = { held: false, lastMove: -1000 };
    let last = 0;
    for (let t = 0; t < 3000; t++) {
      const p = evaluateStage(setup.goal, sim);
      expect(p.progress).toBeGreaterThanOrEqual(last);
      last = p.progress;
      if (p.finished) break;
      step(sim, botInputs(sim, FAST_BOT, mem), setup.hooks, null);
    }
    expect(stageResult(setup.goal, sim).won).toBe(true);
  });
});
