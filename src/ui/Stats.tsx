import { MODES } from '../game/modes';
import { statTotals } from '../game/progress';
import type { GameActions, GameUiState } from '../game/state';
import { t } from '../i18n';
import { formatPlayTime, useFormat } from './format';
import { ModeGlyph } from './icons';
import { Section, Sheet } from './Sheet';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
  z: number;
}

export function StatsScreen({ state, actions, leaving, z }: Props) {
  const fmt = useFormat();
  const totals = statTotals(state.modeStats);
  const none = t('stats.none');
  const tiles: { key: string; label: string; value: string; tone?: string }[] = [
    { key: 'games', label: t('stats.gamesPlayed'), value: fmt(totals.gamesPlayed) },
    {
      key: 'time',
      label: t('stats.totalPlayTime'),
      value: totals.playTime > 0 ? formatPlayTime(totals.playTime) : none,
    },
    {
      key: 'chain',
      label: t('stats.longestChain'),
      value: totals.longestChain > 1 ? `×${totals.longestChain}` : none,
      tone: 'pink',
    },
    {
      key: 'combo',
      label: t('stats.biggestCombo'),
      value: totals.biggestCombo > 0 ? fmt(totals.biggestCombo) : none,
      tone: 'cyan',
    },
  ];
  return (
    <Sheet
      title={t('stats.title')}
      testId="stats"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <div class="stat-hero">
        <span class="stat-hero-label">{t('stats.blocksCleared')}</span>
        <span class="stat-hero-value" data-testid="stat-blocks">
          {fmt(totals.blocksCleared)}
        </span>
        {totals.gamesPlayed === 0 && <span class="stat-hero-hint">{t('stats.empty')}</span>}
      </div>
      <div class="stat-grid">
        {tiles.map((tile) => (
          <div class={`stat-tile${tile.tone ? ` tone-${tile.tone}` : ''}`} key={tile.key}>
            <span class="stat-label">{tile.label}</span>
            <span class="stat-tile-value" data-testid={`stat-${tile.key}`}>
              {tile.value}
            </span>
          </div>
        ))}
      </div>
      <Section title={t('stats.bestPerMode')}>
        {MODES.map((mode) => {
          const m = state.modeStats[mode.id];
          return (
            <div class={`row row-mode accent-${mode.accent}`} key={mode.id}>
              <span class="row-icon">
                <ModeGlyph icon={mode.icon} size={20} />
              </span>
              <span class="row-text">
                <span class="row-label">{t(mode.titleKey)}</span>
                {m && m.played > 0 && (
                  <span class="row-hint">{t('stats.gamesShort', { count: m.played })}</span>
                )}
              </span>
              <span
                class={`row-value ${m && m.best > 0 ? 'row-value-best' : 'row-value-none'}`}
                data-testid={`best-${mode.id}`}
              >
                {m && m.best > 0 ? fmt(m.best) : none}
              </span>
            </div>
          );
        })}
      </Section>
    </Sheet>
  );
}
