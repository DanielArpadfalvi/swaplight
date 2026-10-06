/// <reference types="node" />
/**
 * Renders the app icon, splash screens and store graphics from code (SVG → Chromium → PNG).
 *
 *   npx tsx scripts/make-assets.ts                       # resources/*.png + store/*.png
 *   npx capacitor-assets generate --android --ios --assetPath resources
 *   npx tsx scripts/make-assets.ts --native-post         # crisp adaptive icons + smaller splashes
 *
 * Visual identity matches the in-game tiles (src/render/style/blockTextures.ts): glossy neon rim,
 * recessed gradient face, white-hot symbol with a soft glow, on the dark synthwave backdrop.
 * Uses the Chromium that Playwright provides (PLAYWRIGHT_BROWSERS_PATH fallback like
 * playwright.config.ts).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mixColor, scaleColor } from '../src/render/style/colorMath';
import { NEON_PALETTE } from '../src/render/style/palette';
import type { BlockColorSpec, BlockSymbol } from '../src/render/style/palette';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCES = join(ROOT, 'resources');
const STORE = join(ROOT, 'store');
const P = NEON_PALETTE;
const WHITE = 0xffffff;

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function spec(name: string): BlockColorSpec {
  const s = P.blocks.find((b) => b.name === name);
  if (!s) throw new Error(`No block ${name}`);
  return s;
}

// --- primitives ---------------------------------------------------------------------------------

let uid = 0;
const nextId = (p: string): string => `${p}${uid++}`;

/** SVG path of a block symbol centered on (cx, cy) with nominal radius r (mirrors drawSymbol). */
function symbolPath(kind: BlockSymbol, cx: number, cy: number, r: number): string {
  const f = (n: number): string => n.toFixed(2);
  switch (kind) {
    case 'circle':
      return `M${f(cx - r * 0.9)},${f(cy)}a${f(r * 0.9)},${f(r * 0.9)} 0 1,0 ${f(r * 1.8)},0a${f(r * 0.9)},${f(r * 0.9)} 0 1,0 ${f(-r * 1.8)},0Z`;
    case 'diamond':
      return `M${f(cx)},${f(cy - r * 1.12)}L${f(cx + r * 0.88)},${f(cy)}L${f(cx)},${f(cy + r * 1.12)}L${f(cx - r * 0.88)},${f(cy)}Z`;
    case 'triangle': {
      const R = r * 1.14;
      const oy = cy + r * 0.16;
      const pts = [0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        return `${f(cx + Math.cos(a) * R)},${f(oy + Math.sin(a) * R)}`;
      });
      return `M${pts.join('L')}Z`;
    }
    case 'square': {
      const h = r * 0.8;
      const rr = r * 0.22;
      return `M${f(cx - h + rr)},${f(cy - h)}H${f(cx + h - rr)}Q${f(cx + h)},${f(cy - h)} ${f(cx + h)},${f(cy - h + rr)}V${f(cy + h - rr)}Q${f(cx + h)},${f(cy + h)} ${f(cx + h - rr)},${f(cy + h)}H${f(cx - h + rr)}Q${f(cx - h)},${f(cy + h)} ${f(cx - h)},${f(cy + h - rr)}V${f(cy - h + rr)}Q${f(cx - h)},${f(cy - h)} ${f(cx - h + rr)},${f(cy - h)}Z`;
    }
    case 'star': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? r * 1.14 : r * 0.5;
        pts.push(`${f(cx + Math.cos(a) * rad)},${f(cy + r * 0.06 + Math.sin(a) * rad)}`);
      }
      return `M${pts.join('L')}Z`;
    }
    case 'heart': {
      const y = cy + r * 0.05;
      return (
        `M${f(cx)},${f(y + r * 0.92)}` +
        `C${f(cx - r * 0.35)},${f(y + r * 0.6)} ${f(cx - r * 1.08)},${f(y + r * 0.12)} ${f(cx - r)},${f(y - r * 0.38)}` +
        `C${f(cx - r * 0.92)},${f(y - r * 0.98)} ${f(cx - r * 0.18)},${f(y - r * 1.06)} ${f(cx)},${f(y - r * 0.5)}` +
        `C${f(cx + r * 0.18)},${f(y - r * 1.06)} ${f(cx + r * 0.92)},${f(y - r * 0.98)} ${f(cx + r)},${f(y - r * 0.38)}` +
        `C${f(cx + r * 1.08)},${f(y + r * 0.12)} ${f(cx + r * 0.35)},${f(y + r * 0.6)} ${f(cx)},${f(y + r * 0.92)}Z`
      );
    }
  }
}

