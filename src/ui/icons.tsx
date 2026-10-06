import type { JSX } from 'preact';
import type { ModeIcon } from '../game/modes';

/** Inline SVG icons (no bitmap assets). All use `currentColor`. */

type IconProps = { size?: number; class?: string };

function Svg({
  size = 24,
  class: cls,
  children,
}: IconProps & { children: JSX.Element[] | JSX.Element }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      class={cls}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {children}
    </svg>
  );
}

const MODE_PATHS: Record<ModeIcon, () => JSX.Element[] | JSX.Element> = {
  // Lightning bolt: the roguelite run.
  run: () => (
    <path d="M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6z" fill="currentColor" fill-opacity="0.18" />
  ),
  // Infinity.
  endless: () => (
    <path d="M12 12c-2-2.7-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1.3-5.5 4z" />
  ),
  // Two facing arrows.
  versus: () => [<path key="a" d="M3 8h11l-3-3" />, <path key="b" d="M21 16H10l3 3" />],
  // Calendar with a star.
  daily: () => [
    <rect key="a" x="3.5" y="5" width="17" height="15.5" rx="3" />,
    <path key="b" d="M3.5 10h17M8 3v4M16 3v4" />,
    <path
      key="c"
      d="m12 12.3.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"
      fill="currentColor"
      stroke-width="1"
    />,
  ],
  // Puzzle piece.
  puzzles: () => (
    <path
      d="M5 7h3.2a2 2 0 1 1 3.6 0H15v3.2a2 2 0 1 1 0 3.6V17h-3.2a2 2 0 1 0-3.6 0H5v-3.2a2 2 0 1 0 0-3.6z"
      fill="currentColor"
      fill-opacity="0.15"
    />
  ),
  // Graduation / spark: a guiding pointer.
  tutorial: () => [
    <path key="a" d="M2.5 9.5 12 5l9.5 4.5L12 14z" fill="currentColor" fill-opacity="0.15" />,
    <path key="b" d="M6.5 11.5v4c1.5 1.4 3.4 2 5.5 2s4-.6 5.5-2v-4M21.5 9.5v5" />,
  ],
};

export function ModeGlyph({ icon, size = 28 }: { icon: ModeIcon; size?: number }) {
  return <Svg size={size}>{MODE_PATHS[icon]()}</Svg>;
}

export function IconLock({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" fill-opacity="0.2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  );
}

export function IconPlay({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconBack({ size = 22 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function IconChevron({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function IconSettings({ size = 22 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
    </Svg>
  );
}

export function IconStats({ size = 22 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4 20V11M10 20V4M16 20v-6M22 20H2" />
    </Svg>
  );
}

export function IconCollection({ size = 22 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z" />
      <path d="M12 7.5 16 9.8v4.4l-4 2.3-4-2.3V9.8z" fill="currentColor" fill-opacity="0.25" />
    </Svg>
  );
}
