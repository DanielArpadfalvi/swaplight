import { describe, expect, it } from 'vitest';
import { boardToAscii, loadAscii } from '../../../src/core/ascii';
import { createSim, step } from '../../../src/core/sim';
import type { SimInput } from '../../../src/core/types';
import { KeyboardController } from '../../../src/input/keyboard';
import { createSimView } from '../../../src/input/simView';

function setup(ascii: string, mode: 'static' | 'endless' = 'static') {
  const sim = createSim('kb', {}, mode);
  loadAscii(sim, ascii);
  const kb = new KeyboardController(createSimView(() => sim));
  const tick = (): SimInput[] => {
    kb.update();
    const cmds = kb.takeCommands();
    step(sim, cmds);
    return cmds;
  };
  return { sim, kb, tick };
}

describe('KeyboardController', () => {
  it('moves the cursor with arrows, clamped to the board (cursor is 2 wide)', () => {
    const { kb } = setup('RGB...');
    kb.setCursor(11, 0);
    expect(kb.keyDown('ArrowLeft')).toBe(true);
    expect(kb.cursor).toEqual({ row: 11, col: 0 });
    for (let i = 0; i < 10; i++) kb.keyDown('ArrowRight');
    expect(kb.cursor).toEqual({ row: 11, col: 4 });
    kb.keyDown('ArrowDown');
    expect(kb.cursor.row).toBe(11);
    for (let i = 0; i < 20; i++) kb.keyDown('ArrowUp');
    expect(kb.cursor.row).toBe(0);
    expect(kb.keyDown('a')).toBe(false);
    expect(kb.takeCommands()).toEqual([]);
  });

  it('space / x swap the cursor pair; key repeat does not swap', () => {
    const { sim, kb, tick } = setup('RGB...');
    kb.setCursor(11, 0);
    expect(kb.keyDown(' ')).toBe(true);
    expect(tick()).toEqual([{ type: 'swap', row: 11, col: 0 }]);
    expect(boardToAscii(sim)).toBe('GRB...');
    for (let i = 0; i < 4; i++) tick();
    kb.keyDown('ArrowRight');
    kb.keyDown('x');
    kb.keyDown('x', true);
    expect(tick()).toEqual([{ type: 'swap', row: 11, col: 1 }]);
    expect(boardToAscii(sim)).toBe('GBR...');
  });

  it('shift raises while held', () => {
    const { sim, kb, tick } = setup('RGBYPR', 'endless');
    kb.keyDown('Shift');
    kb.keyDown('Shift', true);
    expect(kb.isRaising).toBe(true);
    expect(tick()).toEqual([{ type: 'raise', active: true }]);
    expect(sim.raiseHeld).toBe(true);
    expect(sim.riseOffset).toBeGreaterThan(0);
    expect(kb.keyUp('Shift')).toBe(true);
    expect(kb.keyUp('ArrowLeft')).toBe(false);
    expect(tick()).toEqual([{ type: 'raise', active: false }]);
    kb.releaseAll();
    expect(kb.takeCommands()).toEqual([]);
  });

  it('the cursor follows the stack when a row rises', () => {
    const { sim, kb, tick } = setup('RGBYPR', 'endless');
    kb.setCursor(11, 2);
    kb.keyDown('Shift');
    for (let i = 0; i < 20 && sim.stats.rowsRisen === 0; i++) tick();
    expect(sim.stats.rowsRisen).toBe(1);
    expect(kb.cursor).toEqual({ row: 11, col: 2 }); // updated on the next tick
    tick();
    expect(kb.cursor).toEqual({ row: 10, col: 2 });
  });
});
