import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  FlashOverlay,
  ParticleBurstPool,
  ScreenShake,
  shakeOffset,
} from '../../../src/render/style/effects';
import { blockGlowPadding, blockTextureKey } from '../../../src/render/style/blockTextures';

describe('shakeOffset', () => {
  it('is zero at zero intensity and bounded by the max offset', () => {
    expect(shakeOffset(0, 1.234)).toEqual({ x: 0, y: 0, rotation: 0 });
    for (let t = 0; t < 2; t += 0.013) {
      const o = shakeOffset(1, t, undefined, 10, 0.02);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(10);
      expect(Math.abs(o.rotation)).toBeLessThanOrEqual(0.02);
    }
  });

  it('is deterministic and writes into the provided object', () => {
    const out = { x: 0, y: 0, rotation: 0 };
    const r = shakeOffset(0.7, 0.5, out);
    expect(r).toBe(out);
    expect(shakeOffset(0.7, 0.5)).toEqual(out);
  });
});

describe('ScreenShake', () => {
  it('decays trauma to rest and respects reduced motion', () => {
    const shake = new ScreenShake();
    shake.add(0.8);
    shake.update(0.016);
    expect(shake.trauma).toBeGreaterThan(0.7);
    for (let i = 0; i < 120; i++) shake.update(1 / 60);
    expect(shake.trauma).toBe(0);
    expect(shake.offset).toEqual({ x: 0, y: 0, rotation: 0 });

    shake.enabled = false;
    shake.add(1);
    expect(shake.update(0.01)).toEqual({ x: 0, y: 0, rotation: 0 });
  });

  it('clamps trauma to 1', () => {
    const shake = new ScreenShake();
    shake.add(0.9);
    shake.add(0.9);
    expect(shake.trauma).toBe(1);
  });
});

describe('ParticleBurstPool', () => {
  const textures = { dotTexture: Texture.WHITE, sparkTexture: Texture.WHITE };

  it('emits, animates and retires particles without growing', () => {
    const pool = new ParticleBurstPool({ capacity: 32, ...textures });
    expect(pool.children).toHaveLength(32);
    pool.burst(10, 10, 0xff0000, { count: 12, life: 0.5 });
    expect(pool.activeCount).toBe(12);
    pool.update(0.1);
    expect(pool.activeCount).toBe(12);
    for (let i = 0; i < 60; i++) pool.update(1 / 60);
    expect(pool.activeCount).toBe(0);
    expect(pool.children).toHaveLength(32);
  });

  it('recycles slots when over capacity', () => {
    const pool = new ParticleBurstPool({ capacity: 16, ...textures });
    pool.burst(0, 0, 0xffffff, { count: 40 });
    expect(pool.activeCount).toBeLessThanOrEqual(16);
    expect(pool.children).toHaveLength(16);
    pool.clear();
    expect(pool.activeCount).toBe(0);
  });
});

describe('FlashOverlay', () => {
  it('fades out and hides itself', () => {
    const flash = new FlashOverlay(100, 50);
    expect(flash.visible).toBe(false);
    flash.flash(0xff00ff, 0.5, 0.2);
    expect(flash.alpha).toBeCloseTo(0.5);
    flash.update(0.1);
    expect(flash.alpha).toBeLessThan(0.5);
    expect(flash.alpha).toBeGreaterThan(0);
    flash.update(0.2);
    expect(flash.visible).toBe(false);
  });
});

describe('block texture helpers', () => {
  it('builds distinct cache keys per variant', () => {
    const a = blockTextureKey({ kind: 'color', color: 1, size: 48 }, 2);
    const b = blockTextureKey({ kind: 'color', color: 1, size: 48, state: 'flash' }, 2);
    const c = blockTextureKey({ kind: 'garbage', color: 3, size: 48 }, 2);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(blockTextureKey({ kind: 'garbage', color: 1, size: 48 }, 2)).toBe(c);
    expect(a).toBe(blockTextureKey({ kind: 'color', color: 1, size: 48, state: 'normal' }, 2));
  });

  it('pads glows proportionally to tile size', () => {
    expect(blockGlowPadding(48)).toBeGreaterThan(12);
    expect(blockGlowPadding(96)).toBeGreaterThan(blockGlowPadding(48));
  });
});
