import { describe, expect, it } from 'vitest';
import {
  THEMES,
  cutoffForIntensity,
  eventsForStep,
  generateTrack,
  type MusicThemeId,
} from '../../../src/audio/patterns';
import { StepClock } from '../../../src/audio/scheduler';

const themes: MusicThemeId[] = ['menu', 'game', 'boss'];

describe('generateTrack', () => {
  it('is deterministic per seed and varies between seeds', () => {
    for (const th of themes) {
      expect(generateTrack(th, 7)).toEqual(generateTrack(th, 7));
    }
    const variants = new Set(
      Array.from({ length: 12 }, (_, s) => JSON.stringify(generateTrack('game', s).steps)),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('produces whole bars with valid events', () => {
    for (const th of themes) {
      const t = generateTrack(th, 3);
      expect(t.bpm).toBe(THEMES[th].bpm);
      expect(t.steps.length % t.stepsPerBar).toBe(0);
      expect(t.steps.length).toBeGreaterThanOrEqual(64);
      for (const step of t.steps) {
        for (const e of step) {
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1);
          expect(e.minIntensity).toBeGreaterThanOrEqual(0);
          expect(e.minIntensity).toBeLessThanOrEqual(1);
          for (const m of e.midi) expect(m).toBeGreaterThan(20);
        }
      }
    }
  });

  it('game theme drives with a four-on-the-floor kick; menu has no drums at rest', () => {
    const g = generateTrack('game', 1);
    for (let s = 0; s < g.steps.length; s += 4) {
      expect(eventsForStep(g, s, 0).some((e) => e.voice === 'kick')).toBe(true);
    }
    const m = generateTrack('menu', 1);
    const drums = m.steps.flatMap((_, s) =>
      eventsForStep(m, s, 0).filter((e) => e.voice === 'kick' || e.voice === 'snare'),
    );
    expect(drums).toHaveLength(0);
  });

  it('intensity adds layers', () => {
    const t = generateTrack('game', 2);
    const count = (i: number): number =>
      t.steps.reduce((n, _, s) => n + eventsForStep(t, s, i).length, 0);
    expect(count(0)).toBeLessThan(count(0.5));
    expect(count(0.5)).toBeLessThan(count(1));
    const voices = new Set(t.steps.flatMap((_, s) => eventsForStep(t, s, 1).map((e) => e.voice)));
    expect(voices.has('lead')).toBe(true);
    expect(voices.has('arp')).toBe(true);
  });

  it('wraps step indices', () => {
    const t = generateTrack('menu', 1);
    expect(eventsForStep(t, t.steps.length + 3, 1)).toEqual(eventsForStep(t, 3, 1));
    expect(eventsForStep(t, -1, 1)).toEqual(eventsForStep(t, t.steps.length - 1, 1));
  });

  it('filter cutoff opens with intensity', () => {
    expect(cutoffForIntensity('game', 0)).toBeCloseTo(THEMES.game.baseCutoff);
    expect(cutoffForIntensity('game', 1)).toBeCloseTo(THEMES.game.maxCutoff);
    expect(cutoffForIntensity('game', 0.5)).toBeGreaterThan(cutoffForIntensity('game', 0.2));
    expect(cutoffForIntensity('game', 5)).toBeCloseTo(THEMES.game.maxCutoff);
  });
});

describe('StepClock', () => {
  it('returns each step exactly once with precise times', () => {
    const c = new StepClock(1, 120); // 16th = 0.125 s
    const a = c.collect(1.3, 1);
    expect(a.map((s) => s.step)).toEqual([0, 1, 2]);
    expect(a[2]!.time).toBeCloseTo(1.25);
    expect(c.collect(1.3, 1.01)).toEqual([]);
    const b = c.collect(1.5, 1.2);
    expect(b.map((s) => s.step)).toEqual([3]);
  });

  it('applies tempo changes to subsequent steps', () => {
    const c = new StepClock(0, 120);
    c.collect(0.1, 0);
    c.setTempo(60);
    expect(c.bpm).toBeCloseTo(60);
    const s = c.collect(0.7, 0.1);
    expect(s[0]!.time).toBeCloseTo(0.125);
    expect(s[1]!.time).toBeCloseTo(0.375);
  });

  it('skips ahead instead of bursting after a stall', () => {
    const c = new StepClock(0, 120);
    const s = c.collect(10.1, 10);
    expect(s.length).toBeLessThanOrEqual(2);
    expect(s[0]!.time).toBeGreaterThanOrEqual(9.5);
  });

  it('clamps silly tempos', () => {
    expect(new StepClock(0, 0).bpm).toBe(40);
    expect(new StepClock(0, Number.NaN).bpm).toBe(120);
  });
});
