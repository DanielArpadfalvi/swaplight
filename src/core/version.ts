export const GAME_NAME = 'Swaplight';
export const VERSION = '0.0.1';

export function versionLabel(name: string = GAME_NAME, version: string = VERSION): string {
  return `${name} v${version}`;
}
