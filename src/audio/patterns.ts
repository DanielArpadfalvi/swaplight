// Pure generative pattern logic for the music sequencer. A track is a loop of 16th-note steps,
// each holding events tagged with the minimum intensity at which they sound.

import { createPrng, prngInt, type Prng } from './prng';
import { PROGRESSIONS, SCALES, chordNotes, scaleDegreeToMidi, type Chord } from './theory';

export type MusicThemeId = 'menu' | 'game' | 'boss';

export type VoiceKind = 'kick' | 'snare' | 'hat' | 'openHat' | 'bass' | 'pad' | 'arp' | 'lead';

export interface NoteEvent {
  voice: VoiceKind;
  /** MIDI notes (empty for drums). */
  midi: number[];
  /** Velocity 0..1. */
  vel: number;
  /** Length in 16th steps. */
  len: number;
  /** Event only plays when the current intensity is >= this value. */
  minIntensity: number;
}

export interface Track {
  theme: MusicThemeId;
  bpm: number;
  stepsPerBar: number;
  /** One entry per 16th step in the loop. */
  steps: NoteEvent[][];
  progression: readonly Chord[];
}

export interface ThemeSpec {
  bpm: number;
  /** Key root (MIDI) used for bass; pads/arps are voiced octaves above. */
  keyMidi: number;
  barsPerChord: number;
  progressions: readonly number[];
  /** Base low-pass cutoff (Hz) at intensity 0. */
  baseCutoff: number;
  /** Cutoff (Hz) at intensity 1. */
  maxCutoff: number;
}

export const THEMES: Record<MusicThemeId, ThemeSpec> = {
  menu: {
    bpm: 92,
    keyMidi: 45,
    barsPerChord: 2,
    progressions: [1, 3],
    baseCutoff: 700,
    maxCutoff: 2600,
  },
  game: {
    bpm: 124,
    keyMidi: 45,
    barsPerChord: 1,
    progressions: [0, 1, 2],
    baseCutoff: 900,
    maxCutoff: 5200,
  },
  boss: {
    bpm: 136,
    keyMidi: 40,
    barsPerChord: 1,
    progressions: [2, 0],
    baseCutoff: 1100,
    maxCutoff: 6500,
  },
};

const STEPS_PER_BAR = 16;

function ev(
  voice: VoiceKind,
  vel: number,
  minIntensity = 0,
  midi: number[] = [],
  len = 1,
): NoteEvent {
  return { voice, midi, vel, len, minIntensity };
}

/** Bass step patterns: values are chord-tone offsets (0 root, 12 octave, 7 fifth), null = rest. */
const GAME_BASS_PATTERNS: readonly (readonly (number | null)[])[] = [
  [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 7, 12],
  [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12],
  [0, 12, 7, 12, 0, 12, 7, 12, 0, 12, 7, 12, 0, 12, 10, 12],
];

function buildMenu(spec: ThemeSpec, prog: readonly Chord[], rng: Prng): NoteEvent[][] {
  const bars = prog.length * spec.barsPerChord;
  const steps: NoteEvent[][] = Array.from({ length: bars * STEPS_PER_BAR }, () => []);
  const arpShape = prngInt(rng, 2) === 0 ? [0, 1, 2, 1] : [0, 2, 1, 2];
  for (let bar = 0; bar < bars; bar++) {
    const chord = prog[Math.floor(bar / spec.barsPerChord)]!;
    const base = bar * STEPS_PER_BAR;
    const padNotes = chordNotes(spec.keyMidi + 24, chord);
    if (bar % spec.barsPerChord === 0) {
      steps[base]!.push(ev('pad', 0.5, 0, padNotes, STEPS_PER_BAR * spec.barsPerChord));
    }
    // Slow bass on beats 1 and 3.
    const bassRoot = spec.keyMidi + chord.root;
    steps[base]!.push(ev('bass', 0.55, 0, [bassRoot], 6));
    steps[base + 8]!.push(ev('bass', 0.4, 0, [bassRoot + (prngInt(rng, 2) ? 7 : 12)], 6));
    // Soft arpeggio in eighths, joins at medium intensity.
    for (let i = 0; i < 8; i++) {
      const tone = padNotes[arpShape[i % arpShape.length]! % padNotes.length]! + 12;
      steps[base + i * 2]!.push(ev('arp', 0.22, 0.35, [tone], 2));
    }
    // Gentle pulse percussion only once intensity rises.
    steps[base]!.push(ev('kick', 0.5, 0.5));
    steps[base + 8]!.push(ev('kick', 0.4, 0.6));
    for (let i = 2; i < 16; i += 4) steps[base + i]!.push(ev('hat', 0.18, 0.4));
    steps[base + 12]!.push(ev('snare', 0.3, 0.75));
  }
  return steps;
}

