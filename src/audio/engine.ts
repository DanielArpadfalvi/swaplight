// AudioEngine: the single entry point the game uses for sound. All methods are safe no-ops
// when Web Audio is unavailable (SSR, tests, very old WebViews) or before the first unlock.

import { DEFAULT_VOLUMES, volumeToGain, type AudioChannel } from './mix';
import { MusicPlayer } from './music';
import { clamp01, type MusicThemeId } from './patterns';
import { SFX, sfxThrottleKey, type SfxId } from './sfx';
import { SoundThrottle, VoiceBudget } from './throttle';

export type AudioContextFactory = () => AudioContext | null;

export interface AudioEngineOptions {
  /** Override AudioContext creation (tests / custom latency hints). */
  createContext?: AudioContextFactory;
  /** Max simultaneous SFX voices (oscillators/noise sources). Default 32. */
  maxVoices?: number;
  /** Initial channel volumes 0..1. */
  volumes?: Partial<Record<AudioChannel, number>>;
  muted?: boolean;
}

export interface PlayMusicOptions {
  /** Seed for the generated variation (progression, bass/lead patterns). Default 1. */
  seed?: number;
  /** Fade-in seconds (default 1.2). When switching themes the old one fades out over this. */
  fade?: number;
  /** Start intensity 0..1 (default: current intensity). */
  intensity?: number;
  /** Tempo override (bpm). */
  bpm?: number;
}

