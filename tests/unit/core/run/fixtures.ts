import { loadAscii } from '../../../../src/core/ascii';
import { scoreClear, type ScoreBreakdown } from '../../../../src/core/scoring';
import { createSim } from '../../../../src/core/sim';
import type { SimMode, SimState } from '../../../../src/core/types';
import {
  createRun,
  getRelic,
  stageConfig,
  type RunState,
  type StageSetup,
} from '../../../../src/core/run';

/** A fresh B1 neon run at act 1 stage 1 with the given relics (no charms). */
export function runWith(relics: string[] = [], patch: Partial<RunState> = {}): RunState {
  const run = createRun('fixture');
  run.charms = [];
  run.relics = relics.map((id) => ({
    id,
    paid: getRelic(id).price,
    state: { ...getRelic(id).initialState },
  }));
  return { ...run, ...patch };
}

/** Put the run on a given stage; optionally force goal type / curses. */
export function atStage(
  run: RunState,
  act: number,
  stage: number,
  patch: { goalType?: RunState['plan'][number]['goalType']; curses?: string[] } = {},
): RunState {
  const next = structuredClone(run);
  next.act = act;
  next.stage = stage;
  const p = next.plan[(act - 1) * 4 + stage]!;
  if (patch.goalType) p.goalType = patch.goalType;
  if (patch.curses) p.curses = patch.curses;
  return next;
}

/** Stage setup + a sim (static mode by default) with an optional ASCII board. */
export function stageSim(
  run: RunState,
  ascii?: string,
  mode: SimMode = 'static',
): { setup: StageSetup; sim: SimState } {
  const setup = stageConfig(run);
  const sim = createSim(setup.seed, setup.config, mode, { modifiers: setup.modifiers });
  if (ascii !== undefined) loadAscii(sim, ascii);
  return { setup, sim };
}

export interface ClearSpec {
  combo?: number;
  chain?: number;
  colors?: number[];
  level?: number;
}

/** Score one clear through the stage's hooks on `sim`. */
export function scoreOf(setup: StageSetup, sim: SimState, spec: ClearSpec = {}): ScoreBreakdown {
  const combo = spec.combo ?? spec.colors?.length ?? 3;
  return scoreClear(
    {
      blocks: combo,
      combo,
      chain: spec.chain ?? 1,
      level: spec.level ?? 1,
      colors: spec.colors ?? new Array<number>(combo).fill(0),
    },
    sim.config,
    setup.hooks.scoreModifiers,
    sim,
  );
}

/** Score with just these relics on an (optionally given) board. */
export function relicScore(
  relics: string[],
  spec: ClearSpec = {},
  ascii = '',
  patch: Partial<RunState> = {},
): ScoreBreakdown {
  const { setup, sim } = stageSim(runWith(relics, patch), ascii);
  return scoreOf(setup, sim, spec);
}
