import { describe, expect, it } from 'vitest';
import { hashState } from '../../../src/core/replay';
import { step } from '../../../src/core/sim';
import {
  DAILY_HISTORY_DAYS,
  DAILY_TIME_LIMIT,
  DAILY_TWISTS,
  addDays,
  beginDailyAttempt,
  createDailySim,
  currentStreak,
  dailyChallenge,
  dailyFinished,
  dailyHistory,
  dailySecondsLeft,
  dailySetup,
  finishDailyAttempt,
  formatCountdown,
  groupDigits,
  isDateKey,
  localDateKey,
  msUntilNextDaily,
  officialAvailable,
} from '../../../src/game/daily';
import { createDefaultSave, sanitizeSave } from '../../../src/game/save';
import { t } from '../../../src/i18n';

describe('daily dates', () => {
  it('formats local dates and shifts them across month / year ends', () => {
    expect(localDateKey(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
    expect(localDateKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(addDays('2026-10-06', 1)).toBe('2026-10-07');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(isDateKey('2026-10-06')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('yesterday')).toBe(false);
  });

  it('counts down to the next local midnight', () => {
    expect(msUntilNextDaily(new Date(2026, 9, 6, 23, 59, 30))).toBe(30_000);
    expect(msUntilNextDaily(new Date(2026, 9, 6, 0, 0, 0))).toBe(24 * 3600 * 1000);
    expect(formatCountdown(5 * 3600_000 + 12 * 60_000 + 33_000)).toBe('05:12:33');
    expect(formatCountdown(400)).toBe('00:00:01');
  });

  it('groups digits for the share text', () => {
    expect(groupDigits(12340)).toBe('12 340');
    expect(groupDigits(1234567)).toBe('1 234 567');
    expect(groupDigits(999)).toBe('999');
  });
});

describe('dailyChallenge', () => {
  it('is the same for everyone on a date, different across dates', () => {
    const a = dailyChallenge('2026-10-06');
    expect(dailyChallenge('2026-10-06')).toEqual(a);
    expect(a.seed).toBe('daily|2026-10-06');
    expect(a.timeLimit).toBe(DAILY_TIME_LIMIT);
    const days = Array.from({ length: 30 }, (_, i) => dailyChallenge(addDays('2026-10-01', i)));
    expect(new Set(days.map((d) => d.twists.join('+'))).size).toBeGreaterThan(5);
    for (const d of days) {
      expect(d.twists.length).toBeGreaterThanOrEqual(1);
      expect(d.twists.length).toBeLessThanOrEqual(2);
      expect(new Set(d.twists).size).toBe(d.twists.length);
      for (const id of d.twists) expect(DAILY_TWISTS).toContain(id);
      expect(d.twists.includes('lock') && d.twists.includes('stagger')).toBe(false);
      expect(d.startLevel).toBeGreaterThanOrEqual(2);
      expect(d.startLevel).toBeLessThanOrEqual(5);
    }
    expect(() => dailyChallenge('2026-13-01')).toThrow();
  });

  it('every twist has EN text (curse names or the daily twist entry)', () => {
    for (const id of DAILY_TWISTS) {
      const name = id === 'rush' ? t('daily.twist.rush.name') : t(`boss.${id}.name` as never);
      expect(name).not.toContain('.');
    }
  });

  it('applies twists: same seed → same game; Spectrum adds a color, Rush a high start', () => {
    const date = '2026-10-06';
    const ch = dailyChallenge(date);
    const play = () => {
      const setup = dailySetup(ch);
      const sim = createDailySim(ch, setup);
      for (let i = 0; i < 600; i++) step(sim, [], setup.hooks);
      return hashState(sim);
    };
    expect(play()).toBe(play());

    const spectrum = dailySetup({ ...ch, twists: ['spectrum'] });
    expect(spectrum.config.colors).toBe(6);
    const rush = dailySetup({ ...ch, twists: ['rush'], startLevel: 3 });
    expect(rush.config.startLevel).toBe(8);
    const veil = dailySetup({ ...ch, twists: ['veil'] });
    expect(veil.modifiers.hiddenColor).toBeGreaterThanOrEqual(0);
    const surge = dailySetup({ ...ch, twists: ['surge'] });
    expect(surge.hooks.riseSpeed?.(100, createDailySim(ch))).toBeCloseTo(160);
  });

  it('finishes when time is up and the board settled, or on top-out', () => {
    const ch = { ...dailyChallenge('2026-10-06'), twists: [] };
    const sim = createDailySim(ch);
    expect(dailyFinished(sim, 60)).toBe(false);
    expect(dailySecondsLeft(sim, DAILY_TIME_LIMIT)).toBe(120);
    for (let i = 0; i < 61; i++) step(sim, []);
    expect(dailySecondsLeft(sim, 60)).toBe(0);
    expect(dailyFinished(sim, 60)).toBe(true);
    const busy = createDailySim(ch);
    busy.chain = 2;
    busy.tick = 100;
    expect(dailyFinished(busy, 60)).toBe(false);
    busy.gameOver = true;
    expect(dailyFinished(busy, 60)).toBe(true);
  });
});

describe('daily bookkeeping', () => {
  it('one official attempt per day; practice after that', () => {
    const save = createDefaultSave();
    const day = '2026-10-06';
    expect(officialAvailable(save, day)).toBe(true);
    expect(beginDailyAttempt(save, day)).toEqual({ official: true });
    // Spent right away (quitting does not give it back).
    expect(officialAvailable(save, day)).toBe(false);
    expect(save.daily[day]).toEqual({ score: 0, attempts: 1, official: true, practiceBest: 0 });
    expect(finishDailyAttempt(save, day, 1200, true)).toEqual({ newBest: true });
    expect(beginDailyAttempt(save, day)).toEqual({ official: false });
    expect(finishDailyAttempt(save, day, 900, false)).toEqual({ newBest: false });
    expect(finishDailyAttempt(save, day, 1500, false)).toEqual({ newBest: true });
    expect(save.daily[day]).toEqual({
      score: 1200,
      attempts: 2,
      official: true,
      practiceBest: 1500,
    });
  });

  it('streak: consecutive official days, reset after a gap, lapses when shown later', () => {
    const save = createDefaultSave();
    beginDailyAttempt(save, '2026-10-01');
    beginDailyAttempt(save, '2026-10-01'); // practice: no change
    expect(save.dailyStreak).toEqual({ current: 1, best: 1, last: '2026-10-01' });
    beginDailyAttempt(save, '2026-10-02');
    beginDailyAttempt(save, '2026-10-03');
    expect(save.dailyStreak).toEqual({ current: 3, best: 3, last: '2026-10-03' });
    expect(currentStreak(save, '2026-10-03')).toBe(3);
    expect(currentStreak(save, '2026-10-04')).toBe(3); // today not played yet
    expect(currentStreak(save, '2026-10-05')).toBe(0); // missed a day
    beginDailyAttempt(save, '2026-10-05');
    expect(save.dailyStreak).toEqual({ current: 1, best: 3, last: '2026-10-05' });
  });

  it('keeps 14 days of history', () => {
    const save = createDefaultSave();
    for (let i = 0; i < 20; i++) {
      const day = addDays('2026-09-20', i);
      beginDailyAttempt(save, day);
      finishDailyAttempt(save, day, 100 + i, true);
    }
    const keys = Object.keys(save.daily).sort();
    expect(keys).toHaveLength(DAILY_HISTORY_DAYS);
    expect(keys[keys.length - 1]).toBe('2026-10-09');
    expect(keys[0]).toBe('2026-09-26');
    const history = dailyHistory(save, '2026-10-10');
    expect(history).toHaveLength(DAILY_HISTORY_DAYS);
    expect(history[history.length - 1]).toEqual({ date: '2026-10-10', score: null });
    expect(history[history.length - 2]).toEqual({ date: '2026-10-09', score: 119 });
  });

  it('sanitizes the streak and old-format daily entries', () => {
    const data = sanitizeSave({
      daily: { '2026-10-05': { score: 10, attempts: 1 }, '2026-10-06': { practiceBest: 5 } },
      dailyStreak: { current: 4, best: 2, last: 'nope' },
    });
    expect(data.daily['2026-10-05']).toEqual({
      score: 10,
      attempts: 1,
      official: true,
      practiceBest: 0,
    });
    expect(data.daily['2026-10-06']?.official).toBe(false);
    expect(data.dailyStreak).toEqual({ current: 4, best: 4, last: '' });
  });

  it('share text matches the requested format', () => {
    expect(t('daily.shareText', { date: '2026-10-06', score: groupDigits(12340), streak: 3 })).toBe(
      'Swaplight Daily 2026-10-06 — 12 340 pts 🔥 streak 3',
    );
  });
});
