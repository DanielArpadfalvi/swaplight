import { describe, expect, it } from 'vitest';
import { FixedStepper, GameLoop, SIM_STEP_MS } from '../../../src/game/loop';

describe('FixedStepper', () => {
  it('accumulates frame time into fixed steps with a fractional alpha', () => {
    const s = new FixedStepper(10, 5);
    expect(s.advance(4)).toBe(0);
    expect(s.alpha).toBeCloseTo(0.4);
    expect(s.advance(7)).toBe(1);
    expect(s.alpha).toBeCloseTo(0.1);
    expect(s.advance(25)).toBe(2);
    expect(s.alpha).toBeCloseTo(0.6);
  });

  it('caps catch-up steps and drops the backlog', () => {
    const s = new FixedStepper(10, 5);
    expect(s.advance(1000)).toBe(5);
    expect(s.alpha).toBeLessThan(1);
    expect(s.advance(10)).toBe(1);
  });

  it('ignores zero, negative and NaN frame times', () => {
    const s = new FixedStepper();
    expect(s.advance(0)).toBe(0);
    expect(s.advance(-5)).toBe(0);
    expect(s.advance(Number.NaN)).toBe(0);
    expect(s.alpha).toBe(0);
  });

  it('runs 60 steps per simulated second at 60 Hz regardless of frame rate', () => {
    for (const fps of [30, 60, 120, 144]) {
      const s = new FixedStepper();
      let steps = 0;
      for (let i = 0; i < fps * 10; i++) steps += s.advance(1000 / fps);
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
    }
    expect(SIM_STEP_MS).toBeCloseTo(16.667, 2);
  });
});

describe('GameLoop', () => {
  const make = () => {
    const log = { ticks: 0, renders: [] as { alpha: number; dt: number }[] };
    const loop = new GameLoop(
      {
        onTick: () => log.ticks++,
        onRender: (alpha, dt) => log.renders.push({ alpha, dt }),
      },
      new FixedStepper(10, 5),
    );
    return { loop, log };
  };

  it('starts paused: renders but does not tick', () => {
    const { loop, log } = make();
    expect(loop.isPaused).toBe(true);
    loop.frame(100);
    expect(log.ticks).toBe(0);
    expect(log.renders).toHaveLength(1);
  });

  it('ticks while running and clamps the render dt', () => {
    const { loop, log } = make();
    loop.resume();
    expect(loop.frame(35)).toBe(3);
    expect(log.ticks).toBe(3);
    expect(log.renders[0]?.alpha).toBeCloseTo(0.5);
    loop.frame(1000);
    expect(log.ticks).toBe(8);
    expect(log.renders[1]?.dt).toBe(0.05);
  });

  it('pause stops ticking and freezes alpha; resume restarts the accumulator', () => {
    const { loop, log } = make();
    loop.resume();
    loop.frame(15);
    loop.pause();
    loop.frame(500);
    expect(log.ticks).toBe(1);
    expect(log.renders[1]?.alpha).toBeCloseTo(0.5);
    loop.resume();
    loop.frame(5);
    expect(log.ticks).toBe(1);
  });

  it('stepTicks steps manually and renders the newest tick', () => {
    const { loop, log } = make();
    loop.stepTicks(7);
    expect(log.ticks).toBe(7);
    loop.frame(16);
    expect(log.ticks).toBe(7);
    expect(log.renders.at(-1)?.alpha).toBe(1);
  });
});
