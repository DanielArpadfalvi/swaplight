import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { canSwap, cloneSim, step } from '../../src/core/sim';
import type { SimState } from '../../src/core/types';
import { createDefaultSave, type SaveData } from '../../src/game/save';
import {
  SCENES,
  STORE_TARGETS,
  frameHtml,
  sceneFileName,
  type SceneDef,
  type SceneId,
  type StoreLang,
  type StoreTarget,
} from '../../scripts/store-frames';
import { findMatchingSwap } from './support/solver';

/**
 * Store screenshots from the real game (`npm run store:screens`, config:
 * `playwright.store.config.ts`). Every scene boots a fresh context with a staged save (Full
 * Version, tutorial done, a daily streak…), drives the game through the `?test` hooks with the
 * render loop stopped, captures the raw frame at the store device size and composes the captioned
 * marketing frame into `store/screenshots/<target>/<lang>/NN-scene.png`.
 */

const OUT = 'store/screenshots';
const RAW = 'test-results/store-raw';
const TODAY = '2026-10-06';
const LANGS: readonly StoreLang[] = ['en', 'hu'];
/** Optional scene filter: `STORE_SCENES=run,shop npm run store:screens`. */
const ONLY = (process.env.STORE_SCENES ?? '').split(',').filter(Boolean);
/** `STORE_COMPOSE_ONLY=1`: rebuild the frames from the raw captures in `test-results/store-raw`. */
const COMPOSE_ONLY = process.env.STORE_COMPOSE_ONLY === '1';

type Api = NonNullable<Window['__swaplight']>;

// ------------------------------------------------------------------------------- staged save

