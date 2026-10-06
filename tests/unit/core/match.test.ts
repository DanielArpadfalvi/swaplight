import { describe, expect, it } from 'vitest';
import { findMatches, isMatchable } from '../../../src/core/match';
import { ofType, run, simFromAscii, swap } from './helpers';

const rc = (sim: { config: { cols: number } }, idx: number[]) =>
  idx.map((i) => [Math.floor(i / sim.config.cols), i % sim.config.cols]);

describe('findMatches', () => {
  it('finds a horizontal 3', () => {
    const sim = simFromAscii('GRRRG.');
    expect(rc(sim, findMatches(sim))).toEqual([
      [11, 1],
      [11, 2],
      [11, 3],
    ]);
  });

  it('finds a vertical 3', () => {
    const sim = simFromAscii('B.....\nB.....\nB.....\nR.....');
    expect(rc(sim, findMatches(sim))).toEqual([
      [8, 0],
      [9, 0],
      [10, 0],
    ]);
  });

  it('counts L and T shapes once per block', () => {
    const l = simFromAscii('R.....\nR.....\nRRR...');
    expect(findMatches(l)).toHaveLength(5);
    const t = simFromAscii('.Y....\n.Y....\nYYY...');
    expect(findMatches(t)).toHaveLength(5);
    const plus = simFromAscii('.G....\nGGG...\n.G....');
    expect(findMatches(plus)).toHaveLength(5);
  });

  it('counts 4 and 5 in a row, and separate simultaneous runs together', () => {
    expect(findMatches(simFromAscii('RRRRG.'))).toHaveLength(4);
    expect(findMatches(simFromAscii('BBBBB.'))).toHaveLength(5);
    expect(findMatches(simFromAscii('BBBBBB'))).toHaveLength(6);
    expect(findMatches(simFromAscii('RRRGGG'))).toHaveLength(6);
    expect(findMatches(simFromAscii('RRGRR.'))).toHaveLength(0);
  });

  it('ignores blocks that are not resting', () => {
    const sim = simFromAscii('RRR...');
    sim.cells[sim.cells.length - 6]!.state = 'swapping';
    expect(findMatches(sim)).toEqual([]);
    expect(isMatchable(null)).toBe(false);
    sim.cells[sim.cells.length - 6]!.state = 'landing';
    expect(findMatches(sim)).toHaveLength(3);
  });
});

describe('match lifecycle in the sim', () => {
  it('flashes, pops one by one with increasing index, then clears together', () => {
    const sim = simFromAscii('RRR...');
    const ev0 = run(sim, 1);
    const matched = ofType(ev0, 'matched');
    expect(matched).toHaveLength(1);
    expect(matched[0]!.combo).toBe(3);
    expect(matched[0]!.chain).toBe(1);
    expect(sim.cells.filter((b) => b?.state === 'matched')).toHaveLength(3);
    const { flashTicks, popTicksPerBlock } = sim.config;

    const flash = run(sim, flashTicks - 1);
    expect(ofType(flash, 'popped')).toHaveLength(0);
    expect(sim.cells.filter((b) => b?.state === 'matched')).toHaveLength(3);

    const popEvents = ofType(run(sim, 1), 'popped');
    expect(popEvents.map((p) => p.index)).toEqual([0]);
    expect(sim.cells.filter((b) => b?.state === 'popping')).toHaveLength(2);

    const rest = run(sim, 2 * popTicksPerBlock);
    expect(ofType(rest, 'popped').map((p) => [p.index, p.size])).toEqual([
      [1, 3],
      [2, 3],
    ]);
    expect(ofType(rest, 'cleared')).toHaveLength(0);
    expect(sim.cells.filter((b) => b?.state === 'popped')).toHaveLength(3);

    const cleared = ofType(run(sim, popTicksPerBlock), 'cleared');
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.cells).toHaveLength(3);
    expect(sim.cells.every((b) => b === null)).toBe(true);
    expect(sim.groups).toEqual([]);
  });

  it('pops in reading order (top-left first)', () => {
    const sim = simFromAscii('R.....\nR.....\nRRR...');
    const events = run(sim, 200);
    const pops = ofType(events, 'popped');
    expect(pops.map((p) => [p.row, p.col])).toEqual([
      [9, 0],
      [10, 0],
      [11, 0],
      [11, 1],
      [11, 2],
    ]);
  });

  it('a swap-made L shape is one 5-combo', () => {
    const sim = simFromAscii('..R...\n..R...\nRRGR..');
    swap(sim, 11, 2);
    const events = run(sim, sim.config.swapTicks);
    const m = ofType(events, 'matched');
    expect(m).toHaveLength(1);
    expect(m[0]!.combo).toBe(5);
  });

  it('matched blocks cannot be swapped and still support blocks above', () => {
    const sim = simFromAscii('Y.....\nRRR...\nGBY...');
    run(sim, 1);
    expect(ofType(swap(sim, 10, 0), 'swapRejected')[0]!.reason).toBe('locked');
    run(sim, 20);
    expect(sim.cells[9 * 6]!.state).toBe('idle');
  });
});
