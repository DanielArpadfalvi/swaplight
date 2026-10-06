/**
 * Frame-time statistics for the perf pass (`window.__swaplight.perf`, `tests/e2e/perf.spec.ts`).
 * Pure: the caller measures, this only summarizes.
 */

/** One frame at 60 Hz, in ms. */
export const FRAME_BUDGET_MS = 1000 / 60;

export interface FrameStats {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Frames above `budgetMs`. */
  over: number;
}

/** Nearest-rank percentile of an ascending array (`q` in 0..1). */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(Math.min(1, Math.max(0, q)) * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? 0;
}

export function summarizeFrames(
  samples: readonly number[],
  budgetMs = FRAME_BUDGET_MS,
): FrameStats {
  const sorted = samples.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const count = sorted.length;
  let sum = 0;
  let over = 0;
  for (const v of sorted) {
    sum += v;
    if (v > budgetMs) over++;
  }
  return {
    count,
    mean: count ? sum / count : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: count ? (sorted[count - 1] ?? 0) : 0,
    over,
  };
}

/** Per-frame cost split by phase. */
export interface FrameSample {
  /** Simulation ticks + event feedback (`onTick`). */
  sim: number;
  /** Scene update: interpolation, effects, background (`onRender`). */
  update: number;
  /** Pixi scene traversal + WebGL command submission (`app.render`). */
  draw: number;
  /** Deferred UI work (Preact renders queued during the frame). */
  ui: number;
}

export type FramePhase = keyof FrameSample;

export interface PerfReport {
  frames: number;
  phases: Record<FramePhase | 'total', FrameStats>;
  /** Peak live particles / popups seen during the run. */
  peakParticles: number;
  peakPopups: number;
  /** Display objects under the stage at the end of the run. */
  displayObjects: number;
}

export function summarizeSamples(
  samples: readonly FrameSample[],
  extra: Omit<PerfReport, 'frames' | 'phases'>,
): PerfReport {
  const pick = (f: (s: FrameSample) => number) => summarizeFrames(samples.map(f));
  return {
    frames: samples.length,
    phases: {
      sim: pick((s) => s.sim),
      update: pick((s) => s.update),
      draw: pick((s) => s.draw),
      ui: pick((s) => s.ui),
      total: pick((s) => s.sim + s.update + s.draw + s.ui),
    },
    ...extra,
  };
}