/** One glossy neon tile (outer halo + rim + face + sheen + glowing symbol), top-left at (x, y). */
function tile(b: BlockColorSpec, x: number, y: number, s: number, rotate = 0, glow = 1): string {
  const id = nextId('t');
  const radius = s * 0.2;
  const rimW = s * 0.062;
  const inner = s - 2 * rimW;
  const innerR = radius - rimW * 0.8;
  const rimHighlight = mixColor(b.light, WHITE, 0.55);
  const faceTop = mixColor(b.base, b.dark, 0.1);
  const faceBottom = mixColor(b.base, b.dark, 0.72);
  const symbol = mixColor(b.light, WHITE, 0.35);
  const symbolGlow = mixColor(b.base, WHITE, 0.35);
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.25;
  return `
  <g transform="rotate(${rotate} ${cx} ${cy})">
    <defs>
      <linearGradient id="${id}rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hex(rimHighlight)}"/>
        <stop offset="0.35" stop-color="${hex(b.base)}"/>
        <stop offset="1" stop-color="${hex(scaleColor(b.base, 0.72))}"/>
      </linearGradient>
      <linearGradient id="${id}face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hex(faceTop)}"/>
        <stop offset="1" stop-color="${hex(faceBottom)}"/>
      </linearGradient>
      <linearGradient id="${id}sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.26"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${id}sym" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hex(mixColor(symbol, WHITE, 0.75))}"/>
        <stop offset="1" stop-color="${hex(mixColor(symbol, b.base, 0.12))}"/>
      </linearGradient>
      <filter id="${id}halo" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="${s * 0.12}"/>
      </filter>
      <filter id="${id}symglow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="${s * 0.05}"/>
      </filter>
      <filter id="${id}shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="${s * 0.04}"/>
      </filter>
    </defs>
    <rect x="${x - s * 0.02}" y="${y - s * 0.02}" width="${s * 1.04}" height="${s * 1.04}" rx="${s * 0.22}"
      fill="${hex(b.base)}" opacity="${0.95 * glow}" filter="url(#${id}halo)" style="mix-blend-mode:screen"/>
    <rect x="${x}" y="${y + s * 0.05}" width="${s}" height="${s}" rx="${radius}" fill="#000" opacity="0.45" filter="url(#${id}shadow)"/>
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${radius}" fill="url(#${id}rim)"/>
    <rect x="${x + rimW}" y="${y + rimW}" width="${inner}" height="${inner}" rx="${innerR}" fill="url(#${id}face)"/>
    <rect x="${x + rimW + s * 0.011}" y="${y + rimW + s * 0.011}" width="${inner - s * 0.022}" height="${inner - s * 0.022}" rx="${innerR}"
      fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="${s * 0.022}"/>
    <rect x="${x + rimW * 1.6}" y="${y + rimW * 1.4}" width="${inner - rimW * 1.2}" height="${inner * 0.42}" rx="${innerR * 0.8}" fill="url(#${id}sheen)"/>
    <rect x="${x + radius * 0.55}" y="${y + s * 0.035}" width="${s * 0.3}" height="${s * 0.03}" rx="${s * 0.015}" fill="#fff" opacity="0.5"/>
    <path d="${symbolPath(b.symbol, cx, cy, r * 1.08)}" fill="${hex(symbolGlow)}" opacity="0.8" filter="url(#${id}symglow)"/>
    <path d="${symbolPath(b.symbol, cx, cy + s * 0.025, r)}" fill="#000" opacity="0.35"/>
    <path d="${symbolPath(b.symbol, cx, cy, r)}" fill="url(#${id}sym)"/>
  </g>`;
}

