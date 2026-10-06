import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../../src/core/types';
import { feedbackForEvents, type FeedbackContext } from '../../../src/game/feedback';
import { createI18n, type Language } from '../../../src/i18n';
import { POPUP_GLYPHS } from '../../../src/render/style/effects';

const matched = (chain: number, combo: number): SimEvent => ({
  type: 'matched',
  groupId: 1,
  combo,
  chain,
  stopTicks: 0,
  blocks: Array.from({ length: combo }, (_, i) => ({ id: i + 1, color: 2, row: 8, col: i % 6 })),
});

const scored = (total: number): SimEvent => ({
  type: 'scored',
  groupId: 1,
  score: total,
  breakdown: { blocks: 3, combo: 3, chain: 1, base: total, mult: 1, total },
});

function popupTexts(language: Language): string[] {
  const i18n = createI18n({ deviceLanguages: [language] });
  const ctx: FeedbackContext = {
    tick: 1,
    danger: false,
    rows: 12,
    cols: 6,
    translate: i18n.t,
  };
  const events: SimEvent[] = [];
  for (let n = 2; n <= 30; n++) events.push(matched(n, n + 2));
  for (const total of [10, 1240, 98765, 1234567]) events.push(scored(total));
  for (let level = 1; level <= 99; level++) events.push({ type: 'levelUp', level });
  return feedbackForEvents(events, ctx).flatMap((f) => (f.kind === 'popup' ? [f.text] : []));
}

// Regression (perf pass): a glyph missing from the pre-generated popup font is drawn on first use,
// re-uploading a whole font page to the GPU in the middle of the player's chain.
describe('popup glyph coverage', () => {
  for (const language of ['en', 'hu'] as const) {
    it(`every ${language.toUpperCase()} popup glyph is pre-generated`, () => {
      const texts = popupTexts(language);
      expect(texts.length).toBeGreaterThan(50);
      const missing = new Set<string>();
      for (const text of texts)
        for (const ch of text) if (!POPUP_GLYPHS.includes(ch)) missing.add(ch);
      expect([...missing]).toEqual([]);
    });
  }
});
