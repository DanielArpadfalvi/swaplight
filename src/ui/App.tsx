import { versusNeedsLeaveConfirm, type Overlay } from '../game/nav';
import { formatClock, type GameActions, type GameUiState } from '../game/state';
import type { Store } from '../game/store';
import { t } from '../i18n';
import { useEffect } from 'preact/hooks';
import { useCompactFormat, useFormat } from './format';
import { hudStyle } from './hudBox';
import { IconPlay, IconSettings } from './icons';
import { CollectionScreen, CreditsScreen, ExitDialog, PrivacyScreen } from './InfoScreens';
import { MainMenu } from './Menu';
import { PaywallScreen } from './Paywall';
import { Presence } from './Presence';
import { SettingsScreen } from './Settings';
import { StatsScreen } from './Stats';
import { useCountUp } from './useCountUp';
import { useStore } from './useStore';
import { CharmCard, RunControls, RunHud, TargetingLayer } from './run/RunHud';
import {
  AbandonDialog,
  RunEndScreen,
  RunMapScreen,
  RunSetupScreen,
  StageIntro,
  StageResultScreen,
} from './run/RunScreens';
import { ShopScreen } from './run/Shop';
import { DailyHud, DailyIntro, DailyResultScreen } from './modes/DailyScreens';
import {
  LeaveMatchDialog,
  VersusHud,
  VersusResultScreen,
  VersusSetupScreen,
} from './modes/VersusScreens';
import './run/run.css';
import './modes/modes.css';
import {
  PuzzleControls,
  PuzzleHintCard,
  PuzzleHud,
  PuzzleLevelsScreen,
  PuzzlePacksScreen,
  PuzzleResultPanel,
  SwapCoach,
} from './puzzle/PuzzleScreens';
import { TutorialLayer } from './puzzle/Tutorial';
import './puzzle/puzzle.css';

interface AppProps {
  store: Store<GameUiState>;
  actions: GameActions;
}

const OVERLAYS: readonly Overlay[] = [
  'settings',
  'stats',
  'collection',
  'credits',
  'privacy',
  'exitConfirm',
  'abandonConfirm',
  'leaveConfirm',
  'paywall',
];

