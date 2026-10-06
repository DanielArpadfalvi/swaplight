/**
 * Fixed-timestep game loop (60 Hz simulation, render interpolation).
 *
 * `FixedStepper` is the pure accumulator; `GameLoop` adds pause/manual stepping on top. Neither
 * touches the DOM: the host calls `loop.frame(dtMs)` once per animation frame (Pixi ticker /
 * requestAnimationFrame) and the loop calls `onTick()` 0..maxSteps times followed by
 * `onRender(alpha, dtSeconds)`.
 */

export const SIM_STEP_MS = 1000 / 60;

export class FixedStepper {
  private acc = 0;

  constructor(
    readonly stepMs = SIM_STEP_MS,
    /** Max simulation steps per frame; a longer stall is dropped instead of caught up. */
    readonly maxSteps = 5,
  ) {}

  /** Add frame time and return how many fixed steps to run now. */
  advance(dtMs: number): number {
    if (!(dtMs > 0)) return 0;
    this.acc += dtMs;
    let steps = Math.floor(this.acc / this.stepMs);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      // Drop the backlog but keep the sub-step phase so motion stays smooth afterwards.
      this.acc = this.acc % this.stepMs;
    } else {
      this.acc -= steps * this.stepMs;
    }
    return steps;
  }

  /** Interpolation factor between the previous and the current tick, in [0, 1). */
  get alpha(): number {
    return Math.min(1, Math.max(0, this.acc / this.stepMs));
  }

  reset(): void {
    this.acc = 0;
  }
}

export interface GameLoopCallbacks {
  /** Advance the simulation by exactly one fixed tick. */
  onTick(): void;
  /** Draw; `alpha` interpolates previous → current tick, `dt` is the (clamped) frame time in s. */
  onRender(alpha: number, dt: number): void;
}

export class GameLoop {
  readonly stepper: FixedStepper;
  private paused = true;
  private alpha = 1;

  constructor(
    private readonly callbacks: GameLoopCallbacks,
    stepper: FixedStepper = new FixedStepper(),
    /** Frame time handed to `onRender` is clamped to this (seconds). */
    private readonly maxFrameDt = 0.05,
  ) {
    this.stepper = stepper;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Run one animation frame of `dtMs` milliseconds. Returns the number of ticks run. */
  frame(dtMs: number): number {
    let steps = 0;
    if (!this.paused) {
      steps = this.stepper.advance(dtMs);
      for (let i = 0; i < steps; i++) this.callbacks.onTick();
      this.alpha = this.stepper.alpha;
    }
    this.callbacks.onRender(this.alpha, Math.min(this.maxFrameDt, Math.max(0, dtMs / 1000)));
    return steps;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.stepper.reset();
    this.alpha = 0;
  }

  /** Manual deterministic stepping (tests / debugging); renders the newest tick (alpha 1). */
  stepTicks(n: number): void {
    for (let i = 0; i < n; i++) this.callbacks.onTick();
    if (n > 0) this.alpha = 1;
  }

  /** Forget interpolation state (new game). */
  reset(): void {
    this.stepper.reset();
    this.alpha = 1;
  }
}
