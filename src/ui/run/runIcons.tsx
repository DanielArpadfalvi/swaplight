import type { JSX } from 'preact';
import type { GoalType, Rarity } from '../../core/run';

/**
 * Code-drawn Run-mode icons (no bitmap assets): relics are hexagonal tiles framed in their
 * rarity color, charms are round tokens, curses red shields; each carries a glyph in its own hue.
 */

type Glyph =
  | 'bolt'
  | 'hand'
  | 'flame'
  | 'leaf'
  | 'wave'
  | 'clover'
  | 'hourglass'
  | 'coin'
  | 'gear'
  | 'stack'
  | 'sun'
  | 'star'
  | 'recycle'
  | 'clock'
  | 'target'
  | 'prism'
  | 'coil'
  | 'snow'
  | 'shield'
  | 'feather'
  | 'net'
  | 'percent'
  | 'ticket'
  | 'pouch'
  | 'rack'
  | 'glow'
  | 'circle'
  | 'domino'
  | 'broom'
  | 'field'
  | 'nova'
  | 'chain'
  | 'cannon'
  | 'rainbow'
  | 'arrow'
  | 'seed'
  | 'infinity'
  | 'crown'
  | 'hole'
  | 'peak'
  | 'column'
  | 'row'
  | 'shuffle'
  | 'joker'
  | 'bomb'
  | 'blast'
  | 'key'
  | 'lantern'
  | 'buoy'
  | 'eye'
  | 'lock'
  | 'gavel'
  | 'zigzag'
  | 'drop'
  | 'diamond';

