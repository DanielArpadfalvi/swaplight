import type { ComponentChildren } from 'preact';
import { versionLabel } from '../core/version';
import { MODES, modeStatus, type ModeDef } from '../game/modes';
import type { GameActions, GameUiState } from '../game/state';
import { t } from '../i18n';
import { IconCollection, IconLock, IconPlay, IconSettings, IconStats, ModeGlyph } from './icons';
import { useFormat } from './format';

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
        {MODES.map((mode, i) => (
          <ModeCard key={mode.id} mode={mode} index={i} state={state} actions={actions} />
        ))}
      </nav>
      <footer class="menu-foot">
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
            <span class="pill pill-lock">
              <IconLock size={11} />
              {t('menu.fullVersion')}
            </span>
          )}
        </span>
        <span class="mode-desc">{t(mode.descKey)}</span>
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
  return (
    <button type="button" class="bar-btn" data-testid={testId} onClick={onClick}>
      {children}
      <span class="bar-label">{label}</span>
    </button>
  );
}
