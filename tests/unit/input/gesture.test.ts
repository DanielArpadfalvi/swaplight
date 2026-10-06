import { describe, expect, it } from 'vitest';
import { boardToAscii } from '../../../src/core/ascii';
import { cellAt } from '../../../src/core/board';
import { step } from '../../../src/core/sim';
import { Harness, raises, swaps } from './harness';

const BOTTOM = 11;

describe('GestureController – drag to swap', () => {
  it('dragging across three columns emits three swaps, tracking the held block', () => {
    const h = new Harness('RGBYPG');
    const r = cellAt(h.sim, BOTTOM, 0)!;
    h.down(1, 11.5, 0.5);
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
    expect(h.ctl.takeUiEvents()).toEqual([{ type: 'grab', row: 11, col: 0, blockId: r.id }]);
    h.move(1, 11.5, 3.5);
    // Only one swap per tick: the next one waits for the sim to apply (and finish) the first.
    expect(h.peek()).toEqual([{ type: 'swap', row: 11, col: 0 }]);
    h.move(1, 11.5, 3.6);
    expect(h.peek()).toHaveLength(1);
    h.tick(20);
    expect(swaps(h.sent)).toEqual([
      { type: 'swap', row: 11, col: 0 },
      { type: 'swap', row: 11, col: 1 },
      { type: 'swap', row: 11, col: 2 },
    ]);
    expect(boardToAscii(h.sim)).toBe('GBYRPG');
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
    expect(h.ctl.hints.hoverCell).toEqual({ row: 11, col: 3 });
    h.up(1, 11.5, 3.6);
    expect(h.ctl.takeUiEvents()).toEqual([{ type: 'release', blockId: r.id }]);
    expect(h.ctl.hints.heldBlockId).toBeNull();
    expect(h.tick(10)).toEqual([]);
  });

  it('follows the pointer step by step and back again', () => {
    const h = new Harness('RGBYPG');
    h.down(1, 11.5, 0.5);
    h.move(1, 11.5, 1.5);
    h.tick(5);
    h.move(1, 11.5, 2.5);
    h.tick(5);
    expect(boardToAscii(h.sim)).toBe('GBRYPG');
    h.move(1, 11.5, 0.5);
    h.tick(12);
    expect(boardToAscii(h.sim)).toBe('RGBYPG');
    expect(swaps(h.sent).map((s) => s.col)).toEqual([0, 1, 1, 0]);
  });

  it('uses hysteresis around column boundaries', () => {
    const h = new Harness('RGBYPG', { gesture: { hysteresis: 0.375 } });
    h.down(1, 11.5, 0.5);
    h.move(1, 11.5, 1.3); // past the boundary, but not by enough
    expect(h.tick(6)).toEqual([]);
    h.move(1, 11.5, 1.4);
    expect(h.tick(6)).toEqual([{ type: 'swap', row: 11, col: 0 }]);
    // Jitter around the boundary does not swap back...
    h.move(1, 11.5, 0.9);
    h.move(1, 11.5, 1.1);
    h.move(1, 11.5, 0.7);
    expect(h.tick(6)).toEqual([]);
    // ...until the pointer is clearly in the old column.
    h.move(1, 11.5, 0.6);
    expect(h.tick(6)).toEqual([{ type: 'swap', row: 11, col: 0 }]);
    expect(boardToAscii(h.sim)).toBe('RGBYPG');
  });

  it('vertical movement while dragging does not change rows', () => {
    const h = new Harness('YB....\nRGBYPG');
    const r = cellAt(h.sim, BOTTOM, 0)!;
    h.down(1, 11.5, 0.5);
    h.move(1, 9.5, 0.6, 400); // slow upward drift (5 cells/s: no swipe)
    h.move(1, 8.2, 1.5, 400);
    h.tick(5);
    expect(swaps(h.sent)).toEqual([{ type: 'swap', row: 11, col: 0 }]);
    expect(cellAt(h.sim, BOTTOM, 1)).toBe(r);
    expect(raises(h.sent)).toEqual([]);
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
  });

  it('does not emit an illegal swap; continues once it becomes legal', () => {
    const h = new Harness('RGBYPG');
    const r = cellAt(h.sim, BOTTOM, 0)!;
    // Lock the neighbour: swap cols 1 and 2 directly through the sim.
    step(h.sim, [{ type: 'swap', row: 11, col: 1 }]);
    expect(h.view.canSwap(11, 0)).toBe(false);
    h.down(1, 11.5, 0.5);
    h.move(1, 11.5, 1.5);
    expect(h.peek()).toEqual([]);
    const blocked = h.tick(h.sim.config.swapTicks - 1);
    expect(blocked).toEqual([]);
    expect(cellAt(h.sim, BOTTOM, 0)).toBe(r);
    // Pointer did not move; the controller retries in update() once the swap is legal.
    h.tick(2);
    expect(swaps(h.sent)).toEqual([{ type: 'swap', row: 11, col: 0 }]);
    expect(boardToAscii(h.sim)).toBe('BRGYPG');
  });

  it('can swap the held block into an empty cell (it then falls) and keeps tracking it', () => {
    const h = new Harness('R.....\nGB....');
    const r = cellAt(h.sim, 10, 0)!;
    h.down(1, 10.5, 0.5);
    h.move(1, 10.5, 2.5);
    h.tick(1);
    expect(swaps(h.sent)).toEqual([{ type: 'swap', row: 10, col: 0 }]);
    h.tick(10);
    // R now sits over B at (10,1): the second swap moves it over the gap at col 2.
    expect(swaps(h.sent)).toEqual([
      { type: 'swap', row: 10, col: 0 },
      { type: 'swap', row: 10, col: 1 },
    ]);
    h.tick(40);
    expect(h.view.locate(r.id)).toEqual({ row: 11, col: 2 });
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
  });

  it('does not move past the board edges', () => {
    const h = new Harness('RGBYPG');
    h.down(1, 11.5, 5.5);
    h.move(1, 11.5, 7.5);
    h.tick(5);
    expect(h.sent).toEqual([]);
    h.move(1, 11.5, 4.9); // still within hysteresis
    h.tick(5);
    expect(h.sent).toEqual([]);
  });

  it('tap on a block emits select and no commands', () => {
    const h = new Harness('RGBYPG');
    const b = cellAt(h.sim, BOTTOM, 2)!;
    h.down(1, 11.5, 2.5);
    h.move(1, 11.55, 2.6);
    h.up(1, 11.55, 2.6, 80);
    expect(h.ctl.takeUiEvents()).toEqual([
      { type: 'grab', row: 11, col: 2, blockId: b.id },
      { type: 'select', row: 11, col: 2, blockId: b.id },
      { type: 'release', blockId: b.id },
    ]);
    expect(h.tick(3)).toEqual([]);
  });

  it('a drag that swapped is not a tap', () => {
    const h = new Harness('RGBYPG');
    h.down(1, 11.5, 0.5);
    h.move(1, 11.5, 1.5);
    h.tick(5);
    h.move(1, 11.5, 0.9);
    h.up(1, 11.5, 0.9);
    expect(h.ctl.takeUiEvents().map((e) => e.type)).toEqual(['grab', 'release']);
  });

  it('a held block that gets cleared is dropped from the hints', () => {
    const h = new Harness('RRGR..');
    const r = cellAt(h.sim, BOTTOM, 0)!;
    h.down(1, 11.5, 0.5);
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
    step(h.sim, [{ type: 'swap', row: 11, col: 2 }]); // → RRRG.. : the held R matches
    h.tick(200);
    expect(h.view.locate(r.id)).toBeNull();
    expect(h.ctl.hints.heldBlockId).toBeNull();
    h.move(1, 11.5, 3.5);
    expect(h.tick(3)).toEqual([]);
  });
});