const GLYPHS: Record<Glyph, () => JSX.Element> = {
  bolt: () => <path d="M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6z" fill="currentColor" />,
  hand: () => (
    <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v6.5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4.5l-1.6-3a1.5 1.5 0 0 1 2.6-1.5L8 13" />
  ),
  flame: () => (
    <path
      d="M12 2.5c.6 3.6 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-3 1.6-4.5 2.4-6.6.9 1.5 1.6 2.1 2.6 2.4C11 7 11.2 4.6 12 2.5z"
      fill="currentColor"
      fill-opacity="0.3"
    />
  ),
  leaf: () => (
    <>
      <path d="M5 19C5 10 10.5 5 19 5c0 8.5-5 14-14 14z" fill="currentColor" fill-opacity="0.3" />
      <path d="M5 19 13 11" />
    </>
  ),
  wave: () => <path d="M3 9c3-3 6 3 9 0s6-3 9 0M3 15c3-3 6 3 9 0s6-3 9 0" />,
  clover: () => (
    <>
      <circle cx="8.5" cy="8.5" r="3.5" fill="currentColor" fill-opacity="0.3" />
      <circle cx="15.5" cy="8.5" r="3.5" fill="currentColor" fill-opacity="0.3" />
      <circle cx="8.5" cy="15.5" r="3.5" fill="currentColor" fill-opacity="0.3" />
      <circle cx="15.5" cy="15.5" r="3.5" fill="currentColor" fill-opacity="0.3" />
    </>
  ),
  hourglass: () => (
    <>
      <path d="M6.5 3h11M6.5 21h11" />
      <path d="M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9" />
      <path d="M9.5 19h5l-2.5-3z" fill="currentColor" />
    </>
  ),
  coin: () => (
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity="0.25" />
      <path d="M12 7.5v9M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5" />
    </>
  ),
  gear: () => (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" />
      <circle cx="12" cy="12" r="6.6" />
    </>
  ),
  stack: () => (
    <>
      <rect x="4" y="14" width="7" height="6" rx="1.4" fill="currentColor" fill-opacity="0.3" />
      <rect x="13" y="14" width="7" height="6" rx="1.4" fill="currentColor" fill-opacity="0.3" />
      <rect x="8.5" y="6.5" width="7" height="6" rx="1.4" fill="currentColor" fill-opacity="0.3" />
    </>
  ),
  sun: () => (
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity="0.3" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  star: () => (
    <path
      d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"
      fill="currentColor"
      fill-opacity="0.3"
    />
  ),
  recycle: () => (
    <path d="M4.5 11a7.5 7.5 0 0 1 13.4-4.2M19.5 13a7.5 7.5 0 0 1-13.4 4.2M18.5 3v4h-4M5.5 21v-4h4" />
  ),
  clock: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  target: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  prism: () => (
    <>
      <path d="M12 4 20 19H4z" fill="currentColor" fill-opacity="0.25" />
      <path d="M2 11h6M16 12l6-2.5M16.5 14l5.5.5" />
    </>
  ),
  coil: () => (
    <path d="M5 6c4-3 10-3 14 0M5 6c4 3 10 3 14 0M5 12c4-3 10-3 14 0M5 12c4 3 10 3 14 0M5 18c4-3 10-3 14 0" />
  ),
  snow: () => (
    <path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5" />
  ),
  shield: () => (
    <path
      d="M12 3 19.5 6v5.5c0 5-3.5 8.3-7.5 9.5-4-1.2-7.5-4.5-7.5-9.5V6z"
      fill="currentColor"
      fill-opacity="0.25"
    />
  ),
  feather: () => (
    <>
      <path d="M20 4C11 4 6 10 6 18l8-2c4-2 6-7 6-12z" fill="currentColor" fill-opacity="0.25" />
      <path d="M4 20 14 10" />
    </>
  ),
  net: () => (
    <path d="M3 6c3 2 15 2 18 0M4 11c3 2 13 2 16 0M6 16c3 2 9 2 12 0M7 5l3 14M12 5v15M17 5l-3 14" />
  ),
  percent: () => (
    <>
      <path d="M18 6 6 18" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </>
  ),
  ticket: () => (
    <path
      d="M3 8V6h18v2a2.5 2.5 0 0 0 0 5v5H3v-5a2.5 2.5 0 0 0 0-5zM14 6v12"
      fill="currentColor"
      fill-opacity="0.25"
    />
  ),
  pouch: () => (
    <>
      <path d="M8 7h8l3 5c1.5 4-1.5 8-7 8s-8.5-4-7-8z" fill="currentColor" fill-opacity="0.25" />
      <path d="M8 7 6.5 4h11L16 7" />
    </>
  ),
  rack: () => <path d="M4 4v16M20 4v16M4 8h16M4 14h16M4 20h16M7 8v6M11 14v6M15 8v6" />,
  glow: () => (
    <>
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
      <circle cx="12" cy="12" r="7" stroke-dasharray="2 3" />
    </>
  ),
  circle: () => <circle cx="12" cy="12" r="7" stroke-dasharray="3.5 2.5" />,
  domino: () => (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" fill="currentColor" fill-opacity="0.2" />
      <path d="M7 12h10" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
      <circle cx="10" cy="15" r="1.1" fill="currentColor" />
      <circle cx="14" cy="18" r="1.1" fill="currentColor" />
    </>
  ),
  broom: () => (
    <>
      <path d="M20 4 11 13" />
      <path d="M11 13c-3-1-6 1-7 7 6-1 8-4 7-7z" fill="currentColor" fill-opacity="0.3" />
    </>
  ),
  field: () => (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 2" />
      <path d="M9 9h6v6H9z" fill="currentColor" fill-opacity="0.35" />
    </>
  ),
  nova: () => (
    <path
      d="m12 2 1.8 6.2L20 6l-3.8 5.3L22 14l-6.4.6L16 21l-4-5-4 5 .4-6.4L2 14l5.8-2.7L4 6l6.2 2.2z"
      fill="currentColor"
      fill-opacity="0.3"
    />
  ),
  chain: () => (
    <>
      <rect x="2.5" y="8.5" width="11" height="7" rx="3.5" />
      <rect x="10.5" y="8.5" width="11" height="7" rx="3.5" />
    </>
  ),
  cannon: () => (
    <>
      <path d="M4 14 17 6l2.5 4-13 8z" fill="currentColor" fill-opacity="0.3" />
      <circle cx="8" cy="18" r="2.5" />
    </>
  ),
  rainbow: () => <path d="M3 18a9 9 0 0 1 18 0M6.5 18a5.5 5.5 0 0 1 11 0M10 18a2 2 0 0 1 4 0" />,
  arrow: () => <path d="M4 18 11 11l3 3 6-6M15 8h5v5" />,
  seed: () => (
    <>
      <path d="M12 21c-5-3-6-9 0-17 6 8 5 14 0 17z" fill="currentColor" fill-opacity="0.3" />
      <path d="M12 21V11" />
    </>
  ),
  infinity: () => (
    <path d="M12 12c-2-2.7-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1.3-5.5 4z" />
  ),
  crown: () => (
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" fill-opacity="0.3" />
  ),
  hole: () => (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12" />
      <circle cx="12" cy="12" r="5.5" fill="currentColor" fill-opacity="0.25" />
      <circle cx="12" cy="12" r="2.4" fill="#050310" />
    </>
  ),
  peak: () => (
    <>
      <path d="M2.5 20 9.5 8l4 6 3-4 5 10z" fill="currentColor" fill-opacity="0.3" />
      <circle cx="17.5" cy="5" r="1.6" fill="currentColor" />
    </>
  ),
  column: () => (
    <>
      <rect x="9" y="3" width="6" height="18" rx="1.5" fill="currentColor" fill-opacity="0.35" />
      <path d="M4 6v12M20 6v12" stroke-dasharray="2 2" />
    </>
  ),
  row: () => (
    <>
      <rect x="3" y="9" width="18" height="6" rx="1.5" fill="currentColor" fill-opacity="0.35" />
      <path d="M6 4h12M6 20h12" stroke-dasharray="2 2" />
    </>
  ),
  shuffle: () => (
    <path d="M3 7h4c5 0 5 10 10 10h4M3 17h4c2 0 3-1.5 4-3.5M13.5 9C14.5 8 15.5 7 17 7h4M18 4l3 3-3 3M18 14l3 3-3 3" />
  ),
  joker: () => (
    <path
      d="m12 3 1.9 6.1H20l-5 3.8 1.9 6.1-4.9-3.8-4.9 3.8 1.9-6.1-5-3.8h6.1z"
      fill="currentColor"
      fill-opacity="0.35"
      stroke-dasharray="0"
    />
  ),
  bomb: () => (
    <>
      <circle cx="11" cy="14" r="6.5" fill="currentColor" fill-opacity="0.3" />
      <path d="M15.5 9.5 18 7M18 7l1-3M18 7l3 1" />
    </>
  ),
  blast: () => (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" stroke-dasharray="3 2" />
      <path
        d="m12 7 1.2 3.3L16.5 9l-1.9 3 2.4 2.2-3.3.2L12 17.5l-1.7-3.1-3.3-.2 2.4-2.2-1.9-3 3.3 1.3z"
        fill="currentColor"
        fill-opacity="0.4"
      />
    </>
  ),
  key: () => (
    <>
      <circle cx="7.5" cy="12" r="4" />
      <path d="M11.5 12H21M17.5 12v3.5M20.5 12v2.5" />
    </>
  ),
  lantern: () => (
    <>
      <path d="M9 5h6M12 2.5V5M8 8h8l1 9H7z" fill="currentColor" fill-opacity="0.25" />
      <path d="M7 20h10" />
      <circle cx="12" cy="12.5" r="1.8" fill="currentColor" />
    </>
  ),
  buoy: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M6 6l3.2 3.2M18 6l-3.2 3.2M6 18l3.2-3.2M18 18l-3.2-3.2" />
    </>
  ),
  eye: () => (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M4 20 20 4" />
    </>
  ),
  lock: () => (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" fill-opacity="0.3" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  gavel: () => (
    <>
      <path d="m13 4 7 7M10 7l7 7M11.5 5.5l-3 3 7 7 3-3z" fill="currentColor" fill-opacity="0.25" />
      <path d="M10.5 12.5 4 19M3 21h9" />
    </>
  ),
  zigzag: () => <path d="M3 8l4 4 4-4 4 4 4-4 2 2M3 15l4 4 4-4 4 4 4-4 2 2" />,
  drop: () => (
    <path
      d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z"
      fill="currentColor"
      fill-opacity="0.3"
    />
  ),
  diamond: () => <path d="M12 3 20 12l-8 9-8-9z" fill="currentColor" fill-opacity="0.3" />,
};

