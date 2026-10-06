import { useEffect, useState } from 'preact/hooks';
import { TICKS_PER_SECOND } from '../../core/config';
import {
  DECKS,
  MAX_BRIGHTNESS,
  getRelic,
  makeGoal,
  type PlannedStage,
  type RunState,
} from '../../core/run';
import { brightnessAvailable, deckAvailable } from '../../game/runUnlocks';
import type { GameActions, GameUiState } from '../../game/state';
import { t } from '../../i18n';
import { useFormat } from '../format';
import { IconBack, IconLock, IconPlay } from '../icons';
import { useCountUp } from '../useCountUp';
import {
  CharmIcon,
  CurseIcon,
  DeckGlyph,
  GoalGlyph,
  RelicIcon,
  SkullIcon,
  SparkIcon,
} from './runIcons';
import {
  brightnessDesc,
  brightnessName,
  clock,
  curseDesc,
  curseName,
  deckDesc,
  deckName,
  goalText,
} from './runText';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
}

function Header({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: preact.ComponentChildren;
}) {
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
      <span class="sheet-spacer run-head-right">{right}</span>
    </header>
  );
}

export function SparkPill({ value, testId }: { value: number; testId?: string }) {
  const shown = useCountUp(value, 500);
  return (
    <span class="spark-pill" data-testid={testId}>
      <SparkIcon size={15} />
      {shown}
    </span>
  );
}

/* ------------------------------------------------------------------------- deck select */

