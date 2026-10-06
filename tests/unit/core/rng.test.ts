import { describe, expect, it } from 'vitest';
import {
  cloneRng,
  createRng,
  hashSeed,
  nextFloat,
  nextUint32,
  pick,
  randInt,
  shuffle,
} from '../../../src/core/rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('daily-2026-10-06');
    const b = createRng('daily-2026-10-06');
    const xs = Array.from({ length: 100 }, () => nextUint32(a));
    const ys = Array.from({ length: 100 }, () => nextUint32(b));
    expect(xs).toEqual(ys);
  });

  it('differs between seeds and treats numbers like their string form', () => {
    expect(nextUint32(createRng(1))).not.toBe(nextUint32(createRng(2)));
    expect(createRng(42)).toEqual(createRng('42'));
    expect(hashSeed('a')).not.toEqual(hashSeed('b'));
  });

  it('produces unsigned 32-bit ints and floats in [0,1)', () => {
    const s = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const u = nextUint32(s);
      expect(Number.isInteger(u) && u >= 0 && u < 2 ** 32).toBe(true);
      const f = nextFloat(s);
      expect(f >= 0 && f < 1).toBe(true);
    }
  });

  it('state is plain data: clone / JSON round-trip continue identically', () => {
    const s = createRng('clone');
    nextUint32(s);
    const c = cloneRng(s);
    const j = JSON.parse(JSON.stringify(s)) as typeof s;
    const sc = structuredClone(s);
    const next = nextUint32(s);
    expect(nextUint32(c)).toBe(next);
    expect(nextUint32(j)).toBe(next);
    expect(nextUint32(sc)).toBe(next);
  });

  it('randInt covers the whole range roughly uniformly', () => {
    const s = createRng('uniform');
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) counts[randInt(s, 5)]!++;
    for (const n of counts) expect(n).toBeGreaterThan(1800);
    expect(() => randInt(s, 0)).toThrow(RangeError);
    expect(() => randInt(s, 2.5)).toThrow(RangeError);
  });

  it('pick and shuffle', () => {
    const s = createRng('pick');
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i++) expect(items).toContain(pick(s, items));
    expect(() => pick(s, [])).toThrow(RangeError);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(s, arr);
    expect(out).toBe(arr);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const again = shuffle(createRng('x'), [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shuffle(createRng('x'), [1, 2, 3, 4, 5, 6, 7, 8])).toEqual(again);
  });
});
