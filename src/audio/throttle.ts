// Pure throttling / voice-budget logic. Time is always passed in (seconds), never read.

/** Drops repeats of the same key that arrive within `windowSec` of the last accepted one. */
export class SoundThrottle {
  private readonly last = new Map<string, number>();

  constructor(private readonly windowSec = 0.03) {}

  /** Returns true if the sound may play now (and records it). `windowSec` overrides the default. */
  accept(key: string, now: number, windowSec = this.windowSec): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now >= prev && now - prev < windowSec) return false;
    this.last.set(key, now);
    return true;
  }

  reset(): void {
    this.last.clear();
  }
}

/**
 * Tracks how many SFX voices are still sounding. When the budget is exhausted new voices are
 * rejected (low-priority) — this keeps CPU bounded and prevents clipping on huge clears.
 */
export class VoiceBudget {
  private ends: number[] = [];

  constructor(private readonly maxVoices = 24) {}

  /** Number of voices still sounding at `now`. */
  active(now: number): number {
    this.ends = this.ends.filter((e) => e > now);
    return this.ends.length;
  }

  /** Whether `count` more voices fit right now. */
  canAcquire(now: number, count = 1): boolean {
    return this.active(now) + count <= this.maxVoices;
  }

  /** Try to allocate `count` voices ending at `endTime`. Returns false if over budget. */
  tryAcquire(now: number, endTime: number, count = 1): boolean {
    if (this.active(now) + count > this.maxVoices) return false;
    for (let i = 0; i < count; i++) this.ends.push(endTime);
    return true;
  }

  reset(): void {
    this.ends = [];
  }
}
