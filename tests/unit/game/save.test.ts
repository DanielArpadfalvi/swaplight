import { describe, expect, it } from 'vitest';
import { createMemoryStorage, type Storage } from '../../../src/platform';
import {
  createDefaultSave,
  LEGACY_ENDLESS_BEST_KEY,
  LEGACY_LANGUAGE_KEY,
  migrateSave,
  parseSave,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_MIGRATIONS,
  SAVE_VERSION,
  SaveError,
  SaveManager,
  sanitizeSave,
  type SaveMigration,
  type SaveTimers,
} from '../../../src/game/save';
import { recordGame, statTotals } from '../../../src/game/progress';

/** Manual timers: `run()` fires every pending callback. */
function fakeTimers(): SaveTimers & { run(): void; pending: number } {
  const queue = new Map<number, () => void>();
  let id = 0;
  return {
    set(fn) {
      queue.set(++id, fn);
      return id;
    },
    clear(h) {
      queue.delete(h as number);
    },
    run() {
      const fns = [...queue.values()];
      queue.clear();
      fns.forEach((f) => f());
    },
    get pending() {
      return queue.size;
    },
  };
}

/** Storage that counts writes. */
function countingStorage(): Storage & { writes: number } {
  const inner = createMemoryStorage();
  const s = {
    writes: 0,
    get: inner.get,
    async set(key: string, value: Parameters<Storage['set']>[1]) {
      s.writes++;
      await inner.set(key, value);
    },
    remove: inner.remove,
  };
  return s;
}

describe('migrateSave', () => {
  const migrations: Record<number, SaveMigration> = {
    0: (d) => ({ ...d, a: 1 }),
    1: (d) => ({ ...d, b: (d.a as number) + 1 }),
    2: (d) => {
      const { old, ...rest } = d;
      return { ...rest, renamed: old };
    },
  };

  it('runs every step from the stored version up to the target, in order', () => {
    expect(migrateSave({ old: 'x' }, migrations, 3)).toEqual({
      version: 3,
      a: 1,
      b: 2,
      renamed: 'x',
    });
    expect(migrateSave({ version: 2, old: 'y' }, migrations, 3)).toEqual({
      version: 3,
      renamed: 'y',
    });
  });

  it('leaves current data unchanged', () => {
    expect(migrateSave({ version: 3, z: 1 }, migrations, 3)).toEqual({ version: 3, z: 1 });
  });

  it('rejects non-objects, bad versions, future versions and gaps', () => {
    expect(() => migrateSave('nope', migrations, 3)).toThrow(SaveError);
    expect(() => migrateSave([1, 2], migrations, 3)).toThrow(SaveError);
    expect(() => migrateSave({ version: -1 }, migrations, 3)).toThrow(SaveError);
    expect(() => migrateSave({ version: 1.5 }, migrations, 3)).toThrow(SaveError);
    expect(() => migrateSave({ version: 4 }, migrations, 3)).toThrow(/newer/);
    expect(() => migrateSave({ version: 0 }, { 0: migrations[0]! }, 3)).toThrow(/version 1/);
  });

  it('has a migration step for every version below the current one', () => {
    for (let v = 0; v < SAVE_VERSION; v++)
      expect(SAVE_MIGRATIONS[v], `v${v}`).toBeTypeOf('function');
  });
});

