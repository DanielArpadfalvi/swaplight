import type { JsonValue, Storage } from '../platform/types';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings';

/**
 * Versioned save game, persisted as one JSON document through the platform {@link Storage}.
 *
 * - `SAVE_VERSION` is bumped whenever the shape changes; add a step to `SAVE_MIGRATIONS` that turns
 *   version N-1 data into version N (steps run in order, oldest first).
 * - After migration every field is sanitized against its default, so a partially damaged or
 *   hand-edited save still loads (unknown/invalid fields fall back to defaults).
 * - Unreadable data (not an object, newer than this build, a migration that throws) is copied to
 *   `SAVE_BACKUP_KEY` and replaced with a fresh save, so the game always boots.
 * - Writes are debounced (`SaveManager.update`); call `flush()` when the app goes to background.
 */

export const SAVE_KEY = 'save';
/** Where an unreadable save is parked (for support / manual recovery) before starting fresh. */
export const SAVE_BACKUP_KEY = 'save.corrupt';
export const SAVE_VERSION = 2;
/** Pre-save-system key of the Endless best score (M2), imported once into a fresh save. */
export const LEGACY_ENDLESS_BEST_KEY = 'endless.best';
/** Language override key (still written by `src/i18n`), imported once into a fresh save. */
export const LEGACY_LANGUAGE_KEY = 'settings.language';

/** Lifetime stats of one mode. */
export interface ModeStats {
  played: number;
  best: number;
  bestChain: number;
  bestCombo: number;
  blocksCleared: number;
  /** Whole seconds of play. */
  playTime: number;
}

export interface DailyResult {
  score: number;
  /** Attempts on that day. */
  attempts: number;
}

/** Best result of one solved puzzle (keyed by puzzle id in {@link SaveData.puzzles}). */
export interface PuzzleRecord {
  /** Best star rating 1..3. */
  stars: number;
  /** Fewest swaps used in a solve. */
  moves: number;
}

export interface SaveData {
  version: number;
  settings: Settings;
  /** Per-mode stats, keyed by mode id (`run`, `endless`, …). */
  modes: Record<string, ModeStats>;
  /** Ids of content unlocked by play (decks, brightness levels, themes…). */
  unlocks: string[];
  /** Ids of collection entries (relics, charms, bosses…) the player has seen. */
  collectionSeen: string[];
  /** Last known entitlement, so locks render correctly before the store answers. */
  fullVersion: boolean;
  tutorialDone: boolean;
  /** One-time hints already shown (e.g. `endless.controls`). */
  hintsSeen: string[];
  /** Best daily-challenge results, keyed by `YYYY-MM-DD`. */
  daily: Record<string, DailyResult>;
  /** Serialized in-progress Run (owned by the Run mode; opaque here). */
  runInProgress: JsonValue;
  /** Solved puzzles, keyed by puzzle id (`p1-01`…). Added in save version 2. */
  puzzles: Record<string, PuzzleRecord>;
}

export const EMPTY_MODE_STATS: Readonly<ModeStats> = {
  played: 0,
  best: 0,
  bestChain: 0,
  bestCombo: 0,
  blocksCleared: 0,
  playTime: 0,
};

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    modes: {},
    unlocks: [],
    collectionSeen: [],
    fullVersion: false,
    tutorialDone: false,
    hintsSeen: [],
    daily: {},
    runInProgress: null,
    puzzles: {},
  };
}

// ------------------------------------------------------------------ migrations

type RawSave = Record<string, unknown>;

/** `SAVE_MIGRATIONS[n]` upgrades a version-n save to version n+1. */
export type SaveMigration = (data: RawSave) => RawSave;

/**
 * Version 0 = the M2 era (no versioned document). Nothing to transform: the legacy best score is
 * imported separately because it lived under its own key.
 */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  0: (data) => ({ ...data }),
  // v2: puzzle progress.
  1: (data) => ({ ...data, puzzles: isRecord(data.puzzles) ? data.puzzles : {} }),
};

export class SaveError extends Error {}

/**
 * Bring `raw` up to `target` by running the migration steps in order. Throws {@link SaveError} if
 * the data is not an object, is newer than `target`, or a step is missing.
 */
export function migrateSave(
  raw: unknown,
  migrations: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS,
  target: number = SAVE_VERSION,
): RawSave {
  if (!isRecord(raw)) throw new SaveError('save is not an object');
  const v = raw.version === undefined ? 0 : raw.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new SaveError(`invalid save version: ${String(v)}`);
  }
  if (v > target) throw new SaveError(`save version ${v} is newer than ${target}`);
  let data: RawSave = { ...raw };
  for (let from = v; from < target; from++) {
    const step = migrations[from];
    if (!step) throw new SaveError(`no migration from version ${from}`);
    data = step(data);
    if (!isRecord(data)) throw new SaveError(`migration ${from} returned a non-object`);
    data.version = from + 1;
  }
  return data;
}

// ------------------------------------------------------------------ sanitizing

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string'))];
}

function isJson(v: unknown, depth = 0): v is JsonValue {
  if (depth > 32) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isJson(x, depth + 1));
  if (isRecord(v)) return Object.values(v).every((x) => isJson(x, depth + 1));
  return false;
}

