import { getRelic } from '../../core/run';
import type { GameActions, GameUiState } from '../../game/state';
import { t, type TranslationKey } from '../../i18n';
import { IconPlay } from '../icons';
import { RelicIcon } from '../run/runIcons';
import { SwapCoach } from './PuzzleScreens';
import { hudStyle } from '../hudBox';

interface Props {
  state: GameUiState;
  actions: GameActions;
}

const TEASER_RELICS = ['spark_plug', 'chain_reactor', 'infinity_loop'] as const;

function stepText(state: GameUiState): { title: string; body: string; extra?: string } {
  const tut = state.tutorial!;
  const base = `tutorial.steps.${tut.id}`;
  const title = t(`${base}.title` as TranslationKey);
  if (tut.id === 'chain' && tut.moves > 0) {
    return { title, body: t('tutorial.steps.chain.bodyTrigger') };
  }
  if (tut.id === 'raise') {
    return {
      title,
      body: t(`${base}.body` as TranslationKey),
      extra: t('tutorial.steps.raise.danger'),
    };
  }
  return { title, body: t(`${base}.body` as TranslationKey) };
}

/** Coach card in the HUD band + the coach mark on the board. */
export function TutorialLayer({ state, actions }: Props) {
  const tut = state.tutorial;
  if (!tut) return null;
  const { title, body, extra } = stepText(state);
  const style = hudStyle(state);
  const card = tut.kind === 'card';
  return (
    <>
      {!card && (
        <div class="tut-band" style={style} data-testid="tutorial-hud">
          <div class="tut-top">
            <span class="tut-step" data-testid="tutorial-step">
              {t('tutorial.stepOf', { n: tut.step + 1, total: tut.total })}
            </span>
            <span class="tut-dots" aria-hidden="true">
              {Array.from({ length: tut.total }, (_, i) => (
                <span
                  key={i}
                  class={`tut-dot${i < tut.step ? ' is-done' : ''}${i === tut.step ? ' is-now' : ''}`}
                />
              ))}
            </span>
            <button
              type="button"
              class="tut-skip"
              data-testid="tutorial-skip"
              onClick={() => actions.tutorial.skip()}
            >
              {t('tutorial.skip')}
            </button>
            <button
              type="button"
              class="icon-btn tut-pause"
              aria-label={t('common.pause')}
              data-testid="pause"
              onClick={() => actions.pause()}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div
            class={`tut-card${tut.success ? ' is-success' : ''}`}
            key={`${tut.key}-${tut.moves}-${tut.success}`}
          >
            {tut.success ? (
              <span class="tut-nice" data-testid="tutorial-success">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M5 12.5 10 17l9-10" />
                </svg>
                {t('tutorial.nice')}
              </span>
            ) : (
              <>
                <h2 class="tut-title">{title}</h2>
                <p class="tut-body">{body}</p>
                {extra && <p class="tut-extra">{extra}</p>}
              </>
            )}
          </div>
        </div>
      )}
      {tut.coach && !tut.success && <SwapCoach target={tut.coach} testId="tutorial-coach" />}
      {tut.kind === 'raise' && !tut.success && (
        <div
          class="tut-raise-pointer"
          style={{
            top: `${state.controlsTop - 34}px`,
            left: `${state.boardLeft + state.boardWidth / 2 - 14}px`,
          }}
          aria-hidden="true"
          data-testid="tutorial-raise-coach"
        >
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path d="M12 4v14M6 12l6 6 6-6" />
          </svg>
        </div>
      )}
      {card && <TeaserCard state={state} actions={actions} />}
    </>
  );
}

function TeaserCard({ state, actions }: Props) {
  const tut = state.tutorial!;
  const { title, body } = stepText(state);
  return (
    <div class="overlay overlay-dim" data-testid="tutorial-card" role="dialog" aria-modal="true">
      <div class="panel tut-teaser">
        <span class="tut-step">{t('tutorial.stepOf', { n: tut.step + 1, total: tut.total })}</span>
        <div class="tut-relics" aria-hidden="true">
          {TEASER_RELICS.map((id, i) => (
            <span key={id} class="tut-relic" style={{ animationDelay: `${120 + i * 120}ms` }}>
              <RelicIcon id={id} rarity={getRelic(id).rarity} size={i === 1 ? 64 : 50} />
            </span>
          ))}
        </div>
        <div class="tut-mult" aria-hidden="true">
          <span class="chip chip-base">120</span>
          <span class="chip-x">×</span>
          <span class="chip chip-mult chip-hot">8</span>
          <span class="chip-eq">=</span>
          <span class="chip-total">960</span>
        </div>
        <h2 class="panel-title">{title}</h2>
        <p class="panel-body tut-teaser-body">{body}</p>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="tutorial-finish"
          onClick={() => actions.tutorial.next()}
        >
          <IconPlay size={18} />
          {t('tutorial.finish')}
        </button>
      </div>
    </div>
  );
}
