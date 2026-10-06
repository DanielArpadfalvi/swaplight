// Low-level Web Audio voice primitives shared by SFX and music. Every node is short-lived:
// oscillators stop themselves and disconnect on `ended`, so nothing leaks.

export interface Voice {
  ctx: BaseAudioContext;
  out: AudioNode;
}

const EPS = 0.0001;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of cached white noise per context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Simple LCG: deterministic, cheap, and keeps Math.random out of the hot path.
    let s = 0x12345678;
    for (let i = 0; i < data.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      data[i] = s / 2147483648 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Percussive attack/decay envelope on a gain param. Returns the end time. */
export function envAD(
  param: AudioParam,
  t: number,
  peak: number,
  attack: number,
  decay: number,
): number {
  param.cancelScheduledValues(t);
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(Math.max(peak, EPS), t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
  return t + attack + decay;
}

/** Attack / hold / release envelope (for pads and held notes). Returns the end time. */
export function envAHR(
  param: AudioParam,
  t: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): number {
  param.cancelScheduledValues(t);
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(Math.max(peak, EPS), t + attack);
  param.setValueAtTime(Math.max(peak, EPS), t + attack + hold);
  param.exponentialRampToValueAtTime(EPS, t + attack + hold + release);
  return t + attack + hold + release;
}

function cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

export interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  /** Optional exponential glide target reached at `glideTime` (default: end of note). */
  freqEnd?: number;
  glideTime?: number;
  detune?: number;
  peak: number;
  attack?: number;
  decay: number;
  /** Hold time before decay (makes envelope AHR). */
  hold?: number;
  /** Optional low-pass filter; `cutoffEnd` sweeps it exponentially over the note. */
  cutoff?: number;
  cutoffEnd?: number;
  q?: number;
}

/** A single enveloped oscillator, optionally through a sweeping low-pass. Returns end time. */
export function tone(v: Voice, t: number, o: ToneOptions): number {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const attack = o.attack ?? 0.004;
  const end =
    o.hold !== undefined
      ? envAHR(g.gain, t, o.peak, attack, o.hold, o.decay)
      : envAD(g.gain, t, o.peak, attack, o.decay);
  if (o.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 1), o.glideTime ?? end);
  }
  const nodes: AudioNode[] = [osc, g];
  if (o.cutoff !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.cutoff, t);
    if (o.cutoffEnd !== undefined) f.frequency.exponentialRampToValueAtTime(o.cutoffEnd, end);
    osc.connect(f).connect(g);
    nodes.push(f);
  } else {
    osc.connect(g);
  }
  g.connect(v.out);
  osc.start(t);
  osc.stop(end + 0.02);
  cleanup(osc, nodes);
  return end;
}

export interface NoiseOptions {
  peak: number;
  attack?: number;
  decay: number;
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
}

/** A filtered noise burst. Returns end time. */
export function noise(v: Voice, t: number, o: NoiseOptions): number {
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, t);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const end = envAD(g.gain, t, o.peak, o.attack ?? 0.002, o.decay);
  if (o.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(o.freqEnd, end);
  src.connect(f).connect(g).connect(v.out);
  // Random-ish offset so repeated bursts don't sound identical.
  const offset = (t * 7.31) % 0.5;
  src.start(t, offset);
  src.stop(end + 0.02);
  cleanup(src, [src, f, g]);
  return end;
}

// --- Drum voices -------------------------------------------------------------------------

export function kick(v: Voice, t: number, vel: number): number {
  noise(v, t, { peak: 0.15 * vel, decay: 0.012, filter: 'lowpass', freq: 3000 });
  return tone(v, t, { freq: 150, freqEnd: 42, glideTime: t + 0.12, peak: 0.9 * vel, decay: 0.28 });
}

export function snare(v: Voice, t: number, vel: number): number {
  tone(v, t, { type: 'triangle', freq: 220, freqEnd: 160, peak: 0.3 * vel, decay: 0.09 });
  return noise(v, t, { peak: 0.45 * vel, decay: 0.16, filter: 'bandpass', freq: 1800, q: 0.7 });
}

export function hat(v: Voice, t: number, vel: number, open = false): number {
  return noise(v, t, {
    peak: 0.3 * vel,
    decay: open ? 0.14 : 0.035,
    filter: 'highpass',
    freq: open ? 7000 : 8500,
  });
}
