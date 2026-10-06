import { shuffle } from '../rng';
import type { Block, SimState } from '../types';
import {
  columnHeights,
  convertRandom,
  dominantColor,
  isRestingFree,
  removeBlocks,
  tallestColumn,
  topRow,
} from './boardOps';
import {
  CHARM_UNLOCKED,
  CHARM_FREEZE_UNTIL,
  CHARM_OVERCHARGE_UNTIL,
  MOD_HIDDEN_COLOR,
  MOD_LOCKED_COLUMNS,
  MOD_SWAP_LOCK_UNTIL,
} from './keys';
import type { CharmCtx, CharmDef } from './types';

export const MAX_CHARM_SLOTS_DEFAULT = 2;

function charm(d: Omit<CharmDef, 'i18nKey'>): CharmDef {
  return { ...d, i18nKey: `charm.${d.id}` };
}

/** Target column (clamped) or the leftmost tallest column. */
function targetColumn(sim: SimState, ctx: CharmCtx): number {
  const col = ctx.target?.col;
  if (col !== undefined && col >= 0 && col < sim.config.cols) return Math.floor(col);
  return tallestColumn(sim);
}

function columnIndices(sim: SimState, col: number): number[] {
  const { rows, cols } = sim.config;
  const out: number[] = [];
  for (let r = 0; r < rows; r++) out.push(r * cols + col);
  return out;
}

function rowIndices(sim: SimState, row: number): number[] {
  const { cols } = sim.config;
  const out: number[] = [];
  for (let c = 0; c < cols; c++) out.push(row * cols + c);
  return out;
}

/** Top block of the target column (or of the tallest column). */
function targetCell(sim: SimState, ctx: CharmCtx): number | null {
  const { rows, cols } = sim.config;
  const { row, col } = ctx.target ?? {};
  if (row !== undefined && col !== undefined && row >= 0 && row < rows && col >= 0 && col < cols) {
    return row * cols + col;
  }
  const c = targetColumn(sim, ctx);
  const h = columnHeights(sim)[c] ?? 0;
  return h > 0 ? (rows - h) * cols + c : null;
}

/**
 * Charms: one-shot actives (max 2 held by default). `apply` mutates the sim
 * deterministically (random choices use `sim.rng`) and returns false when it had no
 * effect, in which case the charm is not consumed.
 */
