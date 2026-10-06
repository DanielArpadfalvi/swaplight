// Procedural sound effects. Each recipe is a handful of oscillators/noise bursts (cheap) and
// returns its end time so the engine can track the voice budget.

import { hat, kick, noise, tone, type Voice } from './synth';
import { SCALES, midiToFreq, noteToMidi, popPitchMidi, scaleDegreeToMidi } from './theory';

export type SfxId =
  | 'swap'
  | 'land'
  | 'match'
  | 'pop'
  | 'chain'
  | 'combo'
  | 'rowRise'
  | 'danger'
  | 'gameOver'
  | 'uiTap'
  | 'uiConfirm'
  | 'purchase'
  | 'unlock'
  | 'stageClear'
  | 'bossIntro'
  | 'garbage'
  | 'attack'
  | 'incoming';

export interface SfxRecipe {
  /** Approximate simultaneous voices (oscillators + noise sources). */
  voices: number;
  /** Seconds within which an identical sound (same throttle key) is dropped. */
  throttle: number;
  /** Important sounds bypass the voice budget. */
  important?: boolean;
  play(v: Voice, t: number, a: number, b: number): number;
}

const clampInt = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

export const SFX: Record<SfxId, SfxRecipe> = {
  swap: {
    voices: 2,
    throttle: 0.03,
    play(v, t) {
      noise(v, t, { peak: 0.12, decay: 0.03, filter: 'bandpass', freq: 3500, q: 2 });
      return tone(v, t, {
        type: 'square',
        freq: 520,
        freqEnd: 880,
        glideTime: t + 0.04,
        peak: 0.12,
        decay: 0.07,
        cutoff: 3000,
      });
    },
  },
  land: {
    voices: 2,
    throttle: 0.04,
    play(v, t) {
      noise(v, t, { peak: 0.1, decay: 0.04, filter: 'bandpass', freq: 500, q: 1.2 });
      return tone(v, t, { freq: 190, freqEnd: 70, peak: 0.35, decay: 0.09 });
    },
  },
  match: {
    voices: 3,
    throttle: 0.05,
    play(v, t) {
      tone(v, t, { type: 'triangle', freq: 1320, detune: -8, peak: 0.12, decay: 0.18 });
      tone(v, t, { type: 'triangle', freq: 1980, detune: 8, peak: 0.08, decay: 0.14 });
      return noise(v, t, {
        peak: 0.08,
        attack: 0.02,
        decay: 0.12,
        filter: 'highpass',
        freq: 4000,
        freqEnd: 9000,
      });
    },
  },
  pop: {
    voices: 2,
    throttle: 0.025,
    play(v, t, index, chain) {
      const f = midiToFreq(popPitchMidi(index, chain));
      const c = Math.max(1, chain);
      tone(v, t, {
        type: 'triangle',
        freq: f * 2,
        peak: 0.06 + Math.min(c, 5) * 0.012,
        decay: 0.08,
      });
      return tone(v, t, {
        type: 'sine',
        freq: f,
        freqEnd: f * 1.02,
        peak: 0.3,
        decay: 0.16 + Math.min(c, 5) * 0.02,
      });
    },
  },
  chain: {
    voices: 5,
    throttle: 0.08,
    play(v, t, n) {
      const level = clampInt(n, 2, 12);
      const root = noteToMidi('A4') + Math.min(level - 2, 7) * 2;
      const notes = [0, 4, 7, 12].map((iv) => midiToFreq(root + iv));
      let end = t;
      notes.forEach((f, i) => {
        end = tone(v, t + i * 0.045, {
          type: 'sawtooth',
          freq: f,
          peak: 0.1,
          decay: i === notes.length - 1 ? 0.35 : 0.1,
          cutoff: 1200,
          cutoffEnd: 6000,
          q: 4,
        });
      });
      noise(v, t, {
        peak: 0.08,
        attack: 0.05,
        decay: 0.2,
        filter: 'bandpass',
        freq: 800,
        freqEnd: 8000,
        q: 3,
      });
      return end;
    },
  },
  combo: {
    voices: 5,
    throttle: 0.08,
    play(v, t, n) {
      const size = clampInt(n, 4, 30);
      const root = noteToMidi('E4') + Math.min(Math.floor((size - 4) / 2), 8);
      const stack = size >= 7 ? [0, 4, 7, 11, 14] : [0, 4, 7];
      let end = t;
      for (const iv of stack) {
        end = tone(v, t, {
          type: 'square',
          freq: midiToFreq(root + iv),
          detune: iv % 2 ? 6 : -6,
          peak: 0.06,
          decay: 0.22,
          cutoff: 4000,
          cutoffEnd: 800,
        });
      }
      return end;
    },
  },
  rowRise: {
    voices: 1,
    throttle: 0.05,
    play(v, t) {
      return tone(v, t, { freq: 2200, peak: 0.025, attack: 0.001, decay: 0.012 });
    },
  },
  danger: {
    voices: 2,
    throttle: 0.35,
    play(v, t) {
      tone(v, t, { freq: 70, freqEnd: 45, peak: 0.45, decay: 0.12 });
      return tone(v, t + 0.17, { freq: 62, freqEnd: 42, peak: 0.3, decay: 0.14 });
    },
  },
  gameOver: {
    voices: 6,
    throttle: 1,
    important: true,
    play(v, t) {
      tone(v, t, {
        type: 'sawtooth',
        freq: 440,
        freqEnd: 55,
        peak: 0.18,
        attack: 0.01,
        hold: 0.2,
        decay: 1.2,
        cutoff: 3000,
        cutoffEnd: 150,
      });
      tone(v, t, {
        type: 'sawtooth',
        freq: 443,
        freqEnd: 54,
        peak: 0.12,
        attack: 0.01,
        hold: 0.2,
        decay: 1.2,
        cutoff: 2000,
        cutoffEnd: 120,
      });
      noise(v, t, {
        peak: 0.15,
        attack: 0.05,
        decay: 1.4,
        filter: 'lowpass',
        freq: 800,
        freqEnd: 60,
      });
      let end = t;
      ['E4', 'C4', 'A3'].forEach((n, i) => {
        end = tone(v, t + 0.25 + i * 0.28, {
          type: 'triangle',
          freq: midiToFreq(noteToMidi(n)),
          peak: 0.2,
          decay: i === 2 ? 0.9 : 0.3,
        });
      });
      return end;
    },
  },
  uiTap: {
    voices: 1,
    throttle: 0.03,
    play(v, t) {
      return tone(v, t, { freq: 1100, freqEnd: 900, peak: 0.12, decay: 0.035 });
    },
  },
  uiConfirm: {
    voices: 2,
    throttle: 0.06,
    play(v, t) {
      tone(v, t, { type: 'triangle', freq: 660, peak: 0.18, decay: 0.08 });
      return tone(v, t + 0.06, { type: 'triangle', freq: 990, peak: 0.18, decay: 0.16 });
    },
  },
  purchase: { voices: 7, throttle: 0.1, play: (v, t) => sparkle(v, t, 0) },
  unlock: { voices: 7, throttle: 0.1, play: (v, t) => sparkle(v, t, 2) },
  stageClear: {
    voices: 8,
    throttle: 1,
    important: true,
    play(v, t) {
      const seq = ['C5', 'E5', 'G5', 'C6'].map((n) => midiToFreq(noteToMidi(n)));
      seq.forEach((f, i) => {
        tone(v, t + i * 0.11, { type: 'square', freq: f, peak: 0.1, decay: 0.12, cutoff: 3500 });
      });
      const tc = t + seq.length * 0.11;
      let end = tc;
      for (const n of ['C4', 'G4', 'C5', 'E5']) {
        end = tone(v, tc, {
          type: 'sawtooth',
          freq: midiToFreq(noteToMidi(n)),
          peak: 0.07,
          attack: 0.02,
          hold: 0.45,
          decay: 0.6,
          cutoff: 900,
          cutoffEnd: 4000,
        });
      }
      noise(v, tc, { peak: 0.06, attack: 0.1, decay: 0.8, filter: 'highpass', freq: 6000 });
      kick(v, tc, 0.7);
      return end;
    },
  },
  bossIntro: {
    voices: 8,
    throttle: 1,
    important: true,
    play(v, t) {
      tone(v, t, {
        type: 'sawtooth',
        freq: 55,
        peak: 0.2,
        attack: 0.3,
        hold: 1.0,
        decay: 0.8,
        cutoff: 150,
        cutoffEnd: 1400,
        q: 6,
      });
      tone(v, t, {
        type: 'sawtooth',
        freq: 55,
        detune: 14,
        peak: 0.16,
        attack: 0.3,
        hold: 1.0,
        decay: 0.8,
        cutoff: 150,
        cutoffEnd: 1400,
        q: 6,
      });
      // Tritone above for unease.
      tone(v, t + 0.4, {
        type: 'square',
        freq: midiToFreq(noteToMidi('D#3')),
        peak: 0.06,
        attack: 0.2,
        hold: 0.6,
        decay: 0.6,
        cutoff: 1200,
      });
      kick(v, t, 1);
      kick(v, t + 0.6, 0.9);
      hat(v, t + 1.2, 0.8, true);
      return kick(v, t + 1.2, 1) + 0.9;
    },
  },
  /** Heavy garbage slab landing; `a` = slab cells (bigger = deeper). */
  garbage: {
    voices: 4,
    throttle: 0.08,
    play(v, t, cells) {
      const size = clampInt(cells, 1, 36);
      const k = Math.min(1, size / 18);
      noise(v, t, {
        peak: 0.16 + 0.1 * k,
        decay: 0.12 + 0.1 * k,
        filter: 'lowpass',
        freq: 900,
        freqEnd: 120,
      });
      noise(v, t + 0.01, { peak: 0.06, decay: 0.06, filter: 'bandpass', freq: 2400, q: 3 });
      tone(v, t, {
        type: 'square',
        freq: 110 - 30 * k,
        freqEnd: 40,
        peak: 0.12,
        decay: 0.18,
        cutoff: 600,
      });
      return kick(v, t, 0.75 + 0.25 * k);
    },
  },
  /** Outgoing attack: rising zap. */
  attack: {
    voices: 3,
    throttle: 0.06,
    play(v, t) {
      noise(v, t, {
        peak: 0.07,
        attack: 0.02,
        decay: 0.22,
        filter: 'bandpass',
        freq: 1200,
        freqEnd: 9000,
        q: 4,
      });
      tone(v, t, {
        type: 'sawtooth',
        freq: 220,
        freqEnd: 1760,
        glideTime: t + 0.18,
        peak: 0.08,
        decay: 0.24,
        cutoff: 1500,
        cutoffEnd: 7000,
      });
      return tone(v, t + 0.03, {
        type: 'square',
        freq: 440,
        freqEnd: 2640,
        glideTime: t + 0.2,
        peak: 0.04,
        decay: 0.2,
        cutoff: 5000,
      });
    },
  },
  /** Incoming garbage warning: two short descending blips. */
  incoming: {
    voices: 2,
    throttle: 0.25,
    important: true,
    play(v, t) {
      tone(v, t, { type: 'square', freq: 988, peak: 0.07, decay: 0.07, cutoff: 3000 });
      return tone(v, t + 0.09, { type: 'square', freq: 740, peak: 0.07, decay: 0.1, cutoff: 3000 });
    },
  },
};

/** Ascending pentatonic glitter used for purchases/unlocks. */
function sparkle(v: Voice, t: number, shift: number): number {
  let end = t;
  for (let i = 0; i < 6; i++) {
    const midi = scaleDegreeToMidi(noteToMidi('E6'), SCALES.majorPentatonic, i + shift);
    end = tone(v, t + i * 0.045, {
      type: i % 2 ? 'triangle' : 'sine',
      freq: midiToFreq(midi),
      peak: 0.1,
      decay: 0.12,
    });
  }
  noise(v, t, {
    peak: 0.05,
    attack: 0.04,
    decay: 0.3,
    filter: 'highpass',
    freq: 7000,
    freqEnd: 11000,
  });
  return end;
}

/** Throttle key: parameterised sounds throttle per parameter set (e.g. each pop pitch). */
export function sfxThrottleKey(id: SfxId, a = 0, b = 0): string {
  return id === 'pop' || id === 'chain' || id === 'combo' ? `${id}:${a}:${b}` : id;
}
