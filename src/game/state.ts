/** UI-facing game state (published by the controller, rendered by the Preact overlay). */

export type Screen = 'title' | 'playing' | 'paused' | 'gameOver';

export interface ScoreFlash {
  base: number;
  mult: number;
  total: number;
  chain: number;
  combo: number;
  /** Increments on every scored clear (restarts the chip animation). */
  key: number;
}

export interface GameUiState {
  screen: Screen;
  score: number;
  level: number;
  /** Whole seconds played. */
  seconds: number;
  best: number;
  maxChain: number;
  newBest: boolean;
  /** Stack pinned against the ceiling. */
  danger: boolean;
  scoreFlash: ScoreFlash | null;
  /** HUD band placement in CSS px (from the board layout). */
  hudTop: number;
  hudHeight: number;
  boardLeft: number;
  boardWidth: number;
}

export interface GameActions {
  play(): void;
  pause(): void;
  resume(): void;
  retry(): void;
  menu(): void;
}

export const INITIAL_UI_STATE: GameUiState = {
  screen: 'title',
  score: 0,
  level: 1,
  seconds: 0,
  best: 0,
  maxChain: 1,
  newBest: false,
  danger: false,
  scoreFlash: null,
  hudTop: 0,
  hudHeight: 160,
  boardLeft: 0,
  boardWidth: 300,
};

/** "m:ss" game clock. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
