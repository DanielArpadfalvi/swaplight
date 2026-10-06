import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import type { PerfReport } from '../../src/game/perf';

/**
 * Perf pass (T3.3): per-frame CPU cost of sim + effects + Pixi submission + UI under worst-case
 * chain feedback, with the CPU throttled to approximate a mid-range phone. Results and method:
 * `docs/PERF.md`; per-scenario JSON lands in `test-results/perf/`.
 *
 * CI and the dev container render WebGL in software (SwiftShader, in the GPU process), so
 * wall-clock FPS here says nothing about a real GPU. What we can measure reliably is main-thread
 * work per frame, which is what drops frames on phones for a scene this size. The budgets are
 * regression guards with headroom for slower CI machines, not targets: see `docs/PERF.md` for the
 * measured numbers.
 */

const CPU_THROTTLE = 4;
/** p95 main-thread work per frame at `CPU_THROTTLE`× slowdown, in ms (one 60 Hz frame). */
const P95_BUDGET_MS = 1000 / 60;
/** Longest frame right after starting a mode (texture baking, font uploads), throttled. */
const FIRST_FRAME_BUDGET_MS = 120;
const FRAMES = 240;
const REPORT = 'test-results/perf';

// 1x DPR: software raster time grows with pixels and only slows the run down (it happens in the
// GPU process, outside the measured main-thread work, which barely depends on resolution).
test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

type Api = NonNullable<Window['__swaplight']>;

interface DomMetrics {
  layouts: number;
  styleRecalcs: number;
  layoutMs: number;
  styleMs: number;
  scriptMs: number;
  heapMb: number;
}

async function domMetrics(cdp: CDPSession): Promise<DomMetrics> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = (name: string) => metrics.find((x) => x.name === name)?.value ?? 0;
  return {
    layouts: m('LayoutCount'),
    styleRecalcs: m('RecalcStyleCount'),
    layoutMs: m('LayoutDuration') * 1000,
    styleMs: m('RecalcStyleDuration') * 1000,
    scriptMs: m('ScriptDuration') * 1000,
    heapMb: m('JSHeapUsedSize') / 2 ** 20,
  };
}

async function heapAfterGc(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  return (await domMetrics(cdp)).heapMb;
}

async function boot(page: Page): Promise<CDPSession> {
  await page.goto('/?test&seed=perf-1');
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => (window.__swaplight as Api).stopRendering());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  // A few seconds on the menu, as a player would: idle frames bake every mode's textures.
  await page.evaluate(() => (window.__swaplight as Api).perf!.profile({ frames: 240 }));
  return cdp;
}

interface ScenarioResult {
  scenario: string;
  report: PerfReport;
  perFrame: { layouts: number; styleRecalcs: number; layoutMs: number; styleMs: number };
  heapGrowthMb: number;
}

async function profile(
  page: Page,
  cdp: CDPSession,
  scenario: string,
  stress: boolean,
): Promise<ScenarioResult> {
  // Warm up (JIT, texture uploads, font atlases) unthrottled, then measure throttled.
  await page.evaluate(
    (s) => (window.__swaplight as Api).perf!.profile({ frames: 30, stress: s }),
    stress,
  );
  const heap0 = await heapAfterGc(cdp);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  const before = await domMetrics(cdp);
  const report = await page.evaluate(
    ([frames, s]) => (window.__swaplight as Api).perf!.profile({ frames, stress: s }),
    [FRAMES, stress] as const,
  );
  const after = await domMetrics(cdp);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const heap1 = await heapAfterGc(cdp);
  const n = report.frames;
  return {
    scenario,
    report,
    perFrame: {
      layouts: (after.layouts - before.layouts) / n,
      styleRecalcs: (after.styleRecalcs - before.styleRecalcs) / n,
      layoutMs: (after.layoutMs - before.layoutMs) / n,
      styleMs: (after.styleMs - before.styleMs) / n,
    },
    heapGrowthMb: heap1 - heap0,
  };
}

