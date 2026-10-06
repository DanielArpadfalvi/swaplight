import type { CellRef, SimInput } from '../core/types';
import { hitTest, pointToGrid, type BoardGeometry } from './geometry';
import type { SimView } from './simView';

/**
 * Pure touch/mouse gesture state machine (Puzzle League DS style). No DOM: feed it pointer
 * samples (`bindPointerInput` does that in the browser, tests do it directly), call `update` once
 * per tick and drain `takeCommands()` into `step(sim, commands)`.
 *
 * Gestures:
 * - press a block + drag horizontally: one swap per column crossed (with hysteresis); the held
 *   block is tracked by id, so it keeps moving with the finger. Vertical motion of a held block is
 *   ignored entirely: it never swaps rows and never raises the stack (the block stays held). While
 *   a swap is illegal (locked, mid-swap, …) nothing is emitted; it resumes once legal.
 * - forgiving grab: a press that misses a block by at most `grabSlop` cells (an adjacent cell in
 *   the same row, the cell above/below — e.g. rise-offset rounding — or just outside the board
 *   edge) grabs the nearest such block.
 * - press an empty cell inside the board (or above/beside it): nothing. That pointer stays inert
 *   even if it is then dragged across onto a block.
 * - press-and-hold in the zone below the active board (the preview row and further down): raise
 *   while held. A quick upward swipe that starts there (`belowSwipe`) additionally keeps raising
 *   for a short burst after the finger lifts.
 * - `setRaiseButton(active)`: explicit raise source for an on-screen raise button; merged (OR)
 *   with the below-zone hold and the swipe burst.
 * - only one pointer drags at a time; extra fingers never raise.
 * - tap a block without dragging: no command, a `select` UI event.
 */

export interface PointerSample {
  /** Stable pointer id (PointerEvent.pointerId). */
  id: number;
  x: number;
  y: number;
  /** Timestamp in milliseconds (same clock as the `now` passed to `update`). */
  t: number;
}

export interface GestureOptions {
  /** A press within this distance (in cells) of a block's cell grabs that block. */
  grabSlop: number;
  /** Enable the upward swipe burst for swipes that start in the below-board zone. */
  belowSwipe: boolean;
  /** How far (in cells) past a column boundary the pointer must go to trigger a swap. */
  hysteresis: number;
  /** Max pointer travel (in cells) for a press/release on a block to count as a tap. */
  tapSlop: number;
  /** Upward speed (cells per second) that counts as a swipe (below-zone swipes only). */
  swipeVelocity: number;
  /** Minimum upward travel from the press point (in cells) for a swipe. */
  swipeMinDistance: number;
  /** Upward travel must exceed horizontal travel by this factor for a swipe. */
  swipeVerticalRatio: number;
  /** Velocity is measured over the samples of the last `swipeWindowMs`. */
  swipeWindowMs: number;
  /** How long a swipe holds the raise. The sim then finishes the current row on its own. */
  swipeBurstMs: number;
}

export const DEFAULT_GESTURE_OPTIONS: Readonly<GestureOptions> = Object.freeze({
  grabSlop: 0.25,
  belowSwipe: true,
  hysteresis: 0.375,
  tapSlop: 0.3,
  swipeVelocity: 8,
  swipeMinDistance: 0.5,
  swipeVerticalRatio: 1.5,
  swipeWindowMs: 100,
  swipeBurstMs: 120,
});

export type GestureUiEvent =
  | { type: 'select'; row: number; col: number; blockId: number }
  | { type: 'grab'; row: number; col: number; blockId: number }
  | { type: 'release'; blockId: number }
  | { type: 'swipe' };

/** Render hints, refreshed on every pointer event and `update`. */
export interface GestureHints {
  /** Id of the block under the drag pointer (null when not dragging). */
  heldBlockId: number | null;
  /** Grid cell under the drag pointer (null when not dragging or outside the grid). */
  hoverCell: CellRef | null;
  /** The controller currently holds the raise (below-zone hold, swipe burst or raise button). */
  raising: boolean;
}

type Role = 'drag' | 'raise' | 'idle';

interface PointerState {
  id: number;
  role: Role;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Recent samples for velocity estimation. */
  samples: { x: number; y: number; t: number }[];
  /** Held block id (role 'drag'). */
  blockId: number | null;
  /** Swaps emitted by this pointer. */
  swaps: number;
  /** Max travel from the press point, in px. */
  travel: number;
  /** A swipe was already reported for this pointer. */
  swiped: boolean;
}

