import { describe, expect, it } from 'vitest';
import { boardToAscii } from '../../../../src/core/ascii';
import { checkInvariants } from '../../../../src/core/invariants';
import { step } from '../../../../src/core/sim';
import {
  CHARMS,
  CHARM_FREEZE_UNTIL,
  CHARM_LAST_USE,
  MOD_HIDDEN_COLOR,
  MOD_LOCKED_COLUMNS,
  MOD_SWAP_LOCK_UNTIL,
  STAGE_CHARM_CLEARED,
  completeStage,
  evaluateStage,
  getCharm,
  useCharm,
  type CharmCtx,
  type RunState,
} from '../../../../src/core/run';
import type { SimState } from '../../../../src/core/types';
import { ofType, settle } from '../helpers';
import { atStage, runWith, scoreOf, stageSim } from './fixtures';

const covered = new Set<string>();

function applyCharm(id: string, sim: SimState, ctx: CharmCtx = {}): boolean {
  covered.add(id);
  return getCharm(id).apply!(sim, ctx);
}

const BOARD = `
  ..R...
  ..G...
  .BYR..
  RGBYPR
  GBYPRG
`;

const colorsOf = (sim: SimState) =>
  sim.cells
    .filter((b) => b)
    .map((b) => b!.color)
    .sort();

describe('charm catalogue', () => {
  it('has 15 charms with unique ids and prices 3–6', () => {
    expect(CHARMS).toHaveLength(15);
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(15);
    for (const c of CHARMS) {
      expect(c.price).toBeGreaterThanOrEqual(3);
      expect(c.price).toBeLessThanOrEqual(6);
      expect(c.apply || c.applyRun).toBeTruthy();
    }
  });
});

