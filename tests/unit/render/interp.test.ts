import { describe, expect, it } from 'vitest';
import { lerp, PositionTrack } from '../../../src/render/board/interp';

describe('PositionTrack', () => {
  it('interpolates between the previous and the current tick', () => {
    const t = new PositionTrack();
    t.begin();
    t.set(1, 5, 2);
    t.begin();
    t.set(1, 6, 3);
    expect(t.get(1, 0)).toEqual({ row: 5, col: 2 });
    expect(t.get(1, 0.5)).toEqual({ row: 5.5, col: 2.5 });
    expect(t.get(1, 1)).toEqual({ row: 6, col: 3 });
  });

  it('snaps new blocks and forgets removed ones', () => {
    const t = new PositionTrack();
    t.begin();
    t.set(1, 3, 0);
    t.begin();
    t.set(2, 4, 4);
    expect(t.get(2, 0.25)).toEqual({ row: 4, col: 4 });
    expect(t.get(1, 0.5)).toBeNull();
    expect(t.size).toBe(1);
  });

  it('clear drops history', () => {
    const t = new PositionTrack();
    t.begin();
    t.set(1, 3, 0);
    t.clear();
    expect(t.get(1, 1)).toBeNull();
  });

  it('lerp', () => {
    expect(lerp(2, 4, 0.25)).toBe(2.5);
  });
});
