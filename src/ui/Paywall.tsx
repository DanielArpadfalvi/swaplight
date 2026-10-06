import type { JSX } from 'preact';
import { LEGAL_URLS } from '../game/paywall';
import type { GameActions, GameUiState, PaywallReason } from '../game/state';
import { t, type TranslationKey } from '../i18n';
import { ModeGlyph } from './icons';
import './paywall.css';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
  z: number;
}

const REASON_KEYS: Partial<Record<PaywallReason, TranslationKey>> = {
  decks: 'paywall.reason.decks',
  brightness: 'paywall.reason.brightness',
  versus: 'paywall.reason.versus',
  daily: 'paywall.reason.daily',
  puzzles: 'paywall.reason.puzzles',
};

type FeatureId = 'decks' | 'brightness' | 'versus' | 'daily' | 'puzzles' | 'future';

const FEATURES: readonly {
  id: FeatureId;
  title: TranslationKey;
  desc: TranslationKey;
  hue: string;
}[] = [
  {
    id: 'decks',
    title: 'paywall.features.decks',
    desc: 'paywall.featureDesc.decks',
    hue: '#ff4fbf',
  },
  {
    id: 'brightness',
    title: 'paywall.features.brightness',
    desc: 'paywall.featureDesc.brightness',
    hue: '#ffd23f',
  },
  {
    id: 'versus',
    title: 'paywall.features.versus',
    desc: 'paywall.featureDesc.versus',
    hue: '#ff8a3d',
  },
  {
    id: 'daily',
    title: 'paywall.features.daily',
    desc: 'paywall.featureDesc.daily',
    hue: '#ffd23f',
  },
  {
    id: 'puzzles',
    title: 'paywall.features.puzzles',
    desc: 'paywall.featureDesc.puzzles',
    hue: '#3dff7a',
  },
  {
    id: 'future',
    title: 'paywall.futureContent',
    desc: 'paywall.featureDesc.future',
    hue: '#1ec8ff',
  },
];