/** Curved neon arrow from (x1,y1) to (x2,y2), bulging by `bend` (perpendicular, px). */
function arrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bend: number,
  w: number,
  color: number,
): string {
  const id = nextId('a');
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const qx = mx + nx * bend;
  const qy = my + ny * bend;
  // Head direction = tangent at the end of the quadratic curve.
  const tx = x2 - qx;
  const ty = y2 - qy;
  const tl = Math.hypot(tx, ty);
  const ux = tx / tl;
  const uy = ty / tl;
  const head = w * 2.3;
  // Stop the shaft inside the head so the round cap does not poke out.
  const ex = x2 - ux * head * 0.6;
  const ey = y2 - uy * head * 0.6;
  const hx1 = x2 - ux * head - uy * head * 0.78;
  const hy1 = y2 - uy * head + ux * head * 0.78;
  const hx2 = x2 - ux * head + uy * head * 0.78;
  const hy2 = y2 - uy * head - ux * head * 0.78;
  const shape = (fill: string, extra = ''): string => `
    <path d="M${x1},${y1} Q${qx},${qy} ${ex},${ey}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" ${extra}/>
    <path d="M${x2},${y2} L${hx1},${hy1} L${hx2},${hy2} Z" fill="${fill}" stroke="${fill}" stroke-width="${w * 0.35}" stroke-linejoin="round" ${extra}/>`;
  return `
  <defs>
    <filter id="${id}w" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${w * 1.3}"/></filter>
    <filter id="${id}n" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${w * 0.4}"/></filter>
  </defs>
  <g opacity="0.85" filter="url(#${id}w)">${shape(hex(color))}</g>
  <g filter="url(#${id}n)">${shape(hex(color))}</g>
  ${shape(hex(mixColor(color, WHITE, 0.6)))}`;
}

/** The synthwave backdrop: gradient sky, horizon glow, perspective grid. */
function backdrop(w: number, h: number, horizonAt = 0.68, gridOpacity = 0.4): string {
  const id = nextId('bg');
  const hy = h * horizonAt;
  const lines: string[] = [];
  const vp = w / 2;
  const span = Math.max(w, h) * 2.2;
  for (let i = -14; i <= 14; i++) {
    const xb = vp + (i / 14) * span;
    lines.push(`<line x1="${vp}" y1="${hy}" x2="${xb}" y2="${h * 1.4}"/>`);
  }
  for (let k = 1; k <= 14; k++) {
    const t = Math.pow(k / 14, 2.1);
    const y = hy + (h * 1.05 - hy) * t;
    lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`);
  }
  const sw = Math.max(1.2, Math.min(w, h) * 0.0035);
  return `
  <defs>
    <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(P.background.top)}"/>
      <stop offset="${horizonAt}" stop-color="${hex(P.background.horizon)}"/>
      <stop offset="1" stop-color="${hex(P.background.bottom)}"/>
    </linearGradient>
    <radialGradient id="${id}sun" cx="0.5" cy="${horizonAt}" r="0.6">
      <stop offset="0" stop-color="${hex(P.ui.accent2)}" stop-opacity="0.35"/>
      <stop offset="0.45" stop-color="${hex(P.background.grid)}" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}fade" x1="0" y1="${hy}" x2="0" y2="${h}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="1"/>
    </linearGradient>
    <mask id="${id}mask"><rect x="0" y="${hy}" width="${w}" height="${h - hy}" fill="url(#${id}fade)"/></mask>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id}sky)"/>
  <rect width="${w}" height="${h}" fill="url(#${id}sun)"/>
  <g stroke="${hex(P.background.grid)}" stroke-width="${sw}" opacity="${gridOpacity}" mask="url(#${id}mask)">${lines.join('')}</g>
  <rect x="0" y="${hy - sw}" width="${w}" height="${sw * 2}" fill="${hex(P.ui.accent2)}" opacity="${gridOpacity * 0.9}"/>`;
}

/**
 * The logo mark in a 1000×1000 box: two tiles mid-swap (cyan diamond rising left, magenta-pink
 * heart dropping right) with a pair of curved swap arrows.
 */
function logoMark(): string {
  const left = spec('cyan');
  const right = spec('red');
  const s = 400;
  const lx = 70;
  const ly = 250;
  const rx = 530;
  const ry = 350;
  return `
  ${tile(left, lx, ly, s, -6)}
  ${tile(right, rx, ry, s, 6)}
  ${arrow(255, 215, 745, 300, -150, 42, P.ui.accent)}
  ${arrow(745, 785, 255, 700, -150, 42, P.ui.accent2)}`;
}

/** Place the 1000-box logo mark at a given center and size. */
function placedLogo(cx: number, cy: number, size: number): string {
  const k = size / 1000;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${k})">${logoMark()}</g>`;
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

