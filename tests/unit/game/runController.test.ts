import { describe, expect, it } from 'vitest';
import { hashState } from '../../../src/core/replay';
import {
  BRIGHTNESS,
  CHARMS,
  CURSES,
  DECKS,
  RELICS,
  getRelic,
  stageConfig,
} from '../../../src/core/run';
import type { ScoreContext } from '../../../src/core/scoring';
import { step } from '../../../src/core/sim';
import { en, hu } from '../../../src/i18n';
import { RunController, charmTargetKind } from '../../../src/game/runController';
import {
  brightnessAvailable,
  brightnessEarned,
  deckAvailable,
  sanitizeRunChoice,
  unlocksForWin,
} from '../../../src/game/runUnlocks';
import { EndlessSession } from '../../../src/game/session';

const lookup = (dict: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], dict);

function playTicks(c: RunController, n: number): void {
  for (let i = 0; i < n; i++) step(c.sim!, [], c.hooks!, null);
}

describe('RunController', () => {
  it('walks map → stage → reward → shop → next stage', () => {
    const c = RunController.create('ctrl-1');
    expect(c.run.phase).toBe('stage');
    expect(c.resumePoint).toBe('map');
    const sim = c.beginStage();
    expect(c.resumePoint).toBe('stage');
    playTicks(c, 60);
    expect(sim.tick).toBe(60);
    expect(c.progress()?.won).toBe(false);
    expect(c.checkFinished()).toBeNull();

    const fin = c.finishStage({ won: true });
    expect(fin.won).toBe(true);
    expect(fin.victory).toBe(false);
    expect(fin.result.value).toBeGreaterThanOrEqual(fin.result.target);
    expect(fin.rewards!.total).toBeGreaterThan(0);
    expect(c.run.phase).toBe('shop');
    expect(c.resumePoint).toBe('shop');
    expect(c.sim).toBeNull();
    expect(c.playTicks).toBe(60);
    expect(c.stagesCleared).toBe(1);

    c.run = { ...c.run, szikra: 99 };
    const price = c.run.shop!.relics[0]!.price;
    expect(c.buyRelic(0).ok).toBe(true);
    expect(c.run.szikra).toBe(99 - price);
    expect(c.buyRelic(0).reason).toBe('sold');
    expect(c.reroll().ok).toBe(true);
    c.leaveShop();
    expect(c.run).toMatchObject({ phase: 'stage', act: 1, stage: 1 });
  });

  it('a lost stage ends the run', () => {
    const c = RunController.create('ctrl-lose');
    c.beginStage();
    playTicks(c, 10);
    const fin = c.finishStage({ won: false });
    expect(fin.won).toBe(false);
    expect(fin.reason).toBe('time');
    expect(c.run.phase).toBe('lost');
    expect(RunController.fromBlob(c.toBlob())).toBeNull();
  });

  it('saves mid-stage and resumes deterministically', () => {
    const c = RunController.create('ctrl-save');
    c.beginStage();
    playTicks(c, 240);
    const json = JSON.parse(JSON.stringify(c.toBlob())) as unknown;
    const back = RunController.fromBlob(json)!;
    expect(back).not.toBeNull();
    expect(back.resumePoint).toBe('stage');
    expect(back.sim!.tick).toBe(240);
    playTicks(c, 300);
    playTicks(back, 300);
    expect(hashState(back.sim!)).toBe(hashState(c.sim!));
  });

  it('rejects invalid blobs', () => {
    expect(RunController.fromBlob(null)).toBeNull();
    expect(RunController.fromBlob({ v: 99 })).toBeNull();
    const blob = RunController.create('x').toBlob();
    expect(RunController.fromBlob({ ...blob, run: { ...blob.run, deckId: 'nope' } })).toBeNull();
    // A broken sim falls back to the map.
    const c = RunController.fromBlob({ ...blob, at: 'stage', sim: { cells: 3 } })!;
    expect(c.resumePoint).toBe('map');
  });

  it('flags relics that changed a clear (HUD pulse)', () => {
    const c = RunController.create('ctrl-relic');
    const def = getRelic('spark_plug');
    c.run = { ...c.run, relics: [{ id: 'spark_plug', paid: 0, state: {} }] };
    const sim = c.beginStage();
    expect(def.base).toBeDefined();
    const probe = c.hooks!.scoreModifiers!.at(-1)!;
    const score: ScoreContext = {
      blocks: 3,
      combo: 3,
      chain: 1,
      level: 1,
      colors: [0, 0, 0],
      base: 30,
      mult: 1,
      config: sim.config,
      sim,
    };
    probe(score);
    expect(score).toMatchObject({ base: 30, mult: 1 }); // read-only
    expect(c.takeFiredRelics()).toEqual(['spark_plug']);
    expect(c.takeFiredRelics()).toEqual([]);
  });

  it('uses charms with and without a target', () => {
    const c = RunController.create('ctrl-charm');
    c.run = {
      ...c.run,
      charms: [
        { id: 'hourglass', paid: 0 },
        { id: 'purge', paid: 0 },
      ],
    };
    const sim = c.beginStage();
    playTicks(c, 5);
    expect(c.charmUsable(0)).toBe(true);
    const stop = sim.stopTicks;
    const a = c.useCharm(0);
    expect(a.ok).toBe(true);
    expect(sim.stopTicks).toBe(stop + 480);
    expect(a.removed).toEqual([]);
    const col = 2;
    const b = c.useCharm(0, { col });
    expect(b.ok).toBe(true);
    expect(b.removed.length).toBeGreaterThan(0);
    expect(b.removed.every((r) => r.col === col)).toBe(true);
    expect(c.run.charms).toEqual([]);
    expect(c.run.stats.charmsUsed).toBe(2);
  });

  it('knows which charms need a board target', () => {
    expect(charmTargetKind('purge')).toBe('column');
    expect(charmTargetKind('monotone')).toBe('row');
    expect(charmTargetKind('detonate')).toBe('cell');
    expect(charmTargetKind('hourglass')).toBeNull();
  });

  it('plays a stage through the session with the run hooks', () => {
    const c = RunController.create('ctrl-session');
    c.beginStage();
    const s = new EndlessSession('unused', () => null);
    s.load(c.sim!, c.hooks!);
    const ref = RunController.create('ctrl-session');
    ref.beginStage();
    for (let i = 0; i < 120; i++) {
      s.tick(i * 16);
      step(ref.sim!, [], stageConfig(ref.run).hooks, null);
    }
    expect(hashState(s.sim)).toBe(hashState(ref.sim!));
  });
});

