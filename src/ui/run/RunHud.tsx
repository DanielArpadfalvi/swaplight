import { useEffect, useState } from 'preact/hooks';
import { getCharm, getRelic, type RunState } from '../../core/run';
import type { GameActions, GameUiState, RunTargeting } from '../../game/state';
import { t } from '../../i18n';
import { useFormat } from '../format';
import { hudStyle } from '../hudBox';
import { useCountUp } from '../useCountUp';
import { CharmIcon, CurseIcon, GoalGlyph, RelicIcon, SkullIcon, SparkIcon } from './runIcons';
import { charmDesc, charmName, clock, curseName, goalShort, relicDesc, relicName } from './runText';

interface Props {
  state: GameUiState;
  actions: GameActions;
}

/** In-stage HUD of the Run mode: goal bar, clock, Sparks, score chips and relic slots. */
export function RunHud({ state, actions }: Props) {
  const fmt = useFormat();
  const hud = state.runHud;
  const run = state.run;
  if (!hud || !run) return null;
  const style = hudStyle(state);
  const timed = hud.goal.type !== 'survive';
  // Narrow HUD with two or more curses: the first badge + "+N" keeps the clock readable.
  const roomy = parseFloat(style.width ?? '0') >= 380;
  const shownCurses = !roomy && hud.curses.length > 1 ? hud.curses.slice(0, 1) : hud.curses;
  const moreCurses = hud.curses.length - shownCurses.length;
  const urgent = timed && !hud.won && hud.secondsLeft <= 10;
  return (
    <div
      class={`hud run-hud${state.danger ? ' hud-danger' : ''}${hud.isBoss ? ' run-hud-boss' : ''}`}
      style={style}
      data-testid="run-hud"
    >
      <div class="run-hud-top">
        <div
          class={`run-stage-chip${hud.isBoss ? ' is-boss' : ''}`}
          data-testid="run-stage-chip"
          title={hud.curses.map(curseName).join(' · ') || undefined}
        >
          <span class="run-stage-act" aria-label={hud.isBoss ? t('run.bossShort') : undefined}>
            {hud.isBoss ? <SkullIcon size={18} /> : `${hud.act}-${hud.stage + 1}`}
          </span>
          {shownCurses.map((c) => (
            <CurseIcon key={c} id={c} size={18} />
          ))}
          {moreCurses > 0 && (
            <span class="run-curse-more" data-testid="run-curse-more">
              +{moreCurses}
            </span>
          )}
        </div>
        <div class={`run-clock${urgent ? ' is-urgent' : ''}`} data-testid="run-clock">
          <ClockGlyph />
          {clock(hud.secondsLeft)}
        </div>
        <div class="run-sparks" data-testid="run-sparks">
          <SparkIcon size={15} />
          {run.szikra}
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
      <GoalBar state={state} fmt={fmt} />
      <ScoreChips state={state} fmt={fmt} />
      <RelicRow run={run} slots={state.runRelicSlots} pulse={state.relicPulse} />
    </div>
  );
}

function ClockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function GoalBar({ state, fmt }: { state: GameUiState; fmt: (n: number) => string }) {
  const hud = state.runHud!;
  const value = useCountUp(hud.value, 300);
  const pct = Math.round(Math.min(1, hud.progress) * 1000) / 10;
  return (
    <div class={`run-goal${hud.won ? ' is-won' : ''}`} data-testid="run-goal">
      <div class="run-goal-fill" style={{ width: `${pct}%` }} />
      <div class="run-goal-text">
        <span class="run-goal-label">
          <GoalGlyph type={hud.goal.type} size={14} />
          {goalShort(hud.goal)}
          {hud.goal.type === 'chainTarget' && ` ×${hud.goal.chainLength}+`}
        </span>
        <span class="run-goal-value" data-testid="run-goal-value">
          {t('run.progress', { value: fmt(value), target: fmt(hud.target) })}
        </span>
      </div>
      {hud.won && <span class="run-goal-check" aria-hidden="true" />}
    </div>
  );
}

