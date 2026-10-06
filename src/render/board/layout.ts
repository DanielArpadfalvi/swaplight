/**
 * Pure portrait layout: a HUD band at the top (~20 % of the height below the safe-area inset) and
 * the board centered below it, as large as fits with an integer cell size (crisp baked textures).
 * All values are CSS pixels in the canvas / stage coordinate space.
 */

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutOptions {
  rows: number;
  cols: number;
  /** HUD height as a fraction of the viewport height. */
  hudFraction?: number;
  minHud?: number;
  maxHud?: number;
  /** Margin left/right of the board frame. */
  sideMargin?: number;
  /** Margin below the board (above the bottom safe inset). */
  bottomMargin?: number;
  /** Frame border thickness around the well. */
  framePad?: number;
  /** How much of the preview row (in cells) is visible below the frame. */
  previewCells?: number;
  minCell?: number;
  maxCell?: number;
}

export interface GameLayout {
  width: number;
  height: number;
  insets: SafeInsets;
  /** Top of the HUD band (= top safe inset) and its height. */
  hudTop: number;
  hudHeight: number;
  cellSize: number;
  /** Top-left of row 0, col 0 at rise offset 0. */
  originX: number;
  originY: number;
  boardWidth: number;
  /** rows × cellSize (the active well, without the preview strip). */
  boardHeight: number;
  /** Visible preview strip height below the well, in px. */
  previewHeight: number;
  framePad: number;
}

export const ZERO_INSETS: SafeInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export function computeLayout(
  width: number,
  height: number,
  insets: SafeInsets,
  options: LayoutOptions,
): GameLayout {
  const {
    rows,
    cols,
    hudFraction = 0.2,
    minHud = 128,
    maxHud = 190,
    sideMargin = 14,
    bottomMargin = 14,
    framePad = 6,
    previewCells = 0.72,
    minCell = 12,
    maxCell = 76,
  } = options;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const hudTop = insets.top;
  const hudHeight = Math.round(Math.min(maxHud, Math.max(minHud, h * hudFraction)));
  const top = hudTop + hudHeight + framePad;
  const availH = h - top - insets.bottom - bottomMargin - framePad;
  const availW = w - insets.left - insets.right - 2 * (sideMargin + framePad);
  const byW = availW / cols;
  const byH = availH / (rows + previewCells);
  const cellSize = Math.max(minCell, Math.min(maxCell, Math.floor(Math.min(byW, byH))));
  const boardWidth = cellSize * cols;
  const boardHeight = cellSize * rows;
  const previewHeight = Math.round(cellSize * previewCells);
  const innerLeft = insets.left;
  const innerWidth = w - insets.left - insets.right;
  const originX = Math.round(innerLeft + (innerWidth - boardWidth) / 2);
  const total = boardHeight + previewHeight;
  // Center in the remaining space, but never above the HUD band.
  const originY = Math.round(top + Math.max(0, (availH - total) / 2));
  return {
    width: w,
    height: h,
    insets,
    hudTop,
    hudHeight,
    cellSize,
    originX,
    originY,
    boardWidth,
    boardHeight,
    previewHeight,
    framePad,
  };
}

/** Center of a (fractional) grid cell on screen, given the current rise in rows. */
export function cellCenter(
  layout: Pick<GameLayout, 'originX' | 'originY' | 'cellSize'>,
  row: number,
  col: number,
  rise: number,
): { x: number; y: number } {
  return {
    x: layout.originX + (col + 0.5) * layout.cellSize,
    y: layout.originY + (row - rise + 0.5) * layout.cellSize,
  };
}

/** Read CSS `env(safe-area-inset-*)` via a probe element (0 when unsupported). */
export function readSafeInsets(doc: Document = document): SafeInsets {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  doc.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}
