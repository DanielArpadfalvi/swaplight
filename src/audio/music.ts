// Look-ahead sequencer that plays a generated Track through Web Audio.

import {
  clamp01,
  cutoffForIntensity,
  eventsForStep,
  generateTrack,
  type MusicThemeId,
  type NoteEvent,
  type Track,
} from './patterns';
import { LOOKAHEAD_SEC, StepClock, TIMER_INTERVAL_MS } from './scheduler';
import { hat, kick, snare, tone, type Voice } from './synth';
import { midiToFreq } from './theory';

export interface MusicPlayerOptions {
  theme: MusicThemeId;
  seed: number;
  intensity: number;
  /** Optional tempo override (bpm). */
  bpm?: number;
  fadeIn: number;
}

export class MusicPlayer {
  readonly track: Track;
  private readonly bus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly echo: DelayNode;
  private readonly echoFb: GainNode;
  private readonly echoSend: GainNode;
  private readonly clock: StepClock;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intensity: number;
  private stopped = false;
  private readonly main: Voice;
  private readonly wet: Voice;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    opts: MusicPlayerOptions,
  ) {
    this.track = generateTrack(opts.theme, opts.seed);
    this.intensity = clamp01(opts.intensity);
    const now = ctx.currentTime;

    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, now);
    this.bus.gain.exponentialRampToValueAtTime(1, now + Math.max(opts.fadeIn, 0.01));
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.8;
    this.filter.frequency.setValueAtTime(cutoffForIntensity(opts.theme, this.intensity), now);
    this.bus.connect(this.filter).connect(out);

    // Tempo-synced dotted-eighth echo for arps/leads (classic synthwave).
    this.clock = new StepClock(now + 0.05, opts.bpm ?? this.track.bpm);
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = this.clock.stepDuration * 3;
    this.echoFb = ctx.createGain();
    this.echoFb.gain.value = 0.35;
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.3;
    this.echoSend.connect(this.echo).connect(this.echoFb).connect(this.echo);
    this.echo.connect(this.bus);

    this.main = { ctx, out: this.bus };
    this.wet = { ctx, out: this.echoSend };
    this.timer = setInterval(() => this.tick(), TIMER_INTERVAL_MS);
    this.tick();
  }

  get theme(): MusicThemeId {
    return this.track.theme;
  }

  setIntensity(v: number): void {
    this.intensity = clamp01(v);
    this.filter.frequency.setTargetAtTime(
      cutoffForIntensity(this.track.theme, this.intensity),
      this.ctx.currentTime,
      0.4,
    );
  }

  setTempo(bpm: number): void {
    this.clock.setTempo(bpm);
    this.echo.delayTime.setTargetAtTime(this.clock.stepDuration * 3, this.ctx.currentTime, 0.1);
  }

  /** Fades out and releases all nodes. Safe to call more than once. */
  stop(fadeOut: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    const fade = Math.max(fadeOut, 0.01);
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(Math.max(this.bus.gain.value, 0.0001), now);
    this.bus.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    // Keep scheduling until the fade is done so the tail stays musical, then tear down.
    setTimeout(() => this.dispose(), (fade + LOOKAHEAD_SEC) * 1000 + 50);
  }

  private dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.echoFb.disconnect();
    this.echo.disconnect();
    this.echoSend.disconnect();
    this.filter.disconnect();
    this.bus.disconnect();
  }

  private tick(): void {
    if (this.ctx.state !== 'running' || this.timer === null) return;
    const now = this.ctx.currentTime;
    for (const { step, time } of this.clock.collect(now + LOOKAHEAD_SEC, now)) {
      for (const e of eventsForStep(this.track, step, this.intensity)) this.playEvent(e, time);
    }
  }

  private playEvent(e: NoteEvent, t: number): void {
    const stepDur = this.clock.stepDuration;
    const v = this.main;
    switch (e.voice) {
      case 'kick':
        kick(v, t, e.vel);
        return;
      case 'snare':
        snare(v, t, e.vel);
        return;
      case 'hat':
        hat(v, t, e.vel);
        return;
      case 'openHat':
        hat(v, t, e.vel, true);
        return;
      case 'bass': {
        const f = midiToFreq(e.midi[0] ?? 45);
        const cutoff = 300 + this.intensity * 900 + e.vel * 400;
        tone(v, t, {
          type: 'sawtooth',
          freq: f,
          peak: 0.22 * e.vel,
          decay: stepDur * e.len * 0.9,
          cutoff: cutoff * 2.5,
          cutoffEnd: cutoff * 0.6,
          q: 5,
        });
        return;
      }
      case 'pad': {
        const dur = stepDur * e.len;
        for (const m of e.midi) {
          const f = midiToFreq(m);
          for (const det of [-9, 9]) {
            tone(v, t, {
              type: 'sawtooth',
              freq: f,
              detune: det,
              peak: (0.05 * e.vel) / Math.max(e.midi.length / 3, 1),
              attack: Math.min(0.4, dur * 0.3),
              hold: dur * 0.55,
              decay: dur * 0.3,
              cutoff: 1400,
            });
          }
        }
        return;
      }
      case 'arp':
        for (const m of e.midi) {
          const opts = {
            type: 'square' as const,
            freq: midiToFreq(m),
            peak: 0.12 * e.vel,
            decay: stepDur * e.len * 1.4,
            cutoff: 2600,
            cutoffEnd: 700,
          };
          tone(v, t, opts);
          tone(this.wet, t, opts);
        }
        return;
      case 'lead':
        for (const m of e.midi) {
          const opts = {
            type: 'sawtooth' as const,
            freq: midiToFreq(m),
            detune: 4,
            peak: 0.2 * e.vel,
            attack: 0.01,
            hold: stepDur * e.len * 0.6,
            decay: stepDur * 1.5,
            cutoff: 3200,
          };
          tone(v, t, opts);
          tone(this.wet, t, opts);
        }
        return;
    }
  }
}
