import { cellAt } from '../core/board';
import { canSwap } from '../core/sim';
import type { Block, CellRef, SimState } from '../core/types';

/** Read-only view of the simulation that the input controllers query. */
export interface SimView {
  readonly rows: number;
  readonly cols: number;
  blockAt(row: number, col: number): Readonly<Block> | null;
  /** Current cell of a block by id, or null when it no longer exists. */
  locate(blockId: number): CellRef | null;
  /** Would `{type:'swap', row, col}` (col ↔ col+1) be accepted right now? */
  canSwap(row: number, col: number): boolean;
  /** Monotonic count of rows risen (lets cursors follow the stack). */
  rowsRisen(): number;
}

/** View over a live sim. The getter is called on every query, so a restarted game is picked up. */
export function createSimView(getSim: () => SimState): SimView {
  return {
    get rows() {
      return getSim().config.rows;
    },
    get cols() {
      return getSim().config.cols;
    },
    blockAt: (row, col) => cellAt(getSim(), row, col),
    locate(blockId) {
      const sim = getSim();
      const i = sim.cells.findIndex((b) => b !== null && b.id === blockId);
      if (i < 0) return null;
      return { row: Math.floor(i / sim.config.cols), col: i % sim.config.cols };
    },
    canSwap: (row, col) => canSwap(getSim(), row, col) === null,
    rowsRisen: () => getSim().stats.rowsRisen,
  };
}
