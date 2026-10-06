import { describe, expect, it, vi } from 'vitest';
import {
  createHaptics,
  createWebHapticsDriver,
  WEB_VIBRATION_PATTERNS,
  type HapticsDriver,
} from '../../../src/platform';

describe('web haptics', () => {
  it('maps events to vibration patterns', () => {
    const vibrate = vi.fn(() => true);
    const h = createHaptics(createWebHapticsDriver(vibrate));
    h.impact('light');
    h.impact('heavy');
    h.notify('success');
    h.selection();
    expect(vibrate.mock.calls).toEqual([
      [WEB_VIBRATION_PATTERNS.light],
      [WEB_VIBRATION_PATTERNS.heavy],
      [[...WEB_VIBRATION_PATTERNS.success]],
      [WEB_VIBRATION_PATTERNS.selection],
    ]);
  });

  it('is a no-op without navigator.vibrate', () => {
    const h = createHaptics(createWebHapticsDriver(undefined));
    expect(() => {
      h.impact('medium');
      h.notify('warning');
      h.selection();
    }).not.toThrow();
  });

  it('respects the global enable flag', () => {
    const vibrate = vi.fn(() => true);
    const h = createHaptics(createWebHapticsDriver(vibrate), false);
    expect(h.isEnabled()).toBe(false);
    h.impact('light');
    expect(vibrate).not.toHaveBeenCalled();
    h.setEnabled(true);
    h.impact('light');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('swallows driver errors (sync and async)', async () => {
    const driver: HapticsDriver = {
      impact: () => {
        throw new Error('boom');
      },
      notify: () => Promise.reject(new Error('boom')),
      selection: () => undefined,
    };
    const h = createHaptics(driver);
    expect(() => h.impact('light')).not.toThrow();
    expect(() => h.notify('success')).not.toThrow();
    await Promise.resolve();
  });
});
