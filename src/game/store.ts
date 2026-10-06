/** Minimal observable store shared by the game controller and the Preact UI. */
export interface Store<T> {
  get(): T;
  /** Shallow-merge `patch`; listeners run only when a field actually changed. */
  set(patch: Partial<T>): void;
  subscribe(listener: (state: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T) => void>();
  return {
    get: () => state,
    set(patch) {
      let changed = false;
      for (const key of Object.keys(patch) as (keyof T)[]) {
        if (!Object.is(state[key], patch[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      for (const l of [...listeners]) l(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
