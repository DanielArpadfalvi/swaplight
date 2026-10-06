import { describe, expect, it } from 'vitest';
import { formatCompact } from '../../../src/ui/format';
import { longestWord } from '../../../src/ui/fit';
import { HUD_MIN_WIDTH, hudRect } from '../../../src/ui/hudBox';

const band = { hudTop: 0, hudHeight: 128 };

describe('HUD band', () => {
  it('widens a narrow board to the minimum HUD width, centered on the board', () => {
    const r = hudRect({ ...band, boardLeft: 75, boardWidth: 210 }, 360);
    expect(r.width).toBe(HUD_MIN_WIDTH);
    expect(r.left + r.width / 2).toBeCloseTo(75 + 105);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.left + r.width).toBeLessThanOrEqual(360);
  });

  it('keeps the board box when the board is wide enough', () => {
    const r = hudRect({ ...band, boardLeft: 200, boardWidth: 420 }, 820);
    expect(r).toEqual({ top: 0, height: 128, left: 200, width: 420 });
  });

  it('never exceeds the screen on tiny viewports', () => {
    const r = hudRect({ ...band, boardLeft: 40, boardWidth: 220 }, 300);
    expect(r.width).toBe(280);
    expect(r.left).toBe(10);
  });
});

describe('compact numbers', () => {
  it('groups below a million and shortens from a million', () => {
    const en = formatCompact('en');
    expect(en(999_999)).toBe('999,999');
    expect(en(1_234_567)).toBe('1.2M');
    expect(en(0)).toBe('0');
    const hu = formatCompact('hu');
    expect(hu(1_234_567).replace(/\s/g, ' ')).toBe('1,2 M');
  });
});

describe('text fitting', () => {
  it('measures the longest word (no-break spaces and hyphens split words)', () => {
    expect(longestWord('Malacpersely')).toBe(12);
    expect(longestWord('Chain Reactor')).toBe(7);
    expect(longestWord('1. felvonás')).toBe(8);
    expect(longestWord('')).toBe(0);
  });
});