describe('board charms', () => {
  it('purge clears the tallest column (or a chosen one) and counts the blocks', () => {
    const { sim } = stageSim(runWith(), BOARD);
    expect(applyCharm('purge', sim)).toBe(true);
    expect(boardToAscii(sim)).toBe(['.B.R..', 'RG.YPR', 'GB.PRG'].join('\n'));
    expect(sim.modifiers[STAGE_CHARM_CLEARED]).toBe(5);
    const other = stageSim(runWith(), BOARD).sim;
    expect(applyCharm('purge', other, { target: { col: 0 } })).toBe(true);
    expect(other.modifiers[STAGE_CHARM_CLEARED]).toBe(2);
    const empty = stageSim(runWith(), '').sim;
    expect(applyCharm('purge', empty)).toBe(false);
  });

  it('undertow removes the bottom row and the stack drops', () => {
    const { sim } = stageSim(runWith(), BOARD);
    expect(applyCharm('undertow', sim)).toBe(true);
    step(sim);
    settle(sim);
    expect(boardToAscii(sim)).toBe(['..R...', '..G...', '.BYR..', 'RGBYPR'].join('\n'));
    expect(checkInvariants(sim)).toEqual([]);
  });

  it('monotone recolors the bottom row to its dominant color → instant 6-combo', () => {
    const { sim } = stageSim(runWith(), 'BBGB..\nRGBRBR');
    expect(applyCharm('monotone', sim)).toBe(true);
    expect(boardToAscii(sim)).toBe('BBGB..\nRRRRRR');
    const events = step(sim);
    expect(ofType(events, 'matched')[0]!.combo).toBe(6);
    expect(applyCharm('monotone', stageSim(runWith(), 'RR....').sim)).toBe(false);
    expect(applyCharm('monotone', stageSim(runWith(), 'RRRRRR').sim)).toBe(false);
    const chosen = stageSim(runWith(), 'BBGB..\nRGBRBR').sim;
    expect(applyCharm('monotone', chosen, { target: { row: 10 } })).toBe(true);
    expect(boardToAscii(chosen)).toBe('BBBB..\nRGBRBR');
  });

  it('kaleido shuffles the top three rows deterministically, keeping the colors', () => {
    const a = stageSim(runWith(), BOARD).sim;
    const b = stageSim(runWith(), BOARD).sim;
    const before = colorsOf(a);
    expect(applyCharm('kaleido', a)).toBe(true);
    applyCharm('kaleido', b);
    expect(boardToAscii(a)).toBe(boardToAscii(b));
    expect(colorsOf(a)).toEqual(before);
    // rows below the top three are untouched
    expect(boardToAscii(a).split('\n').slice(3)).toEqual(['RGBYPR', 'GBYPRG']);
  });

  it('joker / fuse convert two random resting blocks', () => {
    const j = stageSim(runWith(), BOARD).sim;
    expect(applyCharm('joker', j)).toBe(true);
    expect(j.cells.filter((x) => x?.kind === 'wild')).toHaveLength(2);
    const f = stageSim(runWith(), BOARD).sim;
    expect(applyCharm('fuse', f)).toBe(true);
    expect(f.cells.filter((x) => x?.kind === 'bomb')).toHaveLength(2);
    expect(applyCharm('fuse', stageSim(runWith(), '').sim)).toBe(false);
  });

  it('a joker wild then completes matches in play', () => {
    const { sim } = stageSim(runWith(), 'RGRB..');
    sim.cells[11 * 6 + 1]!.kind = 'wild';
    sim.matchScanPending = true;
    const events = [...step(sim), ...settle(sim)];
    expect(ofType(events, 'matched')).toHaveLength(1);
  });

  it('detonate blasts the 3×3 around the top of the tallest column', () => {
    const { sim } = stageSim(runWith(), BOARD);
    expect(applyCharm('detonate', sim)).toBe(true);
    // center (7,2): rows 6..8 × cols 1..3 hold two blocks
    expect(sim.modifiers[STAGE_CHARM_CLEARED]).toBe(2);
    step(sim);
    settle(sim);
    expect(checkInvariants(sim)).toEqual([]);
    const aimed = stageSim(runWith(), BOARD).sim;
    expect(applyCharm('detonate', aimed, { target: { row: 11, col: 0 } })).toBe(true);
    expect(aimed.modifiers[STAGE_CHARM_CLEARED]).toBe(4);
  });

  it('vanish removes every block of the dominant top color', () => {
    const { sim } = stageSim(runWith(), BOARD);
    const reds = sim.cells.filter((b) => b?.color === 0).length;
    expect(applyCharm('vanish', sim)).toBe(true);
    expect(sim.cells.some((b) => b?.color === 0)).toBe(false);
    expect(sim.modifiers[STAGE_CHARM_CLEARED]).toBe(reds);
  });

  it('lifeline clears the top three rows and refills grace', () => {
    const rows = Array.from({ length: 12 }, (_, r) => 'RGBYPRGBYPR'.slice(r % 5, (r % 5) + 6));
    const { sim } = stageSim(runWith(), rows.join('\n'));
    sim.grace = 10;
    expect(applyCharm('lifeline', sim)).toBe(true);
    expect(sim.cells.slice(0, 18).every((b) => b === null)).toBe(true);
    expect(sim.grace).toBe(sim.config.graceTicks);
    expect(applyCharm('lifeline', stageSim(runWith(), 'RGBYPR').sim)).toBe(false);
  });

  it('board charms never touch blocks that are clearing or swapping', () => {
    const { sim } = stageSim(runWith(), 'RRRGBY');
    step(sim); // RRR matched
    expect(applyCharm('undertow', sim)).toBe(true);
    expect(sim.cells.slice(66, 69).every((b) => b?.state === 'matched')).toBe(true);
    settle(sim);
    expect(checkInvariants(sim)).toEqual([]);
  });
});

describe('time and score charms', () => {
  it('cryo freezes the auto-rise for 5 seconds', () => {
    const run = runWith();
    const { setup, sim } = stageSim(run, 'RGBYPR', 'endless');
    expect(applyCharm('cryo', sim)).toBe(true);
    expect(sim.modifiers[CHARM_FREEZE_UNTIL]).toBe(300);
    for (let i = 0; i < 299; i++) step(sim, [], setup.hooks);
    expect(sim.riseOffset + sim.riseAccum).toBe(0);
    for (let i = 0; i < 100; i++) step(sim, [], setup.hooks);
    expect(sim.riseAccum + sim.riseOffset).toBeGreaterThan(0);
  });

  it('hourglass adds 8 s of stop time', () => {
    const { sim } = stageSim(runWith(), 'RGBYPR');
    sim.stopTicks = 20;
    expect(applyCharm('hourglass', sim)).toBe(true);
    expect(sim.stopTicks).toBe(500);
  });

  it('overcharge: +3 mult for 15 s', () => {
    const { setup, sim } = stageSim(runWith(), 'RGBYPR');
    expect(applyCharm('overcharge', sim)).toBe(true);
    expect(scoreOf(setup, sim).mult).toBe(4);
    sim.tick = 900;
    expect(scoreOf(setup, sim).mult).toBe(1);
  });
});

