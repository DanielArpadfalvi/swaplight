import { describe, expect, it } from 'vitest';
import {
  PROGRESSIONS,
  SCALES,
  chordNotes,
  midiToFreq,
  noteToMidi,
  popPitchMidi,
  scaleDegreeToMidi,
  sixteenthDuration,
} from '../../../src/audio/theory';

describe('audio theory', () => {
  it('converts midi to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });

  it('parses note names', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#3')).toBe(54);
    expect(noteToMidi('Bb2')).toBe(46);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('wraps scale degrees across octaves', () => {
    const s = SCALES.majorPentatonic;
    expect(scaleDegreeToMidi(60, s, 0)).toBe(60);
    expect(scaleDegreeToMidi(60, s, 4)).toBe(69);
    expect(scaleDegreeToMidi(60, s, 5)).toBe(72);
    expect(scaleDegreeToMidi(60, s, -1)).toBe(57);
  });

  it('pop pitch rises with index and with chain level', () => {
    const base = [0, 1, 2, 3, 4].map((i) => popPitchMidi(i, 1));
    for (let i = 1; i < base.length; i++) expect(base[i]!).toBeGreaterThan(base[i - 1]!);
    expect(popPitchMidi(0, 2)).toBeGreaterThan(popPitchMidi(0, 1));
    expect(popPitchMidi(0, 4)).toBeGreaterThan(popPitchMidi(0, 3));
    // Every pitch lies on the pentatonic scale of the root (C).
    const pcs = new Set<number>(SCALES.majorPentatonic);
    for (let c = 1; c < 8; c++) {
      for (let i = 0; i < 20; i++) expect(pcs.has((popPitchMidi(i, c) - 72) % 12)).toBe(true);
    }
  });

  it('pop pitch is clamped for huge groups/chains and safe for bad input', () => {
    expect(popPitchMidi(100, 99)).toBe(popPitchMidi(200, 50));
    expect(popPitchMidi(-3, 0)).toBe(popPitchMidi(0, 1));
    expect(popPitchMidi(100, 99)).toBeLessThanOrEqual(72 + 36);
  });

  it('builds chords and progressions', () => {
    expect(chordNotes(57, { root: 0, quality: 'min' })).toEqual([57, 60, 64]);
    expect(PROGRESSIONS.length).toBeGreaterThanOrEqual(3);
    for (const p of PROGRESSIONS) expect(p.length).toBe(4);
  });

  it('computes sixteenth durations', () => {
    expect(sixteenthDuration(120)).toBeCloseTo(0.125);
  });
});