// --- compositions ------------------------------------------------------------------------------

interface Job {
  file: string;
  w: number;
  h: number;
  svg: string;
  /** Transparent background (PNG with alpha). */
  transparent?: boolean;
  /** Encode as a dithered 256-color PNG (large smooth images). */
  palette?: boolean;
}

function jobs(): Job[] {
  const icon = svg(1024, 1024, `${backdrop(1024, 1024, 0.74, 0.45)}${placedLogo(512, 505, 940)}`);
  // Adaptive icon layers span the full 108dp canvas (see writeAdaptiveIcons); launchers show the
  // inner 72dp and guarantee only the 66dp circle, so the mark stays inside ~61% of the canvas.
  const fg = svg(1024, 1024, placedLogo(512, 512, 540));
  const bg = svg(1024, 1024, backdrop(1024, 1024, 0.74, 0.45));
  // No grid on the splash: fine lines bloat the PNG and it is shown for a split second anyway.
  // Only `splash.png` (no `splash-dark.png`): the app is dark-only, so one image serves both.
  const splash = svg(2732, 2732, `${backdrop(2732, 2732, 0.8, 0)}${placedLogo(1366, 1300, 900)}`);
  const feature = svg(
    1024,
    500,
    `${backdrop(1024, 500, 0.7, 0.5)}${sideTiles()}${placedLogo(512, 250, 430)}`,
  );
  return [
    { file: join(RESOURCES, 'icon-only.png'), w: 1024, h: 1024, svg: icon },
    { file: join(RESOURCES, 'icon-foreground.png'), w: 1024, h: 1024, svg: fg, transparent: true },
    { file: join(RESOURCES, 'icon-background.png'), w: 1024, h: 1024, svg: bg },
    { file: join(RESOURCES, 'splash.png'), w: 2732, h: 2732, svg: splash, palette: true },
    { file: join(STORE, 'app-store-icon-1024.png'), w: 1024, h: 1024, svg: icon },
    {
      file: join(STORE, 'play-icon-512.png'),
      w: 512,
      h: 512,
      // Same 1024 artwork, scaled down via the viewBox (rendering it at 512 would crop it).
      svg: icon.replace('width="1024" height="1024"', 'width="512" height="512"'),
    },
    { file: join(STORE, 'play-feature-graphic-1024x500.png'), w: 1024, h: 500, svg: feature },
  ];
}

/** Decorative tile stacks on both sides of the feature graphic (a hint of the playfield). */
function sideTiles(): string {
  const s = 82;
  const g = 9;
  const cols: [number, string[]][] = [
    [32, ['violet', 'amber', 'green', 'magenta']],
    [32 + s + g, ['green', 'cyan', 'red']],
    [32 + 2 * (s + g), ['amber', 'violet']],
    [1024 - 32 - s, ['red', 'magenta', 'cyan', 'amber']],
    [1024 - 32 - 2 * s - g, ['cyan', 'green', 'violet']],
    [1024 - 32 - 3 * s - 2 * g, ['magenta', 'amber']],
  ];
  const out: string[] = [];
  for (const [x, names] of cols) {
    names.forEach((n, i) => {
      const y = 500 - 36 - (i + 1) * s - i * g;
      out.push(tile(spec(n), x, y, s, 0, 0.7));
    });
  }
  return `<g opacity="0.92">${out.join('')}</g>`;
}

