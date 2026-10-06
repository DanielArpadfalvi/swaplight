import { createSim, step, type SimHooks } from '../core/sim';
import type { SimEvent, SimInput, SimState } from '../core/types';
import type { BoardGeometry } from '../input/geometry';
import { GestureController } from '../input/gesture';
import { KeyboardController } from '../input/keyboard';
import { createSimView, type SimView } from '../input/simView';

/**
 * One Endless game: the sim plus its input controllers. Pure logic (no DOM / Pixi): the host binds
 * pointer/keyboard events to `gesture` / `keyboard` and calls `tick(now)` at 60 Hz.
 *
 * Raise commands of both controllers are merged into a single held state, so releasing Shift does
 * not cancel a finger that still holds the raise (and vice versa).
 */
export class EndlessSession {
  sim: SimState;
  readonly gesture: GestureController;
  readonly keyboard: KeyboardController;
  /** Number of events of each type seen since the game started (tests / debugging). */
  readonly eventCounts: Partial<Record<SimEvent['type'], number>> = {};
  /** Events of the last tick (reused array). */
  readonly events: SimEvent[] = [];
  private pending: SimInput[] = [];
  private raiseSent = false;
  /** On-screen RAISE button held (merged with gesture / keyboard raise). */
  private raiseButton = false;
  /** The keyboard was used this game (show its cursor). */
  keyboardActive = false;

  constructor(
    seed: string,
    private readonly getGeometry: () => BoardGeometry | null,
  ) {
    this.sim = createSim(seed, {}, 'endless');
    const base = createSimView(() => this.sim);
    // Modes with extra swap rules (Puzzle: only while settled) gate the controllers' swaps too,
    // so a drag waits for a legal moment instead of emitting a swap that would be refused.
    const view: SimView = {
      get rows() {
        return base.rows;
      },
      get cols() {
        return base.cols;
      },
      blockAt: (row, col) => base.blockAt(row, col),
      locate: (id) => base.locate(id),
      canSwap: (row, col) => base.canSwap(row, col) && (this.swapGate?.(row, col) ?? true),
      rowsRisen: () => base.rowsRisen(),
    };
    this.gesture = new GestureController(view);
    this.keyboard = new KeyboardController(view);
  }

  get seed(): string {
    return String(this.sim.seed);
  }

  /** Sim hooks passed to every step (Run stages: relics, curses…); none for Endless. */
  hooks: SimHooks | undefined = undefined;

  /** Extra swap rule of the current mode (reset by `load`). */
  swapGate: ((row: number, col: number) => boolean) | undefined = undefined;

  /**
   * Replaces the plain `step` of a tick (reset by `load`): the Puzzle / Tutorial modes route swaps
   * through the puzzle runner (move budget, undo). Must advance the sim exactly one tick and
   * collect its events into `events`.
   */
  stepper: ((inputs: readonly SimInput[], events: SimEvent[]) => void) | undefined = undefined;

  restart(seed: string): void {
    this.load(createSim(seed, {}, 'endless'));
  }

  /** Play an existing sim (a Run stage, or a resumed one) with optional hooks. */
  load(sim: SimState, hooks?: SimHooks): void {
    this.sim = sim;
    this.hooks = hooks;
    this.swapGate = undefined;
    this.stepper = undefined;
    this.gesture.reset();
    this.gesture.takeCommands();
    this.gesture.takeUiEvents();
    this.keyboard.releaseAll();
    this.keyboard.takeCommands();
    this.keyboard.update();
    this.pending = [];
    this.raiseSent = false;
    this.raiseButton = false;
    this.keyboardActive = false;
    for (const k of Object.keys(this.eventCounts)) delete this.eventCounts[k as SimEvent['type']];
  }

  /**
   * Hold / release the dedicated on-screen RAISE button. Adapter until `GestureController` exposes
   * its own raise-button input; the hold is OR-ed with the gesture and keyboard raise.
   */
  setRaiseButton(active: boolean): void {
    this.raiseButton = active;
  }

  get raiseButtonHeld(): boolean {
    return this.raiseButton;
  }

  /** Queue a command for the next tick (test hooks, scripted input). */
  queue(input: SimInput): void {
    this.pending.push(input);
  }

  /** Advance one fixed tick; returns this tick's events (valid until the next call). */
  tick(now: number): SimEvent[] {
    const inputs = this.collectInputs(now);
    this.events.length = 0;
    if (this.stepper) this.stepper(inputs, this.events);
    else step(this.sim, inputs, this.hooks, this.events);
    for (const e of this.events) this.eventCounts[e.type] = (this.eventCounts[e.type] ?? 0) + 1;
    return this.events;
  }

  /**
   * This tick's player inputs (gesture, keyboard, queued commands, merged raise) without stepping
   * the sim — for modes that step it themselves (Versus steps both boards in lockstep). Follow
   * with `acceptEvents` for the step's events.
   */
  collectInputs(now: number): SimInput[] {
    const geo = this.getGeometry();
    this.gesture.update(now, geo ?? undefined);
    this.keyboard.update();
    const inputs: SimInput[] = [];
    for (const c of this.gesture.takeCommands()) if (c.type === 'swap') inputs.push(c);
    const keys = this.keyboard.takeCommands();
    if (keys.length > 0) this.keyboardActive = true;
    for (const c of keys) if (c.type === 'swap') inputs.push(c);
    for (const c of this.pending) inputs.push(c);
    this.pending = [];
    const raise = this.gesture.hints.raising || this.keyboard.isRaising || this.raiseButton;
    if (raise !== this.raiseSent) {
      inputs.push({ type: 'raise', active: raise });
      this.raiseSent = raise;
    }
    return inputs;
  }

  /** Adopt the events of a step made elsewhere (see `collectInputs`). */
  acceptEvents(events: readonly SimEvent[]): SimEvent[] {
    this.events.length = 0;
    for (const e of events) {
      this.events.push(e);
      this.eventCounts[e.type] = (this.eventCounts[e.type] ?? 0) + 1;
    }
    return this.events;
  }
}