describe('sanitizeSave / parseSave', () => {
  it('round-trips a default save', () => {
    const d = createDefaultSave();
    const parsed = parseSave(JSON.parse(JSON.stringify(d)));
    expect(parsed).toEqual({ ok: true, data: d });
  });

  it('nothing stored → fresh save', () => {
    expect(parseSave(undefined)).toEqual({ ok: true, data: createDefaultSave() });
  });

  it('repairs invalid fields individually and keeps the valid ones', () => {
    const data = sanitizeSave({
      version: SAVE_VERSION,
      settings: { musicVolume: 3, sfxVolume: 'loud', haptics: false, language: 'de' },
      modes: {
        endless: { played: 3, best: 1200.7, bestChain: -2, blocksCleared: 'x' },
        bogus: 'not stats',
      },
      unlocks: ['deck.red', 7, 'deck.red', null],
      collectionSeen: 'relic.prism',
      fullVersion: 'yes',
      tutorialDone: true,
      daily: { '2026-10-06': { score: 500, attempts: 2 }, yesterday: { score: 1 } },
      runInProgress: { stage: 2, relics: ['a'] },
    });
    expect(data.settings.musicVolume).toBe(1);
    expect(data.settings.sfxVolume).toBe(0.9);
    expect(data.settings.haptics).toBe(false);
    expect(data.settings.language).toBe('auto');
    expect(data.modes.endless).toEqual({
      played: 3,
      best: 1200,
      bestChain: 0,
      bestCombo: 0,
      blocksCleared: 0,
      playTime: 0,
    });
    expect(data.modes.bogus?.played).toBe(0);
    expect(data.unlocks).toEqual(['deck.red']);
    expect(data.collectionSeen).toEqual([]);
    expect(data.fullVersion).toBe(false);
    expect(data.tutorialDone).toBe(true);
    expect(data.daily).toEqual({ '2026-10-06': { score: 500, attempts: 2 } });
    expect(data.runInProgress).toEqual({ stage: 2, relics: ['a'] });
  });

  it('reports corrupt data instead of throwing', () => {
    expect(parseSave('garbage').ok).toBe(false);
    expect(parseSave(42).ok).toBe(false);
    expect(parseSave({ version: SAVE_VERSION + 1 }).ok).toBe(false);
  });
});

