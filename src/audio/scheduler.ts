// Pure look-ahead step clock. The caller polls `collect(until)` from a timer (~25 ms) with
// `until = audioCtx.currentTime + lookahead`; every step whose start time falls before `until`
// is returned exactly once with its precise audio-clock time.

import { sixteenthDuration } from './theory';

export interface ScheduledStep {
  step: number;
  time: number;
}

export const LOOKAHEAD_SEC = 0.12;
export const TIMER_INTERVAL_MS = 25;

export class StepClock {
  private nextTime: number;
  private nextStep = 0;
  private stepDur: number;

  constructor(startTime: number, bpm: number) {
    this.nextTime = startTime;
    this.stepDur = sixteenthDuration(clampBpm(bpm));
  }

  get bpm(): number {
    return 60 / (this.stepDur * 4);
  }

  /** Changes tempo from the next unscheduled step on (no jumps in already-queued notes). */
  setTempo(bpm: number): void {
    this.stepDur = sixteenthDuration(clampBpm(bpm));
  }

  get stepDuration(): number {
    return this.stepDur;
  }

  /**
   * Returns all steps starting before `until`. If the clock fell far behind (e.g. tab was
   * throttled), it skips ahead to `now` instead of bursting a backlog of notes.
   */
  collect(until: number, now: number = until): ScheduledStep[] {
    if (this.nextTime < now - this.stepDur * 4) {
      const behind = Math.ceil((now - this.nextTime) / this.stepDur);
      this.nextStep += behind;
      this.nextTime += behind * this.stepDur;
    }
    const out: ScheduledStep[] = [];
    while (this.nextTime < until && out.length < 64) {
      out.push({ step: this.nextStep, time: this.nextTime });
      this.nextStep++;
      this.nextTime += this.stepDur;
    }
    return out;
  }
}

function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 120;
  return Math.min(220, Math.max(40, bpm));
}