function ScoreChips({ state, fmt }: { state: GameUiState; fmt: (n: number) => string }) {
  const flash = state.scoreFlash;
  const score = useCountUp(state.score);
  const hud = state.runHud!;
  return (
    <div class="run-chips" data-testid="run-chips">
      {flash ? (
        <div class="run-chips-row" key={flash.key} data-testid="score-chips">
          <span class="rchip rchip-base">{fmt(flash.base)}</span>
          <span class="rchip-x">×</span>
          <span class={`rchip rchip-mult${flash.mult >= 4 ? ' rchip-hot' : ''}`}>
            {fmt(flash.mult)}
          </span>
          <span class="rchip-eq">=</span>
          <span class={`rchip-total${flash.total >= 1000 ? ' rchip-big' : ''}`}>
            {fmt(flash.total)}
          </span>
        </div>
      ) : (
        <div class="run-score-idle">
          <span class="score-label">{t('hud.score')}</span>
          <span class="run-score-value">{fmt(score)}</span>
        </div>
      )}
      <div class="run-effects">
        {hud.frozen && <span class="pill run-pill-ice">{t('run.frozen')}</span>}
        {hud.overcharged && <span class="pill run-pill-hot">{t('run.overcharged')}</span>}
      </div>
    </div>
  );
}

function RelicRow({
  run,
  slots,
  pulse,
}: {
  run: RunState;
  slots: number;
  pulse: GameUiState['relicPulse'];
}) {
  const [tip, setTip] = useState<string | null>(null);
  useEffect(() => {
    if (!tip) return;
    const id = window.setTimeout(() => setTip(null), 2600);
    return () => window.clearTimeout(id);
  }, [tip]);
  const cells = Array.from({ length: Math.max(slots, run.relics.length) }, (_, i) => run.relics[i]);
  return (
    <div class="run-relics" data-testid="run-relics">
      {cells.map((r, i) =>
        r ? (
          <button
            type="button"
            key={`${r.id}-${pulse && pulse.ids.includes(r.id) ? pulse.key : 0}`}
            class={`run-relic-slot${pulse && pulse.ids.includes(r.id) ? ' relic-fire' : ''}`}
            data-testid={`hud-relic-${i}`}
            aria-label={relicName(r.id)}
            onClick={() => setTip(tip === r.id ? null : r.id)}
          >
            <RelicIcon id={r.id} rarity={getRelic(r.id).rarity} size={34} />
          </button>
        ) : (
          <span key={`empty-${i}`} class="run-relic-slot is-empty" aria-hidden="true" />
        ),
      )}
      {tip && (
        <div class="run-tip" role="tooltip" data-testid="relic-tip" key={tip}>
          <strong>{relicName(tip)}</strong>
          <span>{relicDesc(tip)}</span>
        </div>
      )}
    </div>
  );
}

/** Below the board: charm slots around the RAISE button. */
export function RunControls({ state, actions }: Props) {
  const run = state.run;
  if (!run) return null;
  const slots = Math.max(state.runCharmSlots, run.charms.length);
  const all = Array.from({ length: slots }, (_, i) => i);
  const left = all.slice(0, Math.ceil(slots / 2));
  const right = all.slice(Math.ceil(slots / 2));
  const style = {
    top: `${state.controlsTop}px`,
    left: `${state.boardLeft}px`,
    width: `${state.boardWidth}px`,
  };
  const down = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    actions.setRaise(true);
  };
  const up = () => actions.setRaise(false);
  const slot = (i: number) => {
    const c = run.charms[i];
    if (!c) return <span key={i} class="run-charm-slot is-empty" aria-hidden="true" />;
    return (
      <button
        type="button"
        key={i}
        class={`run-charm-slot${state.charmMenu === i ? ' is-open' : ''}`}
        data-testid={`hud-charm-${i}`}
        aria-label={charmName(c.id)}
        onClick={() => actions.run.openCharm(i)}
      >
        <CharmIcon id={c.id} size={44} />
      </button>
    );
  };
  return (
    <div class="run-controls" style={style}>
      {left.map(slot)}
      <button
        type="button"
        class={`raise-btn run-raise${state.raiseHeld ? ' raise-held' : ''}`}
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
      {right.map(slot)}
    </div>
  );
}

