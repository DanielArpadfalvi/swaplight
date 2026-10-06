import { useEffect, useState } from 'preact/hooks';
import { TICKS_PER_SECOND } from '../../core/config';
import { currentStreakFrom, formatCountdown, msUntilNextDaily } from '../../game/daily';
import type { GameActions, GameUiState } from '../../game/state';
import { getLanguage, t } from '../../i18n';
import { useFormat } from '../format';
import { IconPlay } from '../icons';
import { useCountUp } from '../useCountUp';
import { CurseIcon, GoalGlyph } from '../run/runIcons';
import { clock, curseDesc, curseName } from '../run/runText';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
}

const twistName = (id: string): string =>
  id === 'rush' ? t('daily.twist.rush.name') : curseName(id);
const twistDesc = (id: string): string =>
  id === 'rush' ? t('daily.twist.rush.desc') : curseDesc(id);

/** "Tuesday, October 6" in the UI language (the date key is a local calendar date). */
export function formatDailyDate(date: string, style: 'long' | 'short' = 'long'): string {
  const [y, m, d] = date.split('-').map(Number);
  const when = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat(getLanguage(), opts).format(when);
}

export function FlameIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" class="flame-icon">
      <path
        d="M12 2.5c.6 3.2 4.8 5.3 4.8 10.1A4.8 4.8 0 0 1 12 17.5a4.8 4.8 0 0 1-4.8-4.9c0-2 1-3.4 2-4.6.3 1.5 1 2.4 2 2.8-.6-3 .1-5.6.8-8.3z"
        fill="currentColor"
      />
      <path
        d="M12 21.5a3.3 3.3 0 0 1-3.3-3.3c0-1.6 1.2-2.6 2.2-3.6.1 1 .6 1.6 1.4 1.9.9-.9 1.6-2 1.8-3.2 1 1.2 1.2 2.7 1.2 3.5a3.3 3.3 0 0 1-3.3 4.7z"
        fill="#fff6c9"
      />
    </svg>
  );
}

function StreakChip({ streak, testId }: { streak: number; testId?: string }) {
  return (
    <span class={`streak-chip${streak > 0 ? ' is-hot' : ''}`} data-testid={testId}>
      <FlameIcon size={16} />
      {t('daily.streak', { count: streak })}
    </span>
  );
}

