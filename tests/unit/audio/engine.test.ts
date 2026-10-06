import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../../src/audio';
import { SFX, type SfxId } from '../../../src/audio/sfx';
import { FakeAudioContext } from './fakeAudioContext';

function setup(): { engine: AudioEngine; ctx: FakeAudioContext } {
  const ctx = new FakeAudioContext();
  const engine = new AudioEngine({ createContext: () => ctx as unknown as AudioContext });
  return { engine, ctx };
}

describe('AudioEngine without Web Audio', () => {
  it('is a safe no-op', async () => {
    const e = new AudioEngine({ createContext: () => null });
    expect(e.available).toBe(false);
    await e.unlock();
    e.swap();
    e.pop(3, 2);
    e.playMusic('game');
    e.setIntensity(1);
    e.setVolume('music', 0.3);
    e.setMuted(true);
    await e.suspend();
    await e.resume();
    e.stopMusic();
    expect(e.getVolume('music')).toBe(0.3);
    expect(e.isMuted()).toBe(true);
  });

  it('works with the default factory in a non-browser env', () => {
    expect(new AudioEngine().available).toBe(false);
  });
});

describe('AudioEngine with a context', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creates the context lazily and ignores SFX until unlocked', async () => {
    const { engine, ctx } = setup();
    expect(ctx.created).toBe(0);
    engine.swap();
    expect(ctx.created).toBe(0);
    await engine.unlock();
    expect(engine.running).toBe(true);
    const before = ctx.created;
    engine.swap();
    expect(ctx.created).toBeGreaterThan(before);
  });

  it('plays every recipe without throwing', async () => {
    const { engine, ctx } = setup();
    await engine.unlock();
    for (const id of Object.keys(SFX) as SfxId[]) {
      ctx.currentTime += 5;
      const before = ctx.created;
      engine.play(id, 3, 2);
      expect(ctx.created, id).toBeGreaterThan(before);
    }
  });

  it('throttles identical sounds and enforces the voice budget', async () => {
    const { engine, ctx } = setup();
    await engine.unlock();
    engine.swap();
    const after = ctx.created;
    engine.swap();
    expect(ctx.created).toBe(after);
    ctx.currentTime += 1;
    // A huge clear: distinct pops are not throttled but the budget caps them.
    for (let i = 0; i < 60; i++) engine.pop(i % 15, 1 + Math.floor(i / 15));
    const nodesPerPop = 4; // 2 oscillators + 2 gains
    expect(ctx.created - after).toBeLessThan(60 * nodesPerPop);
    expect(ctx.created - after).toBeGreaterThan(0);
  });

  it('respects mute and app suspension', async () => {
    const { engine, ctx } = setup();
    await engine.unlock();
    engine.setMuted(true);
    const n = ctx.created;
    engine.uiTap();
    expect(ctx.created).toBe(n);
    engine.setMuted(false);
    await engine.suspend();
    expect(ctx.state).toBe('suspended');
    engine.uiTap();
    expect(ctx.created).toBe(n);
    await engine.resume();
    expect(ctx.state).toBe('running');
    engine.uiTap();
    expect(ctx.created).toBeGreaterThan(n);
  });

  it('defers music until unlock, schedules steps, and stops with a fade', async () => {
    const { engine, ctx } = setup();
    engine.playMusic('menu', { intensity: 0.2 });
    expect(engine.currentTheme).toBe('menu');
    await engine.unlock();
    const n = ctx.created;
    // Advance the audio clock over two bars in timer-sized slices.
    for (let i = 0; i < 160; i++) {
      ctx.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(ctx.created).toBeGreaterThan(n);
    engine.playMusic('game', { fade: 0.5 });
    expect(engine.currentTheme).toBe('game');
    engine.setIntensity(1);
    engine.setTempo(140);
    ctx.currentTime = 4;
    vi.advanceTimersByTime(100);
    engine.stopMusic(0.5);
    expect(engine.currentTheme).toBeNull();
    vi.advanceTimersByTime(2000);
    const m = ctx.created;
    ctx.currentTime = 10;
    vi.advanceTimersByTime(200);
    expect(ctx.created).toBe(m);
  });

  it('auto-unlocks from a user gesture', async () => {
    const { engine, ctx } = setup();
    const target = new EventTarget();
    const remove = engine.installUnlockListeners(target);
    target.dispatchEvent(new Event('pointerdown'));
    await vi.runAllTimersAsync();
    expect(ctx.state).toBe('running');
    remove();
  });
});
