import { describe, expect, it } from 'vitest';
import { ZERO_INSETS, computeLayout } from '../../../src/render/board/layout';
import { QUEUE_STRIP, computeVersusLayout } from '../../../src/render/board/versusLayout';

describe('computeVersusLayout', () => {
  const opts = { rows: 12, cols: 6, bottomMargin: 80 };

  it('fits the main board and the mini board side by side on a phone', () => {
    const vl = computeVersusLayout(390, 844, ZERO_INSETS, opts);
    const { main, mini } = vl;
    const solo = computeLayout(390, 844, ZERO_INSETS, opts);
    // The player's board stays large; the mini board is a fraction of it.
    expect(main.cellSize).toBeGreaterThanOrEqual(Math.floor(solo.cellSize * 0.8));
    expect(mini.cellSize).toBeGreaterThanOrEqual(10);
    expect(mini.cellSize).toBeLessThan(main.cellSize / 2);
    // No overlap, everything on screen.
    const mainRight = main.originX + main.boardWidth + main.framePad;
    expect(mini.originX - mini.framePad).toBeGreaterThan(mainRight);
    expect(mini.originX + mini.boardWidth + mini.framePad).toBeLessThanOrEqual(390);
    expect(main.originX - main.framePad).toBeGreaterThanOrEqual(0);
    // Mini board top-aligned with the main frame, below its incoming strip.
    expect(vl.miniQueue.y).toBe(main.originY - main.framePad);
    expect(mini.originY - mini.framePad).toBeGreaterThanOrEqual(vl.miniQueue.y + vl.miniQueue.h);
    // Player's incoming strip sits right above the main frame, below the HUD band top.
    expect(vl.queue.h).toBe(QUEUE_STRIP);
    expect(vl.queue.y + vl.queue.h).toBeLessThanOrEqual(main.originY - main.framePad);
    expect(vl.queue.y).toBeGreaterThan(main.hudTop);
    // The opponent card fills the column below the mini board.
    expect(vl.card.y).toBeGreaterThan(mini.originY + mini.boardHeight);
    expect(vl.card.h).toBeGreaterThan(100);
  });

  it('respects safe-area insets and scales on tablets', () => {
    const insets = { top: 47, right: 0, bottom: 34, left: 0 };
    const vl = computeVersusLayout(390, 844, insets, opts);
    expect(vl.main.hudTop).toBe(47);
    expect(vl.main.originY + vl.main.boardHeight + vl.main.previewHeight).toBeLessThanOrEqual(
      844 - 34 - 80,
    );
    const big = computeVersusLayout(1024, 1366, ZERO_INSETS, opts);
    expect(big.mini.cellSize).toBeGreaterThan(vl.mini.cellSize);
    expect(big.mini.originX + big.mini.boardWidth).toBeLessThanOrEqual(1024);
  });
});
