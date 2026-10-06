import { describe, expect, it } from 'vitest';
import { loadAscii } from '../../../src/core/ascii';
import {
  createPuzzleSession,
  puzzlePlay,
  puzzleSettle,
  puzzleSwap,
} from '../../../src/core/puzzles';
import { createSim, step } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/types';
import {
  nextCoachMove,
  TUTORIAL_STEPS,
  tutorialGoalMet,
  tutorialPuzzleDef,
  tutorialShouldRetry,
} from '../../../src/game/tutorial';

describe('tutorial script', () => {
  it('has 5–7 steps ending with the Run teaser card', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(TUTORIAL_STEPS.length).toBeLessThanOrEqual(7);
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'swap',
      'match',
      'drop',
      'combo',
      'chain',
      'raise',
      'relics',
    ]);
  });

  TUTORIAL_STEPS.forEach((s, i) => {
    if (s.kind !== 'board') return;
    it(`board step "${s.id}": settled start, goal not met, scripted moves reach the goal`, () => {
      const session = createPuzzleSession(tutorialPuzzleDef(s, i));
      expect(session.sim.stats.matches).toBe(0);
      expect(tutorialGoalMet(s.goal, session.sim, 0)).toBe(false);
      puzzlePlay(session, s.script);
      expect(tutorialGoalMet(s.goal, session.sim, session.moves.length)).toBe(true);
    });
  });

  it('multi-move steps need the whole script (the setup move alone does not finish them)', () => {
    TUTORIAL_STEPS.forEach((s, i) => {
      if (s.kind !== 'board' || s.script.length < 2) return;
      const session = createPuzzleSession(tutorialPuzzleDef(s, i));
      puzzlePlay(session, s.script.slice(0, 1));
      expect(tutorialGoalMet(s.goal, session.sim, 1)).toBe(false);
    });
  });

  it('raise step: the stack is settled and rising reaches the goal without topping out', () => {
    const s = TUTORIAL_STEPS.find((x) => x.kind === 'raise')!;
    const sim = createSim('tutorial', {}, 'endless');
    loadAscii(sim, s.board!);
    const events: SimEvent[] = [];
    for (let i = 0; i < 30; i++) step(sim, [], undefined, events);
    expect(events.some((e) => e.type === 'matched')).toBe(false);
    step(sim, [{ type: 'raise', active: true }]);
    for (let i = 0; i < 120 && !tutorialGoalMet(s.goal, sim, 0); i++) step(sim, []);
    expect(tutorialGoalMet(s.goal, sim, 0)).toBe(true);
    expect(sim.gameOver).toBe(false);
  });

  it('coach follows the script and stops once the player leaves it', () => {
    const chain = TUTORIAL_STEPS.find((x) => x.id === 'chain')!;
    expect(nextCoachMove(chain, [])).toEqual(chain.script[0]);
    expect(nextCoachMove(chain, [chain.script[0]!])).toEqual(chain.script[1]);
    expect(nextCoachMove(chain, [{ row: 0, col: 0 }])).toBeNull();
    expect(tutorialShouldRetry(chain, [])).toBe(false);
    expect(tutorialShouldRetry(chain, [chain.script[0]!])).toBe(false);
    expect(tutorialShouldRetry(chain, [{ row: 11, col: 4 }])).toBe(true);
  });

  it('a wrong move on a board step leads to a retry', () => {
    const i = TUTORIAL_STEPS.findIndex((x) => x.id === 'match');
    const s = TUTORIAL_STEPS[i]!;
    const session = createPuzzleSession(tutorialPuzzleDef(s, i));
    expect(puzzleSwap(session, 11, 4)).toBeNull();
    puzzleSettle(session);
    expect(tutorialGoalMet(s.goal, session.sim, 1)).toBe(false);
    expect(tutorialShouldRetry(s, session.moves)).toBe(true);
  });
});