describe('GestureController – rise offset', () => {
  it('hit-tests against the shifted grid', () => {
    const h = new Harness('RGBYPG', { mode: 'endless' });
    const r = cellAt(h.sim, BOTTOM, 0)!;
    h.sim.riseOffset = 8; // half a cell up
    const geo = h.geo();
    expect(geo.riseOffsetPx).toBe(20);
    // Pixel that is row 10.75 without rise is row 11.25 now → on the block.
    const y = geo.originY + 10.75 * geo.cellSize;
    h.ctl.pointerDown({ id: 1, x: geo.originX + 20, y, t: h.t }, geo);
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
    expect(h.ctl.hints.raising).toBe(false);
    h.ctl.pointerUp({ id: 1, x: geo.originX + 20, y, t: h.t + 50 }, geo);
    // The same pixel without rise is empty space → raise.
    h.sim.riseOffset = 0;
    h.ctl.pointerDown({ id: 2, x: geo.originX + 20, y, t: h.t + 100 }, h.geo());
    expect(h.ctl.hints.raising).toBe(true);
  });

  it('keeps tracking the held block when the stack rises a row', () => {
    const h = new Harness('RGBYPG', { mode: 'endless' });
    const r = cellAt(h.sim, BOTTOM, 0)!;
    h.down(1, 11.5, 0.5);
    h.down(2, 5.5, 3); // second finger: raise
    for (let i = 0; i < 30 && h.sim.stats.rowsRisen === 0; i++) h.tick();
    expect(h.sim.stats.rowsRisen).toBe(1);
    h.up(2, 5.5, 3, 0);
    for (let i = 0; i < 30 && h.sim.manualRaising; i++) h.tick();
    const at = h.view.locate(r.id)!;
    expect(at.row).toBeLessThan(BOTTOM);
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
    expect(swaps(h.sent)).toEqual([]);
    h.move(1, at.row + 0.5, 1.5);
    expect(swaps(h.tick())).toEqual([{ type: 'swap', row: at.row, col: 0 }]);
    expect(h.view.locate(r.id)).toEqual({ row: at.row, col: 1 });
  });
});

