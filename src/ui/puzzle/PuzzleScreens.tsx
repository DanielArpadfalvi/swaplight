import { puzzlePack } from '../../core/puzzles';
import {
  allPackSummaries,
  goalText,
  levelNumber,
  levelState,
  MAX_STARS,
} from '../../game/puzzleProgress';
import type { CoachTarget } from '../../game/puzzleState';
import type { GameActions, GameUiState } from '../../game/state';
import { t, type TranslationKey } from '../../i18n';
import { IconBack, IconLock, IconPlay } from '../icons';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
}

const PACK_ACCENTS = ['cyan', 'green', 'violet', 'pink'] as const;

export function packAccent(pack: number): string {
  return PACK_ACCENTS[(pack - 1) % PACK_ACCENTS.length]!;
}

function packName(pack: number): string {
  return t(`puzzle.packName.p${pack}` as TranslationKey);
}

function SheetHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header class="sheet-head">
      <button
        type="button"
        class="icon-btn sheet-back"
        aria-label={t('common.back')}
        data-testid="sheet-back"
        onClick={onBack}
      >
        <IconBack />
      </button>
      <h2 class="sheet-title">{title}</h2>
      <span class="sheet-spacer" />
    </header>
  );
}

/* ------------------------------------------------------------------------- icons */

export function StarIcon({ size = 14, filled }: { size?: number; filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      class={`pz-star${filled ? ' is-on' : ''}`}
    >
      <path
        d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.6l-5.6 3.2 1.3-6.2L3 9.3l6.3-.7z"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function Stars({ count, size = 12 }: { count: number; size?: number }) {
  return (
    <span class="pz-stars" aria-label={`${count}/${MAX_STARS}`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <StarIcon key={i} size={size} filled={i < count} />
      ))}
    </span>
  );
}

/** Pack emblem: neon tile with the pack number and a difficulty meter. */
function PackEmblem({ pack }: { pack: number }) {
  return (
    <span class="pz-emblem" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="56" height="56">
        <rect x="3" y="3" width="42" height="42" rx="12" class="pz-emblem-frame" />
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={12 + i * 6.6}
            y={39 - (3 + i * 2.2)}
            width="4.4"
            height={3 + i * 2.2}
            rx="1.2"
            class={`pz-emblem-bar${i < pack ? ' is-on' : ''}`}
          />
        ))}
      </svg>
      <span class="pz-emblem-num">{pack}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------- pack select */

