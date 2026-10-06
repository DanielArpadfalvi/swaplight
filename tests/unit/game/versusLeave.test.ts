import { describe, expect, it } from 'vitest';
import { cpuSideRules } from '../../../src/core/ai';
import { FORFEIT_AFTER_TICKS, VersusMatch } from '../../../src/game/versus';
import { createVersusMode, type VersusModeHost } from '../../../src/game/versusMode';
import { modeHarness } from './modeHost';

function playTicks(m: VersusMatch, n: number): void {
  for (let i = 0; i < n && !m.vs.over; i++) m.step([]);
}

describe('VersusMatch leave / forfeit', () => {
  it('uses the CPU level handicap for the CPU side', () => {
    const easy = new VersusMatch('h', 1);
    expect(easy.vs.rules.sides[1]).toEqual(cpuSideRules(1));
    expect(easy.vs.rules.sides[1].attackPercent).toBeLessThan(100);
    expect(easy.vs.rules.sides[0]).toMatchObject({ attackPercent: 100, attackFromTick: 0 });
    expect(new VersusMatch('h', 5).vs.rules.sides[1].attackPercent).toBe(100);
  });

  it('no confirm (and no forfeit) in the first 10 s of the first round', () => {
    const m = new VersusMatch('leave-early', 1);
    playTicks(m, FORFEIT_AFTER_TICKS - 1);
    expect(m.needsLeaveConfirm).toBe(false);
    expect(m.forfeit()).toBe(false);
    expect(m.rounds).toHaveLength(0);
    expect(m.matchOver).toBe(false);
  });

  it('after 10 s mid-round: forfeit scores the round and the match for the CPU', () => {
    const m = new VersusMatch('leave-mid', 1);
    playTicks(m, FORFEIT_AFTER_TICKS);
    expect(m.needsLeaveConfirm).toBe(true);
    expect(m.forfeit()).toBe(true);
    expect(m.matchOver).toBe(true);
    expect(m.matchWinner).toBe(1);
    expect(m.rounds).toHaveLength(1);
    expect(m.rounds[0]?.winner).toBe(1);
    expect(m.needsLeaveConfirm).toBe(false);
    expect(m.forfeit()).toBe(false);
  });

  it('best of 3 after a played round: leaving forfeits even right after the round', () => {
    const m = new VersusMatch('leave-bo3', 2, 'bo3');
    m.forceRound(0);
    m.finishRound();
    expect(m.matchOver).toBe(false);
    expect(m.needsLeaveConfirm).toBe(true);
    m.nextRound();
    expect(m.needsLeaveConfirm).toBe(true);
    expect(m.forfeit()).toBe(true);
    expect(m.matchWinner).toBe(1);
    expect(m.wins).toEqual([1, 2]);
  });

  it('a decided match needs no confirm', () => {
    const m = new VersusMatch('leave-done', 1);
    playTicks(m, FORFEIT_AFTER_TICKS);
    m.forceRound(0);
    m.finishRound();
    expect(m.matchOver).toBe(true);
    expect(m.needsLeaveConfirm).toBe(false);
  });
});

describe('versus mode leave()', () => {
  function setup() {
    const h = modeHarness();
    const mode = createVersusMode(h.host as unknown as VersusModeHost);
    return { ...h, mode };
  }

  it('records a forfeit loss when leaving after 10 s', () => {
    const { mode, save, store } = setup();
    mode.testApi.start({ seed: 'vl', level: 2 });
    expect(mode.needsLeaveConfirm).toBe(false);
    expect(store.get().versusHud?.needsLeaveConfirm).toBe(false);
    for (let i = 0; i < FORFEIT_AFTER_TICKS; i++) mode.tick(0);
    mode.afterTick();
    expect(mode.needsLeaveConfirm).toBe(true);
    expect(store.get().versusHud?.needsLeaveConfirm).toBe(true);
    expect(mode.testApi.state().needsLeaveConfirm).toBe(true);
    mode.leave();
    expect(save.data.versus['2']).toMatchObject({ played: 1, won: 0, lost: 1 });
    expect(save.data.modes.versus?.played).toBe(1);
    expect(mode.testApi.state().active).toBe(false);
    expect(mode.needsLeaveConfirm).toBe(false);
  });

  it('records nothing when leaving in the first seconds', () => {
    const { mode, save } = setup();
    mode.testApi.start({ seed: 'vl2', level: 1 });
    for (let i = 0; i < 60; i++) mode.tick(0);
    mode.leave();
    expect(save.data.versus['1']).toBeUndefined();
    expect(save.data.modes.versus).toBeUndefined();
  });

  it('a finished match is recorded once (leaving from the result does not add a loss)', () => {
    const { mode, save } = setup();
    mode.testApi.start({ seed: 'vl3', level: 1 });
    for (let i = 0; i < FORFEIT_AFTER_TICKS; i++) mode.tick(0);
    mode.testApi.forceWin();
    expect(mode.needsLeaveConfirm).toBe(false);
    mode.leave();
    expect(save.data.versus['1']).toMatchObject({ played: 1, won: 1, lost: 0 });
  });
});

describe('versus mode locked level + paywall', () => {
  it('selects the tapped locked level once the Full Version is bought', () => {
    const h = modeHarness();
    const reasons: string[] = [];
    h.host.openPaywall = (r: string) => reasons.push(r);
    const mode = createVersusMode(h.host as unknown as VersusModeHost);
    h.store.set({ screen: 'versusSetup', fullVersion: false });
    const before = h.store.get().versusSetup.level;
    mode.actions.selectLevel(4);
    expect(reasons).toEqual(['versus']);
    expect(h.store.get().versusSetup.level).toBe(before);
    h.store.set({ fullVersion: true });
    expect(h.store.get().versusSetup.level).toBe(4);
  });

  it('a later pick forgets the locked level', () => {
    const h = modeHarness();
    h.host.openPaywall = () => undefined;
    const mode = createVersusMode(h.host as unknown as VersusModeHost);
    h.store.set({ screen: 'versusSetup', fullVersion: false });
    mode.actions.selectLevel(5);
    mode.actions.selectLevel(1);
    h.store.set({ fullVersion: true });
    expect(h.store.get().versusSetup.level).toBe(1);
  });
});