describe('run unlocks', () => {
  it('gates decks behind the Full Version (Neon is free)', () => {
    expect(deckAvailable('neon', false)).toBe(true);
    expect(deckAvailable('prism', false)).toBe(false);
    expect(deckAvailable('prism', true)).toBe(true);
    expect(deckAvailable('nope', true)).toBe(false);
  });

  it('unlocks Brightness levels one win at a time', () => {
    expect(brightnessEarned([])).toBe(1);
    expect(unlocksForWin(1, [])).toEqual(['brightness.2']);
    expect(unlocksForWin(1, ['brightness.2'])).toEqual([]);
    expect(unlocksForWin(8, [])).toEqual([]);
    const unlocks = ['brightness.2', 'brightness.3', 'brightness.5'];
    expect(brightnessEarned(unlocks)).toBe(3);
    expect(brightnessAvailable(1, [], false)).toBe(true);
    expect(brightnessAvailable(2, unlocks, false)).toBe(false);
    expect(brightnessAvailable(3, unlocks, true)).toBe(true);
    expect(brightnessAvailable(5, unlocks, true)).toBe(false);
    expect(sanitizeRunChoice('prism', 3, unlocks, false)).toEqual({
      deckId: 'neon',
      brightness: 1,
    });
    expect(sanitizeRunChoice('prism', 3, unlocks, true)).toEqual({
      deckId: 'prism',
      brightness: 3,
    });
  });
});

describe('run content translations', () => {
  const keys = [
    ...RELICS.map((r) => r.i18nKey),
    ...CHARMS.map((c) => c.i18nKey),
    ...CURSES.map((c) => c.i18nKey),
    ...DECKS.map((d) => d.i18nKey),
    ...BRIGHTNESS.map((b) => b.i18nKey),
  ];

  it('has a name and description for every relic, charm, curse, deck and Brightness level', () => {
    expect(keys.length).toBe(RELICS.length + CHARMS.length + CURSES.length + 6 + 8);
    for (const dict of [en, hu]) {
      for (const k of keys) {
        expect(typeof lookup(dict, `${k}.name`), `${k}.name`).toBe('string');
        expect(typeof lookup(dict, `${k}.desc`), `${k}.desc`).toBe('string');
        expect((lookup(dict, `${k}.name`) as string).length).toBeGreaterThan(1);
      }
    }
  });

  it('has no translations for content that does not exist', () => {
    const ids = (dict: unknown, group: string) =>
      Object.keys(lookup(dict, group) as Record<string, unknown>).map((id) => `${group}.${id}`);
    for (const dict of [en, hu]) {
      const all = ['relic', 'charm', 'boss', 'deck', 'brightness'].flatMap((g) => ids(dict, g));
      expect(all.sort()).toEqual([...keys].sort());
    }
  });
});