/** Glyph + hue per relic. */
const RELIC_ART: Record<string, [Glyph, string]> = {
  spark_plug: ['bolt', '#ffe066'],
  heavy_hand: ['hand', '#ffb36b'],
  ruby_ember: ['flame', '#ff5470'],
  jade_echo: ['leaf', '#3ddc84'],
  sapphire_tide: ['wave', '#4aa8ff'],
  steady_hand: ['hand', '#9fd8ff'],
  lucky_four: ['clover', '#3ddc84'],
  slow_tide: ['wave', '#7ee8ff'],
  chronoglass: ['hourglass', '#9fd8ff'],
  piggy_bank: ['coin', '#ffd23f'],
  overclock: ['gear', '#ff8a3d'],
  packed_stack: ['stack', '#c7a6ff'],
  early_bird: ['sun', '#ffd23f'],
  constellation: ['star', '#b8c4ff'],
  recycler: ['recycle', '#3ddc84'],
  overachiever: ['arrow', '#ffd23f'],
  clockwork: ['clock', '#ffd23f'],
  bounty_hunter: ['target', '#ff5470'],
  refractor: ['prism', '#7ee8ff'],
  cascade_coil: ['coil', '#4aa8ff'],
  violet_fever: ['flame', '#c77dff'],
  amber_bank: ['coin', '#ffb000'],
  hot_streak: ['flame', '#ff8a3d'],
  snowball: ['snow', '#dff4ff'],
  last_stand: ['shield', '#ff5470'],
  featherweight: ['feather', '#e8e4ff'],
  safety_net: ['net', '#7ee8ff'],
  compound_interest: ['percent', '#ffd23f'],
  coupon_book: ['ticket', '#ff9ad5'],
  talisman_pouch: ['pouch', '#ff9ad5'],
  expansion_rack: ['rack', '#b8c4ff'],
  afterglow: ['glow', '#ff9ad5'],
  minimalist: ['circle', '#e8e4ff'],
  domino: ['domino', '#ffffff'],
  clean_sweep: ['broom', '#7ee8ff'],
  stasis_field: ['field', '#7ee8ff'],
  supernova: ['nova', '#ffd23f'],
  chain_reactor: ['chain', '#ff4fbf'],
  glass_cannon: ['cannon', '#9fd8ff'],
  rainbow_bridge: ['rainbow', '#ff9ad5'],
  momentum: ['arrow', '#ff4fbf'],
  joker_seed: ['seed', '#3ddc84'],
  gold_leaf: ['leaf', '#ffd23f'],
  infinity_loop: ['infinity', '#c77dff'],
  midas_engine: ['crown', '#ffd23f'],
  black_hole: ['hole', '#c77dff'],
  zenith: ['peak', '#ffe066'],
};

