import { describe, expect, it } from 'vitest';
import { GAME_NAME, VERSION, versionLabel } from '../../../src/core/version';

describe('versionLabel', () => {
  it('formats the default name and version', () => {
    expect(versionLabel()).toBe(`${GAME_NAME} v${VERSION}`);
  });

  it('accepts custom values', () => {
    expect(versionLabel('X', '1.2.3')).toBe('X v1.2.3');
  });
});
