import { createMemoryStorage } from '../../../src/platform';
import { SaveManager, type SaveTimers } from '../../../src/game/save';
import { EndlessSession } from '../../../src/game/session';
import { INITIAL_UI_STATE, type GameUiState } from '../../../src/game/state';
import { createStore, type Store } from '../../../src/game/store';

/**
 * Node test harness for the game modes (`createRunMode`, `createVersusMode`): a real store, save
 * manager and session; audio / haptics / scene / loop are inert no-op stubs. `window` timers are
 * mapped onto a manual queue (`runTimers()`).
 */

/** Any property is a callable no-op that returns undefined. */
export function inert<T>(): T {
  const target = function () {
    return undefined;
  };
  const proxy: unknown = new Proxy(target, {
    get: (_t, key) => (key === 'then' ? undefined : proxy),
    apply: () => undefined,
  });
  return proxy as T;
}

export interface ModeHarness {
  store: Store<GameUiState>;
  save: SaveManager;
  session: EndlessSession;
  /** Run every pending `window.setTimeout` callback (once). */
  runTimers(): void;
  host: Record<string, unknown>;
}

export function modeHarness(): ModeHarness {
  const queue = new Map<number, () => void>();
  let id = 0;
  const timers: SaveTimers = {
    set(fn) {
      queue.set(++id, fn);
      return id;
    },
    clear(h) {
      queue.delete(h as number);
    },
  };
  const g = globalThis as unknown as { window?: unknown };
  g.window = {
    setTimeout: (fn: () => void) => timers.set(fn, 0),
    clearTimeout: (h: number | undefined) => {
      if (h !== undefined) timers.clear(h);
    },
  };
  const store = createStore<GameUiState>({ ...INITIAL_UI_STATE });
  const save = new SaveManager(createMemoryStorage(), { timers });
  const session = new EndlessSession('harness', () => null);
  const host: Record<string, unknown> = {
    store,
    save,
    session,
    audio: inert(),
    haptics: inert(),
    scene: inert(),
    loop: inert(),
    isFrozen: () => true,
    showToast: () => undefined,
    setLayoutMode: () => undefined,
    versusLayout: () => null,
    geometry: () => null,
    resetBoard: () => undefined,
    randomSeed: () => 'harness-seed',
    toMenu: () => undefined,
  };
  return {
    store,
    save,
    session,
    host,
    runTimers() {
      const fns = [...queue.values()];
      queue.clear();
      fns.forEach((f) => f());
    },
  };
}