const CHARM_ART: Record<string, [Glyph, string]> = {
  purge: ['column', '#ff5470'],
  undertow: ['row', '#4aa8ff'],
  cryo: ['snow', '#9fe8ff'],
  monotone: ['row', '#c77dff'],
  kaleido: ['shuffle', '#ff9ad5'],
  joker: ['joker', '#ffffff'],
  fuse: ['bomb', '#ff8a3d'],
  detonate: ['blast', '#ff5470'],
  hourglass: ['hourglass', '#ffd23f'],
  overcharge: ['bolt', '#ff4fbf'],
  golden_ticket: ['ticket', '#ffd23f'],
  vanish: ['drop', '#c77dff'],
  skeleton_key: ['key', '#e8e4ff'],
  lantern: ['lantern', '#ffd23f'],
  lifeline: ['buoy', '#ff5470'],
};

const CURSE_ART: Record<string, Glyph> = {
  surge: 'wave',
  veil: 'eye',
  lock: 'lock',
  spectrum: 'prism',
  drought: 'sun',
  judge: 'gavel',
  stagger: 'zigzag',
  shiver: 'snow',
};

export const DECK_ART: Record<string, [Glyph, string]> = {
  neon: ['bolt', '#1ec8ff'],
  prism: ['prism', '#ff4fbf'],
  zen: ['leaf', '#3ddc84'],
  gambler: ['coin', '#ffd23f'],
  cascade: ['coil', '#7a8cff'],
  collector: ['rack', '#ff8a3d'],
};

