/**
 * Per-block screen positions of the previous and the current tick, for render interpolation.
 * Pure data (no Pixi), so it is unit-tested directly.
 */

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface TrackedPos {
  row: number;
  col: number;
}

export class PositionTrack {
  private prev = new Map<number, TrackedPos>();
  private cur = new Map<number, TrackedPos>();
  private spare: TrackedPos[] = [];
  private readonly out: TrackedPos = { row: 0, col: 0 };

  /** Start recording a new tick: the current positions become the previous ones. */
  begin(): void {
    for (const p of this.prev.values()) this.spare.push(p);
    this.prev.clear();
    const t = this.prev;
    this.prev = this.cur;
    this.cur = t;
  }

  /** Record a block's screen row (grid row − rise) and column for the current tick. */
  set(id: number, row: number, col: number): void {
    const p = this.spare.pop() ?? { row: 0, col: 0 };
    p.row = row;
    p.col = col;
    this.cur.set(id, p);
  }

  /**
   * Interpolated position (alpha 0 = previous tick, 1 = current tick). Blocks that did not exist
   * in the previous tick snap to their current position. Returns a shared scratch object, or null
   * when the block was not recorded this tick.
   */
  get(id: number, alpha: number): Readonly<TrackedPos> | null {
    const c = this.cur.get(id);
    if (!c) return null;
    const p = this.prev.get(id);
    if (!p) {
      this.out.row = c.row;
      this.out.col = c.col;
    } else {
      this.out.row = lerp(p.row, c.row, alpha);
      this.out.col = lerp(p.col, c.col, alpha);
    }
    return this.out;
  }

  get size(): number {
    return this.cur.size;
  }

  clear(): void {
    this.prev.clear();
    this.cur.clear();
  }
}
