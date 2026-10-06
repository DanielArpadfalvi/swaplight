import { describe, expect, it } from 'vitest';
import { hashVersus } from '../../../src/core/versus';
import { createDefaultSave, sanitizeSave } from '../../../src/game/save';
import { EndlessSession } from '../../../src/game/session';
import {
  FREE_VERSUS_LEVELS,
  VersusMatch,
  garbageIcons,
  isCpuLevel,
  queuedCells,
  recordVersusMatch,
  roundsToWin,
  versusLevelAvailable,
  versusRecord,
} from '../../../src/game/versus';

describe('versus access', () => {
  it('Easy and Normal are free, Hard+ needs the Full Version', () => {
    expect(FREE_VERSUS_LEVELS).toEqual([1, 2]);
    expect(versusLevelAvailable(1, false)).toBe(true);
    expect(versusLevelAvailable(2, false)).toBe(true);
    for (const level of [3, 4, 5]) {
      expect(versusLevelAvailable(level, false)).toBe(false);
      expect(versusLevelAvailable(level, true)).toBe(true);
    }
    expect(versusLevelAvailable(0, true)).toBe(false);
    expect(versusLevelAvailable(6, true)).toBe(false);
    expect(isCpuLevel(2.5)).toBe(false);
  });

  it('best of 3 needs two round wins', () => {
    expect(roundsToWin('single')).toBe(1);
    expect(roundsToWin('bo3')).toBe(2);
  });
});

describe('VersusMatch', () => {
  it('is deterministic: same seed + level + player inputs → same match', () => {
    const run = () => {
      const m = new VersusMatch('det', 3);
      for (let i = 0; i < 600; i++) m.step([]);
      return hashVersus(m.vs);
    };
    expect(run()).toBe(run());
  });

  it('the CPU plays (swaps) inside the lockstep loop', () => {
    const m = new VersusMatch('cpu-plays', 2);
    for (let i = 0; i < 400; i++) m.step([]);
    expect(m.cpu.stats.swaps).toBeGreaterThan(0);
    expect(m.vs.tick).toBe(400);
    // Both boards share the seed but the CPU's moves make them diverge.
    expect(m.opponent.score + m.opponent.stats.swaps).toBeGreaterThan(0);
  });

  it('scripted garbage shows in the receiver queue, then drops as a slab', () => {
    const m = new VersusMatch('garbage', 1);
    m.sendGarbage(0, 6, 2);
    expect(garbageIcons(m.player)).toEqual([
      { id: expect.any(Number), width: 6, height: 2, chain: true },
    ]);
    expect(queuedCells(m.player)).toBe(12);
    expect(m.vs.sides[0].stats.received).toBe(12);
    expect(m.vs.sides[1].stats.sent).toBe(12);
    for (let i = 0; i < m.vs.rules.attackDelay + 5; i++) m.step([]);
    expect(m.player.garbageQueue).toHaveLength(0);
    expect(m.player.garbage.length).toBeGreaterThan(0);
  });

  it('single match: a forced win ends the match and is scored once', () => {
    const m = new VersusMatch('single', 1);
    for (let i = 0; i < 30; i++) m.step([]);
    expect(m.roundOver).toBe(false);
    m.forceRound(0);
    expect(m.roundOver).toBe(true);
    const r = m.finishRound();
    expect(r).toMatchObject({ round: 1, winner: 0, ticks: 30 });
    expect(m.finishRound()).toBeNull();
    expect(m.matchOver).toBe(true);
    expect(m.matchWinner).toBe(0);
    // Stepping a finished round is a no-op.
    m.step([]);
    expect(m.vs.tick).toBe(30);
  });

  it('best of 3: rounds alternate seeds; a draw does not count', () => {
    const m = new VersusMatch('bo3', 2, 'bo3');
    const seed1 = m.roundSeed;
    m.forceRound(1);
    m.finishRound();
    expect(m.matchOver).toBe(false);
    m.nextRound();
    expect(m.round).toBe(2);
    expect(m.roundSeed).not.toBe(seed1);
    expect(m.vs.tick).toBe(0);
    m.forceRound(null);
    expect(m.finishRound()?.winner).toBeNull();
    expect(m.wins).toEqual([0, 1]);
    m.nextRound();
    m.forceRound(0);
    m.finishRound();
    m.nextRound();
    m.forceRound(0);
    m.finishRound();
    expect(m.wins).toEqual([2, 1]);
    expect(m.matchOver).toBe(true);
    expect(m.matchWinner).toBe(0);
    m.nextRound(); // no-op once decided
    expect(m.round).toBe(4);
    expect(m.totals().ticks).toBe(0);
  });

  it('a real top-out ends the round with the other side as winner', () => {
    const m = new VersusMatch('topout', 1);
    // Bury the player under garbage until it tops out.
    for (let k = 0; k < 8; k++) m.sendGarbage(0, 6, 3);
    let guard = 0;
    while (!m.vs.over && guard++ < 20000) m.step([]);
    expect(m.vs.over).toBe(true);
    expect(m.finishRound()?.winner).toBe(1);
  });
});

describe('versus records', () => {
  it('folds matches into the per-level record', () => {
    const save = createDefaultSave();
    expect(versusRecord(save, 3)).toMatchObject({ played: 0, won: 0, lost: 0 });
    recordVersusMatch(save, 3, 0, 60 * 95, 40);
    recordVersusMatch(save, 3, 1, 60 * 30, 5);
    recordVersusMatch(save, 3, 0, 60 * 70, 12);
    recordVersusMatch(save, 3, null, 60 * 10, 0);
    expect(save.versus['3']).toEqual({
      played: 4,
      won: 2,
      lost: 1,
      fastestWin: 70,
      garbageSent: 57,
    });
    expect(save.versus['1']).toBeUndefined();
  });

  it('sanitizes stored records (bad levels and values dropped)', () => {
    const data = sanitizeSave({
      versus: { '2': { played: 3, won: 2, lost: '1', fastestWin: -4 }, '9': { played: 1 } },
    });
    expect(data.versus).toEqual({
      '2': { played: 3, won: 2, lost: 0, fastestWin: 0, garbageSent: 0 },
    });
  });
});

describe('EndlessSession in versus', () => {
  it('collectInputs + acceptEvents mirror tick without stepping', () => {
    const s = new EndlessSession('vs-session', () => null);
    const { cols, rows } = s.sim.config;
    s.queue({ type: 'swap', row: rows - 1, col: 0 });
    s.setRaiseButton(true);
    const inputs = s.collectInputs(0);
    expect(inputs).toEqual([
      { type: 'swap', row: rows - 1, col: 0 },
      { type: 'raise', active: true },
    ]);
    expect(s.sim.tick).toBe(0);
    const events = s.acceptEvents([{ type: 'levelUp', level: 2 }]);
    expect(events).toHaveLength(1);
    expect(s.eventCounts.levelUp).toBe(1);
    // Raise is only re-sent when it changes.
    expect(s.collectInputs(16)).toEqual([]);
    expect(cols).toBe(6);
  });
});