describe('GestureController – raise', () => {
  it('press on empty space raises while held', () => {
    const h = new Harness('RGBYPG', { mode: 'endless' });
    h.down(1, 5.5, 2.5);
    expect(h.ctl.hints.raising).toBe(true);
    expect(h.tick(1)).toEqual([{ type: 'raise', active: true }]);
    expect(h.sim.raiseHeld).toBe(true);
    h.tick(3);
    expect(h.sim.riseOffset).toBeGreaterThan(0);
    h.move(1, 5.6, 3.5, 300);
    h.up(1, 5.6, 3.5, 300);
    expect(h.ctl.hints.raising).toBe(false);
    expect(h.tick(1)).toEqual([{ type: 'raise', active: false }]);
    expect(h.sim.raiseHeld).toBe(false);
    expect(swaps(h.sent)).toEqual([]);
  });

  it('press below the stack (preview row and further down) raises', () => {
    for (const row of [12.5, 14]) {
      const h = new Harness('RGBYPG');
      h.down(1, row, 2.5);
      expect(h.tick(1)).toEqual([{ type: 'raise', active: true }]);
      h.up(1, row, 2.5, 500);
      expect(h.tick(1)).toEqual([{ type: 'raise', active: false }]);
    }
  });

  it('press above or beside the board does nothing', () => {
    const h = new Harness('RGBYPG');
    for (const [row, col] of [
      [-1, 2.5],
      [5, -1],
      [5, 7],
    ] as const) {
      h.down(1, row, col, 500);
      h.move(1, row, col + 0.2, 300);
      h.up(1, row, col + 0.2, 300);
    }
    expect(h.ctl.takeUiEvents()).toEqual([]);
    expect(h.tick(3)).toEqual([]);
  });

  it('a quick upward swipe anywhere gives a short raise burst (~1 row)', () => {
    const h = new Harness('RGBYPG', { mode: 'endless', gesture: { swipeBurstMs: 120 } });
    h.down(1, -1, 3); // above the board: no hold
    expect(h.peek()).toEqual([]);
    h.move(1, -1.4, 3, 16);
    h.move(1, -2.2, 3.05, 16); // 1.2 cells in 32 ms ≈ 37 cells/s
    expect(h.ctl.takeUiEvents()).toEqual([{ type: 'swipe' }]);
    expect(h.ctl.hints.raising).toBe(true);
    h.up(1, -2.4, 3.05, 16);
    const perTick = Array.from({ length: 12 }, () => h.tick());
    expect(perTick[0]).toEqual([{ type: 'raise', active: true }]);
    // The burst is timed from the last swipe sample (the up event): 120 ms ≈ 8 ticks.
    const releasedAt = perTick.findIndex((c) => c.some((x) => x.type === 'raise' && !x.active));
    expect(releasedAt).toBe(7);
    expect(raises(perTick.flat())).toHaveLength(2);
    // The sim finishes the row it started.
    h.tick(20);
    expect(h.sim.stats.rowsRisen).toBe(1);
    expect(h.sim.riseOffset).toBe(0);
  });

  it('a swipe starting on a block (before any swap) releases the block and raises', () => {
    const h = new Harness('RGBYPG', { mode: 'endless' });
    const r = cellAt(h.sim, BOTTOM, 2)!;
    h.down(1, 11.5, 2.5);
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
    h.move(1, 10.8, 2.55, 16);
    h.move(1, 9.9, 2.6, 16);
    expect(h.ctl.hints.heldBlockId).toBeNull();
    expect(h.ctl.hints.raising).toBe(true);
    expect(h.ctl.takeUiEvents().map((e) => e.type)).toEqual(['grab', 'release', 'swipe']);
    h.move(1, 9.9, 4.5, 16); // no longer a drag
    h.up(1, 9.9, 4.5, 16);
    h.tick(30);
    expect(swaps(h.sent)).toEqual([]);
    expect(h.sim.stats.rowsRisen).toBe(1);
  });

  it('a slow upward movement is not a swipe', () => {
    const h = new Harness('RGBYPG');
    h.down(1, -1, 3);
    for (let i = 1; i <= 10; i++) h.move(1, -1 - i * 0.1, 3, 50); // 2 cells/s
    h.up(1, -2, 3, 50);
    expect(h.ctl.takeUiEvents()).toEqual([]);
    expect(h.tick(5)).toEqual([]);
  });

  it('a drag that already swapped does not turn into a swipe', () => {
    const h = new Harness('RGBYPG');
    h.down(1, 11.5, 0.5);
    h.move(1, 11.5, 1.5);
    h.tick(1);
    h.move(1, 10, 1.5, 16);
    h.move(1, 8, 1.6, 16);
    expect(h.ctl.hints.raising).toBe(false);
    expect(h.ctl.hints.heldBlockId).not.toBeNull();
  });
});