export class GestureController {
  readonly options: GestureOptions;
  private readonly pointers = new Map<number, PointerState>();
  private commands: SimInput[] = [];
  private uiEvents: GestureUiEvent[] = [];
  private geometry: BoardGeometry | null = null;
  private burstUntil = -Infinity;
  private raiseButton = false;
  private now = 0;
  /** Raise state last sent to the sim. */
  private raiseSent = false;
  /** A swap for the drag pointer is queued but not yet consumed by a tick. */
  private swapQueued = false;
  private hintState: GestureHints = { heldBlockId: null, hoverCell: null, raising: false };

  constructor(
    private readonly view: SimView,
    options: Partial<GestureOptions> = {},
  ) {
    this.options = { ...DEFAULT_GESTURE_OPTIONS, ...options };
  }

  get hints(): Readonly<GestureHints> {
    return this.hintState;
  }

  /** Number of pointers currently down. */
  get activePointers(): number {
    return this.pointers.size;
  }

  pointerDown(p: PointerSample, geo: BoardGeometry): void {
    this.geometry = geo;
    this.now = Math.max(this.now, p.t);
    if (this.pointers.has(p.id)) this.pointers.delete(p.id);
    const state: PointerState = {
      id: p.id,
      role: 'idle',
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
      samples: [{ x: p.x, y: p.y, t: p.t }],
      blockId: null,
      swaps: 0,
      travel: 0,
      swiped: false,
    };
    const hasDrag = this.dragPointer() !== null;
    const grab = this.grabTarget(geo, p.x, p.y);
    if (grab) {
      // A second finger on a block while another one drags stays inert (never raises).
      if (!hasDrag) {
        state.role = 'drag';
        state.blockId = grab.blockId;
        this.uiEvents.push({ type: 'grab', ...grab });
      }
    } else if (hitTest(geo, p.x, p.y).zone === 'below') {
      state.role = 'raise';
    }
    this.pointers.set(p.id, state);
    this.refresh();
  }

  pointerMove(p: PointerSample, geo: BoardGeometry): void {
    this.geometry = geo;
    this.now = Math.max(this.now, p.t);
    const s = this.pointers.get(p.id);
    if (!s) return;
    this.track(s, p);
    this.checkSwipe(s, p.t);
    if (s.role === 'drag') this.tryDrag(s);
    this.refresh();
  }

  pointerUp(p: PointerSample, geo: BoardGeometry): void {
    this.geometry = geo;
    this.now = Math.max(this.now, p.t);
    const s = this.pointers.get(p.id);
    if (!s) return;
    this.track(s, p);
    this.checkSwipe(s, p.t);
    if (s.role === 'drag') {
      this.tryDrag(s);
      if (s.blockId !== null) {
        if (s.swaps === 0 && s.travel <= this.options.tapSlop * geo.cellSize) {
          const at = this.view.locate(s.blockId);
          if (at) this.uiEvents.push({ type: 'select', ...at, blockId: s.blockId });
        }
        this.uiEvents.push({ type: 'release', blockId: s.blockId });
      }
    }
    this.pointers.delete(p.id);
    this.refresh();
  }

  /** Pointer lost (pointercancel / lost capture): drop it without tap/swipe side effects. */
  pointerCancel(id: number): void {
    const s = this.pointers.get(id);
    if (!s) return;
    if (s.role === 'drag' && s.blockId !== null) {
      this.uiEvents.push({ type: 'release', blockId: s.blockId });
    }
    this.pointers.delete(id);
    this.refresh();
  }

  /**
   * Call once per sim tick (before `takeCommands`): retries a drag swap that was blocked, expires
   * the swipe burst and refreshes hints for the new rise offset.
   */
  update(now: number, geo?: BoardGeometry): void {
    if (geo) this.geometry = geo;
    this.now = Math.max(this.now, now);
    const drag = this.dragPointer();
    if (drag) this.tryDrag(drag);
    this.refresh();
  }

  /** Commands for the next tick; the caller must pass them to `step` right away. */
  takeCommands(): SimInput[] {
    const out = this.commands;
    this.commands = [];
    this.swapQueued = false;
    return out;
  }

  /** Commands queued for the next tick, without consuming them. */
  peekCommands(): readonly SimInput[] {
    return this.commands;
  }

  takeUiEvents(): GestureUiEvent[] {
    const out = this.uiEvents;
    this.uiEvents = [];
    return out;
  }

  /**
   * Explicit raise source for a dedicated on-screen raise button: raise while `active`. Merged
   * with the below-zone hold and the swipe burst; the sim sees a single raise state.
   */
  setRaiseButton(active: boolean): void {
    if (this.raiseButton === active) return;
    this.raiseButton = active;
    this.refresh();
  }

  /** Drop all pointers and the raise button; queues a raise release if needed. */
  reset(): void {
    this.pointers.clear();
    this.burstUntil = -Infinity;
    this.raiseButton = false;
    this.refresh();
  }

