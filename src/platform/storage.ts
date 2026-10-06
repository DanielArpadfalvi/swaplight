import { Preferences } from '@capacitor/preferences';
import type { JsonValue, Storage } from './types';

const DEFAULT_PREFIX = 'swaplight:';

function parse<T>(raw: string | null | undefined): T | undefined {
  if (raw === null || raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Volatile in-memory storage (tests, and fallback when localStorage is unusable). */
export function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get: async <T extends JsonValue>(key: string) => parse<T>(data.get(key)),
    set: async (key, value) => {
      data.set(key, JSON.stringify(value));
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

/** Minimal subset of the DOM `Storage` API we rely on. */
export type WebStorageBackend = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultBackend(): WebStorageBackend | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    // Accessing localStorage can throw (e.g. disabled cookies, sandboxed iframes).
    return undefined;
  }
}

/**
 * localStorage-backed storage. Any failing backend call (missing, disabled,
 * quota exceeded) permanently switches this instance to in-memory mode, seeded
 * with nothing; values written in-memory remain readable for the session.
 */
export function createWebStorage(
  backend: WebStorageBackend | undefined = defaultBackend(),
  prefix = DEFAULT_PREFIX,
): Storage {
  const memory = createMemoryStorage();
  let usable = backend !== undefined;

  const run = <R>(op: (b: WebStorageBackend) => R): { ok: true; value: R } | { ok: false } => {
    if (!usable || !backend) return { ok: false };
    try {
      return { ok: true, value: op(backend) };
    } catch {
      usable = false;
      return { ok: false };
    }
  };

  return {
    async get<T extends JsonValue>(key: string) {
      const r = run((b) => b.getItem(prefix + key));
      return r.ok ? parse<T>(r.value) : memory.get<T>(key);
    },
    async set(key, value) {
      const r = run((b) => b.setItem(prefix + key, JSON.stringify(value)));
      if (!r.ok) await memory.set(key, value);
    },
    async remove(key) {
      run((b) => b.removeItem(prefix + key));
      await memory.remove(key);
    },
  };
}

/** Native storage via @capacitor/preferences (survives app updates, not cleared by WebView). */
export function createNativeStorage(prefix = DEFAULT_PREFIX): Storage {
  return {
    async get<T extends JsonValue>(key: string) {
      const { value } = await Preferences.get({ key: prefix + key });
      return parse<T>(value);
    },
    async set(key, value) {
      await Preferences.set({ key: prefix + key, value: JSON.stringify(value) });
    },
    async remove(key) {
      await Preferences.remove({ key: prefix + key });
    },
  };
}