function TwistLine({ id, delay }: { id: string; delay: number }) {
  return (
    <div class="curse-line intro-curse daily-twist" style={{ animationDelay: `${delay}ms` }}>
      <CurseIcon id={id} size={34} />
      <div>
        <strong>{twistName(id)}</strong>
        <span>{twistDesc(id)}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- intro */

export function DailyIntro({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const d = state.daily;
  if (!d) return null;
  const ch = d.challenge;
  const rec = state.dailySave.records[ch.date];
  const streak = currentStreakFrom(state.dailySave.streak, ch.date);
  return (
    <div
      class={`overlay overlay-dim daily-intro${leaving ? ' is-leaving' : ''}`}
      data-testid="daily-intro"
    >
      <div class="panel intro-card daily-card">
        <span class="intro-kicker daily-kicker">{formatDailyDate(ch.date)}</span>
        <h2 class="panel-title title-gold">{t('daily.title')}</h2>
        <div class="intro-goal">
          <span class="intro-goal-icon">
            <GoalGlyph type="scoreInTime" size={30} />
          </span>
          <span class="intro-goal-text">
            {t('daily.goal', { time: clock(ch.timeLimit / TICKS_PER_SECOND) })}
          </span>
        </div>
        <div class="stage-card-facts intro-facts">
          <span>{t('daily.speed', { level: ch.startLevel })}</span>
          {streak > 0 && <StreakChip streak={streak} testId="daily-intro-streak" />}
        </div>
        <span class="section-title daily-twists-title">{t('daily.twists')}</span>
        {ch.twists.map((id, i) => (
          <TwistLine key={id} id={id} delay={250 + i * 140} />
        ))}
        <div
          class={`daily-status${d.official ? ' is-official' : ' is-practice'}`}
          data-testid="daily-status"
          data-official={d.official ? 'true' : 'false'}
        >
          <strong>{d.official ? t('daily.official') : t('daily.practice')}</strong>
          <span>{d.official ? t('daily.officialHint') : t('daily.practiceHint')}</span>
          {!d.official && rec?.official && (
            <span class="daily-status-score">
              {t('daily.todayScore')}: <b>{fmt(rec.score)}</b>
            </span>
          )}
        </div>
        <button
          type="button"
          class="btn btn-primary btn-play daily-go"
          data-testid="daily-start"
          onClick={() => actions.daily.begin()}
        >
          <IconPlay size={20} />
          {d.official ? t('daily.start') : t('daily.startPractice')}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-quiet"
          data-testid="daily-back"
          onClick={() => actions.menu()}
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------- HUD */

export function DailyHud({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const fmt = useFormat();
  const score = useCountUp(state.score);
  const d = state.daily;
  if (!d) return null;
  const style = {
    top: `${state.hudTop}px`,
    height: `${state.hudHeight}px`,
    left: `${state.boardLeft}px`,
    width: `${state.boardWidth}px`,
  };
  const urgent = d.secondsLeft <= 10;
  return (
    <div
      class={`hud run-hud daily-hud${state.danger ? ' hud-danger' : ''}`}
      style={style}
      data-testid="daily-hud"
    >
      <div class="run-hud-top">
        <div class="run-stage-chip daily-chip">
          <span>{formatDailyDate(d.challenge.date, 'short')}</span>
        </div>
        <div class={`run-clock${urgent ? ' is-urgent' : ''}`} data-testid="daily-clock">
          {clock(d.secondsLeft)}
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
      <div class="hud-score daily-score">
        <span class="score-label">{d.official ? t('hud.score') : t('daily.practice')}</span>
        <span class="score-value" data-testid="hud-score">
          {fmt(score)}
        </span>
      </div>
      <div class="daily-hud-twists">
        {d.challenge.twists.map((id) => (
          <span class="daily-hud-twist" key={id}>
            <CurseIcon id={id} size={22} />
            {twistName(id)}
          </span>
        ))}
        {!d.official && <span class="pill daily-practice-pill">{t('daily.unofficial')}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------- result */

export function DailyResultScreen({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const r = state.dailyResult;
  const score = useCountUp(r?.score ?? 0, 900);
  if (!r) return null;
  const max = Math.max(1, ...r.history.map((h) => h.score ?? 0));
  return (
    <div
      class={`overlay overlay-dim daily-result${leaving ? ' is-leaving' : ''}`}
      data-testid="daily-result"
    >
      <div class="panel daily-result-card">
        <span
          class={`daily-badge${r.official ? ' is-official' : ''}`}
          data-testid="daily-result-badge"
        >
          {r.official ? t('daily.official') : t('daily.unofficial')}
        </span>
        <h2 class={`panel-title${r.reason === 'topOut' ? ' title-danger' : ' title-gold'}`}>
          {r.reason === 'topOut' ? t('daily.toppedOut') : t('daily.timeUp')}
        </h2>
        <div class="final">
          <span class="final-label">{t('daily.finalScore')}</span>
          <span class="final-score" data-testid="daily-final-score">
            {fmt(score)}
          </span>
          {r.newBest && <span class="badge-best">{t('daily.newBest')}</span>}
        </div>
        <div class="daily-result-row">
          <StreakChip streak={r.streak} testId="daily-streak" />
          <span class="daily-best-streak">
            {t('daily.bestStreak')}: <b>{r.bestStreak}</b>
          </span>
        </div>
        {!r.official && r.todayScore !== null && (
          <div class="daily-status-score daily-result-today">
            {t('daily.todayScore')}: <b>{fmt(r.todayScore)}</b>
          </div>
        )}
        <div class="daily-history" data-testid="daily-history">
          <span class="section-title">{t('daily.history')}</span>
          <div class="daily-bars">
            {r.history.map((h, i) => (
              <span
                key={h.date}
                class={`daily-bar${h.score === null ? ' is-empty' : ''}${h.date === r.date ? ' is-today' : ''}`}
                title={`${h.date}: ${h.score === null ? '—' : fmt(h.score)}`}
                style={{
                  '--h': `${h.score === null ? 0 : Math.max(8, Math.round((100 * h.score) / max))}%`,
                  animationDelay: `${120 + i * 30}ms`,
                }}
              />
            ))}
          </div>
        </div>
        {state.canShare && (
          <button
            type="button"
            class="btn btn-ghost daily-share"
            data-testid="daily-share"
            onClick={() => actions.daily.share()}
          >
            <ShareIcon />
            {t('daily.share')}
          </button>
        )}
        <button
          type="button"
          class="btn btn-primary"
          data-testid="daily-practice"
          onClick={() => actions.daily.practiceAgain()}
        >
          {t('daily.practiceAgain')}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-quiet"
          data-testid="daily-menu"
          onClick={() => actions.menu()}
        >
          {t('gameOver.mainMenu')}
        </button>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    >
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

/* ------------------------------------------------------------------------- menu card */

/** Under the Daily card: streak, today's score and the countdown to the next challenge. */
export function DailyCardInfo({ state }: { state: GameUiState }) {
  const fmt = useFormat();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const today = state.dailyToday;
  const rec = state.dailySave.records[today];
  const streak = currentStreakFrom(state.dailySave.streak, today);
  const done = rec?.official === true;
  return (
    <span class="daily-card-info" data-testid="daily-card-info">
      {streak > 0 && (
        <span class="daily-card-streak" data-testid="daily-card-streak">
          <FlameIcon size={13} />
          {streak}
        </span>
      )}
      <span class="daily-card-text">
        {done ? t('daily.todayDone', { score: fmt(rec.score) }) : t('daily.playToday')}
      </span>
      <span class="daily-card-next" data-testid="daily-countdown">
        {t('daily.nextIn', { time: formatCountdown(msUntilNextDaily(new Date(now))) })}
      </span>
    </span>
  );
}