describe('boss counters', () => {
  it('skeleton key removes locks and disables the Stagger curse', () => {
    const run = atStage(runWith(), 1, 3, { curses: ['lock', 'stagger'] });
    const { setup, sim } = stageSim(run, 'RGBYPR');
    expect(sim.modifiers[MOD_LOCKED_COLUMNS]).toBeGreaterThan(0);
    expect(applyCharm('skeleton_key', sim)).toBe(true);
    expect(sim.modifiers[MOD_LOCKED_COLUMNS]).toBeUndefined();
    scoreOf(setup, sim, { chain: 2 });
    expect(sim.modifiers[MOD_SWAP_LOCK_UNTIL]).toBeUndefined();
    expect(applyCharm('skeleton_key', sim)).toBe(false);
  });

  it('lantern reveals the hidden color; without one it has no effect', () => {
    const veiled = stageSim(atStage(runWith(), 1, 3, { curses: ['veil'] }), 'RGBYPR').sim;
    expect(veiled.modifiers[MOD_HIDDEN_COLOR]).toBeDefined();
    expect(applyCharm('lantern', veiled)).toBe(true);
    expect(veiled.modifiers[MOD_HIDDEN_COLOR]).toBeUndefined();
    expect(applyCharm('lantern', stageSim(runWith(), 'RGBYPR').sim)).toBe(false);
  });
});

describe('useCharm (run level)', () => {
  const stageRun = (charms: string[], relics: string[] = []): RunState => {
    const run = runWith(relics);
    run.charms = charms.map((id) => ({ id, paid: getCharm(id).price }));
    return run;
  };

  it('consumes the charm, stamps the use tick and counts it', () => {
    const run = stageRun(['hourglass', 'cryo']);
    const { sim } = stageSim(run, 'RGBYPR');
    sim.tick = 77;
    const r = useCharm(run, 1, sim);
    expect(r.ok).toBe(true);
    expect(r.run.charms.map((c) => c.id)).toEqual(['hourglass']);
    expect(r.run.stats.charmsUsed).toBe(1);
    expect(sim.modifiers[CHARM_LAST_USE]).toBe(77);
    expect(run.charms).toHaveLength(2); // input untouched
  });

  it('keeps a charm without effect, and needs a sim for board charms', () => {
    const run = stageRun(['lantern', 'purge']);
    const { sim } = stageSim(run, 'RGBYPR');
    expect(useCharm(run, 0, sim)).toMatchObject({ ok: false, reason: 'noEffect' });
    expect(useCharm(run, 1, null)).toMatchObject({ ok: false, reason: 'noSim' });
    expect(useCharm(run, 5, sim)).toMatchObject({ ok: false, reason: 'index' });
  });

  it('golden ticket works in the shop without a sim; stage charms do not', () => {
    covered.add('golden_ticket');
    let run = stageRun(['golden_ticket', 'cryo']);
    const { sim } = stageSim(run, 'RGBYPR');
    sim.score = 5000;
    run = completeStage(run, {
      ...evaluateStage(stageSim(run).setup.goal, sim),
      won: true,
      ticks: 10,
      ticksLeft: 0,
      score: 5000,
      blocksCleared: 0,
      maxChain: 1,
      maxCombo: 0,
      modifiers: {},
    }).run;
    expect(run.phase).toBe('shop');
    const before = run.szikra;
    const r = useCharm(run, 0, null);
    expect(r.ok).toBe(true);
    expect(r.run.szikra).toBe(before + 6);
    expect(useCharm(r.run, 0, null)).toMatchObject({ ok: false, reason: 'phase' });
  });

  it('charm effects are deterministic across identical sims', () => {
    for (const c of CHARMS) {
      if (!c.apply) continue;
      const a = stageSim(runWith(), BOARD).sim;
      const b = stageSim(runWith(), BOARD).sim;
      c.apply(a, {});
      c.apply(b, {});
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});

describe('coverage', () => {
  it('every charm has an effect test', () => {
    expect(CHARMS.map((c) => c.id).filter((id) => !covered.has(id))).toEqual([]);
  });
});