/** The "Full Version" sheet: what unlocks, the store price, buy / restore and every flow state. */
export function PaywallScreen({ state, actions, leaving, z }: Props) {
  const pw = state.paywall;
  const celebrating = pw.status === 'success';
  const owned = state.fullVersion && !celebrating;
  return (
    <div
      class={`overlay paywall${leaving ? ' is-leaving' : ''}${celebrating ? ' is-celebrating' : ''}`}
      style={{ zIndex: z }}
      data-testid="paywall"
      data-status={owned ? 'owned' : pw.status}
      role="dialog"
      aria-modal="true"
      aria-label={t('paywall.title')}
    >
      <div class="paywall-frame">
        <button
          type="button"
          class="icon-btn paywall-close"
          aria-label={t('common.close')}
          data-testid="paywall-close"
          onClick={() => actions.closeOverlay()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
            />
          </svg>
        </button>
        {celebrating || owned ? (
          <Unlocked state={state} actions={actions} owned={owned} />
        ) : (
          <Offer state={state} actions={actions} />
        )}
      </div>
    </div>
  );
}

function Offer({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const pw = state.paywall;
  const reasonKey = pw.reason ? REASON_KEYS[pw.reason] : undefined;
  const buying = pw.status === 'buying';
  const restoring = state.restoreStatus === 'busy';
  const price = pw.price;
  const unavailable = pw.product === 'unavailable';
  const buyLabel = buying
    ? t('paywall.buying')
    : pw.status === 'failed'
      ? t('paywall.tryAgain')
      : price
        ? t('paywall.buyFor', { price })
        : t('paywall.buy');
  return (
    <div class="paywall-body">
      <header class="paywall-hero">
        <Emblem />
        <span class="paywall-kicker">{t('paywall.title')}</span>
        <h2 class="paywall-headline">{t('paywall.headline')}</h2>
        {reasonKey ? (
          <p class="paywall-reason" data-testid="paywall-reason">
            {t(reasonKey)}
          </p>
        ) : (
          <p class="paywall-sub">{t('paywall.subtitle')}</p>
        )}
      </header>

      <ul class="paywall-features" aria-label={t('paywall.featureList')}>
        {FEATURES.map((f, i) => (
          <li
            key={f.id}
            class={`paywall-feature${pw.reason === f.id ? ' is-focus' : ''}`}
            style={{ '--hue': f.hue, animationDelay: `${90 + i * 45}ms` }}
          >
            <span class="paywall-feature-icon">
              <FeatureIcon id={f.id} />
            </span>
            <span class="paywall-feature-text">
              <strong>{t(f.title)}</strong>
              <span>{t(f.desc)}</span>
            </span>
            <span class="paywall-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path
                  d="m5 12.5 4.5 4.5L19 7.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </li>
        ))}
      </ul>

      <p class="paywall-promise">{t('paywall.promise')}</p>

      <StatusNote state={state} />

      <div class="paywall-cta">
        <button
          type="button"
          class={`btn btn-primary paywall-buy${buying ? ' is-busy' : ''}`}
          data-testid="paywall-buy"
          disabled={buying || restoring}
          onClick={() => actions.buyFullVersion()}
        >
          {buying && <span class="paywall-spinner" aria-hidden="true" />}
          <span>{buyLabel}</span>
        </button>
        <span class="paywall-once" data-testid="paywall-price">
          {price || unavailable ? t('paywall.oneTimePurchase') : t('paywall.priceLoading')}
        </span>
      </div>

      <div class="paywall-links">
        <button
          type="button"
          class="paywall-link"
          data-testid="paywall-restore"
          disabled={restoring || buying}
          onClick={() => actions.restorePurchases()}
        >
          {restoring ? t('settings.restoring') : t('settings.restorePurchases')}
        </button>
        <span class="paywall-dot" aria-hidden="true" />
        <button
          type="button"
          class="paywall-link"
          data-testid="paywall-not-now"
          onClick={() => actions.closeOverlay()}
        >
          {t('paywall.notNow')}
        </button>
      </div>

      <footer class="paywall-fine">
        <p>{t('paywall.smallPrint')}</p>
        <p class="paywall-legal">
          <a href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">
            {t('paywall.terms')}
          </a>
          <span aria-hidden="true">·</span>
          <a href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">
            {t('paywall.privacy')}
          </a>
        </p>
      </footer>
    </div>
  );
}

/** Pending / failed / cancelled purchase and restore results. */
function StatusNote({ state }: { state: GameUiState }) {
  const pw = state.paywall;
  let tone: 'info' | 'warn' | 'muted' | null = null;
  let title: string | null = null;
  let body: string | null = null;
  if (pw.status === 'pending') {
    tone = 'info';
    title = t('paywall.pendingTitle');
    body = t('paywall.purchasePending');
  } else if (pw.status === 'failed') {
    tone = 'warn';
    body =
      pw.product === 'unavailable' ? t('paywall.storeUnavailable') : t('paywall.purchaseFailed');
  } else if (pw.status === 'cancelled') {
    tone = 'muted';
    body = t('paywall.purchaseCancelled');
  } else if (state.restoreStatus === 'nothing') {
    tone = 'muted';
    body = t('settings.restoreNothing');
  } else if (state.restoreStatus === 'failed') {
    tone = 'warn';
    body = t('settings.restoreFailed');
  } else if (pw.product === 'unavailable') {
    tone = 'muted';
    body = t('paywall.storeUnavailable');
  }
  if (!tone) return null;
  return (
    <div
      class={`paywall-note note-${tone}`}
      role="status"
      data-testid="paywall-note"
      key={`${pw.status}-${state.restoreStatus}`}
    >
      {title && <strong>{title}</strong>}
      <span>{body}</span>
    </div>
  );
}

function Unlocked({
  state,
  actions,
  owned,
}: {
  state: GameUiState;
  actions: GameActions;
  owned: boolean;
}) {
  const pw = state.paywall;
  const body = owned
    ? t('paywall.ownedBody')
    : pw.via === 'restore'
      ? t('paywall.restoredBody')
      : t('paywall.purchaseSuccess');
  return (
    <div class="paywall-body paywall-done" data-testid="paywall-success" key={pw.key}>
      {!owned && <Confetti />}
      <div class="paywall-burst">
        <Emblem />
      </div>
      <span class="paywall-kicker">{t('paywall.title')}</span>
      <h2 class="paywall-headline">
        {owned ? t('paywall.alreadyOwned') : t('paywall.successTitle')}
      </h2>
      <p class="paywall-sub">{body}</p>
      <ul class="paywall-unlocked">
        {FEATURES.map((f, i) => (
          <li key={f.id} style={{ '--hue': f.hue, animationDelay: `${380 + i * 70}ms` }}>
            <FeatureIcon id={f.id} />
            <span>{t(f.title)}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        class="btn btn-primary btn-play paywall-play"
        data-testid="paywall-done"
        onClick={() => actions.closeOverlay()}
      >
        {t('paywall.letsPlay')}
      </button>
    </div>
  );
}

/** Faceted neon gem with rays (the Full Version emblem). */
export function PaywallEmblem() {
  return <Emblem />;
}

function Emblem() {
  return (
    <span class="paywall-emblem" aria-hidden="true">
      <svg viewBox="0 0 120 120" width="96" height="96">
        <defs>
          <linearGradient id="pw-gem" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#7ae7ff" />
            <stop offset="0.5" stop-color="#a77bff" />
            <stop offset="1" stop-color="#ff6fd0" />
          </linearGradient>
          <radialGradient id="pw-glow">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.55" />
            <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <g class="paywall-rays" stroke="#ffd23f" stroke-linecap="round" stroke-width="3">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            const r0 = i % 2 ? 46 : 42;
            const r1 = i % 2 ? 53 : 58;
            return (
              <line
                key={i}
                x1={60 + Math.cos(a) * r0}
                y1={60 + Math.sin(a) * r0}
                x2={60 + Math.cos(a) * r1}
                y2={60 + Math.sin(a) * r1}
                opacity={i % 2 ? 0.55 : 0.95}
              />
            );
          })}
        </g>
        <circle cx="60" cy="60" r="34" fill="url(#pw-glow)" />
        <path d="M60 26 86 50 60 94 34 50z" fill="url(#pw-gem)" />
        <path
          d="M34 50h52M60 26 48 50l12 44 12-44z"
          fill="none"
          stroke="#fff"
          stroke-opacity="0.55"
          stroke-width="1.6"
        />
        <path d="M60 26 48 50H34z" fill="#fff" fill-opacity="0.35" />
        <path
          d="M60 26 86 50 60 94 34 50z"
          fill="none"
          stroke="#fff"
          stroke-width="2.4"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  );
}

function FeatureIcon({ id }: { id: FeatureId }) {
  if (id === 'versus' || id === 'daily' || id === 'puzzles')
    return <ModeGlyph icon={id} size={20} />;
  const paths: Record<'decks' | 'brightness' | 'future', JSX.Element> = {
    // Fanned cards.
    decks: (
      <g>
        <rect x="4" y="6" width="10" height="14" rx="2" transform="rotate(-12 9 13)" />
        <rect x="10" y="4" width="10" height="14" rx="2" fill="currentColor" fill-opacity="0.2" />
      </g>
    ),
    // Sun.
    brightness: (
      <g>
        <circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity="0.25" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </g>
    ),
    // Sparkles.
    future: (
      <g>
        <path
          d="M10 3.5 11.8 9l5.7 1.8-5.7 1.8L10 18.2l-1.8-5.6-5.7-1.8L8.2 9z"
          fill="currentColor"
          fill-opacity="0.2"
        />
        <path d="M18 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" />
      </g>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {paths[id]}
    </svg>
  );
}

const CONFETTI_COLORS = ['#1ec8ff', '#ff4fbf', '#ffd23f', '#3dff7a', '#a77bff', '#ffffff'];

/** CSS confetti burst (deterministic layout, hidden with reduced motion). */
function Confetti() {
  return (
    <div class="paywall-confetti" aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => {
        const h = (i * 2654435761) >>> 0;
        const x = (h % 1000) / 10; // vw-ish percent
        const drift = ((h >>> 10) % 160) - 80;
        const delay = ((h >>> 4) % 600) / 1000;
        const dur = 1.6 + ((h >>> 14) % 900) / 1000;
        const spin = 360 + ((h >>> 6) % 540);
        const w = 5 + ((h >>> 3) % 5);
        return (
          <span
            key={i}
            style={{
              left: `${x}%`,
              width: `${w}px`,
              height: `${w * (i % 3 === 0 ? 1 : 2.2)}px`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              borderRadius: i % 3 === 0 ? '50%' : '2px',
              '--drift': `${drift}px`,
              '--spin': `${spin}deg`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}
