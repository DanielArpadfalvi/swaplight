import { cellAt, setCell } from './board';
import { SUBUNITS_PER_CELL } from './config';
import type { Block, SimEvent, SimState } from './types';

/**
 * Gravity pass, processed bottom-up so stacks move together:
 * - idle/landing block with an empty cell below → starts hovering (hoverTicks)
 * - idle/landing block on a hovering block → hovers in sync (copies its timer)
 * - idle/landing block on a falling block → falls with it
 * - hovering: timer counts down, then the block falls
 * - falling: advances by fallSpeed sub-units; moves a cell per SUBUNITS_PER_CELL;
 *   lands as soon as the cell below is solid (bottom row, or a block that is
 *   neither hovering nor falling).
 * Swapping, matched, popping and popped blocks are fixed in place and count as solid.
 */
export function applyGravity(sim: SimState, events: SimEvent[]): void {
  const { rows, cols, hoverTicks } = sim.config;
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const b = cellAt(sim, r, c);
      if (!b) continue;
      if (b.state === 'idle' || b.state === 'landing') {
        if (r === rows - 1) continue;
        const below = cellAt(sim, r + 1, c);
        if (below === null) {
          b.state = 'hovering';
          b.timer = hoverTicks;
        } else if (below.state === 'hovering') {
          b.state = 'hovering';
          b.timer = below.timer;
        } else if (below.state === 'falling') {
          b.state = 'falling';
          b.fall = below.fall;
        }
        // A block that starts hovering with hoverTicks = 0 falls right away.
        if (b.state !== 'hovering' || b.timer > 0) continue;
      }
      if (b.state === 'hovering') {
        b.timer--;
        if (b.timer > 0) continue;
        b.state = 'falling';
        b.timer = 0;
        b.fall = 0;
      }
      if (b.state === 'falling') fallBlock(sim, r, c, b, events);
    }
  }
}

function fallBlock(sim: SimState, row: number, col: number, b: Block, events: SimEvent[]): void {
  const { rows, fallSpeed } = sim.config;
  b.fall += fallSpeed;
  for (;;) {
    if (row === rows - 1) return land(sim, b, row, col, events);
    const below = cellAt(sim, row + 1, col);
    if (below !== null) {
      if (below.state === 'falling') {
        b.fall = Math.min(b.fall, below.fall);
        return;
      }
      if (below.state === 'hovering') {
        b.fall = 0;
        return;
      }
      return land(sim, b, row, col, events);
    }
    if (b.fall < SUBUNITS_PER_CELL) return;
    setCell(sim, row, col, null);
    setCell(sim, row + 1, col, b);
    row++;
    b.fall -= SUBUNITS_PER_CELL;
  }
}

function land(sim: SimState, b: Block, row: number, col: number, events: SimEvent[]): void {
  b.fall = 0;
  if (sim.config.landTicks > 0) {
    b.state = 'landing';
    b.timer = sim.config.landTicks;
  } else {
    b.state = 'idle';
    b.timer = 0;
  }
  events.push({ type: 'landed', id: b.id, row, col, chain: b.chain });
}
