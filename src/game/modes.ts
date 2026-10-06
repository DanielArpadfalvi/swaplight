import type { TranslationKey } from '../i18n';

/**
 * Game mode registry: the main menu lists `MODES` in order. A mode becomes playable by giving it a
 * `start` function (until then the menu shows it as "Coming soon"). `start` receives the
 * {@link ModeHost} — the app controller's services a mode needs to begin a game. Extend `ModeHost`
 * when a new mode needs more (e.g. a Run session, a CPU opponent).
 */

export type ModeId = 'run' | 'endless' | 'versus' | 'daily' | 'puzzles' | 'tutorial';

/** `free`: playable without the Full Version (possibly with some content gated inside the mode). */
export type ModeAccess = 'free' | 'full';

/** Built-in SVG icon names (drawn by `src/ui/icons.tsx`). */
export type ModeIcon = 'run' | 'endless' | 'versus' | 'daily' | 'puzzles' | 'tutorial';

/** Neon accent of the menu card. */
export type ModeAccent = 'cyan' | 'pink' | 'violet' | 'gold' | 'green' | 'orange';

export interface ModeHost {
  /** Start (or restart) a classic Endless game. */
  startEndless(): void;
}

export interface ModeDef {
  id: ModeId;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  icon: ModeIcon;
  accent: ModeAccent;
  access: ModeAccess;
  /** Begin the mode; undefined = not implemented yet ("Coming soon"). */
  start?: (host: ModeHost) => void;
}

export const MODES: readonly ModeDef[] = [
  {
    id: 'run',
    titleKey: 'menu.run',
    descKey: 'modes.run',
    icon: 'run',
    accent: 'pink',
    access: 'free',
  },
  {
    id: 'endless',
    titleKey: 'menu.endless',
    descKey: 'modes.endless',
    icon: 'endless',
    accent: 'cyan',
    access: 'free',
    start: (host) => host.startEndless(),
  },
  {
    id: 'versus',
    titleKey: 'menu.versus',
    descKey: 'modes.versus',
    icon: 'versus',
    accent: 'orange',
    access: 'free',
  },
  {
    id: 'daily',
    titleKey: 'menu.daily',
    descKey: 'modes.daily',
    icon: 'daily',
    accent: 'gold',
    access: 'full',
  },
  {
    id: 'puzzles',
    titleKey: 'menu.puzzles',
    descKey: 'modes.puzzles',
    icon: 'puzzles',
    accent: 'green',
    access: 'free',
  },
  {
    id: 'tutorial',
    titleKey: 'menu.tutorial',
    descKey: 'modes.tutorial',
    icon: 'tutorial',
    accent: 'violet',
    access: 'free',
  },
];

export type ModeStatus = 'playable' | 'locked' | 'soon';

export function getMode(id: ModeId): ModeDef | undefined {
  return MODES.find((m) => m.id === id);
}

/** Menu state of a mode: not implemented → soon; Full-Version-only without the unlock → locked. */
export function modeStatus(mode: ModeDef, fullVersion: boolean): ModeStatus {
  if (!mode.start) return 'soon';
  if (mode.access === 'full' && !fullVersion) return 'locked';
  return 'playable';
}

/** Start `id` if it is playable; returns its status (the caller explains a refusal). */
export function startMode(
  id: ModeId,
  host: ModeHost,
  fullVersion: boolean,
  modes: readonly ModeDef[] = MODES,
): ModeStatus | 'unknown' {
  const mode = modes.find((m) => m.id === id);
  if (!mode) return 'unknown';
  const status = modeStatus(mode, fullVersion);
  if (status === 'playable') mode.start?.(host);
  return status;
}
