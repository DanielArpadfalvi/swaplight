import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { CHARMS, CURSES, DECKS, RELICS, type Rarity } from '../core/run';
import { versionLabel } from '../core/version';
import { deckAvailable } from '../game/runUnlocks';
import type { GameActions, GameUiState } from '../game/state';
import { t, type TranslationKey } from '../i18n';
import { longestWord, useFitWord } from './fit';
import { PRIVACY_URL } from '../game/links';
import { IconExternal, IconLock } from './icons';
import { CharmIcon, CurseIcon, DeckGlyph, RelicIcon } from './run/runIcons';
import {
  charmDesc,
  charmName,
  curseDesc,
  curseName,
  deckDesc,
  deckName,
  relicDesc,
  relicName,
} from './run/runText';
import { Sheet } from './Sheet';

interface Props {
  actions: GameActions;
  leaving: boolean;
  z: number;
}

type CollectionTab = 'relics' | 'charms' | 'curses' | 'decks';

const COLLECTION_TABS: readonly CollectionTab[] = ['relics', 'charms', 'curses', 'decks'];

const TAB_LABEL: Record<CollectionTab, TranslationKey> = {
  relics: 'collection.tabRelics',
  charms: 'collection.tabCharms',
  curses: 'collection.tabBosses',
  decks: 'collection.tabDecks',
};

interface CollectionItem {
  id: string;
  /** Discovered (decks: unlocked). */
  seen: boolean;
  rarity?: Rarity;
  icon: (size: number) => ComponentChildren;
  name: () => string;
  desc: () => string;
}

/** Every Run item of a tab, in catalogue order, with its discovered flag. */
export function collectionItems(
  tab: CollectionTab,
  seen: ReadonlySet<string>,
  fullVersion: boolean,
): CollectionItem[] {
  switch (tab) {
    case 'relics':
      return RELICS.map((r) => ({
        id: r.id,
        seen: seen.has(`relic.${r.id}`),
        rarity: r.rarity,
        icon: (size) => <RelicIcon id={r.id} rarity={r.rarity} size={size} />,
        name: () => relicName(r.id),
        desc: () => relicDesc(r.id),
      }));
    case 'charms':
      return CHARMS.map((c) => ({
        id: c.id,
        seen: seen.has(`charm.${c.id}`),
        rarity: c.rarity,
        icon: (size) => <CharmIcon id={c.id} size={size} />,
        name: () => charmName(c.id),
        desc: () => charmDesc(c.id),
      }));
    case 'curses':
      return CURSES.map((c) => ({
        id: c.id,
        seen: seen.has(`boss.${c.id}`),
        icon: (size) => <CurseIcon id={c.id} size={size} />,
        name: () => curseName(c.id),
        desc: () => curseDesc(c.id),
      }));
    case 'decks':
      return DECKS.map((d) => ({
        id: d.id,
        seen: deckAvailable(d.id, fullVersion),
        icon: (size) => (
          <span class="col-deck-icon" style={{ width: `${size}px`, height: `${size}px` }}>
            <DeckGlyph id={d.id} size={Math.round(size * 0.6)} />
          </span>
        ),
        name: () => deckName(d.id),
        desc: () => deckDesc(d.id),
      }));
  }
}