export function App({ store, actions }: AppProps) {
  const state = useStore(store);
  const rm = state.settings.reducedMotion;
  const ms = rm ? 0 : 220;
  const screen = state.screen;
  const run = state.mode === 'run';
  const inPlay = screen === 'playing' || screen === 'paused';
  const endlessHud = state.mode === 'endless' && (inPlay || screen === 'gameOver');
  const versusHud = state.mode === 'versus' && (inPlay || screen === 'versusResult');
  const dailyHud =
    state.mode === 'daily' && (inPlay || screen === 'dailyIntro' || screen === 'dailyResult');
  const puzzleHud = state.mode === 'puzzle' && (inPlay || screen === 'puzzleResult');
  const tutorialHud = state.mode === 'tutorial' && inPlay && state.tutorial !== null;
  const runHud =
    run &&
    (screen === 'playing' ||
      screen === 'paused' ||
      screen === 'stageIntro' ||
      screen === 'stageResult');
  const classes = [
    'ui-root',
    `screen-${state.screen}`,
    `mode-is-${state.mode}`,
    rm ? 'reduced-motion' : '',
    state.settings.highContrast ? 'high-contrast' : '',
    state.settings.largeText ? 'large-text' : '',
  ];
  // The document language drives hyphenation (`hyphens: auto`) and screen readers.
  useEffect(() => {
    document.documentElement.lang = state.language;
  }, [state.language]);
  // During play toasts rest on the lower edge of the HUD band, just above the board: clear of the
  // board's rows, the controls below it and the HUD's top row (pause button).
  const toastStyle: Record<string, string> = {
    '--toast-hide': `${Math.max(0, (state.toast?.ms ?? 0) - 400)}ms`,
  };
  const toastOnTop = inPlay || screen === 'stageIntro' || screen === 'dailyIntro';
  if (toastOnTop) toastStyle.bottom = `calc(100% - ${state.hudTop + state.hudHeight - 2}px)`;
  return (
    <div class={classes.filter(Boolean).join(' ')} lang={state.language}>
      <Presence when={screen === 'menu'} ms={ms}>
        {(leaving) => <MainMenu state={state} actions={actions} leaving={leaving} />}
      </Presence>
      {endlessHud && <Hud state={state} actions={actions} />}
      {endlessHud && <RaiseButton state={state} actions={actions} />}
      {runHud && <RunHud state={state} actions={actions} />}
      {runHud && screen !== 'stageResult' && <RunControls state={state} actions={actions} />}
      {versusHud && <VersusHud state={state} actions={actions} />}
      {dailyHud && <DailyHud state={state} actions={actions} />}
      {(versusHud || dailyHud) && inPlay && <RaiseButton state={state} actions={actions} />}
      {puzzleHud && <PuzzleHud state={state} actions={actions} />}
      {puzzleHud && screen !== 'puzzleResult' && <PuzzleControls state={state} actions={actions} />}
      {puzzleHud && screen === 'playing' && state.puzzle.highlight && (
        <SwapCoach target={state.puzzle.highlight} testId="puzzle-highlight" />
      )}
      {puzzleHud && screen === 'playing' && <PuzzleHintCard state={state} actions={actions} />}
      {tutorialHud && <TutorialLayer state={state} actions={actions} />}
      {tutorialHud && state.tutorial?.kind === 'raise' && (
        <RaiseButton state={state} actions={actions} />
      )}
      <Presence when={screen === 'paused'} ms={ms}>
        {(leaving) => (
          <PausePanel
            run={run}
            puzzle={state.mode === 'puzzle'}
            confirmLeave={versusNeedsLeaveConfirm(state)}
            actions={actions}
            leaving={leaving}
          />
        )}
      </Presence>
      <Presence when={screen === 'puzzlePacks'} ms={ms}>
        {(leaving) => <PuzzlePacksScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'puzzleLevels'} ms={ms}>
        {(leaving) => <PuzzleLevelsScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'puzzleResult'} ms={ms}>
        {(leaving) => <PuzzleResultPanel state={state} actions={actions} leaving={leaving} />}
      </Presence>
      {screen === 'gameOver' && <GameOverPanel state={state} actions={actions} />}
      <Presence when={screen === 'runSetup'} ms={ms}>
        {(leaving) => <RunSetupScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'runMap'} ms={ms}>
        {(leaving) => <RunMapScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'stageIntro'} ms={ms}>
        {(leaving) => <StageIntro state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'stageResult'} ms={ms}>
        {(leaving) => <StageResultScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'shop'} ms={ms}>
        {(leaving) => <ShopScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'runEnd'} ms={ms}>
        {(leaving) => <RunEndScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'versusSetup'} ms={ms}>
        {(leaving) => <VersusSetupScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'versusResult'} ms={ms}>
        {(leaving) => <VersusResultScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'dailyIntro'} ms={ms}>
        {(leaving) => <DailyIntro state={state} actions={actions} leaving={leaving} />}
      </Presence>
      <Presence when={screen === 'dailyResult'} ms={ms}>
        {(leaving) => <DailyResultScreen state={state} actions={actions} leaving={leaving} />}
      </Presence>
      {(screen === 'playing' || screen === 'shop') && state.charmMenu !== null && (
        <CharmCard state={state} actions={actions} />
      )}
      {screen === 'playing' && state.targeting && (
        <TargetingLayer state={state} actions={actions} />
      )}
      {OVERLAYS.map((o) => {
        const index = state.overlays.indexOf(o);
        return (
          <Presence key={o} when={index >= 0} ms={ms}>
            {(leaving) => renderOverlay(o, state, actions, leaving, 20 + Math.max(0, index))}
          </Presence>
        );
      })}
      {state.toast && (
        <div
          class={`toast${toastOnTop ? ' toast-top' : ''}`}
          key={state.toast.key}
          role="status"
          data-testid="toast"
          style={toastStyle}
        >
          {state.toast.text}
        </div>
      )}
    </div>
  );
}

function renderOverlay(
  o: Overlay,
  state: GameUiState,
  actions: GameActions,
  leaving: boolean,
  z: number,
) {
  const props = { actions, leaving, z };
  switch (o) {
    case 'settings':
      return <SettingsScreen state={state} {...props} />;
    case 'stats':
      return <StatsScreen state={state} {...props} />;
    case 'collection':
      return <CollectionScreen state={state} {...props} />;
    case 'credits':
      return <CreditsScreen {...props} />;
    case 'privacy':
      return <PrivacyScreen {...props} />;
    case 'exitConfirm':
      return <ExitDialog {...props} />;
    case 'abandonConfirm':
      return <AbandonDialog {...props} />;
    case 'leaveConfirm':
      return <LeaveMatchDialog {...props} />;
    case 'paywall':
      return <PaywallScreen state={state} {...props} />;
  }
}

