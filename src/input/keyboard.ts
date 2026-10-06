import type { CellRef, SimInput } from '../core/types';
import type { SimView } from './simView';

/**
 * Desktop/testing controls producing the same commands as the touch controller:
 * - arrow keys move a 2-wide cursor (covers `col` and `col + 1`)
 * - space / x swaps the cursor pair
 * - shift raises while held
 * The cursor moves up with the stack when a row rises.
 */
export class KeyboardController {
  private cursorRow: number;
  private cursorCol: number;
  private commands: SimInput[] = [];
  private raising = false;
  private lastRisen: number;

  constructor(private readonly view: SimView) {
    this.cursorRow = Math.max(0, view.rows - 4);
    this.cursorCol = Math.max(0, Math.floor((view.cols - 2) / 2));
    this.lastRisen = view.rowsRisen();
  }

  /** Left cell of the cursor pair. */
  get cursor(): Readonly<CellRef> {
    return { row: this.cursorRow, col: this.cursorCol };
  }

  get isRaising(): boolean {
    return this.raising;
  }

  setCursor(row: number, col: number): void {
    this.cursorRow = clamp(row, 0, this.view.rows - 1);
    this.cursorCol = clamp(col, 0, this.view.cols - 2);
  }

  /** Handle a `KeyboardEvent.key`; returns true when the key is used (caller preventDefaults). */
  keyDown(key: string, repeat = false): boolean {
    switch (key) {
      case 'ArrowLeft':
        this.setCursor(this.cursorRow, this.cursorCol - 1);
        return true;
      case 'ArrowRight':
        this.setCursor(this.cursorRow, this.cursorCol + 1);
        return true;
      case 'ArrowUp':
        this.setCursor(this.cursorRow - 1, this.cursorCol);
        return true;
      case 'ArrowDown':
        this.setCursor(this.cursorRow + 1, this.cursorCol);
        return true;
      case ' ':
      case 'x':
      case 'X':
        if (!repeat) this.commands.push({ type: 'swap', row: this.cursorRow, col: this.cursorCol });
        return true;
      case 'Shift':
        this.setRaise(true);
        return true;
      default:
        return false;
    }
  }

  keyUp(key: string): boolean {
    if (key !== 'Shift') return false;
    this.setRaise(false);
    return true;
  }

  /** Release held keys (e.g. on window blur). */
  releaseAll(): void {
    this.setRaise(false);
  }

  /** Call once per tick before `takeCommands`: keeps the cursor on its row as the stack rises. */
  update(): void {
    const risen = this.view.rowsRisen();
    if (risen !== this.lastRisen) {
      const delta = risen - this.lastRisen;
      this.lastRisen = risen;
      if (delta > 0) this.setCursor(this.cursorRow - delta, this.cursorCol);
    }
  }

  takeCommands(): SimInput[] {
    const out = this.commands;
    this.commands = [];
    return out;
  }

  private setRaise(active: boolean): void {
    if (active === this.raising) return;
    this.raising = active;
    this.commands.push({ type: 'raise', active });
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
