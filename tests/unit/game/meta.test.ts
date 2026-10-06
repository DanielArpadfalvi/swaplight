import { describe, expect, it, vi } from 'vitest';
import { getMode, MODES, modeStatus, startMode, type ModeDef } from '../../../src/game/modes';
import { backAction, popOverlay, pushOverlay, topOverlay } from '../../../src/game/nav';
import {
  applySettings,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  type SettingsTargets,
} from '../../../src/game/settings';
import { en, type TranslationKey } from '../../../src/i18n';

function targets(): SettingsTargets & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setVolume: (c, v) => calls.push(`vol:${c}:${v}`),
    setHaptics: (on) => calls.push(`haptics:${on}`),
    setReducedMotion: (on) => calls.push(`rm:${on}`),
    setHighContrast: (on) => calls.push(`hc:${on}`),
    setLanguage: (l) => calls.push(`lang:${l}`),
  };
}

describe('settings', () => {
  it('sanitizes garbage to defaults and clamps volumes', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({
      musicVolume: -1,
      sfxVolume: 0.333,
      reducedMotion: true,
      language: 'hu',
    });
    expect(s.musicVolume).toBe(0);
    expect(s.sfxVolume).toBe(0.33);
    expect(s.reducedMotion).toBe(true);
    expect(s.language).toBe('hu');
    expect(sanitizeSettings({ musicVolume: NaN }).musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  it('applies everything at boot', () => {
    const t = targets();
    applySettings({ ...DEFAULT_SETTINGS, language: 'auto' }, t);
    expect(t.calls).toEqual([
      'vol:music:0.6',
      'vol:sfx:0.9',
      'haptics:true',
      'rm:false',
      'hc:false',
      'lang:null',
    ]);
  });

  it('applies only changed fields on update', () => {
    const t = targets();
    const prev = { ...DEFAULT_SETTINGS };
    applySettings({ ...prev, highContrast: true, language: 'hu' }, t, prev);
    expect(t.calls).toEqual(['hc:true', 'lang:hu']);
    t.calls.length = 0;
    applySettings({ ...prev, showBreakdown: false }, t, prev);
    expect(t.calls).toEqual([]);
  });
});

describe('back stack', () => {
  it('closes overlays first, whatever the screen', () => {
    expect(backAction('playing', ['settings'])).toEqual({ type: 'closeOverlay' });
    expect(backAction('menu', ['stats', 'credits'])).toEqual({ type: 'closeOverlay' });
  });

  it('maps each screen to its back action', () => {
    expect(backAction('playing', []).type).toBe('pause');
    expect(backAction('paused', []).type).toBe('resume');
    expect(backAction('gameOver', []).type).toBe('toMenu');
    expect(backAction('menu', []).type).toBe('confirmExit');
  });

  it('push / pop keeps a stack without duplicates', () => {
    let s = pushOverlay([], 'settings');
    s = pushOverlay(s, 'credits');
    expect(topOverlay(s)).toBe('credits');
    s = pushOverlay(s, 'settings');
    expect(s).toEqual(['credits', 'settings']);
    s = popOverlay(s);
    expect(s).toEqual(['credits']);
    expect(popOverlay(['a' as never, 'credits'], 'credits')).toEqual(['a']);
    expect(topOverlay(popOverlay(s))).toBeNull();
  });
});

describe('mode registry', () => {
  it('lists the six 1.0 modes with valid translation keys', () => {
    expect(MODES.map((m) => m.id)).toEqual([
      'run',
      'endless',
      'versus',
      'daily',
      'puzzles',
      'tutorial',
    ]);
    const has = (key: TranslationKey) =>
      key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], en);
    for (const m of MODES) {
      expect(typeof has(m.titleKey), m.id).toBe('string');
      expect(typeof has(m.descKey), m.id).toBe('string');
    }
  });

  it('Endless and Run are playable for free; unimplemented modes are "soon"', () => {
    expect(modeStatus(getMode('endless')!, false)).toBe('playable');
    expect(modeStatus(getMode('run')!, false)).toBe('playable');
    expect(modeStatus(getMode('daily')!, true)).toBe('soon');
  });

  it('gates Full-Version modes once they are implemented', () => {
    const daily: ModeDef = { ...getMode('daily')!, start: vi.fn() };
    expect(modeStatus(daily, false)).toBe('locked');
    expect(modeStatus(daily, true)).toBe('playable');
    const host = {
      startEndless: vi.fn(),
      startRun: vi.fn(),
      startPuzzles: vi.fn(),
      startTutorial: vi.fn(),
    };
    expect(startMode('daily', host, false, [daily])).toBe('locked');
    expect(daily.start).not.toHaveBeenCalled();
    expect(startMode('daily', host, true, [daily])).toBe('playable');
    expect(daily.start).toHaveBeenCalledWith(host);
  });

  it('startMode runs the start function of playable modes only', () => {
    const host = {
      startEndless: vi.fn(),
      startRun: vi.fn(),
      startPuzzles: vi.fn(),
      startTutorial: vi.fn(),
    };
    expect(startMode('daily', host, true)).toBe('soon');
    expect(host.startEndless).not.toHaveBeenCalled();
    expect(startMode('run', host, false)).toBe('playable');
    expect(host.startRun).toHaveBeenCalledTimes(1);
    expect(startMode('endless', host, false)).toBe('playable');
    expect(host.startEndless).toHaveBeenCalledTimes(1);
  });
});