describe('SaveManager', () => {
  it('starts fresh, imports the legacy best score and language, and writes once', async () => {
    const storage = countingStorage();
    await storage.set(LEGACY_ENDLESS_BEST_KEY, 4321);
    await storage.set(LEGACY_LANGUAGE_KEY, 'hu');
    storage.writes = 0;
    const timers = fakeTimers();
    const save = new SaveManager(storage, { timers });
    expect(await save.load()).toBe('fresh');
    expect(save.data.modes.endless?.best).toBe(4321);
    expect(save.data.settings.language).toBe('hu');
    timers.run();
    await save.flush();
    expect(storage.writes).toBe(1);
    const stored = await storage.get(SAVE_KEY);
    expect(stored).toMatchObject({ version: SAVE_VERSION, modes: { endless: { best: 4321 } } });
  });

  it('loads an existing save without rewriting it', async () => {
    const storage = countingStorage();
    const d = createDefaultSave();
    d.tutorialDone = true;
    await storage.set(SAVE_KEY, JSON.parse(JSON.stringify(d)));
    storage.writes = 0;
    const timers = fakeTimers();
    const save = new SaveManager(storage, { timers });
    expect(await save.load()).toBe('loaded');
    expect(save.data.tutorialDone).toBe(true);
    expect(save.hasPendingWrite).toBe(false);
    expect(timers.pending).toBe(0);
  });

  it('migrates an old-version save and persists the upgrade', async () => {
    const storage = countingStorage();
    await storage.set(SAVE_KEY, { settings: { haptics: false } }); // version 0
    const timers = fakeTimers();
    const save = new SaveManager(storage, { timers });
    expect(await save.load()).toBe('loaded');
    expect(save.data.settings.haptics).toBe(false);
    expect(save.hasPendingWrite).toBe(true);
    timers.run();
    await save.flush();
    expect(await storage.get(SAVE_KEY)).toMatchObject({ version: SAVE_VERSION });
  });

  it('recovers from corrupt data: backs it up and starts over', async () => {
    const storage = createMemoryStorage();
    await storage.set(SAVE_KEY, 'not a save');
    const save = new SaveManager(storage, { timers: fakeTimers() });
    expect(await save.load()).toBe('recovered');
    expect(save.data).toEqual(createDefaultSave());
    expect(await storage.get(SAVE_BACKUP_KEY)).toBe('not a save');
    await save.flush();
    expect(await storage.get(SAVE_KEY)).toEqual(createDefaultSave());
  });

  it('recovers when storage itself throws on read', async () => {
    const inner = createMemoryStorage();
    const storage: Storage = {
      get: async () => {
        throw new Error('io');
      },
      set: inner.set,
      remove: inner.remove,
    };
    const save = new SaveManager(storage, { timers: fakeTimers() });
    expect(await save.load()).toBe('fresh');
    expect(save.data).toEqual(createDefaultSave());
  });

  it('debounces writes: many updates → one write after the delay', async () => {
    const storage = countingStorage();
    const timers = fakeTimers();
    const save = new SaveManager(storage, { timers });
    await save.load();
    timers.run();
    await save.flush();
    storage.writes = 0;
    for (let i = 0; i < 10; i++) {
      save.update((d) => {
        d.settings.musicVolume = i / 10;
      });
    }
    expect(storage.writes).toBe(0);
    expect(timers.pending).toBe(1);
    timers.run();
    await save.flush();
    expect(storage.writes).toBe(1);
    expect(await storage.get(SAVE_KEY)).toMatchObject({ settings: { musicVolume: 0.9 } });
  });

  it('flush writes immediately and cancels the pending timer', async () => {
    const storage = countingStorage();
    const timers = fakeTimers();
    const save = new SaveManager(storage, { timers });
    await save.load();
    save.update((d) => {
      d.tutorialDone = true;
    });
    await save.flush();
    expect(timers.pending).toBe(0);
    expect(await storage.get(SAVE_KEY)).toMatchObject({ tutorialDone: true });
    const writes = storage.writes;
    await save.flush(); // nothing changed
    expect(storage.writes).toBe(writes);
  });

  it('update publishes a new object to subscribers (never mutates the old one)', async () => {
    const save = new SaveManager(createMemoryStorage(), { timers: fakeTimers() });
    await save.load();
    const before = save.data;
    const seen: boolean[] = [];
    save.subscribe((d) => seen.push(d.tutorialDone));
    save.update((d) => {
      d.tutorialDone = true;
    });
    expect(before.tutorialDone).toBe(false);
    expect(save.data.tutorialDone).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('keeps the data dirty when a write fails, and retries on the next flush', async () => {
    const inner = createMemoryStorage();
    let fail = true;
    const storage: Storage = {
      get: inner.get,
      async set(k, v) {
        if (fail) throw new Error('quota');
        await inner.set(k, v);
      },
      remove: inner.remove,
    };
    const save = new SaveManager(storage, { timers: fakeTimers() });
    await save.load();
    await save.flush();
    expect(save.hasPendingWrite).toBe(true);
    fail = false;
    await save.flush();
    expect(save.hasPendingWrite).toBe(false);
    expect(await inner.get(SAVE_KEY)).toBeDefined();
  });
});

describe('progress', () => {
  it('recordGame accumulates stats and reports new bests', () => {
    const d = createDefaultSave();
    const r = { score: 500, maxChain: 3, maxCombo: 5, blocksCleared: 40, seconds: 65 };
    expect(recordGame(d, 'endless', r)).toBe(true);
    expect(recordGame(d, 'endless', { ...r, score: 200, maxChain: 5 })).toBe(false);
    expect(recordGame(d, 'endless', { ...r, score: 900, maxCombo: 2 })).toBe(true);
    expect(d.modes.endless).toEqual({
      played: 3,
      best: 900,
      bestChain: 5,
      bestCombo: 5,
      blocksCleared: 120,
      playTime: 195,
    });
  });

  it('statTotals sums across modes', () => {
    const d = createDefaultSave();
    recordGame(d, 'endless', { score: 1, maxChain: 4, maxCombo: 6, blocksCleared: 10, seconds: 5 });
    recordGame(d, 'run', { score: 1, maxChain: 2, maxCombo: 9, blocksCleared: 7, seconds: 8 });
    expect(statTotals(d.modes)).toEqual({
      gamesPlayed: 2,
      longestChain: 4,
      biggestCombo: 9,
      blocksCleared: 17,
      playTime: 13,
    });
    expect(statTotals({}).gamesPlayed).toBe(0);
  });
});
