// Pure music-theory helpers: no Web Audio dependency, fully unit-testable.

/** Semitone offsets of common scales (relative to the root). */
export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;

/** Equal-temperament frequency of a MIDI note (A4 = 69 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parses a note name like `C4`, `F#3`, `Bb2` into a MIDI number (C4 = 60). */
export function noteToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name);
  if (!m) throw new Error(`Invalid note name: ${name}`);
  const letter = m[1]!.toUpperCase();
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return (octave + 1) * 12 + NOTE_OFFSETS[letter]! + acc;
}

/**
 * MIDI note of the given scale degree. Degrees may exceed the scale length or be negative;
 * they wrap into higher/lower octaves.
 */
export function scaleDegreeToMidi(
  rootMidi: number,
  scale: readonly number[],
  degree: number,
): number {
  const len = scale.length;
  const octave = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + octave * 12 + scale[idx]!;
}

/** Highest pentatonic degree used by pop sounds before it clamps (keeps it pleasant). */
export const POP_MAX_DEGREE = 14;
/** Chain levels above this do not raise the register further. */
export const POP_MAX_CHAIN_SHIFT = 4;

/**
 * Pitch (MIDI) of the n-th block popping inside one clear group.
 * Rises one major-pentatonic step per block; each chain level shifts the starting point
 * up by two scale degrees (a bit less than half an octave), so chains audibly climb.
 */
export function popPitchMidi(indexInGroup: number, chain: number, rootMidi = 72): number {
  const chainShift = Math.min(Math.max(chain - 1, 0), POP_MAX_CHAIN_SHIFT) * 2;
  const degree = Math.min(Math.max(indexInGroup, 0) + chainShift, POP_MAX_DEGREE);
  return scaleDegreeToMidi(rootMidi, SCALES.majorPentatonic, degree);
}

/** Chord tones (semitones relative to chord root) for the triad types we use. */
export const CHORD_QUALITIES = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
} as const satisfies Record<string, readonly number[]>;

export type ChordQuality = keyof typeof CHORD_QUALITIES;

export interface Chord {
  /** Root offset in semitones from the key root. */
  root: number;
  quality: ChordQuality;
}

/** MIDI notes for a chord, voiced from `keyMidi + chord.root`. */
export function chordNotes(keyMidi: number, chord: Chord): number[] {
  return CHORD_QUALITIES[chord.quality].map((iv) => keyMidi + chord.root + iv);
}

/** Classic synthwave-friendly minor-key progressions (offsets relative to a minor tonic). */
export const PROGRESSIONS: readonly (readonly Chord[])[] = [
  // i - VI - III - VII  (Am F C G)
  [
    { root: 0, quality: 'min' },
    { root: 8, quality: 'maj' },
    { root: 3, quality: 'maj' },
    { root: 10, quality: 'maj' },
  ],
  // i - VII - VI - VII  (Am G F G)
  [
    { root: 0, quality: 'min7' },
    { root: 10, quality: 'maj' },
    { root: 8, quality: 'maj7' },
    { root: 10, quality: 'sus2' },
  ],
  // i - iv - VI - V   (Am Dm F E)
  [
    { root: 0, quality: 'min' },
    { root: 5, quality: 'min7' },
    { root: 8, quality: 'maj7' },
    { root: 7, quality: 'maj' },
  ],
  // VI - VII - i - i  (F G Am Am)
  [
    { root: 8, quality: 'maj7' },
    { root: 10, quality: 'add9' },
    { root: 0, quality: 'min7' },
    { root: 0, quality: 'min' },
  ],
];

/** Duration of one sixteenth note in seconds. */
export function sixteenthDuration(bpm: number): number {
  return 60 / bpm / 4;
}
