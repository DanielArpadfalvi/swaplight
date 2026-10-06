/**
 * Screen navigation model. The base `Screen` is the game flow (menu / playing / paused / game over);
 * `Overlay`s (settings, stats, dialogs…) stack on top of it. The Android back button / Escape pops
 * the stack: `backAction` decides what it does, the controller performs it.
 */

export type Screen = 'menu' | 'playing' | 'paused' | 'gameOver';

export type Overlay = 'settings' | 'stats' | 'collection' | 'credits' | 'privacy' | 'exitConfirm';

export type BackAction =
  | { type: 'closeOverlay' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'toMenu' }
  | { type: 'confirmExit' }
  | { type: 'none' };

export function backAction(screen: Screen, overlays: readonly Overlay[]): BackAction {
  if (overlays.length > 0) return { type: 'closeOverlay' };
  switch (screen) {
    case 'playing':
      return { type: 'pause' };
    case 'paused':
      return { type: 'resume' };
    case 'gameOver':
      return { type: 'toMenu' };
    case 'menu':
      return { type: 'confirmExit' };
  }
}

/** Push `overlay` (moving it to the top if already open). */
export function pushOverlay(stack: readonly Overlay[], overlay: Overlay): Overlay[] {
  return [...stack.filter((o) => o !== overlay), overlay];
}

/** Remove the top overlay (or a specific one). */
export function popOverlay(stack: readonly Overlay[], overlay?: Overlay): Overlay[] {
  if (overlay === undefined) return stack.slice(0, -1);
  return stack.filter((o) => o !== overlay);
}

export function topOverlay(stack: readonly Overlay[]): Overlay | null {
  return stack.length > 0 ? stack[stack.length - 1]! : null;
}
