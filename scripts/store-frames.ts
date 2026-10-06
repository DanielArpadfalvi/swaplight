/**
 * Store screenshot definitions: device targets (capture + output sizes), the scenes and their
 * captions (EN + HU), and the HTML of the branded marketing frame a raw game capture is placed on.
 * Used by `tests/e2e/store-screens.spec.ts` (run with `npm run store:screens`).
 */

export type StoreLang = 'en' | 'hu';

export interface StoreTarget {
  /** Playwright project name and output folder (`store/screenshots/<id>/<lang>/`). */
  id: string;
  /** The game is captured at this CSS viewport × device scale factor. */
  capture: { viewport: { width: number; height: number }; scale: number };
  /** The composed frame is rendered at this CSS viewport × scale (= the store's pixel size). */
  output: { viewport: { width: number; height: number }; scale: number };
  /** Device frame corner radius as a fraction of the screenshot width. */
  radius: number;
}

export const STORE_TARGETS: readonly StoreTarget[] = [
  {
    // App Store 6.9" iPhone (required size): 1320 × 2868.
    id: 'ios-6.9',
    capture: { viewport: { width: 440, height: 956 }, scale: 3 },
    output: { viewport: { width: 440, height: 956 }, scale: 3 },
    radius: 0.12,
  },
  {
    // App Store 13" iPad: 2064 × 2752.
    id: 'ipad-13',
    capture: { viewport: { width: 1032, height: 1376 }, scale: 2 },
    output: { viewport: { width: 1032, height: 1376 }, scale: 2 },
    radius: 0.035,
  },
  {
    // Google Play phone: 1080 × 1920 (9:16 — Play rejects a long side > 2× the short side, so a
    // full 19.5:9 capture cannot be uploaded as is; it is framed on a 9:16 canvas instead).
    id: 'android',
    capture: { viewport: { width: 412, height: 915 }, scale: 2.625 },
    output: { viewport: { width: 360, height: 640 }, scale: 3 },
    radius: 0.12,
  },
];

export type SceneId = 'run' | 'versus' | 'shop' | 'puzzle' | 'daily' | 'menu';

export interface Caption {
  /** Headline; the part wrapped in `*…*` gets the neon gradient. */
  title: string;
  sub: string;
}

export interface SceneDef {
  id: SceneId;
  /** Order in the store (file prefix `NN-`). */
  order: number;
  /** Background accent pair (glows behind the device). */
  accent: [string, string];
  /** Color of the highlighted caption words. */
  highlight: string;
  caption: Record<StoreLang, Caption>;
}

export const SCENES: readonly SceneDef[] = [
  {
    id: 'run',
    highlight: '#ff6ad5',
    order: 1,
    accent: ['#ff3fa4', '#7b5cff'],
    caption: {
      en: { title: 'Chain it. *Multiply it.*', sub: 'Roguelite runs with relics & bosses' },
      hu: {
        title: 'Láncolj és *szorozz!*',
        sub: 'Roguelite futamok ereklyékkel és főellenségekkel',
      },
    },
  },
  {
    id: 'versus',
    highlight: '#ffa95c',
    order: 2,
    accent: ['#ff8a3d', '#ff3f6c'],
    caption: {
      en: { title: 'Bury the CPU in *garbage*', sub: 'Versus mode · 5 CPU levels' },
      hu: { title: 'Zúdíts *szemetet* a gépre!', sub: 'Párbaj mód · 5 nehézségi szint' },
    },
  },
  {
    id: 'shop',
    highlight: '#ffd75e',
    order: 3,
    accent: ['#ffc23d', '#ff3fa4'],
    caption: {
      en: { title: 'Build your *combo engine*', sub: '40+ relics, charms and a shop' },
      hu: { title: 'Pörgesd fel a *szorzót!*', sub: '40+ ereklye, talizmánok és bolt' },
    },
  },
  {
    id: 'puzzle',
    highlight: '#5fffb0',
    order: 4,
    accent: ['#3dff9b', '#2fd8ff'],
    caption: {
      en: { title: '*120* brain-teasing puzzles', sub: 'Clear the board in just a few swaps' },
      hu: { title: '*120* trükkös fejtörő', sub: 'Takarítsd le a pályát néhány cserével' },
    },
  },
  {
    id: 'daily',
    highlight: '#ffd75e',
    order: 5,
    accent: ['#ffc23d', '#7b5cff'],
    caption: {
      en: {
        title: 'A new *challenge* every day',
        sub: 'Same board for everyone · keep the streak',
      },
      hu: {
        title: 'Minden nap *új kihívás*',
        sub: 'Ugyanaz a pálya mindenkinek · tartsd a sorozatot',
      },
    },
  },
  {
    id: 'menu',
    highlight: '#5ff3ff',
    order: 6,
    accent: ['#2fd8ff', '#ff3fa4'],
    caption: {
      en: {
        title: 'No ads. No energy. *Just play.*',
        sub: 'One-time unlock · plays fully offline',
      },
      hu: {
        title: 'Se reklám, se energia. *Csak játék.*',
        sub: 'Egyszeri feloldás · teljesen offline',
      },
    },
  },
];