function defaultContextFactory(): AudioContext | null {
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

const MUTE_RAMP = 0.03;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private failed = false;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: MusicPlayer | null = null;
  /** Desired music state, applied once the context is running. */
  private pendingMusic: { theme: MusicThemeId; opts: PlayMusicOptions } | null = null;
  private intensity = 0;
  private tempo: number | null = null;
  private readonly volumes: Record<AudioChannel, number>;
  private muted: boolean;
  private appSuspended = false;
  private readonly throttle = new SoundThrottle();
  private readonly budget: VoiceBudget;
  private readonly createContext: AudioContextFactory;

  constructor(opts: AudioEngineOptions = {}) {
    this.createContext = opts.createContext ?? defaultContextFactory;
    this.budget = new VoiceBudget(opts.maxVoices ?? 32);
    this.volumes = { ...DEFAULT_VOLUMES };
    for (const [k, v] of Object.entries(opts.volumes ?? {})) {
      this.volumes[k as AudioChannel] = clamp01(v);
    }
    this.muted = opts.muted ?? false;
  }

  /** True when Web Audio exists (context may still be locked). */
  get available(): boolean {
    return this.ensureContext() !== null;
  }

  /** True once the context is running and sounds will actually be heard. */
  get running(): boolean {
    return this.ctx?.state === 'running' && !this.appSuspended;
  }

  // --- lifecycle -------------------------------------------------------------------------

  /**
   * Call from inside a user-gesture handler (pointerdown/touchend/keydown). Creates/resumes the
   * context and plays a silent buffer (iOS needs it). Idempotent.
   */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || this.appSuspended) return;
    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      src.onended = () => src.disconnect();
      if (ctx.state !== 'running') await ctx.resume();
    } catch {
      return;
    }
    this.applyPendingMusic();
  }

  /**
   * Registers one-shot listeners that call `unlock()` on the first user gesture.
   * Returns a function removing them.
   */
  installUnlockListeners(target: EventTarget | undefined = globalThis.window): () => void {
    if (!target) return () => {};
    const events = ['pointerdown', 'touchend', 'keydown', 'click'];
    const handler = (): void => {
      void this.unlock().then(() => {
        if (this.ctx?.state === 'running') remove();
      });
    };
    const remove = (): void => {
      for (const e of events) target.removeEventListener(e, handler, true);
    };
    for (const e of events) target.addEventListener(e, handler, true);
    return remove;
  }

  /** App went to background (Capacitor pause / visibilitychange). */
  async suspend(): Promise<void> {
    this.appSuspended = true;
    if (this.ctx && this.ctx.state === 'running') {
      try {
        await this.ctx.suspend();
      } catch {
        /* ignore */
      }
    }
  }

  /** App returned to foreground. */
  async resume(): Promise<void> {
    this.appSuspended = false;
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* still locked: the next gesture will unlock */
      }
    }
    this.applyPendingMusic();
  }

  /** Stops music and closes the context. The engine can be used again afterwards. */
  async dispose(): Promise<void> {
    this.music?.stop(0.01);
    this.music = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = this.sfxBus = this.musicBus = null;
    this.budget.reset();
    this.throttle.reset();
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }

  // --- mixer -----------------------------------------------------------------------------

  setVolume(channel: AudioChannel, volume: number): void {
    this.volumes[channel] = clamp01(volume);
    this.applyGains();
  }

  getVolume(channel: AudioChannel): number {
    return this.volumes[channel];
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGains();
  }

  isMuted(): boolean {
    return this.muted;
  }

  // --- SFX -------------------------------------------------------------------------------

  /** Generic entry point; `a`/`b` are the recipe parameters (see the typed helpers). */
  play(id: SfxId, a = 0, b = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running' || this.appSuspended || this.muted) return;
    const recipe = SFX[id];
    const now = ctx.currentTime;
    if (!this.throttle.accept(sfxThrottleKey(id, a, b), now, recipe.throttle)) return;
    if (!recipe.important && !this.budget.canAcquire(now, recipe.voices)) return;
    try {
      const end = recipe.play({ ctx, out: this.sfxBus }, now + 0.005, a, b);
      if (!recipe.important) this.budget.tryAcquire(now, end, recipe.voices);
    } catch {
      /* never let audio break the game */
    }
  }

  swap(): void {
    this.play('swap');
  }
  land(): void {
    this.play('land');
  }
  /** Blocks start flashing (match detected). */
  match(): void {
    this.play('match');
  }
  /** One block popping; `indexInGroup` 0.., `chain` 1 = no chain. */
  pop(indexInGroup: number, chain = 1): void {
    this.play('pop', Math.max(0, Math.floor(indexInGroup)), Math.max(1, Math.floor(chain)));
  }
  /** Chain stinger for chain level n (>= 2). */
  chain(n: number): void {
    this.play('chain', Math.floor(n));
  }
  /** Combo stab for n blocks cleared at once (>= 4). */
  combo(n: number): void {
    this.play('combo', Math.floor(n));
  }
  rowRise(): void {
    this.play('rowRise');
  }
  /** Heartbeat pulse; call on a beat while in danger (self-throttled to ~350 ms). */
  danger(): void {
    this.play('danger');
  }
  gameOver(): void {
    this.play('gameOver');
  }
  uiTap(): void {
    this.play('uiTap');
  }
  uiConfirm(): void {
    this.play('uiConfirm');
  }
  purchase(): void {
    this.play('purchase');
  }
  /** Sparkle for unlocking an item (named to avoid clashing with `unlock()`). */
  itemUnlock(): void {
    this.play('unlock');
  }
  stageClear(): void {
    this.play('stageClear');
  }
  bossIntro(): void {
    this.play('bossIntro');
  }

  // --- music -----------------------------------------------------------------------------

  /** Starts (or crossfades to) a theme. Before unlock the request is remembered. */
  playMusic(theme: MusicThemeId, opts: PlayMusicOptions = {}): void {
    if (opts.intensity !== undefined) this.intensity = clamp01(opts.intensity);
    if (opts.bpm !== undefined) this.tempo = opts.bpm;
    this.pendingMusic = { theme, opts };
    this.applyPendingMusic();
  }

  /** Fades the music out (seconds). */
  stopMusic(fade = 1): void {
    this.pendingMusic = null;
    this.music?.stop(fade);
    this.music = null;
  }

  get currentTheme(): MusicThemeId | null {
    return this.music?.theme ?? this.pendingMusic?.theme ?? null;
  }

  /** 0..1: adds layers (arp, lead, extra hats/fills) and opens the music filter. */
  setIntensity(v: number): void {
    this.intensity = clamp01(v);
    this.music?.setIntensity(this.intensity);
  }

  getIntensity(): number {
    return this.intensity;
  }

  /** Tempo override in bpm; `null` restores the theme's tempo. */
  setTempo(bpm: number | null): void {
    this.tempo = bpm;
    if (this.music) this.music.setTempo(bpm ?? this.music.track.bpm);
  }

  // --- internals -------------------------------------------------------------------------

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.failed) return null;
    const ctx = this.createContext();
    if (!ctx) {
      this.failed = true;
      return null;
    }
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(comp);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
    } catch {
      this.failed = true;
      return null;
    }
    this.ctx = ctx;
    this.applyGains(true);
    return ctx;
  }

  private applyGains(immediate = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = ctx.currentTime;
    const set = (node: GainNode, value: number): void => {
      if (immediate) node.gain.value = value;
      else node.gain.setTargetAtTime(value, t, MUTE_RAMP);
    };
    set(this.master, this.muted ? 0 : volumeToGain(this.volumes.master));
    set(this.sfxBus, volumeToGain(this.volumes.sfx));
    set(this.musicBus, volumeToGain(this.volumes.music));
  }

  private applyPendingMusic(): void {
    const req = this.pendingMusic;
    const ctx = this.ctx;
    if (!req || !ctx || !this.musicBus || ctx.state !== 'running' || this.appSuspended) return;
    this.pendingMusic = null;
    const fade = req.opts.fade ?? 1.2;
    if (this.music && this.music.theme === req.theme && req.opts.seed === undefined) return;
    this.music?.stop(fade);
    this.music = new MusicPlayer(ctx, this.musicBus, {
      theme: req.theme,
      seed: req.opts.seed ?? 1,
      intensity: this.intensity,
      fadeIn: fade,
      ...(this.tempo !== null ? { bpm: this.tempo } : {}),
    });
  }
}