function buildDriving(spec: ThemeSpec, prog: readonly Chord[], rng: Prng): NoteEvent[][] {
  const bars = prog.length * spec.barsPerChord;
  const steps: NoteEvent[][] = Array.from({ length: bars * STEPS_PER_BAR }, () => []);
  const bassPattern = GAME_BASS_PATTERNS[prngInt(rng, GAME_BASS_PATTERNS.length)]!;
  // Lead motif: 8 pentatonic degrees chosen once and reused per chord (shifted to chord root).
  const motif = Array.from({ length: 8 }, () => (rng() < 0.25 ? null : prngInt(rng, 7)));
  const arpUp = rng() < 0.5;

  for (let bar = 0; bar < bars; bar++) {
    const chord = prog[Math.floor(bar / spec.barsPerChord)]!;
    const base = bar * STEPS_PER_BAR;
    const padNotes = chordNotes(spec.keyMidi + 24, chord);
    const lastBar = bar === bars - 1;
    if (bar % spec.barsPerChord === 0) {
      steps[base]!.push(ev('pad', 0.4, 0, padNotes, STEPS_PER_BAR * spec.barsPerChord));
    }
    for (let i = 0; i < 16; i++) {
      const s = steps[base + i]!;
      // Drums: four-on-the-floor kick, backbeat snare, offbeat hats.
      if (i % 4 === 0) s.push(ev('kick', i === 0 ? 1 : 0.85));
      if (i === 4 || i === 12) s.push(ev('snare', 0.8));
      if (lastBar && i >= 13) s.push(ev('snare', 0.35 + (i - 13) * 0.15, 0.55));
      if (i % 4 === 2) s.push(ev('openHat', 0.3));
      else if (i % 2 === 0) s.push(ev('hat', 0.22, 0.25));
      else s.push(ev('hat', 0.12 + rng() * 0.06, 0.65));
      // Bass: 16th-note synthwave octave pump.
      const off = bassPattern[i];
      if (off !== null && off !== undefined) {
        s.push(ev('bass', i % 4 === 0 ? 0.75 : 0.55, 0, [spec.keyMidi + chord.root + off], 1));
      }
      // Arp over chord tones, joins at moderate intensity.
      if (i % 2 === 0) {
        const k = i / 2;
        const idx = arpUp ? k % padNotes.length : padNotes.length - 1 - (k % padNotes.length);
        s.push(ev('arp', 0.2, 0.4, [padNotes[idx]! + 12 * (1 + (Math.floor(k / 4) % 2))], 1));
      }
      // Lead motif at high intensity.
      if (i % 2 === 0) {
        const deg = motif[i / 2];
        if (deg !== null && deg !== undefined) {
          const midi = scaleDegreeToMidi(spec.keyMidi + 36, SCALES.minorPentatonic, deg);
          s.push(ev('lead', 0.22, 0.7, [midi], 2));
        }
      }
    }
  }
  return steps;
}

/** Generates a looping track for a theme. Same (theme, seed) always yields the same track. */
export function generateTrack(theme: MusicThemeId, seed: number): Track {
  const spec = THEMES[theme];
  const rng = createPrng(seed ^ 0x5eed);
  const progIndex = spec.progressions[prngInt(rng, spec.progressions.length)]!;
  const progression = PROGRESSIONS[progIndex]!;
  const steps =
    theme === 'menu' ? buildMenu(spec, progression, rng) : buildDriving(spec, progression, rng);
  return { theme, bpm: spec.bpm, stepsPerBar: STEPS_PER_BAR, steps, progression };
}

/** Events of a step that are audible at the given intensity. */
export function eventsForStep(track: Track, step: number, intensity: number): NoteEvent[] {
  const len = track.steps.length;
  const events = track.steps[((step % len) + len) % len] ?? [];
  return events.filter((e) => intensity >= e.minIntensity);
}

/** Low-pass cutoff for the music bus at a given intensity (exponential sweep). */
export function cutoffForIntensity(theme: MusicThemeId, intensity: number): number {
  const { baseCutoff, maxCutoff } = THEMES[theme];
  const t = clamp01(intensity);
  return baseCutoff * Math.pow(maxCutoff / baseCutoff, t);
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
