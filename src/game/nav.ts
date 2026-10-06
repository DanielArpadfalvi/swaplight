/**
 * Screen navigation model. The base `Screen` is the game flow (menu / playing / paused / game over);
 * `Overlay`s (settings, stats, dialogs…) stack on top of it. The Android back button / Escape pops
 * the stack: `backAction` decides what it does, the controller performs it.
 */

export type Screen =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'gameOver'
  // Run mode flow (in-stage play reuses 'playing' / 'paused').
  | 'runSetup'
  | 'runMap'
  | 'stageIntro'
  | 'stageResult'
  | 'shop'
  | 'runEnd'
  // Versus CPU / Daily Challenge (play reuses 'playing' / 'paused').
  | 'versusSetup'
  | 'versusResult'
  | 'dailyIntro'
  | 'dailyResult';

export type Overlay =
  'settings' | 'stats' | 'collection' | 'credits' | 'privacy' | 'exitConfirm' | 'abandonConfirm';

/** Screens that show the board canvas (the others show only the backdrop). */
export function showsBoard(screen: Screen): boolean {
  return (
    screen === 'playing' ||
    screen === 'paused' ||
    screen === 'gameOver' ||
    screen === 'stageIntro' ||
    screen === 'stageResult' ||
    screen === 'versusResult' ||
    screen === 'dailyIntro' ||
    screen === 'dailyResult'
  );
}

export type BackAction =
  | { type: 'closeOverlay' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'toMenu' }
  | { type: 'toRunMap' }
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
    case 'runSetup':
    case 'runMap':
    case 'shop':
    case 'runEnd':
    case 'versusSetup':
    case 'versusResult':
    case 'dailyIntro':
    case 'dailyResult':
      return { type: 'toMenu' };
    case 'stageIntro':
      return { type: 'toRunMap' };
    case 'stageResult':
      return { type: 'none' };
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