function isoDay(offset: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** A seasoned player's save: unlocked, tutorial done, daily streak, some records. */
function stagedSave(): SaveData {
  const s = createDefaultSave();
  s.fullVersion = true;
  s.tutorialDone = true;
  s.hintsSeen = ['endless.controls'];
  const scores = [120, 165, 95, 210, 140, 185, 230, 150, 205, 175, 245, 160, 220];
  scores.forEach((score, i) => {
    s.daily[isoDay(i - scores.length)] = { score, attempts: 2, official: true, practiceBest: 0 };
  });
  s.dailyStreak = { current: scores.length, best: scores.length, last: isoDay(-1) };
  s.modes = {
    endless: {
      played: 42,
      best: 48210,
      bestChain: 6,
      bestCombo: 9,
      blocksCleared: 9120,
      playTime: 14800,
    },
    run: {
      played: 17,
      best: 126400,
      bestChain: 7,
      bestCombo: 11,
      blocksCleared: 12040,
      playTime: 21500,
    },
  };
  s.versus = {
    '1': { played: 6, won: 6, lost: 0, fastestWin: 48, garbageSent: 220 },
    '2': { played: 9, won: 7, lost: 2, fastestWin: 71, garbageSent: 310 },
    '3': { played: 11, won: 6, lost: 5, fastestWin: 95, garbageSent: 402 },
  };
  for (let i = 1; i <= 30; i++) {
    s.puzzles[`p1-${String(i).padStart(2, '0')}`] = { stars: i % 7 === 0 ? 2 : 3, moves: 2 };
  }
  for (let i = 1; i <= 12; i++) {
    s.puzzles[`p2-${String(i).padStart(2, '0')}`] = { stars: 3, moves: 3 };
  }
  return s;
}

// ------------------------------------------------------------------------------- page helpers

async function openGame(
  browser: Browser,
  target: StoreTarget,
  lang: StoreLang,
  seed: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: target.capture.viewport,
    deviceScaleFactor: target.capture.scale,
    isMobile: true,
    hasTouch: true,
    locale: lang === 'hu' ? 'hu-HU' : 'en-US',
  });
  const save = JSON.stringify(stagedSave());
  await context.addInitScript((data) => {
    try {
      localStorage.setItem('swaplight:save', data);
      localStorage.setItem('swaplight:purchases.mock.fullVersion', 'true');
    } catch {
      // ignore
    }
  }, save);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?test&seed=${encodeURIComponent(seed)}`);
  await page.waitForFunction(() => window.__swaplight?.ready === true);
  await page.evaluate(() => {
    const api = window.__swaplight!;
    api.stopRendering();
    api.pause();
    api.setFullVersion?.(true);
  });
  expect(errors).toEqual([]);
  return { context, page };
}

const hook = <R, A = undefined>(page: Page, fn: (api: Api, arg: A) => R, arg?: A): Promise<R> =>
  page.evaluate(
    ([src, a]) => {
      const api = window.__swaplight as Api;
      return new Function('api', 'arg', `return (${src})(api, arg);`)(api, a) as R;
    },
    [fn.toString(), arg] as const,
  ) as Promise<R>;

const getSim = (page: Page): Promise<SimState> => hook(page, (api) => api.getSim());
const stepTicks = (page: Page, n: number): Promise<void> =>
  hook(page, (api, k: number) => api.stepTicks(k), n);
const renderFrames = (page: Page, n: number): Promise<void> =>
  hook(page, (api, k: number) => api.renderFrames(k), n);

interface ChainPick {
  row: number;
  col: number;
  /** Longest chain reached. */
  chain: number;
  /** Ticks after the swap until that chain link matches. */
  ticks: number;
  /** Column centroid of the last link (where the popups appear). */
  center: number;
  /** Size of the last link (a 4+ link adds a wide COMBO popup). */
  combo: number;
  /** Ticks after the swap until the previous chain link matched. */
  prevTicks: number;
}

/**
 * The swap with the longest chain within `horizon` ticks. Ties prefer a last link near the middle
 * of the board with no combo, so the chain popup is not cut off at the screen edge.
 */
function bestChainSwap(sim: SimState, horizon = 360): ChainPick | null {
  let best: ChainPick | null = null;
  let bestScore = -Infinity;
  const { rows, cols } = sim.config;
  const mid = (cols - 1) / 2;
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 0; col < cols - 1; col++) {
      if (canSwap(sim, row, col) !== null) continue;
      const s = cloneSim(sim);
      step(s, [{ type: 'swap', row, col }]);
      let pick: ChainPick | null = null;
      for (let i = 1; i <= horizon && !s.gameOver; i++) {
        for (const e of step(s, [])) {
          if (e.type !== 'matched' || e.chain < 2 || (pick && e.chain <= pick.chain)) continue;
          const center = e.blocks.reduce((a, b) => a + b.col, 0) / Math.max(1, e.blocks.length);
          pick = {
            row,
            col,
            chain: e.chain,
            ticks: i,
            center,
            combo: e.combo,
            prevTicks: (pick as ChainPick | null)?.ticks ?? 0,
          };
        }
      }
      if (!pick) continue;
      const score = pick.chain * 10 - Math.abs(pick.center - mid) * 2 - (pick.combo >= 4 ? 15 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = pick;
      }
    }
  }
  return best;
}

/** Play `n` scoring swaps (prefers chains) so a mode has a believable score. */
async function playSwaps(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const sim = await getSim(page);
    const chain = bestChainSwap(sim, 240);
    const swap = chain ?? findMatchingSwap(sim, 40);
    if (!swap) {
      await stepTicks(page, 120);
      continue;
    }
    await hook(page, (api, m: { row: number; col: number }) => api.swap(m.row, m.col), swap);
    await stepTicks(page, chain ? chain.ticks + 60 : 90);
  }
}

// ------------------------------------------------------------------------------- scenes

/** Seeds whose first stage board has a ×3+ single-swap chain (searched once, kept stable). */
const RUN_SEEDS = [
  'store-run-1',
  'store-run-2',
  'store-run-3',
  'store-run-4',
  'store-run-5',
  'store-run-6',
  'store-run-7',
  'store-run-8',
];

/** Height (rows) of the tallest column. */
function stackHeight(sim: SimState): number {
  const { rows, cols } = sim.config;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) if (sim.cells[row * cols + col]) return rows - row;
  }
  return 0;
}

/** Hold the on-screen RAISE button until the stack is `rows` tall. */
async function raiseTo(page: Page, rows: number): Promise<void> {
  const box = await page.getByTestId('raise').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 60 && stackHeight(await getSim(page)) < rows; i++) await stepTicks(page, 10);
  await page.mouse.up();
  await stepTicks(page, 30);
}

/** Step the sim and render every frame, as in real time (effects age naturally). */
const playFrames = (page: Page, n: number): Promise<void> =>
  hook(
    page,
    (api, k: number) => {
      for (let i = 0; i < k; i++) {
        api.stepTicks(1);
        api.renderFrames(1);
      }
    },
    n,
  );

async function sceneRun(page: Page): Promise<void> {
  let pick: ChainPick | null = null;
  for (const seed of RUN_SEEDS) {
    await hook(
      page,
      (api, s: string) => {
        api.run!.abandon();
        api.run!.start({ seed: s, deck: 'neon' });
      },
      seed,
    );
    // Skip ahead to act 3, stage 1 (a "survive" goal: the stage cannot end early on score).
    for (let i = 0; i < 8; i++) {
      await hook(page, (api) => {
        api.run!.playStage();
        api.run!.beginStage();
        api.run!.forceWin();
      });
      await page.waitForTimeout(2400);
      await hook(page, (api) => {
        api.run!.continueFromResult();
        api.run!.leaveShop();
      });
    }
    await hook(page, (api) => {
      // Relics first: the stage compiles its scoring hooks when it begins.
      for (const id of ['spark_plug', 'refractor', 'constellation', 'cascade_coil', 'supernova']) {
        api.run!.grantRelic(id);
      }
      api.run!.playStage();
      api.run!.beginStage();
    });
    await raiseTo(page, 9);
    // Want a ×3+ chain whose last link is not also a combo (two stacked popups get too wide,
    // especially in Hungarian). Plain clears reshape the board between searches.
    for (let attempt = 0; attempt < 8; attempt++) {
      pick = bestChainSwap(await getSim(page));
      if (pick && pick.chain >= 3 && pick.combo < 4) break;
      const plain = findMatchingSwap(await getSim(page), 40);
      if (!plain) break;
      await hook(page, (api, m: { row: number; col: number }) => api.swap(m.row, m.col), plain);
      await stepTicks(page, 90);
      if (stackHeight(await getSim(page)) < 8) await raiseTo(page, 9);
    }
    if (pick && pick.chain >= 3 && pick.combo < 4) break;
  }
  expect(pick).not.toBeNull();
  await hook(page, (api, m: { row: number; col: number }) => api.swap(m.row, m.col), pick!);
  // Popups live ~75 frames: let the previous link's popup fade before the last one is shot.
  const extra = Number(
    process.env.STORE_RUN_EXTRA ?? Math.max(24, 80 - (pick!.ticks - pick!.prevTicks)),
  );
  await playFrames(page, pick!.ticks + extra);
  await page.waitForTimeout(900);
}

async function sceneShop(page: Page): Promise<void> {
  await hook(page, (api) => {
    api.run!.abandon();
    api.run!.start({ seed: 'store-shop-2', deck: 'neon' });
    api.run!.grantRelic('refractor');
    api.run!.grantRelic('spark_plug');
    api.run!.grantRelic('constellation');
    api.run!.playStage();
    api.run!.beginStage();
    api.run!.forceWin();
  });
  await page.waitForTimeout(2400);
  await hook(page, (api) => {
    api.run!.continueFromResult();
    api.run!.grantSzikra(21);
    api.run!.grantCharm('fuse');
  });
  await expect(page.getByTestId('shop')).toBeVisible();
  await renderFrames(page, 3);
  await page.waitForTimeout(1000);
}

async function sceneVersus(page: Page): Promise<void> {
  await hook(page, (api) => api.versus!.start({ seed: 'store-vs-1', level: 4 }));
  await renderFrames(page, 90);
  await stepTicks(page, 200);
  await playSwaps(page, 3);
  await hook(page, (api) => {
    api.versus!.sendGarbage(6, 2, 'player');
    api.versus!.sendGarbage(4, 1, 'player');
    api.versus!.sendGarbage(5, 1, 'cpu');
  });
  await renderFrames(page, 14);
  await page.waitForTimeout(150);
}

async function scenePuzzle(page: Page): Promise<void> {
  await hook(page, (api) => api.puzzle!.open('p4-09'));
  await renderFrames(page, 3);
  await page.waitForTimeout(700);
}

async function sceneDaily(page: Page): Promise<void> {
  await hook(
    page,
    (api, d: string) => {
      api.daily!.setToday(d);
      api.daily!.start();
    },
    TODAY,
  );
  await stepTicks(page, 30);
  await playSwaps(page, 12);
  await hook(page, (api) => api.daily!.finish());
  await renderFrames(page, 3);
  await page.waitForTimeout(1400);
}

async function sceneMenu(page: Page): Promise<void> {
  await renderFrames(page, 3);
  await page.waitForTimeout(800);
}

const SCENE_FNS: Record<SceneId, (page: Page) => Promise<void>> = {
  run: sceneRun,
  shop: sceneShop,
  versus: sceneVersus,
  puzzle: scenePuzzle,
  daily: sceneDaily,
  menu: sceneMenu,
};

// ------------------------------------------------------------------------------- composition

async function compose(
  browser: Browser,
  target: StoreTarget,
  scene: SceneDef,
  lang: StoreLang,
  raw: Buffer,
): Promise<string> {
  const context = await browser.newContext({
    viewport: target.output.viewport,
    deviceScaleFactor: target.output.scale,
  });
  const page = await context.newPage();
  const html = frameHtml({
    target,
    scene,
    lang,
    shot: `data:image/png;base64,${raw.toString('base64')}`,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const file = join(OUT, target.id, lang, sceneFileName(scene));
  mkdirSync(dirname(file), { recursive: true });
  // Lossless re-encode: about half the size of Chromium's PNG.
  const png = await page.screenshot();
  await sharp(png).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toFile(file);
  await context.close();
  return file;
}

for (const lang of LANGS) {
  test(`store screenshots (${lang})`, async ({ browser }, testInfo) => {
    const target = STORE_TARGETS.find((t) => t.id === testInfo.project.name);
    expect(target, `unknown store target ${testInfo.project.name}`).toBeDefined();
    for (const scene of SCENES) {
      if (ONLY.length > 0 && !ONLY.includes(scene.id)) continue;
      const rawFile = join(RAW, target!.id, lang, sceneFileName(scene));
      let raw: Buffer;
      if (COMPOSE_ONLY) {
        // Re-frame the last captures (caption / layout tweaks) without replaying the game.
        raw = readFileSync(rawFile);
      } else {
        const { context, page } = await openGame(browser, target!, lang, `store-${scene.id}`);
        await SCENE_FNS[scene.id](page);
        raw = await page.screenshot();
        mkdirSync(dirname(rawFile), { recursive: true });
        writeFileSync(rawFile, raw);
        await context.close();
      }
      await compose(browser, target!, scene, lang, raw);
    }
  });
}