export const CHARMS: readonly CharmDef[] = Object.freeze([
  charm({
    id: 'purge',
    rarity: 'common',
    price: 4,
    usable: 'stage',
    desc: 'Purge: clear a column (default: the tallest).',
    apply: (sim, ctx) => removeBlocks(sim, columnIndices(sim, targetColumn(sim, ctx))) > 0,
  }),
  charm({
    id: 'undertow',
    rarity: 'common',
    price: 4,
    usable: 'stage',
    desc: 'Undertow: remove the bottom row; everything above drops.',
    apply: (sim) => removeBlocks(sim, rowIndices(sim, sim.config.rows - 1)) > 0,
  }),
  charm({
    id: 'cryo',
    rarity: 'common',
    price: 3,
    usable: 'stage',
    desc: 'Cryo: freeze the auto-rise for 5 seconds.',
    apply: (sim) => {
      const until = sim.tick + 300;
      sim.modifiers[CHARM_FREEZE_UNTIL] = Math.max(sim.modifiers[CHARM_FREEZE_UNTIL] ?? 0, until);
      return true;
    },
  }),
  charm({
    id: 'monotone',
    rarity: 'uncommon',
    price: 5,
    usable: 'stage',
    desc: 'Monotone: recolor a row (default: the bottom row) to its most common color.',
    apply: (sim, ctx) => {
      const { rows } = sim.config;
      const row = ctx.target?.row ?? rows - 1;
      if (row < 0 || row >= rows) return false;
      const blocks = rowIndices(sim, row)
        .map((i) => sim.cells[i])
        .filter((b): b is Block => isRestingFree(b) && b.kind === 'normal');
      if (blocks.length < 3) return false;
      const color = dominantColor(blocks, sim.config.colors);
      if (blocks.every((b) => b.color === color)) return false;
      for (const b of blocks) b.color = color;
      sim.matchScanPending = true;
      return true;
    },
  }),
  charm({
    id: 'kaleido',
    rarity: 'common',
    price: 3,
    usable: 'stage',
    desc: 'Kaleido: shuffle the colors of the top three rows of the stack.',
    apply: (sim) => {
      const { rows, cols } = sim.config;
      const top = topRow(sim);
      const cells: Block[] = [];
      for (let r = top; r < Math.min(rows, top + 3); r++) {
        for (let c = 0; c < cols; c++) {
          const b = sim.cells[r * cols + c];
          if (isRestingFree(b) && b.kind === 'normal') cells.push(b);
        }
      }
      if (cells.length < 2) return false;
      const colors = shuffle(
        sim.rng,
        cells.map((b) => b.color),
      );
      cells.forEach((b, k) => {
        b.color = colors[k] as number;
      });
      sim.matchScanPending = true;
      return true;
    },
  }),
  charm({
    id: 'joker',
    rarity: 'uncommon',
    price: 5,
    usable: 'stage',
    desc: 'Joker: two random blocks become wild (they match any color).',
    apply: (sim) => convertRandom(sim, 'wild', 2) > 0,
  }),
  charm({
    id: 'fuse',
    rarity: 'uncommon',
    price: 4,
    usable: 'stage',
    desc: 'Fuse: two random blocks become bombs (a matched bomb clears its 3×3 area).',
    apply: (sim) => convertRandom(sim, 'bomb', 2) > 0,
  }),
  charm({
    id: 'detonate',
    rarity: 'uncommon',
    price: 5,
    usable: 'stage',
    desc: 'Detonate: blast the 3×3 area around a block (default: top of the tallest column).',
    apply: (sim, ctx) => {
      const center = targetCell(sim, ctx);
      if (center === null) return false;
      const { rows, cols } = sim.config;
      const r0 = Math.floor(center / cols);
      const c0 = center % cols;
      const area: number[] = [];
      for (let r = Math.max(0, r0 - 1); r <= Math.min(rows - 1, r0 + 1); r++) {
        for (let c = Math.max(0, c0 - 1); c <= Math.min(cols - 1, c0 + 1); c++) {
          area.push(r * cols + c);
        }
      }
      return removeBlocks(sim, area) > 0;
    },
  }),
  charm({
    id: 'hourglass',
    rarity: 'common',
    price: 3,
    usable: 'stage',
    desc: 'Hourglass: +8 seconds of stop time.',
    apply: (sim) => {
      sim.stopTicks += 480;
      return true;
    },
  }),
  charm({
    id: 'overcharge',
    rarity: 'uncommon',
    price: 5,
    usable: 'stage',
    desc: 'Overcharge: +3 mult on every clear for 15 seconds.',
    apply: (sim) => {
      sim.modifiers[CHARM_OVERCHARGE_UNTIL] = sim.tick + 900;
      return true;
    },
  }),
  charm({
    id: 'golden_ticket',
    rarity: 'common',
    price: 4,
    usable: 'any',
    desc: 'Golden Ticket: gain 6 Szikra.',
    applyRun: (run) => {
      run.szikra += 6;
    },
  }),
  charm({
    id: 'vanish',
    rarity: 'rare',
    price: 6,
    usable: 'stage',
    desc: 'Vanish: remove every block of the most common color in the top three rows.',
    apply: (sim) => {
      const { rows, cols } = sim.config;
      const top = topRow(sim);
      const blocks: Block[] = [];
      for (let r = top; r < Math.min(rows, top + 3); r++) {
        for (let c = 0; c < cols; c++) {
          const b = sim.cells[r * cols + c];
          if (isRestingFree(b) && b.kind === 'normal') blocks.push(b);
        }
      }
      const color = dominantColor(blocks, sim.config.colors);
      if (color < 0) return false;
      const targets: number[] = [];
      sim.cells.forEach((b, i) => {
        if (b && b.kind === 'normal' && b.color === color) targets.push(i);
      });
      return removeBlocks(sim, targets) > 0;
    },
  }),
  charm({
    id: 'skeleton_key',
    rarity: 'common',
    price: 3,
    usable: 'stage',
    desc: 'Skeleton Key: unlock frozen columns and swap locks for the rest of the stage.',
    apply: (sim) => {
      const mods = sim.modifiers;
      if (mods[CHARM_UNLOCKED]) return false;
      delete mods[MOD_LOCKED_COLUMNS];
      delete mods[MOD_SWAP_LOCK_UNTIL];
      mods[CHARM_UNLOCKED] = 1;
      return true;
    },
  }),
  charm({
    id: 'lantern',
    rarity: 'common',
    price: 3,
    usable: 'stage',
    desc: 'Lantern: reveal the hidden color.',
    apply: (sim) => {
      if (sim.modifiers[MOD_HIDDEN_COLOR] === undefined) return false;
      delete sim.modifiers[MOD_HIDDEN_COLOR];
      return true;
    },
  }),
  charm({
    id: 'lifeline',
    rarity: 'rare',
    price: 5,
    usable: 'stage',
    desc: 'Lifeline: clear the top three rows of the board and refill the top-out grace.',
    apply: (sim) => {
      const { cols } = sim.config;
      const area: number[] = [];
      for (let i = 0; i < 3 * cols; i++) area.push(i);
      const removed = removeBlocks(sim, area);
      if (removed === 0) return false;
      sim.grace = sim.config.graceTicks;
      return true;
    },
  }),
]);

const BY_ID = new Map(CHARMS.map((c) => [c.id, c]));

export function getCharm(id: string): CharmDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown charm '${id}'`);
  return def;
}

export function isCharmId(id: string): boolean {
  return BY_ID.has(id);
}
