import { columnTops } from './board';
import { SUBUNITS_PER_CELL } from './config';
import { findSlab } from './garbage';
import type { BlockKind, BlockState, GarbageSlab, SimState } from './types';

/**
 * Pure render helpers. They never mutate the sim.
 *
 * Interpolation contract: the renderer tracks blocks by `id` across ticks.
 * Within a tick, `blockRenderPos` already includes swap offsets and fall
 * progress, so positions are continuous from tick to tick except:
 * - a block moves to a new grid index (swap, fall, row rise) – the returned
 *   fractional row/col stays continuous because the offsets compensate;
 * - a row rises: every block's `row` drops by 1 while `riseFraction(sim)` wraps
 *   from ~1 to 0, so `row - riseFraction(sim)` (screen row) is continuous.
 * Draw at screen row `row - riseFraction(sim)`; the preview row sits at `rows`.
 * Blocks never move up relative to the grid except through the rise.
 */

export interface BlockRenderPos {
  id: number;
  kind: BlockKind;
  color: number;
  state: BlockState;
  chain: boolean;
  /** Grid row incl. fall progress (not incl. rise). */
  row: number;
  /** Grid column incl. the swap offset. */
  col: number;
  /**
   * 0..1 through the match flash (1 once popping/popped, 0 otherwise). For garbage
   * cells: 0..1 through the slab's conversion.
   */
  flashProgress: number;
  /** 0 until the block pops, then 0..1 over `popTicksPerBlock` ticks. */
  popProgress: number;
}

/**
 * Render position of the block at cell `index`, or null for an empty cell. Pass `out` to fill
 * (and return) a reused object instead of allocating one (per-frame rendering).
 */
export function blockRenderPos(
  sim: SimState,
  index: number,
  out?: BlockRenderPos,
): BlockRenderPos | null {
  const b = sim.cells[index];
  if (!b) return null;
  const { cols, swapTicks, flashTicks, popTicksPerBlock } = sim.config;
  const gridRow = Math.floor(index / cols);
  const gridCol = index % cols;
  const row = b.state === 'falling' ? gridRow + b.fall / SUBUNITS_PER_CELL : gridRow;
  const col = b.state === 'swapping' ? gridCol - (b.swapDir * b.timer) / swapTicks : gridCol;
  let flashProgress = 0;
  let popProgress = 0;
  if (b.slab !== 0) {
    const slab = findSlab(sim, b.slab);
    if (slab && slab.state === 'converting' && slab.convertTicks > 0) {
      flashProgress = 1 - slab.timer / slab.convertTicks;
    }
  } else if (b.group !== 0) {
    const group = sim.groups.find((g) => g.id === b.group);
    const age = group ? group.age : 0;
    flashProgress = flashTicks > 0 ? Math.min(1, age / flashTicks) : 1;
    if (b.state === 'popping' || b.state === 'popped') flashProgress = 1;
    if (b.state === 'popped') {
      const since = age - (flashTicks + b.popIndex * popTicksPerBlock);
      popProgress = popTicksPerBlock > 0 ? Math.min(1, Math.max(0, since / popTicksPerBlock)) : 1;
    }
  }
  if (out) {
    out.id = b.id;
    out.kind = b.kind;
    out.color = b.color;
    out.state = b.state;
    out.chain = b.chain;
    out.row = row;
    out.col = col;
    out.flashProgress = flashProgress;
    out.popProgress = popProgress;
    return out;
  }
  return {
    id: b.id,
    kind: b.kind,
    color: b.color,
    state: b.state,
    chain: b.chain,
    row,
    col,
    flashProgress,
    popProgress,
  };
}

/**
 * Columns whose stack reaches within `rowsFromTop` rows of the ceiling
 * (default 2: a block in row 0 or 1) – for warning visuals / audio.
 */
export function dangerColumns(sim: SimState, rowsFromTop = 2): number[] {
  const tops = columnTops(sim);
  const result: number[] = [];
  for (let c = 0; c < tops.length; c++) if ((tops[c] as number) < rowsFromTop) result.push(c);
  return result;
}

export interface SlabRenderPos {
  id: number;
  /** Top row incl. fall progress (not incl. rise). */
  row: number;
  col: number;
  width: number;
  height: number;
  state: GarbageSlab['state'];
  /** 0..1 through the conversion flash (0 unless converting). */
  convertProgress: number;
}

/** Render rectangles of every garbage slab (draw one framed slab per entry). */
export function slabRenderPositions(sim: SimState): SlabRenderPos[] {
  return sim.garbage.map((s) => ({
    id: s.id,
    row: s.row + (s.state === 'falling' ? s.fall / SUBUNITS_PER_CELL : 0),
    col: s.col,
    width: s.width,
    height: s.height,
    state: s.state,
    convertProgress:
      s.state === 'converting' && s.convertTicks > 0 ? 1 - s.timer / s.convertTicks : 0,
  }));
}
