import { useMemo } from 'preact/hooks';
import { versionLabel } from '../core/version';
import { formatClock, type GameActions, type GameUiState } from '../game/state';
import type { Store } from '../game/store';
import { getLanguage, t } from '../i18n';
import { useCountUp } from './useCountUp';
import { useStore } from './useStore';

interface AppProps {
  store: Store<GameUiState>;
  actions: GameActions;
}

function useFormat(): (n: number) => string {
  const lang = getLanguage();
  return useMemo(() => {
    const fmt = new Intl.NumberFormat(lang);
    return (n: number) => fmt.format(n);
  }, [lang]);
}

export function App({ store, actions }: AppProps) {
  const state = useStore(store);
  return (
    <div class={`ui-root screen-${state.screen}`}>
      {state.screen !== 'title' && <Hud state={state} actions={actions} />}
      {state.screen === 'title' && <StartScreen actions={actions} best={state.best} />}
      {state.screen === 'paused' && <PausePanel actions={actions} />}
      {state.screen === 'gameOver' && <GameOverPanel state={state} actions={actions} />}
    </div>
  );
}

function Hud({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const fmt = useFormat();
  const score = useCountUp(state.score);
  const flash = state.scoreFlash;
  const style = {
    top: `${state.hudTop}px`,
    height: `${state.hudHeight}px`,
    left: `${state.boardLeft}px`,
    width: `${state.boardWidth}px`,
  };
  return (
    <div class={`hud${state.danger ? ' hud-danger' : ''}`} style={style} data-testid="hud">
      <div class="hud-top">
        <div class="stat">
          <span class="stat-label">{t('hud.level')}</span>
          <span class="stat-value" data-testid="hud-level">
            {state.level}
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">{t('hud.time')}</span>
          <span class="stat-value" data-testid="hud-time">
            {formatClock(state.seconds)}
          </span>
        </div>
        <div class="stat stat-best">
          <span class="stat-label">{t('hud.best')}</span>
          <span class="stat-value" data-testid="hud-best">
            {fmt(Math.max(state.best, state.score))}
          </span>
        </div>
        <button
          type="button"
          class="icon-btn"
          aria-label={t('common.pause')}
          data-testid="pause"
          onClick={() => actions.pause()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div class="hud-score">
        <span class="score-label">{t('hud.score')}</span>
        <span class="score-value" data-testid="hud-score">
          {fmt(score)}
        </span>
      </div>
      <div class="chips" aria-hidden={flash ? 'false' : 'true'}>
        {flash && (
          <div class="chips-row" key={flash.key} data-testid="score-chips">
            <span class="chip chip-base">{fmt(flash.base)}</span>
            <span class="chip-x">×</span>
            <span class={`chip chip-mult${flash.mult > 1 ? ' chip-hot' : ''}`}>
              {fmt(flash.mult)}
            </span>
            <span class="chip-eq">=</span>
            <span class="chip-total">{fmt(flash.total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StartScreen({ actions, best }: { actions: GameActions; best: number }) {
  const fmt = useFormat();
  return (
    <div class="overlay overlay-title" data-testid="start-screen">
      <div class="title-block">
        <h1 class="logo" aria-label={t('app.title')}>
          <span class="logo-swap">SWAP</span>
          <span class="logo-light">LIGHT</span>
        </h1>
        <p class="tagline">{t('app.tagline')}</p>
      </div>
      <div class="title-actions">
        <div class="mode-card">
          <span class="mode-name">{t('menu.endless')}</span>
          <span class="mode-desc">{t('modes.endless')}</span>
          {best > 0 && (
            <span class="mode-best">
              {t('hud.best')} · {fmt(best)}
            </span>
          )}
        </div>
        <button
          type="button"
          class="btn btn-primary btn-play"
          data-testid="play"
          onClick={() => actions.play()}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"
              fill="currentColor"
            />
          </svg>
          {t('common.play')}
        </button>
      </div>
      <div class="ui-label">{versionLabel()}</div>
    </div>
  );
}

function PausePanel({ actions }: { actions: GameActions }) {
  return (
    <div class="overlay overlay-dim" data-testid="pause-panel">
      <div class="panel">
        <h2 class="panel-title">{t('common.paused')}</h2>
        <button type="button" class="btn btn-primary" onClick={() => actions.resume()}>
          {t('common.resume')}
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => actions.menu()}>
          {t('common.quit')}
        </button>
      </div>
    </div>
  );
}

function GameOverPanel({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const fmt = useFormat();
  return (
    <div class="overlay overlay-dim" data-testid="game-over">
      <div class="panel panel-gameover">
        <h2 class="panel-title title-danger">{t('gameOver.title')}</h2>
        <div class="final">
          <span class="final-label">{t('gameOver.finalScore')}</span>
          <span class="final-score" data-testid="final-score">
            {fmt(state.score)}
          </span>
          {state.newBest && <span class="badge-best">{t('gameOver.newBest')}</span>}
        </div>
        <div class="final-stats">
          <div class="final-stat">
            <span class="stat-label">{t('hud.best')}</span>
            <span class="stat-value">{fmt(state.best)}</span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('stats.longestChain')}</span>
            <span class="stat-value">×{state.maxChain}</span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('hud.level')}</span>
            <span class="stat-value">{state.level}</span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('hud.time')}</span>
            <span class="stat-value">{formatClock(state.seconds)}</span>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="retry"
          onClick={() => actions.retry()}
        >
          {t('gameOver.playAgain')}
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => actions.menu()}>
          {t('gameOver.mainMenu')}
        </button>
      </div>
    </div>
  );
}
