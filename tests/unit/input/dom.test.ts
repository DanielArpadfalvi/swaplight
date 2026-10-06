// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { loadAscii } from '../../../src/core/ascii';
import { createSim } from '../../../src/core/sim';
import { bindKeyboardInput, bindPointerInput } from '../../../src/input/dom';
import { geometryForSim } from '../../../src/input/geometry';
import { GestureController } from '../../../src/input/gesture';
import { KeyboardController } from '../../../src/input/keyboard';
import { createSimView } from '../../../src/input/simView';

const LAYOUT = { originX: 0, originY: 0, cellSize: 40 };

function pointer(type: string, id: number, x: number, y: number, timeStamp = 0): PointerEvent {
  const e = new PointerEvent(type, {
    pointerId: id,
    clientX: x,
    clientY: y,
    pointerType: 'touch',
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  return e;
}

describe('bindPointerInput', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.splice(0).forEach((c) => c());
    document.body.innerHTML = '';
  });

  function setup() {
    const sim = createSim('dom', {}, 'static');
    loadAscii(sim, 'RGBYPG');
    const view = createSimView(() => sim);
    const ctl = new GestureController(view);
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.style.touchAction = 'auto';
    const unbind = bindPointerInput(el, ctl, () => geometryForSim(LAYOUT, sim));
    cleanups.push(() => unbind());
    return { sim, ctl, el, unbind };
  }

  it('disables browser gestures and restores them on unbind', () => {
    const { el, unbind } = setup();
    expect(el.style.touchAction).toBe('none');
    const touch = new Event('touchmove', { cancelable: true });
    el.dispatchEvent(touch);
    expect(touch.defaultPrevented).toBe(true);
    unbind();
    expect(el.style.touchAction).toBe('auto');
    const touch2 = new Event('touchmove', { cancelable: true });
    el.dispatchEvent(touch2);
    expect(touch2.defaultPrevented).toBe(false);
  });

  it('forwards pointer events as element-relative samples', () => {
    const { ctl, el } = setup();
    const down = pointer('pointerdown', 7, 20, 11.5 * 40, 100);
    el.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(ctl.hints.heldBlockId).not.toBeNull();
    el.dispatchEvent(pointer('pointermove', 7, 1.5 * 40, 11.5 * 40, 116));
    expect(ctl.takeCommands()).toEqual([{ type: 'swap', row: 11, col: 0 }]);
    el.dispatchEvent(pointer('pointerup', 7, 1.5 * 40, 11.5 * 40, 132));
    expect(ctl.hints.heldBlockId).toBeNull();
    expect(ctl.activePointers).toBe(0);
  });

  it('pointercancel drops the pointer; unbind stops forwarding', () => {
    const { ctl, el, unbind } = setup();
    el.dispatchEvent(pointer('pointerdown', 1, 20, 13 * 40)); // below the board → raise
    expect(ctl.hints.raising).toBe(true);
    el.dispatchEvent(pointer('pointercancel', 1, 20, 13 * 40));
    expect(ctl.hints.raising).toBe(false);
    unbind();
    ctl.takeCommands();
    el.dispatchEvent(pointer('pointerdown', 2, 20, 13 * 40));
    expect(ctl.activePointers).toBe(0);
    expect(ctl.takeCommands()).toEqual([]);
  });
});

describe('bindKeyboardInput', () => {
  it('routes keys to the controller and prevents default for used keys', () => {
    const sim = createSim('kb', {}, 'static');
    loadAscii(sim, 'RGBYPG');
    const kb = new KeyboardController(createSimView(() => sim));
    const target = new EventTarget();
    const unbind = bindKeyboardInput(target, kb);
    const key = (type: string, k: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent(type, { key: k, cancelable: true, ...init });
      target.dispatchEvent(e);
      return e;
    };
    kb.setCursor(11, 0);
    expect(key('keydown', 'ArrowRight').defaultPrevented).toBe(true);
    expect(key('keydown', 'q').defaultPrevented).toBe(false);
    expect(key('keydown', 'x', { ctrlKey: true }).defaultPrevented).toBe(false);
    key('keydown', ' ');
    key('keydown', 'Shift');
    expect(kb.takeCommands()).toEqual([
      { type: 'swap', row: 11, col: 1 },
      { type: 'raise', active: true },
    ]);
    target.dispatchEvent(new Event('blur'));
    expect(kb.takeCommands()).toEqual([{ type: 'raise', active: false }]);
    unbind();
    key('keydown', 'Shift');
    expect(kb.takeCommands()).toEqual([]);
  });
});