describe('GestureController – multi-touch', () => {
  it('a second finger raises while the first keeps dragging', () => {
    const h = new Harness('RGBYPG', { mode: 'endless' });
    const r = cellAt(h.sim, BOTTOM, 0)!;
    h.down(1, 11.5, 0.5);
    h.down(2, 11.5, 4.5); // on a block, but a drag is already active → raise
    expect(h.ctl.activePointers).toBe(2);
    expect(h.ctl.hints).toMatchObject({ heldBlockId: r.id, raising: true });
    h.move(2, 11.5, 2.5); // moving the raise finger never swaps
    h.move(1, 11.5, 1.5);
    const cmds = h.tick();
    expect(cmds).toEqual([
      { type: 'raise', active: true },
      { type: 'swap', row: 11, col: 0 },
    ]);
    h.up(2, 11.5, 2.5, 200);
    expect(h.tick()).toEqual([{ type: 'raise', active: false }]);
    expect(h.ctl.hints.heldBlockId).toBe(r.id);
  });

  it('only one drag pointer: a second finger on a block does not drag it', () => {
    const h = new Harness('RGBYPG');
    const g = cellAt(h.sim, BOTTOM, 5)!;
    h.down(1, 11.5, 0.5);
    h.down(2, 11.5, 5.5);
    h.move(2, 11.5, 3.5);
    h.tick(10);
    expect(swaps(h.sent)).toEqual([]);
    expect(cellAt(h.sim, BOTTOM, 5)).toBe(g);
  });

  it('when the first finger is raising, a second finger on a block drags', () => {
    const h = new Harness('RGBYPG');
    h.down(1, 5.5, 0.5); // empty → raise
    h.down(2, 11.5, 0.5);
    h.move(2, 11.5, 1.5);
    expect(h.tick()).toEqual([
      { type: 'raise', active: true },
      { type: 'swap', row: 11, col: 0 },
    ]);
  });

  it('raise stays active until every raise pointer is up', () => {
    const h = new Harness('RGBYPG');
    h.down(1, 5.5, 0.5);
    h.down(2, 4.5, 3.5);
    h.up(1, 5.5, 0.5, 200);
    expect(h.ctl.hints.raising).toBe(true);
    h.up(2, 4.5, 3.5, 200);
    expect(h.ctl.hints.raising).toBe(false);
    // Pressed and released between two ticks: both edges are delivered, in order.
    expect(h.tick()).toEqual([
      { type: 'raise', active: true },
      { type: 'raise', active: false },
    ]);
  });
});

describe('GestureController – cancel / reset', () => {
  it('pointercancel drops a drag without select', () => {
    const h = new Harness('RGBYPG');
    const r = cellAt(h.sim, BOTTOM, 0)!;
    h.down(1, 11.5, 0.5);
    h.ctl.pointerCancel(1);
    expect(h.ctl.takeUiEvents()).toEqual([
      { type: 'grab', row: 11, col: 0, blockId: r.id },
      { type: 'release', blockId: r.id },
    ]);
    expect(h.ctl.hints.heldBlockId).toBeNull();
    h.ctl.pointerCancel(99); // unknown pointer: ignored
    h.move(1, 11.5, 2.5);
    expect(h.tick(3)).toEqual([]);
  });

  it('cancel and reset release the raise', () => {
    const h = new Harness('RGBYPG');
    h.down(1, 5.5, 0.5);
    h.tick();
    h.ctl.pointerCancel(1);
    expect(h.tick()).toEqual([{ type: 'raise', active: false }]);
    h.down(2, 5.5, 0.5);
    h.tick();
    h.ctl.reset();
    expect(h.ctl.activePointers).toBe(0);
    expect(h.tick()).toEqual([{ type: 'raise', active: false }]);
  });

  it('ignores moves/ups of unknown pointers', () => {
    const h = new Harness('RGBYPG');
    h.move(5, 11.5, 2.5);
    h.up(5, 11.5, 2.5);
    expect(h.tick()).toEqual([]);
    expect(h.ctl.takeUiEvents()).toEqual([]);
  });
});
