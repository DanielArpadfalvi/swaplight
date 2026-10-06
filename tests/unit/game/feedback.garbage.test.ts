import { describe, expect, it } from 'vitest';
import {
  GARBAGE_HEAVY_CELLS,
  feedbackForEvents,
  garbageShake,
  type FeedbackContext,
} from '../../../src/game/feedback';

const ctx: FeedbackContext = {
  tick: 1,
  danger: false,
  rows: 12,
  cols: 6,
  translate: (key) => key,
};

describe('garbage feedback', () => {
  it('a landing slab thuds; big ones shake and buzz hard', () => {
    const small = feedbackForEvents(
      [{ type: 'garbageLanded', slabId: 1, row: 3, col: 0, width: 3, height: 1 }],
      ctx,
    );
    expect(small).toContainEqual({ kind: 'sfx', sfx: 'garbage', a: 3 });
    expect(small.some((f) => f.kind === 'shake')).toBe(false);
    const big = feedbackForEvents(
      [{ type: 'garbageLanded', slabId: 2, row: 0, col: 0, width: 6, height: 3 }],
      ctx,
    );
    expect(big).toContainEqual({ kind: 'haptic', strength: 'heavy' });
    expect(big).toContainEqual({ kind: 'shake', amount: garbageShake(18) });
    expect(garbageShake(GARBAGE_HEAVY_CELLS)).toBeGreaterThan(garbageShake(6));
    expect(garbageShake(200)).toBeLessThanOrEqual(0.75);
  });

  it('converted blocks burst where they emerge', () => {
    const out = feedbackForEvents(
      [
        { type: 'garbageConverting', slabIds: [4], ticks: 30 },
        {
          type: 'garbageConverted',
          slabId: 4,
          remaining: 0,
          blocks: [
            { id: 90, row: 5, col: 1, color: 2 },
            { id: 91, row: 5, col: 2, color: 0 },
          ],
        },
      ],
      ctx,
    );
    expect(out).toContainEqual({ kind: 'sfx', sfx: 'match' });
    expect(out.filter((f) => f.kind === 'garbageBurst')).toEqual([
      { kind: 'garbageBurst', row: 5, col: 1, color: 2 },
      { kind: 'garbageBurst', row: 5, col: 2, color: 0 },
    ]);
  });
});