export function PuzzlePacksScreen({ state, actions, leaving }: Props) {
  const packs = allPackSummaries(state.puzzleRecords, state.fullVersion);
  return (
    <div class={`overlay sheet pz-sheet${leaving ? ' is-leaving' : ''}`} data-testid="puzzle-packs">
      <div class="sheet-frame">
        <SheetHeader title={t('puzzle.title')} onBack={() => actions.menu()} />
        <div class="sheet-body">
          <section class="section">
            <h3 class="section-title">{t('puzzle.packs')}</h3>
            <div class="pz-pack-list">
              {packs.map((p, i) => {
                const pct = p.total > 0 ? Math.round((p.solved / p.total) * 100) : 0;
                return (
                  <button
                    type="button"
                    key={p.pack}
                    class={`pz-pack accent-${packAccent(p.pack)}${p.available ? '' : ' is-locked'}${
                      p.solved === p.total ? ' is-complete' : ''
                    }`}
                    style={{ animationDelay: `${40 + i * 50}ms` }}
                    data-testid={`puzzle-pack-${p.pack}`}
                    data-locked={p.available ? 'false' : 'true'}
                    onClick={() => actions.puzzle.openPack(p.pack)}
                  >
                    <PackEmblem pack={p.pack} />
                    <span class="pz-pack-text">
                      <span class="pz-pack-label">
                        {t('puzzle.packLabel', { n: p.pack })}
                        {!p.available && (
                          <span class="pill pill-lock" data-testid="puzzle-pack-lock">
                            <IconLock size={10} />
                            {t('menu.fullVersion')}
                          </span>
                        )}
                      </span>
                      <span class="pz-pack-name">{packName(p.pack)}</span>
                      <span class="pz-pack-desc">
                        {t(`puzzle.packDesc.p${p.pack}` as TranslationKey)}
                      </span>
                      <span class="pz-pack-progress">
                        <span class="pz-bar">
                          <span class="pz-bar-fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span class="pz-pack-count">
                          {t('puzzle.solvedCount', { solved: p.solved, total: p.total })}
                        </span>
                        <span class="pz-pack-stars">
                          <StarIcon size={12} filled />
                          {p.stars}/{p.maxStars}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- level grid */

export function PuzzleLevelsScreen({ state, actions, leaving }: Props) {
  const pack = state.puzzle.pack;
  const defs = puzzlePack(pack);
  const records = state.puzzleRecords;
  const summary = allPackSummaries(records, state.fullVersion)[pack - 1];
  return (
    <div
      class={`overlay sheet pz-sheet accent-${packAccent(pack)}${leaving ? ' is-leaving' : ''}`}
      data-testid="puzzle-levels"
    >
      <div class="sheet-frame">
        <SheetHeader title={packName(pack)} onBack={() => actions.puzzle.toPacks()} />
        <div class="sheet-body">
          <div class="pz-levels-head">
            <span class="pz-pack-label">{t('puzzle.packLabel', { n: pack })}</span>
            {summary && (
              <span class="pz-levels-sum">
                {t('puzzle.solvedCount', { solved: summary.solved, total: summary.total })}
                <span class="pz-pack-stars">
                  <StarIcon size={12} filled />
                  {summary.stars}/{summary.maxStars}
                </span>
              </span>
            )}
          </div>
          <div class="pz-grid">
            {defs.map((d, i) => {
              const ls = levelState(defs, i, records);
              const next = ls === 'open';
              return (
                <button
                  type="button"
                  key={d.id}
                  class={`pz-level is-${ls}`}
                  style={{ animationDelay: `${Math.min(i, 20) * 14}ms` }}
                  data-testid={`puzzle-level-${d.id}`}
                  data-state={ls}
                  aria-label={`${levelNumber(i)}${ls === 'locked' ? ` · ${t('run.locked')}` : ''}`}
                  onClick={() => actions.puzzle.play(d.id)}
                >
                  {ls === 'locked' ? (
                    <span class="pz-level-lock">
                      <IconLock size={14} />
                    </span>
                  ) : (
                    <span class="pz-level-num">{i + 1}</span>
                  )}
                  {ls === 'solved' && <Stars count={records[d.id]?.stars ?? 0} size={11} />}
                  {next && (
                    <span class="pz-level-go">
                      <IconPlay size={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- in-game */

function goalLabel(state: GameUiState): string {
  const goal = state.puzzle.goal;
  if (!goal) return '';
  const g = goalText(goal);
  return t(g.key, g.params);
}

export function PuzzleHud({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const p = state.puzzle;
  const left = Math.max(0, p.moveBudget - p.movesUsed);
  const style = {
    top: `${state.hudTop}px`,
    height: `${state.hudHeight}px`,
    left: `${state.boardLeft}px`,
    width: `${state.boardWidth}px`,
  };
  return (
    <div class={`hud pz-hud accent-${packAccent(p.pack)}`} style={style} data-testid="puzzle-hud">
      <div class="pz-hud-top">
        <span class="pz-hud-title" data-testid="puzzle-title">
          {t('puzzle.levelTitle', { pack: p.pack, level: levelNumber(p.index) })}
        </span>
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
      <div class="pz-hud-main">
        <div class="pz-goal">
          <span class="stat-label">{t('puzzle.goal')}</span>
          <span class="pz-goal-text" data-testid="puzzle-goal">
            {goalLabel(state)}
          </span>
          <span class="pz-par">
            {t('puzzle.par', { n: p.par })}
            {p.hintsUsed > 0 && <span class="pz-hint-used">· {t('puzzle.hintUsed')}</span>}
          </span>
        </div>
        <div
          class={`pz-moves${left === 0 && p.status !== 'won' ? ' is-empty' : ''}${p.waiting ? ' is-waiting' : ''}`}
        >
          <span class="stat-label">{t('puzzle.movesLeft')}</span>
          <span class="pz-moves-value" data-testid="puzzle-moves-left" key={left}>
            {left}
          </span>
          <span class="pz-pips" aria-hidden="true">
            {Array.from({ length: p.moveBudget }, (_, i) => (
              <span key={i} class={`pz-pip${i < left ? ' is-on' : ''}`} />
            ))}
          </span>
        </div>
      </div>
      <div class={`pz-wait${p.waiting ? ' is-on' : ''}`} aria-live="polite">
        {p.waiting ? t('puzzle.waitSettle') : ''}
      </div>
    </div>
  );
}

function CtrlIcon({ name }: { name: 'undo' | 'restart' | 'hint' }) {
  const paths = {
    undo: <path d="M9 7 4 12l5 5M4.5 12H15a5 5 0 0 1 0 10h-2" />,
    restart: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />,
    hint: (
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
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
      {paths[name]}
    </svg>
  );
}

export function PuzzleControls({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const p = state.puzzle;
  const width = Math.min(state.boardWidth, 320);
  const style = {
    top: `${state.controlsTop}px`,
    left: `${state.boardLeft + (state.boardWidth - width) / 2}px`,
    width: `${width}px`,
  };
  const playing = p.status === 'playing';
  return (
    <div class="pz-controls" style={style} data-testid="puzzle-controls">
      <button
        type="button"
        class="pz-ctrl"
        data-testid="puzzle-undo"
        disabled={!p.canUndo}
        onClick={() => actions.puzzle.undo()}
      >
        <CtrlIcon name="undo" />
        <span>{t('puzzle.undo')}</span>
      </button>
      <button
        type="button"
        class="pz-ctrl"
        data-testid="puzzle-restart"
        disabled={p.movesUsed === 0}
        onClick={() => actions.puzzle.restart()}
      >
        <CtrlIcon name="restart" />
        <span>{t('puzzle.restart')}</span>
      </button>
      <button
        type="button"
        class="pz-ctrl pz-ctrl-hint"
        data-testid="puzzle-hint"
        disabled={!playing}
        onClick={() => actions.puzzle.hint()}
      >
        <CtrlIcon name="hint" />
        <span>{t('puzzle.hintButton')}</span>
      </button>
    </div>
  );
}

/** Ring around the two cells of a swap with a finger sliding left → right. */
export function SwapCoach({ target, testId }: { target: CoachTarget; testId: string }) {
  const c = target.cellSize;
  const style = {
    left: `${target.x - c / 2}px`,
    top: `${target.y - c / 2}px`,
    width: `${2 * c}px`,
    height: `${c}px`,
    '--cell': `${c}px`,
  };
  return (
    <div
      class={`coach${target.fromRight ? ' is-left' : ''}`}
      style={style}
      key={target.key}
      data-testid={testId}
      aria-hidden="true"
    >
      <span class="coach-ring" />
      <span class="coach-from" />
      <span class="coach-arrow">
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path d="M4 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
      <span class="coach-finger">
        <svg viewBox="0 0 32 40" width="100%" height="100%">
          <path
            d="M12 4.5a2.8 2.8 0 0 1 5.6 0V17l1.4-.6a2.7 2.7 0 0 1 3.5 1.5l.1.2 1.8-.5a2.6 2.6 0 0 1 3.2 2l.2 1 .9-.1a2.4 2.4 0 0 1 2.6 2.4v6c0 5.3-4.3 9.6-9.6 9.6h-2.2a9 9 0 0 1-7-3.4l-6-7.6a2.6 2.6 0 0 1 3.7-3.6L12 26z"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

export function PuzzleHintCard({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const p = state.puzzle;
  if (!p.hintCard) return null;
  const text = p.hintCard === 'text';
  return (
    <div
      class="overlay overlay-dim pz-hint-overlay"
      data-testid="puzzle-hint-card"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.puzzle.closeHint();
      }}
    >
      <div class="panel pz-hint-panel">
        <span class="pz-hint-bulb">
          <CtrlIcon name="hint" />
        </span>
        <h2 class="panel-title pz-hint-title">
          {text ? t('puzzle.hintTitle') : t('puzzle.hintConfirmTitle')}
        </h2>
        {text ? (
          <p class="pz-hint-text" data-testid="puzzle-hint-text">
            {t((p.hintKey ?? 'puzzle.hint.swap') as TranslationKey)}
          </p>
        ) : (
          <p class="pz-hint-text">
            {t('puzzle.hintConfirmBody')}
            {p.movesUsed > 0 && <span class="pz-hint-note">{t('puzzle.hintConfirmRestart')}</span>}
          </p>
        )}
        {text ? (
          <button
            type="button"
            class="btn btn-primary"
            data-testid="puzzle-hint-ok"
            onClick={() => actions.puzzle.closeHint()}
          >
            {t('puzzle.gotIt')}
          </button>
        ) : (
          <>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="puzzle-hint-confirm"
              onClick={() => actions.puzzle.confirmHint()}
            >
              {t('puzzle.hintShow')}
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              data-testid="puzzle-hint-cancel"
              onClick={() => actions.puzzle.closeHint()}
            >
              {t('puzzle.hintCancel')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function PuzzleResultPanel({ state, actions, leaving }: Props) {
  const r = state.puzzle.result;
  if (!r) return null;
  const improved = r.won && r.prevStars > 0 && r.stars > r.prevStars;
  return (
    <div
      class={`overlay overlay-dim${leaving ? ' is-leaving' : ''}`}
      data-testid={r.won ? 'puzzle-win' : 'puzzle-fail'}
      role="dialog"
      aria-modal="true"
    >
      <div class={`panel pz-result${r.won ? ' is-won' : ' is-lost'}`}>
        <span class="pz-result-tag">
          {t('puzzle.levelTitle', {
            pack: state.puzzle.pack,
            level: levelNumber(state.puzzle.index),
          })}
        </span>
        <h2 class={`panel-title${r.won ? ' pz-title-win' : ' title-danger'}`}>
          {r.won ? t('puzzle.solved') : t('puzzle.failTitle')}
        </h2>
        {r.won ? (
          <>
            <div class="pz-big-stars" data-testid="puzzle-stars" data-stars={r.stars}>
              {Array.from({ length: MAX_STARS }, (_, i) => (
                <span
                  key={i}
                  class={`pz-big-star${i < r.stars ? ' is-on' : ''}`}
                  style={{ animationDelay: `${180 + i * 170}ms` }}
                >
                  <StarIcon size={i === 1 ? 58 : 46} filled={i < r.stars} />
                </span>
              ))}
            </div>
            <p class="pz-result-line">{t('puzzle.solvedIn', { count: r.movesUsed })}</p>
            {improved && <span class="badge-best pz-badge">{t('puzzle.newBest')}</span>}
            <ul class="pz-criteria">
              <li class="is-ok">{t('puzzle.starSolved')}</li>
              <li class={r.withinPar ? 'is-ok' : 'is-miss'}>{t('puzzle.starPar')}</li>
              <li class={r.hintsUsed === 0 ? 'is-ok' : 'is-miss'}>{t('puzzle.starNoHint')}</li>
            </ul>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="puzzle-next"
              onClick={() => actions.puzzle.next()}
            >
              {r.nextId ? (
                <>
                  <IconPlay size={18} />
                  {t('puzzle.nextPuzzle')}
                </>
              ) : (
                t('puzzle.packComplete')
              )}
            </button>
            <div class="pz-result-row">
              <button
                type="button"
                class="btn btn-ghost"
                data-testid="puzzle-retry"
                onClick={() => actions.puzzle.restart()}
              >
                {t('puzzle.retry')}
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                data-testid="puzzle-levels-btn"
                onClick={() => actions.puzzle.toLevels()}
              >
                {t('puzzle.allPuzzles')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p class="panel-body">{t('puzzle.failBody')}</p>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="puzzle-retry"
              onClick={() => actions.puzzle.restart()}
            >
              {t('puzzle.retry')}
            </button>
            <div class="pz-result-row">
              <button
                type="button"
                class="btn btn-ghost"
                data-testid="puzzle-fail-undo"
                onClick={() => actions.puzzle.undo()}
              >
                {t('puzzle.undo')}
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                data-testid="puzzle-levels-btn"
                onClick={() => actions.puzzle.toLevels()}
              >
                {t('puzzle.allPuzzles')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
