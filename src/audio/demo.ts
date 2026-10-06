// Dev-only: plays every SFX in sequence, then a short music preview. Not wired into main.
// Usage (from a click handler): `void playAudioDemo(engine)`.

import type { AudioEngine } from './engine';

type Step = [label: string, run: (e: AudioEngine) => void, waitMs: number];

const STEPS: Step[] = [
  ['uiTap', (e) => e.uiTap(), 300],
  ['uiConfirm', (e) => e.uiConfirm(), 400],
  ['swap', (e) => e.swap(), 300],
  ['land', (e) => e.land(), 300],
  ['rowRise', (e) => e.rowRise(), 300],
  ['match', (e) => e.match(), 350],
  ...[1, 2, 3].map((chain): Step => [
    `pop x5 (chain ${chain})`,
    (e) => {
      for (let i = 0; i < 5; i++) setTimeout(() => e.pop(i, chain), i * 90);
    },
    700,
  ]),
  ['chain(2)', (e) => e.chain(2), 600],
  ['chain(5)', (e) => e.chain(5), 600],
  ['combo(4)', (e) => e.combo(4), 500],
  ['combo(8)', (e) => e.combo(8), 500],
  ['danger', (e) => e.danger(), 600],
  ['purchase', (e) => e.purchase(), 600],
  ['itemUnlock', (e) => e.itemUnlock(), 600],
  ['stageClear', (e) => e.stageClear(), 1800],
  ['bossIntro', (e) => e.bossIntro(), 2600],
  ['gameOver', (e) => e.gameOver(), 2200],
];

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Plays each SFX with a gap, logging its name; optionally previews both music themes.
 * Must be started from a user gesture (it calls `unlock()` first).
 */
export async function playAudioDemo(
  engine: AudioEngine,
  opts: { music?: boolean; log?: (label: string) => void } = {},
): Promise<void> {
  const log = opts.log ?? ((l: string) => console.info(`[audio-demo] ${l}`));
  await engine.unlock();
  for (const [label, run, ms] of STEPS) {
    log(label);
    run(engine);
    await wait(ms);
  }
  if (opts.music === false) return;
  log('music: menu');
  engine.playMusic('menu', { fade: 0.5, intensity: 0.2 });
  await wait(5000);
  log('music: game (intensity 0 -> 1)');
  engine.playMusic('game', { fade: 1, intensity: 0 });
  for (let i = 0; i <= 10; i++) {
    engine.setIntensity(i / 10);
    await wait(800);
  }
  engine.stopMusic(1.5);
}
