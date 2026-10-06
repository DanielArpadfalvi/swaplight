import type { SimState } from '../core/types';
import type { Overlay, Screen } from './nav';
import type { DailyTestApi } from './dailyMode';
import type { RunTestApi } from './runMode';
import type { PlayMode } from './state';
import type { VersusTestApi } from './versusMode';
import type { SaveData } from './save';

/** Test / debug hooks, exposed as `window.__swaplight` in dev builds or with `?test`. */
export interface SwaplightTestApi {
  ready: boolean;
  /** Start a game from the title screen (or restart). */
  start(): void;
  /** Freeze real-time stepping (no pause overlay); use `stepTicks` to advance. */
  pause(): void;
  /** Return to real-time stepping. */
  resume(): void;
  /** Run `n` simulation ticks synchronously (deterministic). */
  stepTicks(n: number): void;
  /** Queue a swap of (row, col) ↔ (row, col + 1) for the next tick. */
  swap(row: number, col: number): void;
  getState(): SwaplightStateSummary;
  /** A plain-data copy of the full sim state (for running core logic in the test runner). */
  getSim(): SimState;
  /** Deep copy of the in-memory save. */
  getSave(): SaveData;
  /** Write pending save changes now. */
  flushSave(): Promise<void>;
  /** Simulate the Android back button / Escape. */
  back(): void;
  getRenderInfo(): { boardVisible: boolean; palette: string; reducedMotion: boolean };
  /** Center of a grid cell in canvas CSS pixels (at the current rise offset). */
  cellCenter(row: number, col: number): { x: number; y: number };
  /**
   * Stop the real-time render loop (Pixi ticker). Software WebGL redrawing continuously can starve
   * `page.screenshot`; freeze, then `renderFrames` to draw deterministic frames.
   */
  stopRendering(): void;
  startRendering(): void;
  /** Draw `n` frames advancing effects by `dtMs` each (sim only steps if not frozen). */
  renderFrames(n: number, dtMs?: number): void;
  /** Run-mode hooks (start a run with a seed / deck, force-win stages, shop, charms…). */
  run?: RunTestApi;
  /** Versus CPU hooks (start with a seed / level, scripted garbage, force win / lose…). */
  versus?: VersusTestApi;
  /** Daily Challenge hooks (fix the date, start, finish…). */
  daily?: DailyTestApi;
  /** Grant / revoke the Full Version entitlement (mock store). */
  setFullVersion?(on: boolean): void;
}

export interface SwaplightStateSummary {
  screen: Screen;
  mode: PlayMode;
  overlays: Overlay[];
  /** The on-screen RAISE button is held. */
  raiseButton: boolean;
  seed: string;
  tick: number;
  score: number;
  level: number;
  chain: number;
  danger: boolean;
  gameOver: boolean;
  frozen: boolean;
  stats: SimState['stats'];
  eventCounts: Record<string, number>;
  sprites: number;
  layout: { cellSize: number; originX: number; originY: number };
}

declare global {
  interface Window {
    __swaplight?: SwaplightTestApi;
  }
}