/** The open charm's card (in a stage: the sim is paused until it closes). */
export function CharmCard({ state, actions }: Props) {
  const slot = state.charmMenu;
  const owned = slot === null ? undefined : state.run?.charms[slot];
  if (slot === null || !owned) return null;
  const def = getCharm(owned.id);
  const inShop = state.screen === 'shop';
  const usable = inShop ? def.usable === 'any' : true;
  return (
    <div class="overlay run-charm-overlay" onClick={() => actions.run.cancelCharm()}>
      <div
        class="run-charm-card"
        data-testid="charm-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={charmName(owned.id)}
      >
        <CharmIcon id={owned.id} size={64} />
        <div class="run-charm-card-text">
          <span class={`rarity-tag rarity-${def.rarity}`}>{t(`run.rarity.${def.rarity}`)}</span>
          <h3>{charmName(owned.id)}</h3>
          <p>{charmDesc(owned.id)}</p>
        </div>
        <div class="run-charm-card-actions">
          {usable && (
            <button
              type="button"
              class="btn btn-primary btn-small"
              data-testid="charm-use"
              onClick={() => actions.run.useCharm(slot)}
            >
              {t('run.use')}
            </button>
          )}
          {inShop && (
            <button
              type="button"
              class="btn btn-ghost btn-small"
              data-testid="charm-sell"
              onClick={() => actions.run.sellCharm(slot)}
            >
              {t('run.sellFor', { price: Math.max(1, Math.floor(owned.paid / 2)) })}
            </button>
          )}
          <button
            type="button"
            class="btn btn-ghost btn-small btn-quiet"
            data-testid="charm-cancel"
            onClick={() => actions.run.cancelCharm()}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pick a column / row / block for a targeted charm. */
export function TargetingLayer({ state, actions }: Props) {
  const tg = state.targeting;
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  if (!tg) return null;
  const toCell = (e: PointerEvent): { row: number; col: number } | null => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor((x - tg.originX) / tg.cellSize);
    const row = Math.floor((y - tg.originY + tg.riseOffsetPx) / tg.cellSize);
    if (col < 0 || col >= tg.cols || row < 0 || row >= tg.rows) return null;
    return { row, col };
  };
  const hint =
    tg.kind === 'column'
      ? t('run.targetColumn')
      : tg.kind === 'row'
        ? t('run.targetRow')
        : t('run.targetBlock');
  return (
    <div
      class="overlay run-targeting"
      data-testid="targeting"
      onPointerDown={(e) => setHover(toCell(e))}
      onPointerMove={(e) => setHover(toCell(e))}
      onPointerUp={(e) => {
        const c = toCell(e);
        if (c) actions.run.target(c.row, c.col);
      }}
    >
      <div class="run-target-banner" onPointerUp={(e) => e.stopPropagation()}>
        <CharmIcon id={tg.charmId} size={32} />
        <span>{hint}</span>
        <button
          type="button"
          class="btn btn-ghost btn-small"
          data-testid="target-cancel"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => actions.run.cancelCharm()}
        >
          {t('common.cancel')}
        </button>
      </div>
      {hover && <TargetHighlight tg={tg} cell={hover} />}
    </div>
  );
}

function TargetHighlight({ tg, cell }: { tg: RunTargeting; cell: { row: number; col: number } }) {
  const s = tg.cellSize;
  const top = (r: number) => tg.originY + r * s - tg.riseOffsetPx;
  let box: { left: number; top: number; width: number; height: number };
  if (tg.kind === 'column') {
    box = { left: tg.originX + cell.col * s, top: top(0), width: s, height: tg.rows * s };
  } else if (tg.kind === 'row') {
    box = { left: tg.originX, top: top(cell.row), width: tg.cols * s, height: s };
  } else {
    const c0 = Math.max(0, cell.col - 1);
    const r0 = Math.max(0, cell.row - 1);
    const c1 = Math.min(tg.cols - 1, cell.col + 1);
    const r1 = Math.min(tg.rows - 1, cell.row + 1);
    box = {
      left: tg.originX + c0 * s,
      top: top(r0),
      width: (c1 - c0 + 1) * s,
      height: (r1 - r0 + 1) * s,
    };
  }
  return (
    <div
      class="run-target-box"
      style={{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
    />
  );
}
