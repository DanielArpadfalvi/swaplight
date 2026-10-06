import { riseFraction } from '../core/sim';
import type { SimState } from '../core/types';

/**
 * Screen placement of the board, in the same coordinate space as the pointer samples fed to the
 * controllers (for `bindPointerInput`: CSS pixels relative to the bound element's top-left).
 *
 * `originY` is the top edge of row 0 when the rise offset is 0. The renderer shifts the whole grid
 * (and the preview row) up by `riseOffsetPx`, so row `r` currently spans
 * `[originY + r·cellSize − riseOffsetPx, … + cellSize)`.
 */
export interface BoardGeometry {
  originX: number;
  originY: number;
  cellSize: number;
  cols: number;
  rows: number;
  /** Current upward shift of the grid in pixels: `riseFraction(sim) · cellSize`. */
  riseOffsetPx: number;
}

export interface BoardLayout {
  originX: number;
  originY: number;
  cellSize: number;
}

/** Build a geometry from a fixed layout and the current sim (rows/cols/rise offset). */
export function geometryForSim(layout: BoardLayout, sim: SimState): BoardGeometry {
  return {
    ...layout,
    cols: sim.config.cols,
    rows: sim.config.rows,
    riseOffsetPx: riseFraction(sim) * layout.cellSize,
  };
}

/** Fractional grid position of a screen point (col 1.5 = middle of column 1). */
export function pointToGrid(
  geo: BoardGeometry,
  x: number,
  y: number,
): { row: number; col: number } {
  return {
    row: (y - geo.originY + geo.riseOffsetPx) / geo.cellSize,
    col: (x - geo.originX) / geo.cellSize,
  };
}

/**
 * Where a screen point lands:
 * - `cell`    inside the active grid (row 0..rows-1, col 0..cols-1)
 * - `below`   in the preview row or anywhere below the bottom row (within or outside the columns)
 * - `outside` above the grid or left/right of it
 */
export type PointZone = 'cell' | 'below' | 'outside';

export interface PointHit {
  zone: PointZone;
  /** Integer row/col (not clamped; may be out of range unless zone is 'cell'). */
  row: number;
  col: number;
}

export function hitTest(geo: BoardGeometry, x: number, y: number): PointHit {
  const g = pointToGrid(geo, x, y);
  const row = Math.floor(g.row);
  const col = Math.floor(g.col);
  if (row >= geo.rows) return { zone: 'below', row, col };
  if (row < 0 || col < 0 || col >= geo.cols) return { zone: 'outside', row, col };
  return { zone: 'cell', row, col };
}

/** Integer cell under a screen point, or null when outside the active grid. */
export function pointToCell(
  geo: BoardGeometry,
  x: number,
  y: number,
): { row: number; col: number } | null {
  const hit = hitTest(geo, x, y);
  return hit.zone === 'cell' ? { row: hit.row, col: hit.col } : null;
}