function Hud({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const fmt = useFormat();
  const compact = useCompactFormat();
  const score = useCountUp(state.score);
  const flash = state.scoreFlash;
  const scoreText = fmt(score);
  return (
    <div
      class={`hud${state.danger ? ' hud-danger' : ''}`}
      style={hudStyle(state)}
      data-testid="hud"
    >
      <div class="hud-top">
        <div class="stat stat-level">
          <span class="stat-label">{t('hud.level')}</span>
          <span class="stat-value" data-testid="hud-level">
            {state.level}
          </span>
        </div>
        <div class="stat stat-time">
          <span class="stat-label">{t('hud.time')}</span>
          <span class="stat-value" data-testid="hud-time">
            {formatClock(state.seconds)}
          </span>
        </div>
        <div class="stat stat-best">
          <span class="stat-label">{t('hud.best')}</span>
          <span class="stat-value" data-testid="hud-best">
            {compact(Math.max(state.best, state.score))}
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
        <span
          class={`score-value${scoreText.length > 9 ? ' score-long' : ''}`}
          data-testid="hud-score"
        >
          {scoreText}
        </span>
      </div>
      <div class="chips" aria-hidden={flash ? 'false' : 'true'}>
        {flash && (
          <div class="chips-row" key={flash.key} data-testid="score-chips">
            <span class="chip chip-base">{compact(flash.base)}</span>
            <span class="chip-x">×</span>
            <span class={`chip chip-mult${flash.mult > 1 ? ' chip-hot' : ''}`}>
              {compact(flash.mult)}
            </span>
            <span class="chip-eq">=</span>
            <span class="chip-total">{compact(flash.total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Press-and-hold RAISE control under the board. */
function RaiseButton({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const width = Math.min(state.boardWidth, 280);
  const style = {
    top: `${state.controlsTop}px`,
    left: `${state.boardLeft + (state.boardWidth - width) / 2}px`,
    width: `${width}px`,
  };
  const down = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    actions.setRaise(true);
  };
  const up = () => actions.setRaise(false);
  return (
    <button
      type="button"
      class={`raise-btn${state.raiseHeld ? ' raise-held' : ''}`}
      style={style}
      data-testid="raise"
      aria-label={t('hud.raiseHint')}
      aria-pressed={state.raiseHeld ? 'true' : 'false'}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onPointerLeave={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 4 4 14h5v6h6v-6h5z" fill="currentColor" />
      </svg>
      <span>{t('hud.raise')}</span>
    </button>
  );
}

function PausePanel({
  run,
  puzzle,
  confirmLeave,
  actions,
  leaving,
}: {
  run: boolean;
  puzzle: boolean;
  /** Quitting forfeits a Versus match: ask first. */
  confirmLeave: boolean;
  actions: GameActions;
  leaving: boolean;
}) {
  return (
    <div
      class={`overlay overlay-dim pause-overlay${leaving ? ' is-leaving' : ''}`}
      data-testid="pause-panel"
      role="dialog"
      aria-modal="true"
      aria-label={t('common.paused')}
    >
      <div class="panel">
        <h2 class="panel-title">{t('common.paused')}</h2>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="resume"
          onClick={() => actions.resume()}
        >
          <IconPlay size={20} />
          {t('common.resume')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="pause-settings"
          onClick={() => actions.openOverlay('settings')}
        >
          <IconSettings size={18} />
          {t('menu.settings')}
        </button>
        {puzzle && (
          <button
            type="button"
            class="btn btn-ghost"
            data-testid="pause-puzzle-levels"
            onClick={() => actions.puzzle.toLevels()}
          >
            {t('puzzle.allPuzzles')}
          </button>
        )}
        <button
          type="button"
          class="btn btn-ghost btn-quiet"
          data-testid="quit-to-menu"
          onClick={() => (confirmLeave ? actions.openOverlay('leaveConfirm') : actions.menu())}
        >
          {t('common.quitToMenu')}
        </button>
        {run && (
          <button
            type="button"
            class="btn btn-ghost btn-quiet btn-danger"
            data-testid="pause-abandon"
            onClick={() => actions.run.abandon()}
          >
            {t('run.abandon')}
          </button>
        )}
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
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="gameover-menu"
          onClick={() => actions.menu()}
        >
          {t('gameOver.mainMenu')}
        </button>
      </div>
    </div>
  );
}
