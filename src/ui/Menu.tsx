import { Fragment, type ComponentChildren } from 'preact';
import { versionLabel } from '../core/version';
import { MODES, modeStatus, type ModeDef } from '../game/modes';
import type { GameActions, GameUiState } from '../game/state';
import { t } from '../i18n';
import {
  IconChevron,
  IconCollection,
  IconLock,
  IconPlay,
  IconSettings,
  IconStats,
  ModeGlyph,
} from './icons';
import { PaywallEmblem } from './Paywall';
import { useFitWord } from './fit';
import { useFormat } from './format';
import { DailyCardInfo } from './modes/DailyScreens';

interface MenuProps {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
}

export function MainMenu({ state, actions, leaving }: MenuProps) {
  return (
    <div class={`overlay screen-menu${leaving ? ' is-leaving' : ''}`} data-testid="start-screen">
      <header class="menu-head">
        <h1 class="logo logo-menu" aria-label={t('app.title')}>
          <span class="logo-swap">SWAP</span>
          <span class="logo-light">LIGHT</span>
        </h1>
        <p class="tagline">{t('app.tagline')}</p>
      </header>
      <nav class="mode-list" aria-label={t('common.play')}>
        {!state.tutorialDone && <TutorialBanner actions={actions} />}
        {MODES.map((mode, i) => (
          <Fragment key={mode.id}>
            <ModeCard mode={mode} index={i} state={state} actions={actions} />
            {mode.id === 'run' && state.savedRun && <ContinueRun state={state} actions={actions} />}
          </Fragment>
        ))}
      </nav>
      <footer class="menu-foot">
        {!state.fullVersion && <FullVersionBanner state={state} actions={actions} />}
        <div class="menu-bar">
          <BarButton
            label={t('menu.stats')}
            testId="open-stats"
            onClick={() => actions.openOverlay('stats')}
          >
            <IconStats />
          </BarButton>
          <BarButton
            label={t('menu.collection')}
            testId="open-collection"
            onClick={() => actions.openOverlay('collection')}
          >
            <IconCollection />
          </BarButton>
          <BarButton
            label={t('menu.settings')}
            testId="open-settings"
            onClick={() => actions.openOverlay('settings')}
          >
            <IconSettings />
          </BarButton>
        </div>
        <div class="ui-label">{versionLabel()}</div>
      </footer>
    </div>
  );
}

function ModeCard({
  mode,
  index,
  state,
  actions,
}: {
  mode: ModeDef;
  index: number;
  state: GameUiState;
  actions: GameActions;
}) {
  const fmt = useFormat();
  const status = modeStatus(mode, state.fullVersion);
  const gated = mode.access === 'full' && !state.fullVersion;
  const best = state.modeStats[mode.id]?.best ?? 0;
  const playable = status === 'playable';
  return (
    <button
      type="button"
      class={`mode-card accent-${mode.accent} mode-${status}`}
      style={{ animationDelay: `${60 + index * 45}ms` }}
      data-testid={`mode-${mode.id}`}
      onClick={() => actions.startMode(mode.id)}
    >
      <span class="mode-icon">
        <ModeGlyph icon={mode.icon} />
        {gated && (
          <span class="lock-badge" title={t('paywall.requiresFull')} data-testid="lock-badge">
            <IconLock size={11} />
          </span>
        )}
      </span>
      <span class="mode-text">
        <span class="mode-title-row">
          <span class="mode-name">{t(mode.titleKey)}</span>
          {status === 'soon' && <span class="pill pill-soon">{t('menu.comingSoon')}</span>}
          {status === 'locked' && (
            <span class="pill pill-lock" title={t('menu.fullVersion')}>
              <IconLock size={11} />
              <span class="pill-text">{t('menu.fullVersion')}</span>
            </span>
          )}
        </span>
        <span class="mode-desc">{t(mode.descKey)}</span>
        {mode.id === 'daily' && playable && <DailyCardInfo state={state} />}
      </span>
      {playable && (
        <span class="mode-side">
          {best > 0 && (
            <span class="mode-best">
              <span class="mode-best-label">{t('hud.best')}</span>
              {fmt(best)}
            </span>
          )}
          <span class="mode-go" data-testid={mode.id === 'endless' ? 'play' : undefined}>
            <IconPlay size={16} />
          </span>
        </span>
      )}
    </button>
  );
}

/** First-launch offer until the tutorial is done. */
function TutorialBanner({ actions }: { actions: GameActions }) {
  return (
    <button
      type="button"
      class="tut-banner accent-violet"
      data-testid="tutorial-banner"
      onClick={() => actions.startMode('tutorial')}
    >
      <span class="tut-banner-icon">
        <ModeGlyph icon="tutorial" size={22} />
      </span>
      <span class="tut-banner-text">
        <span class="tut-banner-title">{t('tutorial.bannerTitle')}</span>
        <span class="tut-banner-body">{t('tutorial.bannerBody')}</span>
      </span>
      <span class="mode-go">
        <IconPlay size={14} />
      </span>
    </button>
  );
}

/** Subtle Full Version strip above the menu bar (free version only). */
function FullVersionBanner({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const price = state.paywall.price;
  return (
    <button
      type="button"
      class="paywall-banner"
      data-testid="paywall-banner"
      onClick={() => actions.openPaywall('menu')}
    >
      <PaywallEmblem />
      <span class="paywall-banner-text">
        <strong>{t('paywall.bannerTitle')}</strong>
        <span>{price ? t('paywall.bannerBody', { price }) : t('paywall.bannerBodyNoPrice')}</span>
      </span>
      <span class="paywall-banner-go">
        <IconChevron />
      </span>
    </button>
  );
}

/** Saved run strip under the Run card: continue it or abandon it. */
function ContinueRun({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const saved = state.savedRun!;
  return (
    <div class="run-continue accent-pink" data-testid="run-continue-strip">
      <button
        type="button"
        class="run-continue-go"
        data-testid="run-continue"
        onClick={() => actions.run.continueRun()}
      >
        <IconPlay size={14} />
        <span class="run-continue-text">
          <span class="run-continue-title">{t('run.continueRun')}</span>
          <span class="run-continue-where">
            {saved.stage === 3
              ? t('run.bossTitle', { act: saved.act })
              : t('run.continueWhere', { act: saved.act, stage: saved.stage + 1 })}
          </span>
        </span>
      </button>
      <button
        type="button"
        class="run-continue-x"
        data-testid="run-abandon-menu"
        aria-label={t('run.abandon')}
        onClick={() => actions.run.abandon()}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function BarButton({
  label,
  testId,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  children: ComponentChildren;
}) {
  const fit = useFitWord<HTMLSpanElement>(0.75);
  return (
    <button type="button" class="bar-btn" data-testid={testId} onClick={onClick}>
      {children}
      <span class="bar-label" ref={fit}>
        {label}
      </span>
    </button>
  );
}
