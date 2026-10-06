import { RISE_SCALE, SUBUNITS_PER_CELL } from './config';
import type { Block, SimState } from './types';

/**
 * Structural invariants that must hold between steps. Returns a list of
 * human-readable violations (empty = OK). Used by tests and debug builds.
 */
export function checkInvariants(sim: SimState): string[] {
  const errors: string[] = [];
  const { rows, cols } = sim.config;
  if (sim.cells.length !== rows * cols) errors.push(`cells length ${sim.cells.length}`);
  if (sim.preview.length !== cols) errors.push(`preview length ${sim.preview.length}`);
  if (sim.riseOffset < 0 || sim.riseOffset >= SUBUNITS_PER_CELL) {
    errors.push(`riseOffset ${sim.riseOffset}`);
  }
  if (sim.riseAccum < 0 || sim.riseAccum >= RISE_SCALE) errors.push(`riseAccum ${sim.riseAccum}`);
  if (sim.chain < 1) errors.push(`chain ${sim.chain}`);

  const ids = new Set<number>();
  const groupCounts = new Map<number, number>();
  const slabCounts = new Map<number, number>();
  const seen = (id: number, where: string) => {
    if (ids.has(id)) errors.push(`duplicate block id ${id} (${where})`);
    ids.add(id);
    if (id >= sim.nextBlockId) errors.push(`block id ${id} >= nextBlockId`);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = sim.cells[r * cols + c];
      if (!b) continue;
      const at = `${r},${c}`;
      seen(b.id, at);
      if (b.color < 0 || b.color >= sim.config.colors) errors.push(`bad color at ${at}`);
      if ((b.kind === 'garbage') !== (b.slab !== 0))
        errors.push(`garbage kind/slab mismatch at ${at}`);
      if (b.slab !== 0) {
        slabCounts.set(b.slab, (slabCounts.get(b.slab) ?? 0) + 1);
        if (b.group !== 0) errors.push(`garbage cell in a match group at ${at}`);
        continue;
      }
      const inGroup = b.state === 'matched' || b.state === 'popping' || b.state === 'popped';
      if (inGroup !== (b.group !== 0)) errors.push(`group/state mismatch at ${at}`);
      if (b.group !== 0) groupCounts.set(b.group, (groupCounts.get(b.group) ?? 0) + 1);
      if (b.state === 'hovering' && b.timer <= 0) errors.push(`hover timer at ${at}`);
      if (b.state === 'swapping' && b.timer <= 0) errors.push(`swap timer at ${at}`);
      if (b.state !== 'falling' && b.fall !== 0) errors.push(`fall progress at ${at}`);
      if (b.state === 'falling' && b.fall > 0 && r < rows - 1) {
        const below = sim.cells[(r + 1) * cols + c];
        if (below && (below.state !== 'falling' || below.fall < b.fall)) {
          errors.push(`falling block overlaps the block below at ${at}`);
        }
      }
      if ((b.state === 'idle' || b.state === 'landing') && r < rows - 1) {
        const below = sim.cells[(r + 1) * cols + c];
        if (!below) errors.push(`floating ${b.state} block at ${at}`);
        else if (below.state === 'hovering' || below.state === 'falling') {
          errors.push(`${b.state} block on ${below.state} block at ${at}`);
        }
      }
    }
  }
  for (const b of sim.preview) {
    seen(b.id, 'preview');
    if (b.state !== 'idle') errors.push(`preview block ${b.id} is ${b.state}`);
  }
  for (const g of sim.groups) {
    const count = groupCounts.get(g.id) ?? 0;
    if (count !== g.size) errors.push(`group ${g.id} has ${count}/${g.size} blocks`);
    if (g.cells.length !== g.size || g.cells.some((i) => sim.cells[i]?.group !== g.id)) {
      errors.push(`group ${g.id} cell list mismatch`);
    }
    groupCounts.delete(g.id);
  }
  for (const id of groupCounts.keys()) errors.push(`blocks reference unknown group ${id}`);
  checkGarbage(sim, errors, slabCounts);
  return errors;
}

const SLAB_CELL_STATE = {
  idle: 'idle',
  hovering: 'hovering',
  falling: 'falling',
  landing: 'landing',
  converting: 'matched',
} as const;

function checkGarbage(sim: SimState, errors: string[], slabCounts: Map<number, number>): void {
  const { rows, cols } = sim.config;
  const slabIds = new Set<number>();
  for (const s of sim.garbage) {
    const name = `slab ${s.id}`;
    if (slabIds.has(s.id)) errors.push(`duplicate ${name}`);
    slabIds.add(s.id);
    if (s.id >= sim.nextSlabId) errors.push(`${name} id >= nextSlabId`);
    if (
      s.width < 1 ||
      s.height < 1 ||
      s.row < 0 ||
      s.col < 0 ||
      s.row + s.height > rows ||
      s.col + s.width > cols
    ) {
      errors.push(`${name} out of bounds`);
      continue;
    }
    const count = slabCounts.get(s.id) ?? 0;
    if (count !== s.width * s.height)
      errors.push(`${name} has ${count}/${s.width * s.height} cells`);
    slabCounts.delete(s.id);
    const cellState = SLAB_CELL_STATE[s.state];
    for (let r = s.row; r < s.row + s.height; r++) {
      for (let c = s.col; c < s.col + s.width; c++) {
        const b = sim.cells[r * cols + c];
        if (!b || b.slab !== s.id) {
          errors.push(`${name} cell ${r},${c} missing`);
          continue;
        }
        if (b.state !== cellState || b.fall !== s.fall)
          errors.push(`${name} cell ${r},${c} out of sync`);
      }
    }
    if ((s.state === 'hovering' || s.state === 'converting') && s.timer <= 0) {
      errors.push(`${name} ${s.state} timer`);
    }
    if (s.state !== 'falling' && s.fall !== 0) errors.push(`${name} fall progress`);
    const bottom = s.row + s.height - 1;
    if (bottom < rows - 1 && (s.state === 'idle' || s.state === 'landing')) {
      let solid = false;
      for (let c = s.col; c < s.col + s.width; c++) {
        const b: Block | null | undefined = sim.cells[(bottom + 1) * cols + c];
        if (b && b.state !== 'hovering' && b.state !== 'falling') solid = true;
      }
      if (!solid) errors.push(`floating ${s.state} ${name}`);
    }
  }
  for (const id of slabCounts.keys()) errors.push(`cells reference unknown slab ${id}`);
  const queueIds = new Set<number>();
  for (const q of sim.garbageQueue) {
    if (q.width < 1 || q.width > cols || q.height < 1 || q.delay < 0) {
      errors.push(`bad queued garbage ${q.id}`);
    }
    if (queueIds.has(q.id) || slabIds.has(q.id)) errors.push(`duplicate garbage id ${q.id}`);
    queueIds.add(q.id);
    if (q.id >= sim.nextSlabId) errors.push(`queued garbage id ${q.id} >= nextSlabId`);
  }
}