function fmt(r: ScenarioResult): string {
  const p = r.report.phases;
  const row = (k: keyof typeof p) =>
    `  ${k.padEnd(6)} mean ${p[k].mean.toFixed(2).padStart(6)}  p50 ${p[k].p50.toFixed(2).padStart(6)}` +
    `  p95 ${p[k].p95.toFixed(2).padStart(6)}  p99 ${p[k].p99.toFixed(2).padStart(6)}` +
    `  max ${p[k].max.toFixed(2).padStart(6)}  >16.7ms ${p[k].over}`;
  return [
    `${r.scenario} (${r.report.frames} frames, CPU ×${CPU_THROTTLE})`,
    ...(['sim', 'update', 'draw', 'ui', 'total'] as const).map(row),
    `  peak particles ${r.report.peakParticles}, popups ${r.report.peakPopups}, display objects ${r.report.displayObjects}`,
    `  per frame: layouts ${r.perFrame.layouts.toFixed(2)} (${r.perFrame.layoutMs.toFixed(2)} ms), ` +
      `style recalcs ${r.perFrame.styleRecalcs.toFixed(2)} (${r.perFrame.styleMs.toFixed(2)} ms)`,
    `  retained heap growth ${r.heapGrowthMb.toFixed(2)} MB`,
  ].join('\n');
}

function save(r: ScenarioResult): void {
  mkdirSync(REPORT, { recursive: true });
  writeFileSync(`${REPORT}/${r.scenario}.json`, JSON.stringify(r, null, 2));
  console.log(fmt(r));
}

function expectWithinBudget(r: ScenarioResult, p95Budget = P95_BUDGET_MS): void {
  const total = r.report.phases.total;
  expect(total.mean, `${r.scenario}: mean main-thread ms/frame`).toBeLessThan(P95_BUDGET_MS);
  expect(total.p95, `${r.scenario}: p95 main-thread ms/frame`).toBeLessThan(p95Budget);
  // DOM work must not run every frame (HUD updates only when a shown value changes).
  expect(r.perFrame.layouts, `${r.scenario}: layouts per frame`).toBeLessThan(0.5);
  // No leak: effects are pooled, so a long session must not retain memory.
  expect(r.heapGrowthMb, `${r.scenario}: retained heap growth`).toBeLessThan(2);
}

test.describe('perf', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('endless: idle board', async ({ page }) => {
    const cdp = await boot(page);
    await page.evaluate(() => (window.__swaplight as Api).start());
    const r = await profile(page, cdp, 'endless-idle', false);
    save(r);
    expectWithinBudget(r);
  });

  test('endless: worst-case chain effects', async ({ page }) => {
    const cdp = await boot(page);
    await page.evaluate(() => (window.__swaplight as Api).start());
    const r = await profile(page, cdp, 'endless-stress', true);
    save(r);
    expect(r.report.peakParticles).toBeGreaterThan(100);
    expectWithinBudget(r);
  });

  test('versus: first frame after the menu does not stall', async ({ page }) => {
    const cdp = await boot(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    const first = await page.evaluate(async () => {
      const api = window.__swaplight as Api;
      const t0 = performance.now();
      api.versus!.start({ seed: 'perf-2', level: 5 });
      const start = performance.now() - t0;
      const r = await api.perf!.profile({ frames: 5 });
      return { start, frame: r.phases.total.max };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(
      `versus-first-frame (CPU ×${CPU_THROTTLE}): start ${first.start.toFixed(1)} ms, ` +
        `longest frame ${first.frame.toFixed(1)} ms`,
    );
    expect(first.frame).toBeLessThan(FIRST_FRAME_BUDGET_MS);
  });

  test('versus: normal play vs the hardest CPU', async ({ page }) => {
    const cdp = await boot(page);
    await page.evaluate(() =>
      (window.__swaplight as Api).versus!.start({ seed: 'perf-1', level: 5 }),
    );
    const r = await profile(page, cdp, 'versus', false);
    save(r);
    expectWithinBudget(r);
  });

  test('versus: two boards + worst-case effects', async ({ page }) => {
    const cdp = await boot(page);
    await page.evaluate(() =>
      (window.__swaplight as Api).versus!.start({ seed: 'perf-1', level: 5 }),
    );
    const r = await profile(page, cdp, 'versus-stress', true);
    save(r);
    // Two boards under a chain ×5 every third of a second: the average still fits a frame, the
    // slowest 5 % may run over by up to half a frame at this throttle (see docs/PERF.md).
    expectWithinBudget(r, P95_BUDGET_MS * 1.5);
  });
});
