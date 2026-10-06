import { describe, expect, it } from 'vitest';
import { RunController } from '../../../src/game/runController';
import { createRunMode, type RunModeHost } from '../../../src/game/runMode';
import { unlocksForWin } from '../../../src/game/runUnlocks';
import { createDefaultSave } from '../../../src/game/save';
import { modeHarness } from './modeHost';

describe('RunController.recordFinished', () => {
  it('records a lost run once and clears the saved run', () => {
    const c = RunController.create('fin-lost');
    const save = createDefaultSave();
    c.beginStage();
    save.runInProgress = JSON.parse(JSON.stringify(c.toBlob()));
    expect(c.recordFinished(save)).toBe(false); // still playing
    expect(save.modes.run).toBeUndefined();
    c.finishStage({ won: false });
    expect(c.ended).toBe(true);
    expect(c.recordFinished(save)).toBe(true);
    expect(save.modes.run?.played).toBe(1);
    expect(save.runInProgress).toBeNull();
    expect(c.recordFinished(save)).toBe(true);
    expect(save.modes.run?.played).toBe(1);
  });

  it('a won run also grants its unlocks (kept on the controller for the summary)', () => {
    const c = RunController.create('fin-won');
    c.run = { ...c.run, phase: 'won' };
    const save = createDefaultSave();
    const expected = unlocksForWin(c.run.brightness, save.unlocks);
    expect(expected.length).toBeGreaterThan(0);
    c.recordFinished(save);
    expect(c.unlocked).toEqual(expected);
    for (const key of expected) expect(save.unlocks).toContain(key);
    c.recordFinished(save);
    expect(c.unlocked).toEqual(expected);
    expect(save.modes.run?.played).toBe(1);
  });
});

describe('run mode: a finished run survives an early app close', () => {
  function setup() {
    const h = modeHarness();
    const mode = createRunMode(h.host as unknown as RunModeHost);
    return { ...h, mode };
  }

  it('lost stage → pagehide persist() during the end animation keeps the run in the stats', () => {
    const { mode, save } = setup();
    mode.testApi.start({ seed: 'close-lost' });
    mode.testApi.playStage();
    mode.testApi.beginStage();
    mode.testApi.forceLose();
    // The end animation is still running (timer pending) – the app is closed now.
    mode.persist();
    expect(save.data.modes.run?.played).toBe(1);
    expect(save.data.runInProgress).toBeNull();
    expect(mode.testApi.state().saved).toBe(false);
  });

  it('the summary after the animation does not record the run twice', () => {
    const { mode, save, runTimers, store } = setup();
    mode.testApi.start({ seed: 'close-lost-2' });
    mode.testApi.playStage();
    mode.testApi.beginStage();
    mode.testApi.forceLose();
    mode.persist();
    runTimers();
    expect(store.get().screen).toBe('runEnd');
    expect(save.data.modes.run?.played).toBe(1);
  });

  it('suspending (leaving to the menu) during the end animation records the run', () => {
    const { mode, save } = setup();
    mode.testApi.start({ seed: 'close-lost-3' });
    mode.testApi.playStage();
    mode.testApi.beginStage();
    mode.testApi.forceLose();
    mode.suspend();
    expect(save.data.modes.run?.played).toBe(1);
    expect(save.data.runInProgress).toBeNull();
  });
});
