import { describe, expect, it } from 'vitest';
import { step } from '../../../../src/core/sim';
import {
  STAGE_CHARM_CLEARED,
  chainKey,
  evaluateStage,
  makeGoal,
  niceRound,
  stageResult,
  type GoalType,
  type StageGoal,
} from '../../../../src/core/run';
import { ofType, settle } from '../helpers';
import { atStage, runWith, stageSim } from './fixtures';

const TYPES: GoalType[] = ['scoreInTime', 'clearBlocks', 'survive', 'chainTarget'];

describe('goal curve', () => {
  it('niceRound keeps two significant digits', () => {
    expect([0, 7, 512, 703, 1234, 5678, 45678].map(niceRound)).toEqual([
      0, 5, 510, 700, 1200, 5700, 46000,
    ]);
  });

  it.each(TYPES)('%s goals never get easier along the run or with brightness', (type) => {
    // chain goals restart their count when act 3 switches to ×3 chains
    const difficulty = (g: StageGoal) =>
      type === 'chainTarget' ? g.target * 10 ** g.chainLength : g.target;
    let prev = 0;
    for (let act = 1; act <= 3; act++) {
      for (let stage = 0; stage < (type === 'scoreInTime' ? 4 : 3); stage++) {
        const g = makeGoal(type, act, stage, 1);
        expect(difficulty(g)).toBeGreaterThanOrEqual(prev);
        prev = difficulty(g);
        expect(makeGoal(type, act, stage, 8).target).toBeGreaterThanOrEqual(g.target);
        expect(g.startLevel).toBeGreaterThanOrEqual(1 + 2 * (act - 1));
        expect(g.timeLimit).toBeGreaterThan(0);
      }
    }
  });

  it('survive runs at an elevated speed level; chains need ×3 in act 3', () => {
    expect(makeGoal('survive', 1, 0, 1).startLevel).toBe(5);
    expect(makeGoal('chainTarget', 3, 0, 1).chainLength).toBe(3);
    expect(makeGoal('chainTarget', 1, 0, 1)).toMatchObject({ chainLength: 2, target: 1 });
  });
});

describe('evaluateStage', () => {
  const goal = (over: Partial<StageGoal>): StageGoal => ({
    type: 'scoreInTime',
    target: 100,
    chainLength: 0,
    timeLimit: 600,
    startLevel: 1,
    ...over,
  });

  it('scoreInTime: progress, win, loss on time and on top-out', () => {
    const { sim } = stageSim(runWith(), 'RGBYPR');
    const g = goal({});
    sim.score = 40;
    expect(evaluateStage(g, sim)).toMatchObject({
      value: 40,
      progress: 0.4,
      won: false,
      lost: false,
      finished: false,
      ticksLeft: 600,
    });
    sim.score = 150;
    expect(evaluateStage(g, sim)).toMatchObject({
      progress: 1,
      ratio: 1.5,
      won: true,
      finished: true,
    });
    sim.score = 50;
    sim.tick = 600;
    expect(evaluateStage(g, sim)).toMatchObject({ lost: true, finished: true, ticksLeft: 0 });
    sim.tick = 10;
    sim.gameOver = true;
    expect(evaluateStage(g, sim)).toMatchObject({ lost: true, finished: true });
  });

  it('a won stage finishes only once the board settles (finishing chains count)', () => {
    const { sim } = stageSim(runWith(), 'RRRGBY');
    const g = goal({ target: 20 });
    const events = step(sim);
    expect(ofType(events, 'matched')).toHaveLength(1);
    expect(evaluateStage(g, sim)).toMatchObject({ won: true, finished: false });
    settle(sim);
    expect(evaluateStage(g, sim)).toMatchObject({ won: true, finished: true });
  });

  it('clearBlocks counts cleared blocks plus charm removals', () => {
    const { sim } = stageSim(runWith(), 'RGBYPR');
    const g = goal({ type: 'clearBlocks', target: 10 });
    sim.stats.blocksCleared = 6;
    sim.modifiers[STAGE_CHARM_CLEARED] = 3;
    expect(evaluateStage(g, sim).value).toBe(9);
    sim.modifiers[STAGE_CHARM_CLEARED] = 4;
    expect(evaluateStage(g, sim).won).toBe(true);
  });

  it('survive: won at the time limit unless topped out', () => {
    const { sim } = stageSim(runWith(), 'RGBYPR');
    const g = goal({ type: 'survive', target: 600, timeLimit: 600 });
    sim.tick = 300;
    expect(evaluateStage(g, sim)).toMatchObject({ progress: 0.5, won: false, lost: false });
    sim.gameOver = true;
    expect(evaluateStage(g, sim)).toMatchObject({ won: false, lost: true });
    sim.gameOver = false;
    sim.tick = 600;
    expect(evaluateStage(g, sim)).toMatchObject({ won: true, lost: false });
  });

  it('chainTarget counts chains reaching the required length (stage counters)', () => {
    const g = goal({ type: 'chainTarget', target: 1, chainLength: 2 });
    // Swapping G/B on the bottom row clears the GGG column; the R above lands on RR_ → ×2.
    const { setup, sim } = stageSim(
      runWith(),
      `
      ..R...
      ..G...
      ..G...
      RRBG..
    `,
    );
    expect(evaluateStage(g, sim).value).toBe(0);
    const events = step(sim, [{ type: 'swap', row: 11, col: 2 }], setup.hooks);
    events.push(...settle(sim, 2000, setup.hooks));
    expect(ofType(events, 'matched').map((m) => m.chain)).toEqual([1, 2]);
    expect(sim.modifiers[chainKey(2)]).toBe(1);
    expect(evaluateStage(g, sim)).toMatchObject({ value: 1, won: true, finished: true });
    expect(evaluateStage({ ...g, chainLength: 3 }, sim).value).toBe(0);
  });

  it('stageResult snapshots the finished stage', () => {
    const run = atStage(runWith(), 1, 0, { goalType: 'scoreInTime' });
    const { setup, sim } = stageSim(run, 'RGBYPR');
    sim.score = 2 * setup.goal.target;
    sim.tick = 600;
    const r = stageResult(setup.goal, sim);
    expect(r).toMatchObject({
      won: true,
      ratio: 2,
      ticks: 600,
      ticksLeft: setup.goal.timeLimit - 600,
    });
    expect(r.modifiers).not.toBe(sim.modifiers);
  });
});
