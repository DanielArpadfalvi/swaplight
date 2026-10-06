/**
 * Small, dependency-free color helpers used by the neon palette and its tests.
 * Colors are 0xRRGGBB integers (the format Pixi uses everywhere).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export type CvdKind = 'protanopia' | 'deuteranopia' | 'tritanopia';

export function hexToRgb(hex: number): Rgb {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

export function rgbToHex({ r, g, b }: Rgb): number {
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

/** Linear interpolation between two colors in sRGB space. `t` = 0 → a, 1 → b. */
export function mixColor(a: number, b: number, t: number): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/** Mix toward the color's own luminance-equivalent gray (0 = unchanged, 1 = gray). */
export function desaturate(hex: number, amount: number): number {
  const { r, g, b } = hexToRgb(hex);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return rgbToHex({ r: r + (y - r) * amount, g: g + (y - g) * amount, b: b + (y - b) * amount });
}

/** Multiply every channel (0..1 darkens, >1 brightens with clamping). */
export function scaleColor(hex: number, factor: number): number {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r * factor, g: g * factor, b: b * factor });
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(hex: number): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio (1..21). */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function hexToLab(hex: number): Lab {
  const { r, g, b } = hexToRgb(hex);
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // sRGB D65 → XYZ, normalised by the D65 white point.
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIEDE2000 color difference. ~2 is barely noticeable; >20 reads as clearly different hues. */
export function deltaE2000(c1: number, c2: number): number {
  const l1 = hexToLab(c1);
  const l2 = hexToLab(c2);
  const deg = Math.PI / 180;
  const C1 = Math.hypot(l1.a, l1.b);
  const C2 = Math.hypot(l2.a, l2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1 = (1 + G) * l1.a;
  const a2 = (1 + G) * l2.a;
  const C1p = Math.hypot(a1, l1.b);
  const C2p = Math.hypot(a2, l2.b);
  const h = (b: number, a: number): number => {
    if (a === 0 && b === 0) return 0;
    const v = Math.atan2(b, a) / deg;
    return v < 0 ? v + 360 : v;
  };
  const h1 = h(l1.b, a1);
  const h2 = h(l2.b, a2);
  const dL = l2.L - l1.L;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * deg);
  const Lbar = (l1.L + l2.L) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbar = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) > 180) hbar = h1 + h2 < 360 ? hbar + 360 : hbar - 360;
    hbar /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbar - 30) * deg) +
    0.24 * Math.cos(2 * hbar * deg) +
    0.32 * Math.cos((3 * hbar + 6) * deg) -
    0.2 * Math.cos((4 * hbar - 63) * deg);
  const dTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * deg) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

// Machado, Oliveira & Fernandes (2009) dichromacy matrices (severity 1.0), linear RGB.
const CVD_MATRICES: Record<CvdKind, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
};

/** Simulate how a color appears with full dichromacy of the given kind. */
export function simulateCvd(hex: number, kind: CvdKind): number {
  const m = CVD_MATRICES[kind];
  const { r, g, b } = hexToRgb(hex);
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const at = (i: number): number => m[i] ?? 0;
  return rgbToHex({
    r: linearToSrgb(at(0) * R + at(1) * G + at(2) * B),
    g: linearToSrgb(at(3) * R + at(4) * G + at(5) * B),
    b: linearToSrgb(at(6) * R + at(7) * G + at(8) * B),
  });
}

/** Smallest pairwise CIEDE2000 distance in a set of colors (optionally under simulated CVD). */
export function minPairwiseDeltaE(colors: readonly number[], cvd?: CvdKind): number {
  const list = cvd ? colors.map((c) => simulateCvd(c, cvd)) : colors;
  let min = Infinity;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      min = Math.min(min, deltaE2000(list[i] ?? 0, list[j] ?? 0));
    }
  }
  return min;
}
