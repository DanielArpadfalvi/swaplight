import { TICKS_PER_SECOND, type SimConfig } from '../core/config';
import { createRng, randInt, shuffle } from '../core/rng';
import {
  buildHooks,
  getCurse,
  makeGoal,
  type ActiveEffect,
  type RunEffect,
  type StageInfo,
} from '../core/run';
import { createSim, type SimHooks } from '../core/sim';
import type { SimModifiers, SimState } from '../core/types';
import type { DailyResult, DailyStreak, SaveData } from './save';

/**
 * Daily Challenge glue (pure, no DOM): one seeded challenge per local calendar date. Everyone gets
 * the same board seed, start speed and 1–2 twists (boss curses / rule tweaks) for a date; the goal
 * is the highest score in two minutes. The first attempt of a day is the official one (spent as
 * soon as it starts); later attempts are practice.
 */

/** Two minutes. */
export const DAILY_TIME_LIMIT = 120 * TICKS_PER_SECOND;
/** Days of results kept in `save.daily`. */
export const DAILY_HISTORY_DAYS = 14;

/** Twists a daily can draw (curse ids from the Run layer, plus `rush`). */
export const DAILY_TWISTS: readonly string[] = [
  'surge',
  'veil',
  'spectrum',
  'lock',
  'shiver',
  'drought',
  'judge',
  'stagger',
  'rush',
];

/** Rush Hour: start at a high speed level. */
const RUSH_EFFECT: RunEffect = Object.freeze({
  config: (cfg: Partial<SimConfig>) => {
    cfg.startLevel = Math.max(cfg.startLevel ?? 1, 8);
  },
});

