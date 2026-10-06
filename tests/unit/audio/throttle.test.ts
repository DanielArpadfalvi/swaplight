import { describe, expect, it } from 'vitest';
import { SoundThrottle, VoiceBudget } from '../../../src/audio/throttle';
import { sfxThrottleKey } from '../../../src/audio/sfx';
import { volumeToGain } from '../../../src/audio/mix';

describe('SoundThrottle', () => {
  it('drops identical sounds within the window', () => {
    const t = new SoundThrottle(0.03);
    expect(t.accept('swap', 1)).toBe(true);
    expect(t.accept('swap', 1.01)).toBe(false);
    expect(t.accept('land', 1.01)).toBe(true);
    expect(t.accept('swap', 1.04)).toBe(true);
  });

  it('supports per-call windows and survives clock resets', () => {
    const t = new SoundThrottle();
    expect(t.accept('danger', 5, 0.35)).toBe(true);
    expect(t.accept('danger', 5.2, 0.35)).toBe(false);
    expect(t.accept('danger', 5.4, 0.35)).toBe(true);
    // A new AudioContext restarts at 0: must not lock the sound out.
    expect(t.accept('danger', 0.1, 0.35)).toBe(true);
  });

  it('keys parameterised sounds separately', () => {
    expect(sfxThrottleKey('pop', 1, 2)).not.toBe(sfxThrottleKey('pop', 2, 2));
    expect(sfxThrottleKey('swap', 1, 2)).toBe(sfxThrottleKey('swap'));
  });
});

describe('VoiceBudget', () => {
  it('limits concurrent voices and frees them after they end', () => {
    const b = new VoiceBudget(4);
    expect(b.tryAcquire(0, 1, 3)).toBe(true);
    expect(b.canAcquire(0.5, 2)).toBe(false);
    expect(b.tryAcquire(0.5, 1, 2)).toBe(false);
    expect(b.tryAcquire(0.5, 2, 1)).toBe(true);
    expect(b.active(0.5)).toBe(4);
    expect(b.active(1.5)).toBe(1);
    expect(b.tryAcquire(1.5, 3, 3)).toBe(true);
    b.reset();
    expect(b.active(1.5)).toBe(0);
  });
});

describe('volumeToGain', () => {
  it('uses a clamped perceptual curve', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });
});
