import { describe, expect, it } from 'vitest';
import { cellAt } from '../../../src/core/board';
import { blockRenderPos, dangerColumns } from '../../../src/core/view';
import { run, simFromAscii, swap } from './helpers';

describe('blockRenderPos', () => {
  it('returns null for empty cells and plain positions for idle blocks', () => {
    const sim = simFromAscii('R.....');
    expect(blockRenderPos(sim, 0)).toBeNull();
    expect(blockRenderPos(sim, 66)).toMatchObject({
      row: 11,
      col: 0,
      state: 'idle',
      kind: 'normal',
      color: 0,
      flashProgress: 0,
      popProgress: 0,
    });
  });

  it('includes the swap offset (continuous towards the destination)', () => {
    const sim = simFromAscii('RG....');
    swap(sim, 11, 0);
    // R is stored in (11,1) but still drawn at its origin column.
    expect(blockRenderPos(sim, 67)!.col).toBe(0);
    expect(blockRenderPos(sim, 66)!.col).toBe(1);
    run(sim, 2);
    expect(blockRenderPos(sim, 67)!.col).toBe(0.5);
    run(sim, 2);
    expect(blockRenderPos(sim, 67)!.col).toBe(1);
  });

  it('includes fall progress', () => {
    const sim = simFromAscii('R.....\n......\n......\nG.....', { fallSpeed: 4, hoverTicks: 0 });
    run(sim, 2);
    const r = cellAt(sim, 8, 0)!;
    expect(r.state).toBe('falling');
    expect(blockRenderPos(sim, 48)!.row).toBe(8 + r.fall / 16);
  });

  it('reports flash and pop progress', () => {
    const sim = simFromAscii('RRR...');
    const { flashTicks, popTicksPerBlock } = sim.config;
    const half = Math.floor(flashTicks / 2);
    run(sim, 1);
    expect(blockRenderPos(sim, 66)!.flashProgress).toBe(0);
    run(sim, half);
    expect(blockRenderPos(sim, 66)!.flashProgress).toBeCloseTo(half / flashTicks);
    run(sim, flashTicks - half);
    const first = blockRenderPos(sim, 66)!;
    expect(first.state).toBe('popped');
    expect(first.flashProgress).toBe(1);
    expect(first.popProgress).toBe(0);
    expect(blockRenderPos(sim, 68)!.state).toBe('popping');
    expect(blockRenderPos(sim, 68)!.popProgress).toBe(0);
    run(sim, 3);
    expect(blockRenderPos(sim, 66)!.popProgress).toBeCloseTo(3 / popTicksPerBlock);
    run(sim, 2 * popTicksPerBlock);
    expect(blockRenderPos(sim, 66)!.popProgress).toBe(1);
  });

  it('handles zero flash/pop durations and a block whose group is gone', () => {
    const sim = simFromAscii('RRR...', { flashTicks: 0, popTicksPerBlock: 0 });
    run(sim, 1);
    sim.cells[66]!.state = 'popped';
    sim.cells[66]!.group = 99;
    expect(blockRenderPos(sim, 66)).toMatchObject({ flashProgress: 1, popProgress: 1 });
  });
});

describe('dangerColumns', () => {
  it('lists columns whose stack reaches the top two rows', () => {
    const tall = Array.from({ length: 11 }, () => 'R.G...');
    const sim = simFromAscii(['.Y....', ...tall].join('\n'));
    expect(dangerColumns(sim)).toEqual([0, 1, 2]);
    expect(dangerColumns(sim, 1)).toEqual([1]);
    expect(dangerColumns(simFromAscii('R.....'))).toEqual([]);
  });
});
