// Pure mixer helpers.

import { clamp01 } from './patterns';

export type AudioChannel = 'master' | 'sfx' | 'music';

export const DEFAULT_VOLUMES: Readonly<Record<AudioChannel, number>> = {
  master: 0.8,
  sfx: 0.9,
  music: 0.6,
};

/** Maps a 0..1 slider value to linear gain with a perceptual (squared) curve. */
export function volumeToGain(volume: number): number {
  const v = clamp01(volume);
  return v * v;
}