export function sanitizeModeStats(v: unknown): ModeStats {
  const r = isRecord(v) ? v : {};
  return {
    played: count(r.played),
    best: count(r.best),
    bestChain: count(r.bestChain),
    bestCombo: count(r.bestCombo),
    blocksCleared: count(r.blocksCleared),
    playTime: count(r.playTime),
  };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizePuzzleRecords(v: unknown): Record<string, PuzzleRecord> {
  const out: Record<string, PuzzleRecord> = {};
  if (!isRecord(v)) return out;
  for (const [id, r] of Object.entries(v)) {
    if (!isRecord(r)) continue;
    const stars = Math.min(3, count(r.stars));
    if (stars < 1) continue;
    out[id] = { stars, moves: count(r.moves) };
  }
  return out;
}

/** Coerce migrated data into a valid {@link SaveData}; invalid fields fall back to defaults. */
export function sanitizeSave(raw: RawSave): SaveData {
  const base = createDefaultSave();
  const modes: Record<string, ModeStats> = {};
  if (isRecord(raw.modes)) {
    for (const [id, stats] of Object.entries(raw.modes)) modes[id] = sanitizeModeStats(stats);
  }
  const daily: Record<string, DailyResult> = {};
  if (isRecord(raw.daily)) {
    for (const [date, r] of Object.entries(raw.daily)) {
      if (!DATE_KEY.test(date) || !isRecord(r)) continue;
      daily[date] = { score: count(r.score), attempts: count(r.attempts) };
    }
  }
  return {
    version: SAVE_VERSION,
    settings: sanitizeSettings(raw.settings),
    modes,
    unlocks: stringList(raw.unlocks),
    collectionSeen: stringList(raw.collectionSeen),
    fullVersion: raw.fullVersion === true,
    tutorialDone: raw.tutorialDone === true,
    hintsSeen: stringList(raw.hintsSeen),
    daily,
    runInProgress: isJson(raw.runInProgress) ? raw.runInProgress : base.runInProgress,
    puzzles: sanitizePuzzleRecords(raw.puzzles),
  };
}

export type ParseResult = { ok: true; data: SaveData } | { ok: false; error: string };

/** Migrate + sanitize stored data. `undefined` (nothing stored) yields a fresh save. */
export function parseSave(
  raw: unknown,
  migrations: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS,
  target: number = SAVE_VERSION,
): ParseResult {
  if (raw === undefined || raw === null) return { ok: true, data: createDefaultSave() };
  try {
    return { ok: true, data: sanitizeSave(migrateSave(raw, migrations, target)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------ manager

export interface SaveTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const DEFAULT_TIMERS: SaveTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface SaveManagerOptions {
  /** Debounce delay of writes after `update` (ms). */
  debounceMs?: number;
  timers?: SaveTimers;
}

export type LoadOutcome = 'fresh' | 'loaded' | 'recovered';

/**
 * Owns the in-memory save, persists it with debounced writes. Mutate only through `update`, which
 * notifies subscribers and schedules a write.
 */
export class SaveManager {
  private current: SaveData = createDefaultSave();
  private timer: unknown = null;
  private dirty = false;
  private writing: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(data: SaveData) => void>();
  private readonly debounceMs: number;
  private readonly timers: SaveTimers;

  constructor(
    private readonly storage: Storage,
    options: SaveManagerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 400;
    this.timers = options.timers ?? DEFAULT_TIMERS;
  }

  get data(): SaveData {
    return this.current;
  }

  get hasPendingWrite(): boolean {
    return this.dirty;
  }

  /** Read (and migrate / recover) the stored save. Never throws. */
  async load(): Promise<LoadOutcome> {
    let raw: unknown;
    try {
      raw = await this.storage.get(SAVE_KEY);
    } catch {
      raw = undefined;
    }
    const result = parseSave(raw);
    if (result.ok) {
      this.current = result.data;
      if (raw === undefined || raw === null) {
        await this.importLegacy();
        this.markDirty();
        return 'fresh';
      }
      if (isRecord(raw) && raw.version !== SAVE_VERSION) this.markDirty();
      this.emit();
      return 'loaded';
    }
    // Corrupt or from a newer build: keep a copy, start over.
    try {
      if (isJson(raw)) await this.storage.set(SAVE_BACKUP_KEY, raw);
    } catch {
      // Best effort.
    }
    this.current = createDefaultSave();
    this.markDirty();
    return 'recovered';
  }

  /** Apply `mutate` to a copy of the save, publish it and schedule a write. */
  update(mutate: (draft: SaveData) => void): SaveData {
    const draft = structuredClone(this.current);
    mutate(draft);
    this.current = draft;
    this.markDirty();
    return draft;
  }

  subscribe(listener: (data: SaveData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Write now if anything changed (app pause / page hide). */
  flush(): Promise<void> {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return this.writing;
    this.dirty = false;
    const snapshot = this.current as unknown as JsonValue;
    this.writing = this.writing
      .then(() => this.storage.set(SAVE_KEY, snapshot))
      .catch(() => {
        this.dirty = true;
      });
    return this.writing;
  }

  private markDirty(): void {
    this.dirty = true;
    this.emit();
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l(this.current);
  }

  private async importLegacy(): Promise<void> {
    try {
      const best = await this.storage.get(LEGACY_ENDLESS_BEST_KEY);
      if (typeof best === 'number' && Number.isFinite(best) && best > 0) {
        this.current.modes.endless = { ...EMPTY_MODE_STATS, best: Math.floor(best) };
      }
      const language = await this.storage.get(LEGACY_LANGUAGE_KEY);
      if (language === 'en' || language === 'hu') this.current.settings.language = language;
    } catch {
      // Ignore: legacy data is optional.
    }
  }
}
