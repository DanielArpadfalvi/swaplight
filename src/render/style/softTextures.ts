import { Texture } from 'pixi.js';

/**
 * Tiny procedurally drawn textures shared by the backdrop and effects (canvas 2D, created once).
 * All are white so sprites can be tinted.
 */

let dot: Texture | undefined;
let spark: Texture | undefined;
let vignette: Texture | undefined;

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  return Texture.from(canvas);
}

/** 64×64 soft round dot with a hot core. */
export function softDotTexture(): Texture {
  dot ??= canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  return dot;
}

/** 64×16 elongated streak (for velocity-aligned sparks). */
export function sparkTexture(): Texture {
  spark ??= canvasTexture(64, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(32, 8, 32, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.ellipse(46, 8, 10, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  return spark;
}

/** 256×256 edge vignette: transparent center, white rim. */
export function vignetteTexture(): Texture {
  vignette ??= canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  return vignette;
}