export function RunSetupScreen({ state, actions, leaving }: Props) {
  const { deckId, brightness } = state.runSetup;
  const full = state.fullVersion;
  return (
    <div class={`overlay sheet run-sheet${leaving ? ' is-leaving' : ''}`} data-testid="run-setup">
      <div class="sheet-frame">
        <Header title={t('run.newRun')} onBack={() => actions.menu()} />
        <div class="sheet-body">
          <section class="section">
            <h3 class="section-title">{t('run.chooseDeck')}</h3>
            <div class="deck-grid">
              {DECKS.map((d, i) => {
                const open = deckAvailable(d.id, full);
                return (
                  <button
                    type="button"
                    key={d.id}
                    class={`deck-card${d.id === deckId ? ' is-selected' : ''}${open ? '' : ' is-locked'}`}
                    style={{ animationDelay: `${40 + i * 40}ms` }}
                    data-testid={`deck-${d.id}`}
                    aria-pressed={d.id === deckId ? 'true' : 'false'}
                    onClick={() => actions.run.selectDeck(d.id)}
                  >
                    <span class="deck-art">
                      <DeckGlyph id={d.id} size={30} />
                      {!open && (
                        <span class="lock-badge">
                          <IconLock size={11} />
                        </span>
                      )}
                    </span>
                    <span class="deck-name">{deckName(d.id)}</span>
                    <span class="deck-desc">{deckDesc(d.id)}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section class="section">
            <h3 class="section-title">{t('run.brightness')}</h3>
            <div class="bright-row" role="radiogroup" aria-label={t('run.brightness')}>
              {Array.from({ length: MAX_BRIGHTNESS }, (_, i) => i + 1).map((level) => {
                const open = brightnessAvailable(level, state.unlocks, full);
                return (
                  <button
                    type="button"
                    key={level}
                    role="radio"
                    aria-checked={level === brightness ? 'true' : 'false'}
                    class={`bright-pip${level === brightness ? ' is-selected' : ''}${open ? '' : ' is-locked'}`}
                    style={{ '--lvl': String(level) }}
                    data-testid={`brightness-${level}`}
                    onClick={() => actions.run.selectBrightness(level)}
                  >
                    {open ? level : <IconLock size={11} />}
                  </button>
                );
              })}
            </div>
            <div class="bright-info">
              <strong>
                {t('run.brightnessLevel', { level: brightness })} · {brightnessName(brightness)}
              </strong>
              <span>{brightnessDesc(brightness)}</span>
              <span class="bright-hint">{t('run.brightnessHint')}</span>
            </div>
          </section>
        </div>
        <footer class="run-foot">
          <button
            type="button"
            class="btn btn-primary btn-play"
            data-testid="run-start"
            onClick={() => actions.run.start()}
          >
            <IconPlay size={20} />
            {t('run.startRun')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------ map */

function stageGoal(run: RunState, p: PlannedStage) {
  return makeGoal(p.goalType, p.act, p.stage, run.brightness);
}

export function RunMapScreen({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const run = state.run;
  if (!run) return null;
  const index = (run.act - 1) * 4 + run.stage;
  const current = run.plan[index]!;
  const goal = stageGoal(run, current);
  const boss = current.stage === 3;
  return (
    <div class={`overlay sheet run-sheet${leaving ? ' is-leaving' : ''}`} data-testid="run-map">
      <div class="sheet-frame">
        <Header
          title={t('run.actNumber', { number: run.act })}
          onBack={() => actions.menu()}
          right={<SparkPill value={run.szikra} testId="map-sparks" />}
        />
        <div class="sheet-body run-map-body">
          <div class="run-meta">
            <span class="pill run-meta-pill">
              <DeckGlyph id={run.deckId} size={13} />
              {deckName(run.deckId)}
            </span>
            <span class="pill run-meta-pill">
              {t('run.brightnessLevel', { level: run.brightness })}
            </span>
          </div>
          <div class="acts">
            {[1, 2, 3].map((act) => (
              <div
                key={act}
                class={`act-row${act === run.act ? ' is-current' : ''}${act < run.act ? ' is-done' : ''}`}
              >
                <span class="act-label">{act}</span>
                <div class="act-track">
                  {run.plan
                    .filter((p) => p.act === act)
                    .map((p) => {
                      const i = (p.act - 1) * 4 + p.stage;
                      const status = i < index ? 'done' : i === index ? 'now' : 'next';
                      const isBoss = p.stage === 3;
                      return (
                        <div
                          key={i}
                          class={`map-node node-${status}${isBoss ? ' node-boss' : ''}`}
                          data-testid={`node-${p.act}-${p.stage}`}
                        >
                          <span class="map-node-dot">
                            {status === 'done' ? (
                              <CheckGlyph />
                            ) : isBoss ? (
                              <SkullIcon size={18} />
                            ) : (
                              <GoalGlyph type={p.goalType} size={16} />
                            )}
                          </span>
                          {isBoss && (
                            <span class="map-node-curses">
                              {p.curses.map((c) => (
                                <CurseIcon key={c} id={c} size={18} />
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
          <div class={`stage-card${boss ? ' is-boss' : ''}`} data-testid="map-stage-card">
            <span class="stage-card-kicker">{t('run.upNext')}</span>
            <h3 class="stage-card-title">
              {boss
                ? t('run.bossTitle', { act: current.act })
                : t('run.stageTitle', { act: current.act, stage: current.stage + 1 })}
            </h3>
            <div class="stage-card-goal">
              <GoalGlyph type={goal.type} size={20} />
              <span>{goalText(goal, fmt)}</span>
            </div>
            <div class="stage-card-facts">
              <span>
                {t('run.timeLimit')}: <b>{clock(goal.timeLimit / TICKS_PER_SECOND)}</b>
              </span>
              <span>
                {t('run.speed')}: <b>{goal.startLevel}</b>
              </span>
            </div>
            {current.curses.map((c) => (
              <div class="curse-line" key={c}>
                <CurseIcon id={c} size={30} />
                <div>
                  <strong>{curseName(c)}</strong>
                  <span>{curseDesc(c)}</span>
                </div>
              </div>
            ))}
          </div>
          <Loadout state={state} />
        </div>
        <footer class="run-foot">
          <button
            type="button"
            class={`btn btn-primary btn-play${boss ? ' btn-boss' : ''}`}
            data-testid="run-play-stage"
            onClick={() => actions.run.playStage()}
          >
            <IconPlay size={20} />
            {boss ? t('run.faceBoss') : t('run.playStage')}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-quiet run-abandon"
            data-testid="run-abandon"
            onClick={() => actions.run.abandon()}
          >
            {t('run.abandon')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Owned relics + charms (read-only strip). */
function Loadout({ state }: { state: GameUiState }) {
  const run = state.run!;
  const relicSlots = Math.max(state.runRelicSlots, run.relics.length);
  const charmSlots = Math.max(state.runCharmSlots, run.charms.length);
  return (
    <div class="loadout">
      <div class="loadout-group">
        <span class="section-title">{t('run.yourRelics')}</span>
        <div class="loadout-row">
          {Array.from({ length: relicSlots }, (_, i) => {
            const r = run.relics[i];
            return r ? (
              <RelicIcon key={i} id={r.id} rarity={getRelic(r.id).rarity} size={36} />
            ) : (
              <span key={i} class="slot-empty slot-hex" />
            );
          })}
        </div>
      </div>
      <div class="loadout-group">
        <span class="section-title">{t('run.yourCharms')}</span>
        <div class="loadout-row">
          {Array.from({ length: charmSlots }, (_, i) => {
            const c = run.charms[i];
            return c ? (
              <CharmIcon key={i} id={c.id} size={36} />
            ) : (
              <span key={i} class="slot-empty slot-round" />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- stage intro */

export function StageIntro({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const hud = state.runHud;
  if (!hud) return null;
  const goal = hud.goal;
  return (
    <div
      class={`overlay overlay-dim stage-intro${hud.isBoss ? ' is-boss' : ''}${leaving ? ' is-leaving' : ''}`}
      data-testid="stage-intro"
    >
      <div class="panel intro-card">
        <span class="intro-kicker">{hud.isBoss ? <SkullIcon size={26} /> : t('hud.goal')}</span>
        <h2 class={`panel-title${hud.isBoss ? ' title-danger' : ''}`}>
          {hud.isBoss
            ? t('run.bossTitle', { act: hud.act })
            : t('run.stageTitle', { act: hud.act, stage: hud.stage + 1 })}
        </h2>
        <div class="intro-goal">
          <span class="intro-goal-icon">
            <GoalGlyph type={goal.type} size={30} />
          </span>
          <span class="intro-goal-text">{goalText(goal, fmt)}</span>
        </div>
        <div class="stage-card-facts intro-facts">
          <span>
            {t('run.timeLimit')}: <b>{clock(goal.timeLimit / TICKS_PER_SECOND)}</b>
          </span>
          <span>
            {t('run.speed')}: <b>{goal.startLevel}</b>
          </span>
        </div>
        {hud.curses.map((c, i) => (
          <div
            class="curse-line intro-curse"
            key={c}
            style={{ animationDelay: `${300 + i * 150}ms` }}
          >
            <CurseIcon id={c} size={36} />
            <div>
              <strong>{curseName(c)}</strong>
              <span>{curseDesc(c)}</span>
            </div>
          </div>
        ))}
        <button
          type="button"
          class={`btn btn-primary btn-play${hud.isBoss ? ' btn-boss' : ''}`}
          data-testid="stage-start"
          onClick={() => actions.run.beginStage()}
        >
          <IconPlay size={20} />
          {t('run.start')}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-quiet"
          data-testid="stage-back"
          onClick={() => actions.back()}
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- stage result */

const LINE_MS = 380;

export function StageResultScreen({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const fin = state.runFinished;
  const rm = state.settings.reducedMotion;
  const rewards = fin?.rewards;
  const lines: [string, number][] = rewards
    ? (
        [
          [t('run.rewardBase'), rewards.base],
          [t('run.rewardOverachieve'), rewards.overachieve],
          [t('run.rewardTime'), rewards.time],
          [t('run.rewardInterest'), rewards.interest],
          [t('run.rewardRelics'), rewards.relics],
        ] as [string, number][]
      ).filter(([, v], i) => i === 0 || v > 0)
    : [];
  const [shownTotal, setShownTotal] = useState(rm ? (rewards?.total ?? 0) : 0);
  useEffect(() => {
    if (!rewards || rm) return;
    const timers = lines.map((_, i) =>
      window.setTimeout(
        () => setShownTotal(lines.slice(0, i + 1).reduce((s, [, v]) => s + v, 0)),
        250 + i * LINE_MS,
      ),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [fin]);
  const total = useCountUp(shownTotal, 300);
  if (!fin || !rewards) return null;
  const boss = fin.plan.stage === 3;
  const goal = makeGoal(
    fin.plan.goalType,
    fin.plan.act,
    fin.plan.stage,
    state.run?.brightness ?? 1,
  );
  const value =
    goal.type === 'survive' ? Math.round(fin.result.value / TICKS_PER_SECOND) : fin.result.value;
  const target =
    goal.type === 'survive' ? Math.round(fin.result.target / TICKS_PER_SECOND) : fin.result.target;
  return (
    <div
      class={`overlay overlay-dim stage-result${leaving ? ' is-leaving' : ''}`}
      data-testid="stage-result"
    >
      <div class="panel result-panel">
        <h2 class="panel-title title-win">{boss ? t('run.bossDefeated') : t('run.stageClear')}</h2>
        <div class="result-goal">
          <GoalGlyph type={goal.type} size={18} />
          <span>{goalText(goal, fmt)}</span>
          <b>
            {fmt(value)} / {fmt(target)}
          </b>
        </div>
        <ul class="reward-lines" data-testid="reward-lines">
          {lines.map(([label, v], i) => (
            <li key={label} style={{ animationDelay: `${250 + i * LINE_MS}ms` }}>
              <span>{label}</span>
              <span class="reward-value">
                +{v}
                <SparkIcon size={13} />
              </span>
            </li>
          ))}
        </ul>
        <div class="reward-total" style={{ animationDelay: `${250 + lines.length * LINE_MS}ms` }}>
          <span>{t('run.rewardTotal')}</span>
          <span class="reward-total-value" data-testid="reward-total">
            <SparkIcon size={22} />
            {total}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="result-continue"
          onClick={() => actions.run.continueFromResult()}
        >
          {fin.victory ? t('run.toVictory') : t('run.toShop')}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- run summary */

export function RunEndScreen({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const s = state.runEnd;
  if (!s) return null;
  const sub = s.won
    ? t('run.victorySub')
    : t(s.reason === 'time' ? 'run.runOverTime' : 'run.runOverSub', {
        act: s.act,
        stage: s.stage + 1,
      });
  return (
    <div
      class={`overlay overlay-dim run-end${s.won ? ' is-won' : ''}${leaving ? ' is-leaving' : ''}`}
      data-testid="run-end"
    >
      <div class="panel run-end-panel">
        <h2 class={`panel-title ${s.won ? 'title-victory' : 'title-danger'}`}>
          {s.won ? t('run.victory') : t('gameOver.runOver')}
        </h2>
        <p class="panel-body">{sub}</p>
        <div class="run-end-tags">
          <span class="pill run-meta-pill">
            <DeckGlyph id={s.deckId} size={13} />
            {deckName(s.deckId)}
          </span>
          <span class="pill run-meta-pill">
            {t('run.brightnessLevel', { level: s.brightness })}
          </span>
        </div>
        <div class="final-stats">
          <div class="final-stat">
            <span class="stat-label">{t('run.stagesCleared')}</span>
            <span class="stat-value" data-testid="end-stages">
              {s.stagesCleared} / 12
            </span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('run.bestChain')}</span>
            <span class="stat-value">×{s.bestChain}</span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('run.bestClear')}</span>
            <span class="stat-value">{fmt(s.bestClear)}</span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('run.totalScore')}</span>
            <span class="stat-value">{fmt(s.totalScore)}</span>
          </div>
        </div>
        <div class="run-end-relics">
          <span class="stat-label">{t('run.relicsOwned')}</span>
          <div class="loadout-row">
            {s.relics.length === 0 && <span class="run-muted">{t('run.noRelics')}</span>}
            {s.relics.map((id) => (
              <RelicIcon key={id} id={id} rarity={getRelic(id).rarity} size={34} />
            ))}
          </div>
        </div>
        {s.unlockedBrightness.map((level) => (
          <div class="unlock-banner" key={level} data-testid="unlock-banner">
            <strong>{t('run.unlockedBrightness', { level })}</strong>
            {!state.fullVersion && <span>{t('run.unlockNeedsFull')}</span>}
          </div>
        ))}
        <button
          type="button"
          class="btn btn-primary"
          data-testid="run-again"
          onClick={() => actions.run.newRun()}
        >
          {t('run.tryAgain')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="run-end-menu"
          onClick={() => actions.run.finish()}
        >
          {t('gameOver.mainMenu')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- abandon dialog */

export function AbandonDialog({
  actions,
  leaving,
  z,
}: {
  actions: GameActions;
  leaving: boolean;
  z: number;
}) {
  return (
    <div
      class={`overlay overlay-dim dialog${leaving ? ' is-leaving' : ''}`}
      style={{ zIndex: z }}
      data-testid="abandon-confirm"
      role="alertdialog"
      aria-modal="true"
    >
      <div class="panel panel-danger">
        <h2 class="panel-title title-danger">{t('run.abandonTitle')}</h2>
        <p class="panel-body">{t('run.abandonBody')}</p>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="abandon-cancel"
          onClick={() => actions.closeOverlay()}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-danger"
          data-testid="abandon-yes"
          onClick={() => actions.run.confirmAbandon()}
        >
          {t('run.abandonConfirm')}
        </button>
      </div>
    </div>
  );
}