export function sceneFileName(scene: SceneDef): string {
  return `${String(scene.order).padStart(2, '0')}-${scene.id}.png`;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `Chain it. *Multiply it.*` → HTML with the starred part highlighted. */
export function captionHtml(title: string): string {
  return escapeHtml(title).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export interface FrameInput {
  target: StoreTarget;
  scene: SceneDef;
  lang: StoreLang;
  /** `data:image/png;base64,…` of the raw capture. */
  shot: string;
}

/**
 * Full-page HTML of one marketing frame. All sizes are relative to the output viewport, so the
 * same layout works for the phone (tall) and tablet (4:3) canvases.
 */
export function frameHtml({ target, scene, lang, shot }: FrameInput): string {
  const { width: W, height: H } = target.output.viewport;
  const cap = scene.caption[lang];
  const shotAspect = target.capture.viewport.width / target.capture.viewport.height;
  const tablet = W / H > 0.66;
  // Caption block takes the top; the device fills the rest with a small bottom margin.
  const captionH = H * (tablet ? 0.215 : 0.235);
  const bottom = H * 0.035;
  let devH = H - captionH - bottom;
  let devW = devH * shotAspect;
  const maxW = W * (tablet ? 0.86 : 0.84);
  if (devW > maxW) {
    devW = maxW;
    devH = devW / shotAspect;
  }
  const bezel = Math.max(3, devW * (tablet ? 0.012 : 0.022));
  const radius = devW * target.radius;
  const titleSize = W * (tablet ? 0.062 : 0.088) * (cap.title.length > 30 ? 0.9 : 1);
  const subSize = W * (tablet ? 0.026 : 0.039);
  const [a1, a2] = scene.accent;
  const px = (n: number): string => `${n.toFixed(2)}px`;

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #07061a; }
  body { position: relative; font-family: 'Inter', 'Avenir Next', 'Segoe UI', system-ui, sans-serif; color: #fff; }
  .bg { position: absolute; inset: 0;
    background:
      radial-gradient(ellipse ${px(W * 0.9)} ${px(H * 0.45)} at 12% 8%, ${a1}55, transparent 70%),
      radial-gradient(ellipse ${px(W * 0.9)} ${px(H * 0.5)} at 92% 70%, ${a2}50, transparent 70%),
      radial-gradient(ellipse ${px(W * 1.2)} ${px(H * 0.3)} at 50% 100%, #ff3fa433, transparent 70%),
      linear-gradient(180deg, #0b0824 0%, #120a2e 55%, #1a0b33 100%); }
  .stars { position: absolute; inset: 0; opacity: .55;
    background-image:
      radial-gradient(1.2px 1.2px at 20% 30%, #fff, transparent),
      radial-gradient(1px 1px at 70% 12%, #fff, transparent),
      radial-gradient(1.4px 1.4px at 85% 40%, #cfc8ff, transparent),
      radial-gradient(1px 1px at 40% 60%, #fff, transparent),
      radial-gradient(1.2px 1.2px at 10% 75%, #ffd2f0, transparent),
      radial-gradient(1px 1px at 55% 85%, #fff, transparent);
    background-size: ${px(W * 0.5)} ${px(W * 0.5)}; }
  .grid { position: absolute; left: -50%; right: -50%; bottom: 0; height: ${px(H * 0.42)};
    transform-origin: 50% 100%; transform: perspective(${px(H * 0.3)}) rotateX(62deg);
    background-image:
      linear-gradient(90deg, ${a1}66 1.5px, transparent 1.5px),
      linear-gradient(0deg, ${a1}66 1.5px, transparent 1.5px);
    background-size: ${px(W * 0.11)} ${px(W * 0.11)};
    -webkit-mask-image: linear-gradient(0deg, #000 10%, transparent 90%);
            mask-image: linear-gradient(0deg, #000 10%, transparent 90%); }
  .caption { position: absolute; left: ${px(W * 0.06)}; right: ${px(W * 0.06)}; top: 0; height: ${px(captionH)};
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: ${px(H * 0.012)}; }
  h1 { font-size: ${px(titleSize)}; line-height: 1.04; font-weight: 900; font-style: italic;
    letter-spacing: -0.01em; text-transform: uppercase; text-wrap: balance;
    text-shadow: 0 0 ${px(titleSize * 0.35)} ${a2}aa, 0 ${px(titleSize * 0.05)} 0 #00000066; }
  h1 em { font-style: italic; color: ${scene.highlight};
    text-shadow: 0 0 ${px(titleSize * 0.25)} ${scene.highlight}cc, 0 0 ${px(titleSize * 0.6)} ${a1}aa, 0 ${px(titleSize * 0.05)} 0 #00000066; }
  p { font-size: ${px(subSize)}; font-weight: 600; letter-spacing: 0.04em; color: #d9d3ff; opacity: .92; text-wrap: balance; }
  .device { position: absolute; left: ${px((W - devW) / 2)}; top: ${px(captionH)}; width: ${px(devW)}; height: ${px(devH)};
    border-radius: ${px(radius)}; padding: ${px(bezel)};
    background: linear-gradient(140deg, #4fe6ff, ${a1} 45%, ${a2});
    box-shadow: 0 0 ${px(devW * 0.08)} ${a1}88, 0 0 ${px(devW * 0.2)} ${a2}55, 0 ${px(devW * 0.04)} ${px(devW * 0.1)} #000000aa; }
  .screen { width: 100%; height: 100%; border-radius: ${px(radius - bezel)}; overflow: hidden; background: #07070f; }
  .screen img { display: block; width: 100%; height: 100%; }
</style></head>
<body>
  <div class="bg"></div><div class="stars"></div><div class="grid"></div>
  <div class="caption"><h1>${captionHtml(cap.title)}</h1><p>${escapeHtml(cap.sub).replace(/ · /g, '&nbsp;· ')}</p></div>
  <div class="device"><div class="screen"><img src="${shot}" alt=""></div></div>
</body></html>`;
}
