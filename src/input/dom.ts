import type { BoardGeometry } from './geometry';
import type { GestureController, PointerSample } from './gesture';
import type { KeyboardController } from './keyboard';

/**
 * Attach pointer events of `element` to a GestureController. Coordinates are CSS pixels relative
 * to the element's top-left corner (so `getGeometry` must use the same space); timestamps are
 * `event.timeStamp` (performance.now clock — pass `performance.now()` to `controller.update`).
 * Disables browser panning/zooming on the element. Returns an unbind function.
 */
export function bindPointerInput(
  element: HTMLElement,
  controller: GestureController,
  getGeometry: () => BoardGeometry,
): () => void {
  const sample = (e: PointerEvent): PointerSample => {
    const rect = element.getBoundingClientRect();
    return { id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp };
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      element.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic/inactive pointers; events still arrive while over the element.
    }
    controller.pointerDown(sample(e), getGeometry());
    if (e.cancelable) e.preventDefault();
  };
  const onMove = (e: PointerEvent) => controller.pointerMove(sample(e), getGeometry());
  const onUp = (e: PointerEvent) => {
    controller.pointerUp(sample(e), getGeometry());
    try {
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };
  const onCancel = (e: PointerEvent) => controller.pointerCancel(e.pointerId);
  const block = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };

  const prevTouchAction = element.style.touchAction;
  const prevUserSelect = element.style.userSelect;
  element.style.touchAction = 'none';
  element.style.userSelect = 'none';

  const listeners: [string, EventListener, AddEventListenerOptions?][] = [
    ['pointerdown', onDown as EventListener],
    ['pointermove', onMove as EventListener],
    ['pointerup', onUp as EventListener],
    ['pointercancel', onCancel as EventListener],
    ['lostpointercapture', onCancel as EventListener],
    ['touchstart', block, { passive: false }],
    ['touchmove', block, { passive: false }],
    ['contextmenu', block],
  ];
  for (const [type, fn, opts] of listeners) element.addEventListener(type, fn, opts);

  return () => {
    for (const [type, fn, opts] of listeners) element.removeEventListener(type, fn, opts);
    element.style.touchAction = prevTouchAction;
    element.style.userSelect = prevUserSelect;
    controller.reset();
  };
}

/** Attach keyboard events (typically `window`) to a KeyboardController. Returns an unbind. */
export function bindKeyboardInput(target: EventTarget, controller: KeyboardController): () => void {
  const onDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.ctrlKey || ke.metaKey || ke.altKey) return;
    if (controller.keyDown(ke.key, ke.repeat)) ke.preventDefault();
  };
  const onUp = (e: Event) => {
    if (controller.keyUp((e as KeyboardEvent).key)) e.preventDefault();
  };
  const onBlur = () => controller.releaseAll();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', onBlur);
    controller.releaseAll();
  };
}
