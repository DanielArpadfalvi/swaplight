import { describe, expect, it } from 'vitest';
import {
  FRAME_BUDGET_MS,
  percentile,
  summarizeFrames,
  summarizeSamples,
} from '../../../src/game/perf';

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(s, 0.5)).toBe(5);
    expect(percentile(s, 0.95)).toBe(10);
    expect(percentile(s, 0)).toBe(1);
    expect(percentile(s, 1)).toBe(10);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('summarizeFrames', () => {
  it('computes mean, percentiles, max and budget overruns', () => {
    const samples = [...Array.from({ length: 98 }, () => 4), 20, 30];
    const s = summarizeFrames(samples);
    expect(s.count).toBe(100);
    expect(s.mean).toBeCloseTo((98 * 4 + 50) / 100);
    expect(s.p50).toBe(4);
    expect(s.p95).toBe(4);
    expect(s.p99).toBe(20);
    expect(s.max).toBe(30);
    expect(s.over).toBe(2);
  });

  it('ignores non-finite samples and handles empty input', () => {
    expect(summarizeFrames([NaN, Infinity, 2]).count).toBe(1);
    expect(summarizeFrames([])).toEqual({
      count: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      over: 0,
    });
  });

  it('defaults to a 60 Hz budget', () => {
    expect(FRAME_BUDGET_MS).toBeCloseTo(16.667, 2);
    expect(summarizeFrames([16, 17]).over).toBe(1);
  });
});

describe('summarizeSamples', () => {
  it('summarizes each phase and the per-frame total', () => {
    const r = summarizeSamples(
      [
        { sim: 1, update: 2, draw: 3, ui: 0 },
        { sim: 2, update: 2, draw: 4, ui: 10 },
      ],
      { peakParticles: 5, peakPopups: 1, displayObjects: 100 },
    );
    expect(r.frames).toBe(2);
    expect(r.phases.sim.max).toBe(2);
    expect(r.phases.total.p50).toBe(6);
    expect(r.phases.total.max).toBe(18);
    expect(r.phases.total.over).toBe(1);
    expect(r.peakParticles).toBe(5);
  });
});