const GOAL_ART: Record<GoalType, Glyph> = {
  scoreInTime: 'star',
  clearBlocks: 'stack',
  survive: 'shield',
  chainTarget: 'chain',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#5aa9ff',
  uncommon: '#3ddc84',
  rare: '#ff5470',
  legendary: '#c77dff',
};

function GlyphSvg({ glyph, size, color }: { glyph: Glyph; size: number; color?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      style={color ? { color } : undefined}
    >
      {GLYPHS[glyph]()}
    </svg>
  );
}

const HEX = 'M12 1.6 21.2 6.8v10.4L12 22.4 2.8 17.2V6.8z';

/** Relic tile: hexagon framed in the rarity color with the relic's glyph. */
export function RelicIcon({
  id,
  rarity,
  size = 40,
}: {
  id: string;
  rarity: Rarity;
  size?: number;
}) {
  const [glyph, hue] = RELIC_ART[id] ?? ['star', '#ffffff'];
  const frame = RARITY_COLOR[rarity];
  return (
    <span class={`relic-icon rarity-${rarity}`} style={{ width: `${size}px`, height: `${size}px` }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" class="relic-hex">
        <path d={HEX} fill="#0d0922" stroke={frame} stroke-width="1.3" />
        <path
          d={HEX}
          fill={frame}
          fill-opacity="0.14"
          transform="translate(12 12) scale(0.82) translate(-12 -12)"
        />
      </svg>
      <span class="relic-glyph">
        <GlyphSvg glyph={glyph} size={Math.round(size * 0.5)} color={hue} />
      </span>
    </span>
  );
}

/** Charm token: round coin with the charm's glyph. */
export function CharmIcon({ id, size = 40 }: { id: string; size?: number }) {
  const [glyph, hue] = CHARM_ART[id] ?? ['star', '#ffffff'];
  return (
    <span
      class="charm-icon"
      style={{ width: `${size}px`, height: `${size}px`, '--charm-hue': hue }}
    >
      <GlyphSvg glyph={glyph} size={Math.round(size * 0.54)} color={hue} />
    </span>
  );
}

/** Boss curse badge. */
export function CurseIcon({ id, size = 36 }: { id: string; size?: number }) {
  const glyph = CURSE_ART[id] ?? 'eye';
  return (
    <span class="curse-icon" style={{ width: `${size}px`, height: `${size}px` }}>
      <GlyphSvg glyph={glyph} size={Math.round(size * 0.56)} />
    </span>
  );
}

export function DeckGlyph({ id, size = 34 }: { id: string; size?: number }) {
  const [glyph, hue] = DECK_ART[id] ?? ['bolt', '#1ec8ff'];
  return <GlyphSvg glyph={glyph} size={size} color={hue} />;
}

export function GoalGlyph({ type, size = 18 }: { type: GoalType; size?: number }) {
  return <GlyphSvg glyph={GOAL_ART[type]} size={size} />;
}

/** The Szikra (spark) currency mark. */
export function SparkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" class="spark-icon">
      <path
        d="m12 1.5 2.4 7.1 7.1 2.4-7.1 2.4L12 20.5l-2.4-7.1L2.5 11l7.1-2.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SkullIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    >
      <path d="M12 3a8 8 0 0 0-8 8c0 3 1.5 4.5 3 5.5V20h10v-3.5c1.5-1 3-2.5 3-5.5a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="11.5" r="1.8" fill="currentColor" />
      <circle cx="15" cy="11.5" r="1.8" fill="currentColor" />
      <path d="M10.5 20v-2.5M13.5 20v-2.5" />
    </svg>
  );
}
