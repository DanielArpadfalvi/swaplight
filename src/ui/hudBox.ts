import type { GameUiState } from '../game/state';

/** Narrowest HUD band (CSS px) – on small phones the HUD may be wider than the board. */
export const HUD_MIN_WIDTH = 340;
/** Gap kept between a widened HUD and the screen edges. */
const HUD_EDGE = 10;

/**
 * Box of the in-game HUD band: the board's width (centered on it), but at least
 * {@link HUD_MIN_WIDTH} px – narrow boards would otherwise squeeze the stats – and never wider
 * than the screen.
 */
export function hudRect(
  state: Pick<GameUiState, 'hudTop' | 'hudHeight' | 'boardLeft' | 'boardWidth'>,
  viewWidth: number,
  minWidth = HUD_MIN_WIDTH,
): { top: number; height: number; left: number; width: number } {
  const center = state.boardLeft + state.boardWidth / 2;
  const room = Math.max(0, viewWidth - 2 * HUD_EDGE);
  const width = Math.max(state.boardWidth, Math.min(minWidth, room));
  const left =
    width <= state.boardWidth
      ? state.boardLeft
      : Math.max(0, Math.min(Math.max(center - width / 2, HUD_EDGE), viewWidth - HUD_EDGE - width));
  return { top: state.hudTop, height: state.hudHeight, left, width };
}

/** {@link hudRect} as an inline style for the current window. */
export function hudStyle(
  state: Pick<GameUiState, 'hudTop' | 'hudHeight' | 'boardLeft' | 'boardWidth'>,
  minWidth = HUD_MIN_WIDTH,
): Record<string, string> {
  const r = hudRect(state, window.innerWidth || state.boardLeft * 2 + state.boardWidth, minWidth);
  return {
    top: `${r.top}px`,
    height: `${r.height}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
  };
}