// --- render ------------------------------------------------------------------------------------

function chromiumPath(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const candidate = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium');
  return existsSync(candidate) ? candidate : undefined;
}

/**
 * capacitor-assets writes full-color splash PNGs (~2.5 MB each, ×3 on iOS). The splash is a smooth
 * gradient + logo, so a dithered 256-color palette is visually identical at a fraction of the size.
 */
async function compressNativeSplashes(): Promise<void> {
  const files: string[] = [];
  const res = join(ROOT, 'android/app/src/main/res');
  for (const dir of readdirSync(res)) {
    if (dir.startsWith('drawable') && existsSync(join(res, dir, 'splash.png'))) {
      files.push(join(res, dir, 'splash.png'));
    }
  }
  const ios = join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');
  if (existsSync(ios)) {
    for (const f of readdirSync(ios)) if (f.endsWith('.png')) files.push(join(ios, f));
  }
  for (const file of files) {
    const before = readFileSync(file);
    const after = await sharp(before)
      .png({ palette: true, quality: 100, dither: 1, compressionLevel: 9 })
      .toBuffer();
    if (after.length < before.length) writeFileSync(file, after);
    console.log(
      `${file.slice(ROOT.length + 1)}: ${before.length} → ${Math.min(after.length, before.length)}`,
    );
  }
}

/**
 * capacitor-assets emits 48dp-sized adaptive layers wrapped in a 16.7% <inset>, which Android then
 * upscales (blurry on xxxhdpi). Write full 108dp layers from resources/ instead, without inset.
 */
async function writeAdaptiveIcons(): Promise<void> {
  const res = join(ROOT, 'android/app/src/main/res');
  const densities: Record<string, number> = {
    ldpi: 0.75,
    mdpi: 1,
    hdpi: 1.5,
    xhdpi: 2,
    xxhdpi: 3,
    xxxhdpi: 4,
  };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${name}`);
    if (!existsSync(dir)) continue;
    const px = Math.round(108 * scale);
    for (const layer of ['foreground', 'background'] as const) {
      await sharp(join(RESOURCES, `icon-${layer}.png`))
        .resize(px, px, { kernel: 'lanczos3' })
        .png({ compressionLevel: 9 })
        .toFile(join(dir, `ic_launcher_${layer}.png`));
    }
    console.log(`mipmap-${name}: adaptive layers ${px}px`);
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    writeFileSync(join(res, 'mipmap-anydpi-v26', f), xml);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--native-post')) {
    await writeAdaptiveIcons();
    await compressNativeSplashes();
    return;
  }
  const only = args;
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  try {
    for (const job of jobs()) {
      if (only.length && !only.some((o) => job.file.includes(o))) continue;
      mkdirSync(dirname(job.file), { recursive: true });
      const page = await browser.newPage({ viewport: { width: job.w, height: job.h } });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">${job.svg}</body></html>`,
      );
      const shot = await page.screenshot({
        omitBackground: job.transparent ?? false,
        clip: { x: 0, y: 0, width: job.w, height: job.h },
      });
      // Opaque images are written without an alpha channel (App Store rejects icons with alpha).
      const img = sharp(shot);
      await (job.transparent ? img : img.removeAlpha())
        .png(
          job.palette
            ? { palette: true, quality: 100, dither: 1, compressionLevel: 9 }
            : { compressionLevel: 9 },
        )
        .toFile(job.file);
      await page.close();
      console.log(`wrote ${job.file.slice(ROOT.length + 1)}`);
    }
  } finally {
    await browser.close();
  }
}

await main();
