import { RISE_SCALE, SUBUNITS_PER_CELL } from './config';
import type { SimState } from './types';

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
      const inGroup = b.state === 'matched' || b.state === 'popping' || b.state === 'popped';
      if (inGroup !== (b.group !== 0)) errors.push(`group/state mismatch at ${at}`);
      if (b.group !== 0) groupCounts.set(b.group, (groupCounts.get(b.group) ?? 0) + 1);
      if (b.state === 'hovering' && b.timer <= 0) errors.push(`hover timer at ${at}`);
      if (b.state === 'swapping' && b.timer <= 0) errors.push(`swap timer at ${at}`);
      if (b.state !== 'falling' && b.fall !== 0) errors.push(`fall progress at ${at}`);
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
    groupCounts.delete(g.id);
  }
  for (const id of groupCounts.keys()) errors.push(`blocks reference unknown group ${id}`);
  return errors;
}