  /**
   * Block a press at (x, y) grabs: the block under the point, else the nearest block whose cell is
   * within `grabSlop` cells of the point (adjacent column, row above/below, or just outside the
   * board edge). Null when nothing is close enough.
   */
  private grabTarget(
    geo: BoardGeometry,
    x: number,
    y: number,
  ): { row: number; col: number; blockId: number } | null {
    const g = pointToGrid(geo, x, y);
    const r0 = Math.floor(g.row);
    const c0 = Math.floor(g.col);
    const slop = this.options.grabSlop;
    let best: { row: number; col: number; blockId: number } | null = null;
    let bestDist = Infinity;
    for (let row = r0 - 1; row <= r0 + 1; row++) {
      if (row < 0 || row >= this.view.rows) continue;
      for (let col = c0 - 1; col <= c0 + 1; col++) {
        if (col < 0 || col >= this.view.cols) continue;
        const dx = Math.max(col - g.col, 0, g.col - (col + 1));
        const dy = Math.max(row - g.row, 0, g.row - (row + 1));
        const dist = Math.hypot(dx, dy);
        if (dist > slop || dist >= bestDist) continue;
        const block = this.view.blockAt(row, col);
        if (!block) continue;
        best = { row, col, blockId: block.id };
        bestDist = dist;
      }
    }
    return best;
  }

  private dragPointer(): PointerState | null {
    for (const s of this.pointers.values()) if (s.role === 'drag') return s;
    return null;
  }

  private track(s: PointerState, p: PointerSample): void {
    s.x = p.x;
    s.y = p.y;
    s.travel = Math.max(s.travel, Math.hypot(p.x - s.startX, p.y - s.startY));
    s.samples.push({ x: p.x, y: p.y, t: p.t });
    const cutoff = p.t - this.options.swipeWindowMs;
    while (s.samples.length > 2 && s.samples[0]!.t < cutoff) s.samples.shift();
  }

  /** Upward swipe burst: only for pointers that started in the below-board zone. */
  private checkSwipe(s: PointerState, t: number): void {
    if (s.role !== 'raise' || !this.options.belowSwipe) return;
    const geo = this.geometry;
    if (!geo) return;
    const first = s.samples[0]!;
    const dt = t - first.t;
    if (dt <= 0) return;
    const cell = geo.cellSize;
    const up = s.startY - s.y;
    const side = Math.abs(s.x - s.startX);
    const speed = ((first.y - s.y) / cell / dt) * 1000; // cells per second, upwards
    if (
      up >= this.options.swipeMinDistance * cell &&
      up >= side * this.options.swipeVerticalRatio &&
      speed >= this.options.swipeVelocity
    ) {
      this.burstUntil = Math.max(this.burstUntil, t + this.options.swipeBurstMs);
      if (!s.swiped) {
        s.swiped = true;
        this.uiEvents.push({ type: 'swipe' });
      }
    }
  }

  /** Emit at most one swap moving the held block towards the pointer column. */
  private tryDrag(s: PointerState): void {
    const geo = this.geometry;
    if (!geo || s.blockId === null || this.swapQueued) return;
    const at = this.view.locate(s.blockId);
    if (!at) return;
    const fx = pointToGrid(geo, s.x, s.y).col;
    const h = this.options.hysteresis;
    let dir = 0;
    if (fx >= at.col + 1 + h && at.col + 1 < this.view.cols) dir = 1;
    else if (fx < at.col - h && at.col > 0) dir = -1;
    if (dir === 0) return;
    const col = dir > 0 ? at.col : at.col - 1;
    if (!this.view.canSwap(at.row, col)) return;
    this.commands.push({ type: 'swap', row: at.row, col });
    this.swapQueued = true;
    s.swaps++;
  }

  private refresh(): void {
    let raisePointer = false;
    for (const s of this.pointers.values()) if (s.role === 'raise') raisePointer = true;
    const raising = raisePointer || this.raiseButton || this.now < this.burstUntil;
    if (raising !== this.raiseSent) {
      this.commands.push({ type: 'raise', active: raising });
      this.raiseSent = raising;
    }
    const drag = this.dragPointer();
    let hoverCell: CellRef | null = null;
    if (drag && this.geometry) {
      const hit = hitTest(this.geometry, drag.x, drag.y);
      if (hit.zone === 'cell') hoverCell = { row: hit.row, col: hit.col };
    }
    this.hintState = {
      heldBlockId: drag?.blockId != null && this.view.locate(drag.blockId) ? drag.blockId : null,
      hoverCell,
      raising,
    };
  }
}
