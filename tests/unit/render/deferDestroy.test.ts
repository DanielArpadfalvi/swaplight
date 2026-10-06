import { describe, expect, it } from 'vitest';
import {
  attachDeferredDestroy,
  deferDestroy,
  sharedGradient,
} from '../../../src/render/style/blockTextures';

describe('deferDestroy with a renderer attached', () => {
  it('waits for rendered frames, not just time (no "destroyed while still bound")', () => {
    const runners: { postrender(): void }[] = [];
    attachDeferredDestroy({ runners: { postrender: { add: (r) => runners.push(r) } } });
    const frame = () => runners.forEach((r) => r.postrender());
    let destroyed = 0;
    deferDestroy([{ destroy: () => destroyed++ }, { destroy: () => destroyed++ }], 0);
    frame();
    frame();
    expect(destroyed).toBe(0);
    frame();
    expect(destroyed).toBe(2);
    frame();
    expect(destroyed).toBe(2);
  });
});

describe('sharedGradient', () => {
  it('returns one cached gradient per stop set', () => {
    const a = sharedGradient({ x: 0, y: 1 }, [
      { offset: 0, color: 0xff0000 },
      { offset: 1, color: 'rgba(0,0,0,0.5)' },
    ]);
    const b = sharedGradient({ x: 0, y: 1 }, [
      { offset: 0, color: 0xff0000 },
      { offset: 1, color: 'rgba(0,0,0,0.5)' },
    ]);
    const c = sharedGradient({ x: 1, y: 1 }, [
      { offset: 0, color: 0xff0000 },
      { offset: 1, color: 'rgba(0,0,0,0.5)' },
    ]);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});
