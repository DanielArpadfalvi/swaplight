import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  makeConfig,
  riseSpeedForLevel,
  stopTicksFor,
} from '../../../src/core/config';

describe('config', () => {
  it('defaults match the design', () => {
    expect(DEFAULT_CONFIG.cols).toBe(6);
    expect(DEFAULT_CONFIG.rows).toBe(12);
    expect(DEFAULT_CONFIG.colors).toBe(5);
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
  });

  it('makeConfig merges overrides into a fresh object', () => {
    const c = makeConfig({ colors: 6 });
    expect(c.colors).toBe(6);
    expect(c.rows).toBe(12);
    expect(c).not.toBe(DEFAULT_CONFIG);
  });

  it('rejects invalid values', () => {
    expect(() => makeConfig({ colors: 2 })).toThrow(RangeError);
    expect(() => makeConfig({ colors: 7 })).toThrow(RangeError);
    expect(() => makeConfig({ cols: 2 })).toThrow(RangeError);
    expect(() => makeConfig({ rows: 3 })).toThrow(RangeError);
    expect(() => makeConfig({ swapTicks: 0 })).toThrow(RangeError);
    expect(() => makeConfig({ fallSpeed: 0 })).toThrow(RangeError);
    expect(() => makeConfig({ hoverTicks: 1.5 })).toThrow(RangeError);
    expect(() => makeConfig({ flashTicks: -1 })).toThrow(RangeError);
    expect(() => makeConfig({ startLevel: 0 })).toThrow(RangeError);
    expect(() => makeConfig({ startLevel: 5, maxLevel: 4 })).toThrow(RangeError);
    expect(() => makeConfig({ initialMinHeight: 5, initialMaxHeight: 4 })).toThrow(RangeError);
    expect(() => makeConfig({ initialMaxHeight: 12 })).toThrow(RangeError);
  });

  it('rise speed grows linearly with level and is clamped', () => {
    const c = makeConfig();
    expect(riseSpeedForLevel(c, 1)).toBe(c.riseSpeedBase);
    expect(riseSpeedForLevel(c, 2)).toBe(c.riseSpeedBase + c.riseSpeedPerLevel);
    expect(riseSpeedForLevel(c, 0)).toBe(riseSpeedForLevel(c, 1));
    expect(riseSpeedForLevel(c, 999)).toBe(riseSpeedForLevel(c, c.maxLevel));
  });

  it('stop time from combos and chains', () => {
    const c = makeConfig();
    expect(stopTicksFor(c, 3, 1)).toBe(0);
    expect(stopTicksFor(c, 4, 1)).toBe(c.comboStopBase);
    expect(stopTicksFor(c, 6, 1)).toBe(c.comboStopBase + 2 * c.comboStopPerBlock);
    expect(stopTicksFor(c, 3, 2)).toBe(c.chainStopBase);
    expect(stopTicksFor(c, 3, 4)).toBe(c.chainStopBase + 2 * c.chainStopPerLevel);
    expect(stopTicksFor(c, 20, 2)).toBe(c.comboStopBase + 16 * c.comboStopPerBlock);
  });
});