function twistEffect(id: string): RunEffect {
  return id === 'rush' ? RUSH_EFFECT : getCurse(id);
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_KEY.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** Local calendar date as `YYYY-MM-DD`. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `key` shifted by `days` calendar days. */
export function addDays(key: string, days: number): string {
  const m = DATE_KEY.exec(key);
  if (!m) throw new RangeError(`invalid date key '${key}'`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** Milliseconds until the next local midnight (next daily). */
export function msUntilNextDaily(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

/** "hh:mm:ss" countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(h)}:${two(m)}:${two(s)}`;
}

export interface DailyChallenge {
  date: string;
  seed: string;
  /** Twist ids in display order. */
  twists: string[];
  startLevel: number;
  timeLimit: number;
}

/** The challenge of a date: deterministic, same for everyone. */
export function dailyChallenge(date: string): DailyChallenge {
  if (!isDateKey(date)) throw new RangeError(`invalid date key '${date}'`);
  const rng = createRng(`daily|${date}|rules`);
  const count = 1 + randInt(rng, 2);
  const pool = shuffle(rng, [...DAILY_TWISTS]);
  const twists: string[] = [];
  for (const id of pool) {
    if (twists.length >= count) break;
    // Two hard "lock" twists together are no fun.
    if (id === 'lock' && twists.includes('stagger')) continue;
    if (id === 'stagger' && twists.includes('lock')) continue;
    twists.push(id);
  }
  return {
    date,
    seed: `daily|${date}`,
    twists,
    startLevel: 2 + randInt(rng, 4),
    timeLimit: DAILY_TIME_LIMIT,
  };
}

export interface DailySetup {
  config: Partial<SimConfig>;
  modifiers: SimModifiers;
  hooks: SimHooks;
}

/** Sim config / modifiers / hooks of a challenge (twists applied like boss curses). */
export function dailySetup(ch: DailyChallenge): DailySetup {
  const goal = { ...makeGoal('scoreInTime', 1, 0, 1), timeLimit: ch.timeLimit };
  const info: StageInfo = {
    act: 1,
    stage: 0,
    isBoss: false,
    goal,
    szikra: 0,
    relicCount: 0,
    relicSlots: 0,
    bossesDefeated: 0,
  };
  const effects: ActiveEffect[] = ch.twists.map((id) => ({
    source: 'curse',
    id,
    effect: twistEffect(id),
    prefix: `curse.${id}.`,
  }));
  const config: Partial<SimConfig> = { startLevel: ch.startLevel };
  for (const a of effects) a.effect.config?.(config, info);
  const modifiers: SimModifiers = {};
  const curseRng = createRng(`daily|${ch.date}|curse`);
  for (const a of effects) a.effect.modifiers?.(modifiers, info, curseRng);
  return { config, modifiers, hooks: buildHooks(effects, info) };
}

export function createDailySim(ch: DailyChallenge, setup: DailySetup = dailySetup(ch)): SimState {
  return createSim(ch.seed, setup.config, 'endless', { modifiers: setup.modifiers });
}

/** The attempt is over: time is up (once the board settles) or the stack topped out. */
export function dailyFinished(sim: SimState, timeLimit: number): boolean {
  if (sim.gameOver) return true;
  if (sim.tick < timeLimit) return false;
  return (
    sim.groups.length === 0 && sim.chain === 1 && !sim.garbage.some((g) => g.state === 'converting')
  );
}

/** Whole seconds left on the clock. */
export function dailySecondsLeft(sim: SimState, timeLimit: number): number {
  return Math.ceil(Math.max(0, timeLimit - sim.tick) / TICKS_PER_SECOND);
}

// ---------------------------------------------------------------------- save bookkeeping

export const EMPTY_DAILY_RESULT: Readonly<DailyResult> = Object.freeze({
  score: 0,
  attempts: 0,
  official: false,
  practiceBest: 0,
});

export function dailyResult(save: SaveData, date: string): DailyResult {
  return { ...EMPTY_DAILY_RESULT, ...save.daily[date] };
}

/** The official attempt of `date` is still available. */
export function officialAvailable(save: SaveData, date: string): boolean {
  return !save.daily[date]?.official;
}

/** Drop history older than `DAILY_HISTORY_DAYS` before `today` (and anything in the future). */
export function pruneDailyHistory(save: SaveData, today: string): void {
  const oldest = addDays(today, -(DAILY_HISTORY_DAYS - 1));
  for (const key of Object.keys(save.daily)) {
    if (key < oldest || key > today) delete save.daily[key];
  }
}

/**
 * Start an attempt (mutates `save`). The first attempt of a day is official: it is spent right
 * away (quitting or closing the app does not give it back) and extends the streak.
 */
export function beginDailyAttempt(save: SaveData, date: string): { official: boolean } {
  const prev = dailyResult(save, date);
  const official = !prev.official;
  save.daily[date] = { ...prev, attempts: prev.attempts + 1, official: true };
  if (official) {
    const s = save.dailyStreak;
    if (s.last !== date) {
      s.current = s.last === addDays(date, -1) ? s.current + 1 : 1;
      s.last = date;
      s.best = Math.max(s.best, s.current);
    }
  }
  pruneDailyHistory(save, date);
  return { official };
}

/** Record an attempt's score (mutates `save`); returns whether it beat the day's previous best. */
export function finishDailyAttempt(
  save: SaveData,
  date: string,
  score: number,
  official: boolean,
): { newBest: boolean } {
  const prev = dailyResult(save, date);
  const s = Math.max(0, Math.floor(score));
  const before = Math.max(prev.score, prev.practiceBest);
  const next: DailyResult = official
    ? { ...prev, score: Math.max(prev.score, s), official: true }
    : { ...prev, practiceBest: Math.max(prev.practiceBest, s) };
  save.daily[date] = next;
  return { newBest: s > before };
}

/** Streak as shown today: it lapses once a whole day was missed. */
export function currentStreak(save: SaveData, today: string): number {
  return currentStreakFrom(save.dailyStreak, today);
}

export function currentStreakFrom(s: DailyStreak, today: string): number {
  if (!isDateKey(today)) return 0;
  if (s.last === today || s.last === addDays(today, -1)) return s.current;
  return 0;
}

export interface DailyHistoryDay {
  date: string;
  /** Official score, or null when the official attempt was not played that day. */
  score: number | null;
}

/** The last `DAILY_HISTORY_DAYS` days, oldest first, ending with `today`. */
export function dailyHistory(save: SaveData, today: string): DailyHistoryDay[] {
  const out: DailyHistoryDay[] = [];
  for (let i = DAILY_HISTORY_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const r = save.daily[date];
    out.push({ date, score: r?.official ? r.score : null });
  }
  return out;
}

/** Group digits with spaces ("12 340"): language neutral, safe in plain-text shares. */
export function groupDigits(n: number): string {
  return Math.max(0, Math.floor(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
