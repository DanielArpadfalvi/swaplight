import { describe, expect, it, vi } from 'vitest';
import { createWebClipboard } from '../../../src/platform';

describe('createWebClipboard', () => {
  it('is unavailable without a clipboard API', async () => {
    const c = createWebClipboard(undefined);
    expect(c.available).toBe(false);
    expect(await c.writeText('x')).toBe(false);
  });

  it('writes through and reports failures without throwing', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('no'));
    const c = createWebClipboard({ writeText });
    expect(c.available).toBe(true);
    expect(await c.writeText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(await c.writeText('again')).toBe(false);
  });
});
