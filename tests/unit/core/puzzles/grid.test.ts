import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../src/core/rng';
import { step } from '../../../../src/core/sim';
import { bricksBoard, randomBoard } from '../../../../src/core/puzzles/generator';
import {
  applyMove,
  gridFromAscii,
  gridFromKey,
  gridFromSim,
  gridKey,
  gridToAscii,
  hasMatch,
  isBoardSettled,
  isCandidateMove,
  isStable,
  PUZZLE_COLS,
  PUZZLE_ROWS,
  settleSim,
  simFromGrid,
  type Grid,
} from '../../../../src/core/puzzles/grid';

/** Reference: plain engine stepping, no shortcuts. */
function engineMove(g: Grid, row: number, col: number) {
  const sim = simFromGrid(g);
  settleSim(sim);
  step(sim, [{ type: 'swap', row, col }], undefined, null);
  settleSim(sim);
  return {
    ascii: gridToAscii(gridFromSim(sim)),
    chain: sim.stats.maxChain,
    combo: sim.stats.maxCombo,
  };
}

describe('puzzle grid', () => {
  it('round-trips ascii and keys', () => {
    const board = '..B...\n..R...\nBBRR..';
    const g = gridFromAscii(board);
    expect(gridToAscii(g)).toBe(board);
    expect(gridKey(gridFromKey(gridKey(g)))).toBe(gridKey(g));
    expect(isStable(g)).toBe(true);
    expect(hasMatch(g)).toBe(false);
    expect(isStable(gridFromAscii('R.....\n.GG...'))).toBe(false);
    expect(hasMatch(gridFromAscii('R.....\nR.....\nR.....'))).toBe(true);
  });

  it('settled = nothing moving, nothing clearing', () => {
    const sim = simFromGrid(gridFromAscii('RR.R..'));
    expect(isBoardSettled(sim)).toBe(false); // pending match scan
    settleSim(sim);
    expect(isBoardSettled(sim)).toBe(true);
    step(sim, [{ type: 'swap', row: PUZZLE_ROWS - 1, col: 2 }]);
    expect(isBoardSettled(sim)).toBe(false);
    settleSim(sim);
    expect(sim.cells.every((b) => b === null)).toBe(true);
  });

  it('applyMove (fast paths + skipped waits) equals plain engine stepping', () => {
    const rng = createRng('grid-equivalence');
    let boards = 0;
    let engine = 0;
    let moves = 0;
    for (let attempt = 0; boards < 80 && attempt < 1000; attempt++) {
      // Alternate random boards and scrambled triple stacks (chain-rich).
      const g =
        attempt % 2 === 0
          ? randomBoard(rng, 3 + (attempt % 3), 3 + (attempt % 4), 4 + (attempt % 3), 5)
          : bricksBoard(rng, 3 + (attempt % 3), 4 + (attempt % 4), 4 + (attempt % 3), 6, 4);
      if (!g) continue;
      boards++;
      for (let row = 0; row < PUZZLE_ROWS; row++) {
        for (let col = 0; col < PUZZLE_COLS - 1; col++) {
          if (!isCandidateMove(g, row, col)) continue;
          const fast = applyMove(g, row, col);
          const ref = engineMove(g, row, col);
          moves++;
          if (fast.engine) engine++;
          expect(gridToAscii(fast.grid)).toBe(ref.ascii);
          expect(fast.chain).toBe(ref.chain);
          expect(fast.combo).toBe(ref.combo);
        }
      }
    }
    expect(boards).toBe(80);
    expect(engine).toBeGreaterThan(0);
    expect(engine).toBeLessThan(moves);
  });
});
