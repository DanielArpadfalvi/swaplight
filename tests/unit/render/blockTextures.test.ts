import type { Renderer, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  BlockTextureFactory,
  type BlockTextureFactoryOptions,
  type BlockTextureRequest,
  type BlockTextureSet,
} from '../../../src/render/style/blockTextures';
import {
  GarbageSlabTextures,
  type SlabTextureSet,
} from '../../../src/render/style/garbageTextures';

/** Factory whose bakes are counting fakes (no canvas / GPU in unit tests). */
class FakeFactory extends BlockTextureFactory {
  baked = 0;
  destroyed = 0;
  protected override build(req: BlockTextureRequest): BlockTextureSet {
    const tex = () => {
      this.baked++;
      return { destroy: () => this.destroyed++ } as unknown as Texture;
    };
    return { body: tex(), glow: tex(), glowPadding: 0, size: req.size };
  }
}

function fakeFactory(options: BlockTextureFactoryOptions) {
  const f = new FakeFactory({ resolution: 1 } as Renderer, options);
  return { f, stats: f as { baked: number; destroyed: number } };
}

describe('BlockTextureFactory size retention', () => {
  it('keeps textures of recently used sizes instead of re-baking on a mode switch', () => {
    const { f, stats } = fakeFactory({ maxSizes: 2 });
    f.tile('color', 0, 'normal', 40);
    f.tile('color', 0, 'normal', 30);
    const baked = stats.baked;
    expect(baked).toBe(4); // body + glow per size
    f.tile('color', 0, 'normal', 40);
    f.tile('color', 0, 'normal', 30);
    expect(stats.baked).toBe(baked);
    expect(f.keptSizes).toEqual([30, 40]);
  });

  it('evicts the least recently used size beyond maxSizes', async () => {
    const { f, stats } = fakeFactory({ maxSizes: 2 });
    f.tile('color', 0, 'normal', 40);
    f.tile('color', 0, 'normal', 30);
    f.tile('color', 0, 'normal', 20);
    expect(f.keptSizes).toEqual([20, 30]);
    expect(f.has({ kind: 'color', color: 0, size: 40 })).toBe(false);
    expect(f.cacheSize).toBe(2);
    // Destruction is deferred (no renderer attached in tests: timer based).
    await new Promise((r) => setTimeout(r, 300));
    expect(stats.destroyed).toBe(2);
  });
});

describe('BlockTextureFactory.warmupStep', () => {
  it('bakes at least one variant per call and reports completion', () => {
    const { f } = fakeFactory({ maxSizes: 3 });
    const total = f.variants(32).length;
    expect(total).toBeGreaterThan(10);
    let calls = 0;
    while (!f.warmupStep(32, () => true)) calls++;
    // One variant per call when always out of time; the last call bakes the final one.
    expect(calls).toBe(total - 1);
    expect(f.variants(32).every((r) => f.has(r))).toBe(true);
    expect(f.warmupStep(32, () => true)).toBe(true);
  });

  it('does not push the on-screen size out of the cache', () => {
    const { f } = fakeFactory({ maxSizes: 2 });
    f.tile('color', 0, 'normal', 40);
    f.warmup([30]);
    f.warmup([20]);
    expect(f.keptSizes[0]).toBe(40);
    expect(f.has({ kind: 'color', color: 0, size: 40 })).toBe(true);
  });
});

class FakeSlabs extends GarbageSlabTextures {
  baked = 0;
  protected override build(): SlabTextureSet {
    this.baked++;
    const tex = { destroy: () => undefined } as unknown as Texture;
    return { body: tex, glow: tex, glowPadding: 0 };
  }
}

describe('GarbageSlabTextures', () => {
  it('keeps slabs of recently used cell sizes and warms up the common Versus shapes', () => {
    const slabs = new FakeSlabs({ resolution: 1 } as Renderer, undefined, 2);
    let steps = 1;
    while (!slabs.warmupStep(30, () => true)) steps++;
    const common = slabs.baked;
    expect(common).toBeGreaterThanOrEqual(8);
    expect(steps).toBe(common);
    // A warmed-up shape is free when the match starts; switching sizes back and forth keeps both.
    slabs.get(6, 1, 30);
    slabs.get(6, 1, 40);
    slabs.get(6, 1, 30, 'flash');
    expect(slabs.baked).toBe(common + 1);
    // A third size evicts the least recently used one.
    slabs.get(6, 1, 20);
    slabs.get(6, 1, 30);
    expect(slabs.baked).toBe(common + 2);
    slabs.get(6, 1, 40);
    expect(slabs.baked).toBe(common + 3);
  });
});
