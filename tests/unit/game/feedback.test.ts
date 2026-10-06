import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../../src/core/types';
import {
  DANGER_BEAT_TICKS,
  chainHaptic,
  chainShake,
  feedbackForEvents,
  formatPoints,
  musicIntensity,
  type Feedback,
  type FeedbackContext,
} from '../../../src/game/feedback';
import { createI18n } from '../../../src/i18n';

const i18n = createI18n({ deviceLanguages: ['en'] });
const ctx = (over: Partial<FeedbackContext> = {}): FeedbackContext => ({
  tick: 1,
  danger: false,
  rows: 12,
  cols: 6,
  translate: i18n.t,
  ...over,
});

const matched = (chain: number, combo: number, groupId = 1): SimEvent => ({
  type: 'matched',
  groupId,
  combo,
  chain,
  stopTicks: 0,
  blocks: Array.from({ length: combo }, (_, i) => ({ id: i + 1, color: 2, row: 8, col: i })),
});

const kinds = (f: Feedback[]) => f.map((x) => (x.kind === 'sfx' ? `sfx:${x.sfx}` : x.kind));

describe('feedbackForEvents', () => {
  it('swap → swap sound + light haptic', () => {
    const f = feedbackForEvents(
      [{ type: 'swapped', row: 3, col: 1, leftId: 1, rightId: 2 }],
      ctx(),
    );
    expect(f).toEqual([
      { kind: 'sfx', sfx: 'swap' },
      { kind: 'haptic', strength: 'light' },
    ]);
  });

  it('several landings in one tick make one thud', () => {
    const land = (id: number): SimEvent => ({ type: 'landed', id, row: 5, col: id, chain: false });
    const f = feedbackForEvents([land(1), land(2), land(3)], ctx());
    expect(kinds(f)).toEqual(['sfx:land']);
  });

  it('plain match of 3: match sound only, then a score popup at the group', () => {
    const f = feedbackForEvents(
      [
        matched(1, 3),
        {
          type: 'scored',
          groupId: 1,
          score: 30,
          breakdown: { blocks: 3, combo: 3, chain: 1, base: 30, mult: 1, total: 30 },
        },
      ],
      ctx(),
    );
    expect(kinds(f)).toEqual(['sfx:match', 'popup', 'scored']);
    const popup = f[1];
    expect(popup).toMatchObject({ kind: 'popup', text: '+30', tone: 'score', col: 1 });
    expect(f[2]).toMatchObject({ kind: 'scored', base: 30, mult: 1, total: 30 });
  });

  it('chain: stinger, popup, haptic, excitement; shake from ×3, flash from ×4', () => {
    const c2 = feedbackForEvents([matched(2, 3)], ctx());
    expect(kinds(c2)).toEqual(['sfx:match', 'sfx:chain', 'popup', 'haptic', 'excite']);
    expect(c2.find((x) => x.kind === 'popup')).toMatchObject({ text: '2× CHAIN!', tone: 'chain' });
    expect(c2.find((x) => x.kind === 'haptic')).toMatchObject({ strength: 'medium' });

    const c3 = feedbackForEvents([matched(3, 3)], ctx());
    expect(kinds(c3)).toContain('shake');
    expect(kinds(c3)).not.toContain('flash');

    const c4 = feedbackForEvents([matched(4, 3)], ctx());
    expect(kinds(c4)).toContain('flash');
    expect(c4.find((x) => x.kind === 'haptic')).toMatchObject({ strength: 'heavy' });
  });

  it('combo ≥ 4: combo stab + popup', () => {
    const f = feedbackForEvents([matched(1, 5)], ctx());
    expect(kinds(f)).toEqual(['sfx:match', 'sfx:combo', 'popup', 'haptic', 'excite']);
    expect(f[1]).toMatchObject({ a: 5 });
    expect(f[2]).toMatchObject({ text: '5 COMBO!', tone: 'combo' });
  });

  it('pop → rising pop sound + particle burst', () => {
    const f = feedbackForEvents(
      [
        {
          type: 'popped',
          groupId: 1,
          id: 9,
          row: 4,
          col: 2,
          color: 3,
          index: 2,
          size: 3,
          chain: 2,
        },
      ],
      ctx(),
    );
    expect(f).toEqual([
      { kind: 'sfx', sfx: 'pop', a: 2, b: 2 },
      { kind: 'burst', row: 4, col: 2, color: 3, chain: 2 },
    ]);
  });

  it('row rise, level up and game over', () => {
    expect(kinds(feedbackForEvents([{ type: 'rowRisen', previewIds: [] }], ctx()))).toEqual([
      'sfx:rowRise',
    ]);
    const lvl = feedbackForEvents([{ type: 'levelUp', level: 4 }], ctx());
    expect(lvl[0]).toMatchObject({ kind: 'popup', text: 'LEVEL 4', tone: 'level' });
    const over = feedbackForEvents([{ type: 'gameOver', tick: 10, score: 5 }], ctx());
    expect(kinds(over)).toEqual(['sfx:gameOver', 'haptic', 'flash', 'shake']);
    expect(over[1]).toMatchObject({ strength: 'heavy' });
  });

  it('danger heartbeat on a fixed tick period', () => {
    expect(
      kinds(feedbackForEvents([], ctx({ danger: true, tick: DANGER_BEAT_TICKS * 3 }))),
    ).toEqual(['sfx:danger']);
    expect(feedbackForEvents([], ctx({ danger: true, tick: DANGER_BEAT_TICKS * 3 + 1 }))).toEqual(
      [],
    );
    expect(feedbackForEvents([], ctx({ danger: false, tick: 0 }))).toEqual([]);
  });
});

describe('helpers', () => {
  it('chain haptics / shake scale with the chain', () => {
    expect(chainHaptic(2)).toBe('medium');
    expect(chainHaptic(5)).toBe('heavy');
    expect(chainShake(2)).toBe(0);
    expect(chainShake(3)).toBeGreaterThan(0);
    expect(chainShake(4)).toBeGreaterThan(chainShake(3));
    expect(chainShake(50)).toBeLessThanOrEqual(0.85);
  });

  it('formatPoints groups thousands', () => {
    expect(formatPoints(30)).toBe('+30');
    expect(formatPoints(1240)).toBe('+1 240');
    expect(formatPoints(1234567)).toBe('+1 234 567');
  });

  it('music intensity rises with level and peaks in danger', () => {
    expect(musicIntensity(1, false, false)).toBeLessThan(musicIntensity(10, false, false));
    expect(musicIntensity(1, false, true)).toBeGreaterThan(musicIntensity(1, false, false));
    expect(musicIntensity(1, true, true)).toBe(1);
    expect(musicIntensity(20, false, false)).toBeLessThanOrEqual(1);
  });
});
