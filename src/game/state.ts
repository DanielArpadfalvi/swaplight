/** UI-facing game state (published by the controller, rendered by the Preact overlay). */

import type { Language } from '../i18n';
import type { ModeId } from './modes';
import type { Overlay, Screen } from './nav';
import type { ModeStats } from './save';
import { DEFAULT_SETTINGS, type Settings } from './settings';

export type { Overlay, Screen } from './nav';

export type RestoreStatus = 'idle' | 'busy' | 'restored' | 'nothing' | 'failed';

export interface Toast {
  text: string;
  /** Display time in ms. */
  ms: number;
  /** Increments per toast (restarts the animation). */
  key: number;
}

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
  /** Top of the in-game controls strip below the board (CSS px). */
  controlsTop: number;
  /** The on-screen RAISE button is held. */
  raiseHeld: boolean;
  /** Overlays stacked above the screen (settings, stats, dialogs), bottom → top. */
  overlays: Overlay[];
  settings: Settings;
  /** Current UI language (re-renders the tree on change). */
  language: Language;
  /** Lifetime stats per mode (from the save). */
  modeStats: Record<string, ModeStats>;
  fullVersion: boolean;
  restoreStatus: RestoreStatus;
  toast: Toast | null;
}

export interface GameActions {
  /** Start the Endless mode (kept for the quick-play path and tests). */
  play(): void;
  /** Start a mode from the menu (explains locked / coming-soon modes with a toast). */
  startMode(id: ModeId): void;
  pause(): void;
  resume(): void;
  /** Press (true) / release (false) the on-screen RAISE button. */
  setRaise(active: boolean): void;
  retry(): void;
  /** Quit to the main menu. */
  menu(): void;
  openOverlay(overlay: Overlay): void;
  /** Close the top overlay. */
  closeOverlay(): void;
  updateSettings(patch: Partial<Settings>): void;
  restorePurchases(): void;
  /** Same as the hardware back button / Escape. */
  back(): void;
  exitApp(): void;
}

export const INITIAL_UI_STATE: GameUiState = {
  screen: 'menu',
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
  controlsTop: 0,
  raiseHeld: false,
  overlays: [],
  settings: { ...DEFAULT_SETTINGS },
  language: 'en',
  modeStats: {},
  fullVersion: false,
  restoreStatus: 'idle',
  toast: null,
};

/** "m:ss" game clock. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
