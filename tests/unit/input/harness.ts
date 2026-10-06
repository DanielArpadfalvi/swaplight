import { loadAscii } from '../../../src/core/ascii';
import type { SimConfig } from '../../../src/core/config';
import { createSim, step } from '../../../src/core/sim';
import type { SimEvent, SimInput, SimMode, SimState } from '../../../src/core/types';
import { geometryForSim, type BoardGeometry, type BoardLayout } from '../../../src/input/geometry';
import { GestureController, type GestureOptions } from '../../../src/input/gesture';
import { createSimView, type SimView } from '../../../src/input/simView';

export const LAYOUT: BoardLayout = { originX: 10, originY: 20, cellSize: 40 };
export const TICK_MS = 1000 / 60;

/**
 * Real core sim + GestureController. Pointer positions are given in fractional grid units
 * (row 11.5, col 0.5 = centre of the bottom-left cell) and converted to pixels with the current
 * rise offset, exactly as the renderer would place the board.
 */
export class Harness {
  readonly sim: SimState;
  readonly view: SimView;
  readonly ctl: GestureController;
  t = 1000;
  /** Every command passed to `step`, in order. */
  readonly sent: SimInput[] = [];
  readonly events: SimEvent[] = [];

  constructor(
    ascii: string,
    opts: { mode?: SimMode; config?: Partial<SimConfig>; gesture?: Partial<GestureOptions> } = {},
  ) {
    this.sim = createSim('input', opts.config ?? {}, opts.mode ?? 'static');
    loadAscii(this.sim, ascii);
    this.view = createSimView(() => this.sim);
    this.ctl = new GestureController(this.view, opts.gesture);
  }

  geo(): BoardGeometry {
    return geometryForSim(LAYOUT, this.sim);
  }

  px(row: number, col: number): { x: number; y: number } {
    const g = this.geo();
    return {
      x: g.originX + col * g.cellSize,
      y: g.originY + row * g.cellSize - g.riseOffsetPx,
    };
  }

  down(id: number, row: number, col: number, dt = 0): void {
    this.t += dt;
    this.ctl.pointerDown({ id, ...this.px(row, col), t: this.t }, this.geo());
  }

  move(id: number, row: number, col: number, dt = TICK_MS): void {
    this.t += dt;
    this.ctl.pointerMove({ id, ...this.px(row, col), t: this.t }, this.geo());
  }

  up(id: number, row: number, col: number, dt = TICK_MS): void {
    this.t += dt;
    this.ctl.pointerUp({ id, ...this.px(row, col), t: this.t }, this.geo());
  }

  /** Commands queued so far (without consuming them). */
  peek(): SimInput[] {
    return [...this.ctl.peekCommands()];
  }

  /** Advance n ticks like the game loop: update → takeCommands → step. Returns commands sent. */
  tick(n = 1): SimInput[] {
    const out: SimInput[] = [];
    for (let i = 0; i < n; i++) {
      this.t += TICK_MS;
      this.ctl.update(this.t, this.geo());
      const cmds = this.ctl.takeCommands();
      out.push(...cmds);
      this.sent.push(...cmds);
      this.events.push(...step(this.sim, cmds));
    }
    return out;
  }
}

export const swaps = (cmds: SimInput[]) =>
  cmds.filter((c): c is Extract<SimInput, { type: 'swap' }> => c.type === 'swap');
export const raises = (cmds: SimInput[]) =>
  cmds.filter((c): c is Extract<SimInput, { type: 'raise' }> => c.type === 'raise');