/** Relics, charms, bosses and decks of the Run mode: discovered ones in full, the rest as "???". */
export function CollectionScreen({ state, actions, leaving, z }: Props & { state: GameUiState }) {
  const [tab, setTab] = useState<CollectionTab>('relics');
  const [open, setOpen] = useState<string | null>(null);
  const seen = new Set(state.collectionSeen);
  const lists = Object.fromEntries(
    COLLECTION_TABS.map((k) => [k, collectionItems(k, seen, state.fullVersion)]),
  ) as Record<CollectionTab, CollectionItem[]>;
  const count = (k: CollectionTab) => lists[k].filter((i) => i.seen).length;
  const found = COLLECTION_TABS.reduce((n, k) => n + count(k), 0);
  const total = COLLECTION_TABS.reduce((n, k) => n + lists[k].length, 0);
  const items = lists[tab];
  const pick = (k: CollectionTab) => {
    setTab(k);
    setOpen(null);
  };
  return (
    <Sheet
      title={t('collection.title')}
      testId="collection"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <div class="col-summary">
        <span class="col-summary-text" data-testid="collection-total">
          {t('collection.discovered', { found, total })}
        </span>
        <span class="col-meter" aria-hidden="true">
          <span
            class="col-meter-fill"
            style={{ width: `${(found / Math.max(1, total)) * 100}%` }}
          />
        </span>
      </div>
      <div class="col-tabs" role="tablist" aria-label={t('collection.title')}>
        {COLLECTION_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === tab ? 'true' : 'false'}
            class={`col-tab${k === tab ? ' is-on' : ''}`}
            data-testid={`collection-tab-${k}`}
            onClick={() => pick(k)}
          >
            <TabLabel text={t(TAB_LABEL[k])} />
            <span class="col-tab-count" data-testid={`collection-count-${k}`}>
              {count(k)}/{lists[k].length}
            </span>
          </button>
        ))}
      </div>
      {found === 0 && tab !== 'decks' ? (
        <div class="col-empty" data-testid="collection-empty">
          <HexArt />
          <span class="col-empty-text">
            <strong>{t('collection.soonTitle')}</strong>
            <span>{t('collection.soonBody')}</span>
          </span>
        </div>
      ) : (
        <p class="col-hint">{t('collection.tapHint')}</p>
      )}
      <div class={`col-grid col-${tab}`} role="tabpanel" data-testid="collection-grid">
        {items.map((item) => {
          const isOpen = open === item.id;
          const label = item.seen || tab === 'decks' ? item.name() : t('collection.unknown');
          return (
            <button
              key={item.id}
              type="button"
              class={`col-item${item.seen ? ' is-seen' : ' is-unseen'}${isOpen ? ' is-open' : ''}${item.rarity ? ` rarity-${item.rarity}` : ''}`}
              data-testid={`collection-item-${item.id}`}
              aria-expanded={isOpen ? 'true' : 'false'}
              aria-label={item.seen ? item.name() : t('collection.undiscovered')}
              onClick={() => setOpen(isOpen ? null : item.id)}
            >
              <span class="col-icon">{item.icon(isOpen ? 52 : 36)}</span>
              {isOpen ? (
                <span class="col-detail" data-testid="collection-detail">
                  {item.seen && item.rarity && (
                    <span class={`rarity-tag rarity-${item.rarity}`}>
                      {t(`run.rarity.${item.rarity}`)}
                    </span>
                  )}
                  <strong class="col-name">{label}</strong>
                  <span class="col-desc">
                    {item.seen
                      ? item.desc()
                      : tab === 'decks'
                        ? `${item.desc()} ${t('collection.deckLocked')}`
                        : t('collection.unknownHint')}
                  </span>
                </span>
              ) : (
                <span class="col-name" style={{ '--word': String(longestWord(label)) }}>
                  {label}
                </span>
              )}
              {tab === 'decks' && !item.seen && (
                <span class="col-lock" aria-hidden="true">
                  <IconLock size={11} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function HexArt() {
  return (
    <svg viewBox="0 0 120 104" width="72" height="62" aria-hidden="true" class="hex-art">
      {[
        [30, 18],
        [60, 18],
        [90, 18],
        [15, 44],
        [45, 44],
        [75, 44],
        [105, 44],
        [30, 70],
        [60, 70],
        [90, 70],
      ].map(([x, y], i) => (
        <polygon
          key={i}
          points={hexPoints(x!, y!, 13)}
          class={i === 4 ? 'hex hex-lit' : i === 8 ? 'hex hex-lit2' : 'hex'}
        />
      ))}
    </svg>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function CreditsScreen({ actions, leaving, z }: Props) {
  return (
    <Sheet
      title={t('about.creditsTitle')}
      testId="credits"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <div class="about">
        <div class="logo logo-small" aria-hidden="true">
          <span class="logo-swap">SWAP</span>
          <span class="logo-light">LIGHT</span>
        </div>
        <dl class="credits">
          <dt>{t('about.madeBy')}</dt>
          <dd>{t('about.madeByName')}</dd>
          <dt>{t('about.artAudio')}</dt>
          <dd>{t('about.artAudioBody')}</dd>
          <dt>{t('about.tech')}</dt>
          <dd>{t('about.techList')}</dd>
        </dl>
        <p class="about-thanks">{t('about.thanks')}</p>
        <p class="ui-label ui-label-static">{versionLabel()}</p>
      </div>
    </Sheet>
  );
}

export function PrivacyScreen({ actions, leaving, z }: Props) {
  return (
    <Sheet
      title={t('about.privacyTitle')}
      testId="privacy"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <div class="about about-text">
        <p>{t('about.privacyBody1')}</p>
        <p>{t('about.privacyBody2')}</p>
        <p class="about-note">{t('about.privacyBody3')}</p>
        <a
          class="btn btn-ghost btn-small about-link"
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="privacy-link"
        >
          {t('about.privacyLink')}
          <IconExternal />
        </a>
      </div>
    </Sheet>
  );
}

/** Android back on the main menu: confirm leaving the app. */
export function ExitDialog({ actions, leaving, z }: Props) {
  return (
    <div
      class={`overlay overlay-dim dialog${leaving ? ' is-leaving' : ''}`}
      style={{ zIndex: z }}
      data-testid="exit-confirm"
      role="alertdialog"
      aria-modal="true"
    >
      <div class="panel">
        <h2 class="panel-title">{t('menu.exitTitle')}</h2>
        <p class="panel-body">{t('menu.exitBody')}</p>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="exit-stay"
          onClick={() => actions.closeOverlay()}
        >
          {t('menu.stay')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="exit-app"
          onClick={() => actions.exitApp()}
        >
          {t('menu.exit')}
        </button>
      </div>
    </div>
  );
}

/** Collection tab label: one word, shrunk to fit rather than broken mid-word ("TALIZMÁNO-K"). */
function TabLabel({ text }: { text: string }) {
  const ref = useFitWord<HTMLSpanElement>(0.72);
  return (
    <span class="col-tab-label" ref={ref}>
      {text}
    </span>
  );
}
