import { computeLayout, type GameLayout, type LayoutOptions, type SafeInsets } from './layout';

/**
 * Portrait Versus layout: the player's board (large, left) and the CPU's mini board in a column on
 * its right, top-aligned with the main frame. Above the mini board sits the CPU's incoming-garbage
 * strip; below it, the opponent card. The player's incoming strip uses the bottom of the HUD band.
 * Pure (CSS px), unit-tested.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VersusLayout {
  main: GameLayout;
  /** Mini board (a regular `GameLayout`, so a `BoardView` can draw it). */
  mini: GameLayout;
  /** Player's incoming-garbage strip (above the main board). */
  queue: Rect;
  /** CPU's incoming-garbage strip (above the mini board). */
  miniQueue: Rect;
  /** Opponent card below the mini board. */
  card: Rect;
}

export interface VersusLayoutOptions extends Pick<LayoutOptions, 'rows' | 'cols' | 'bottomMargin'> {
  /** Mini cell size as a fraction of the main cell size before the split. */
  miniScale?: number;
}

/** Height of an incoming-garbage strip. */
export const QUEUE_STRIP = 22;
const GAP = 10;
const MINI_PAD = 4;

export function computeVersusLayout(
  width: number,
  height: number,
  insets: SafeInsets,
  options: VersusLayoutOptions,
): VersusLayout {
  const { rows, cols, bottomMargin = 14, miniScale = 0.36 } = options;
  const hud = { hudFraction: 0.19, minHud: 136, maxHud: 176 };
  const base = computeLayout(width, height, insets, { rows, cols, bottomMargin, ...hud });
  const miniCell = Math.max(8, Math.min(22, Math.floor(base.cellSize * miniScale)));
  const miniCol = cols * miniCell + 2 * MINI_PAD + GAP;
  const main = computeLayout(
    width,
    height,
    { ...insets, right: insets.right + miniCol },
    { rows, cols, bottomMargin, ...hud },
  );
  // Center the pair (main frame + mini column) horizontally.
  const pairW = main.boardWidth + 2 * main.framePad + miniCol;
  const innerW = width - insets.left - insets.right;
  const left = insets.left + Math.max(0, (innerW - pairW) / 2);
  main.originX = Math.round(left + main.framePad);

  const frameTop = main.originY - main.framePad;
  const miniX = main.originX + main.boardWidth + main.framePad + GAP + MINI_PAD;
  const miniY = frameTop + QUEUE_STRIP + MINI_PAD;
  const mini: GameLayout = {
    width: main.width,
    height: main.height,
    insets,
    hudTop: 0,
    hudHeight: 0,
    cellSize: miniCell,
    originX: Math.round(miniX),
    originY: Math.round(miniY),
    boardWidth: cols * miniCell,
    boardHeight: rows * miniCell,
    previewHeight: Math.round(miniCell * 0.72),
    framePad: MINI_PAD,
  };
  const miniFrameW = mini.boardWidth + 2 * MINI_PAD;
  const miniBottom = mini.originY + mini.boardHeight + mini.previewHeight + MINI_PAD;
  return {
    main,
    mini,
    queue: {
      x: main.originX - main.framePad,
      y: frameTop - QUEUE_STRIP - 4,
      w: main.boardWidth + 2 * main.framePad,
      h: QUEUE_STRIP,
    },
    miniQueue: { x: mini.originX - MINI_PAD, y: frameTop, w: miniFrameW, h: QUEUE_STRIP - 4 },
    card: {
      x: mini.originX - MINI_PAD,
      y: miniBottom + 12,
      w: miniFrameW,
      h: Math.max(0, main.originY + main.boardHeight + main.previewHeight - miniBottom - 12),
    },
  };
}
