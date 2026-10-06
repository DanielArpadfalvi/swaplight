import type { CpuLevel } from '../../core/ai';
import type { GameActions, GameUiState, UiRect } from '../../game/state';
import {
  VERSUS_LEVELS,
  VERSUS_LEVEL_IDS,
  versusLevelAvailable,
  type GarbageIcon,
} from '../../game/versus';
import type { VersusRecord } from '../../game/save';
import { versusNeedsLeaveConfirm } from '../../game/nav';
import { formatClock } from '../../game/state';
import { t, type TranslationKey } from '../../i18n';
import { useFormat } from '../format';
import { useFitText } from '../fit';
import { IconBack, IconLock, IconPlay } from '../icons';
import { useCountUp } from '../useCountUp';
import { ScrollMore } from '../ScrollMore';
import { useScrollMore } from '../useScrollMore';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
}

const key = (k: string): TranslationKey => k as TranslationKey;
export const levelName = (level: CpuLevel): string =>
  t(key(`versus.level.${VERSUS_LEVEL_IDS[level]}`));
export const cpuName = (level: CpuLevel): string => t(key(`versus.cpu.${VERSUS_LEVEL_IDS[level]}`));
const cpuDesc = (level: CpuLevel): string => t(key(`versus.cpuDesc.${VERSUS_LEVEL_IDS[level]}`));

/** Accent per difficulty. */
export const LEVEL_COLOR: Readonly<Record<CpuLevel, string>> = {
  1: '#3dff9a',
  2: '#1ec8ff',
  3: '#ffd23f',
  4: '#ff8a3d',
  5: '#ff3b6b',
};

/** CPU avatar: a visor head whose eyes get angrier with the level. */
export function CpuAvatar({ level, size = 44 }: { level: CpuLevel; size?: number }) {
  const color = LEVEL_COLOR[level];
  const tilt = (level - 1) * 0.9;
  return (
    <span
      class="cpu-avatar"
      style={{ width: `${size}px`, height: `${size}px`, '--cpu': color }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect
          x="5"
          y="7"
          width="30"
          height="26"
          rx="9"
          fill="#0d0922"
          stroke={color}
          stroke-width="2"
        />
        <rect x="9" y="14" width="22" height="11" rx="5.5" fill={color} fill-opacity="0.16" />
        <path
          d={`M11 ${17 - tilt * 0.4} L18 ${18 + tilt} L18 ${21 + tilt * 0.4} L11 ${21 - tilt * 0.2}z`}
          fill={color}
        />
        <path
          d={`M29 ${17 - tilt * 0.4} L22 ${18 + tilt} L22 ${21 + tilt * 0.4} L29 ${21 - tilt * 0.2}z`}
          fill={color}
        />
        <path d="M20 3v4M14 33v3M26 33v3" stroke={color} stroke-width="2" stroke-linecap="round" />
        <circle cx="20" cy="3" r="1.8" fill={color} />
      </svg>
    </span>
  );
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

function recordText(r: VersusRecord | undefined): string {
  if (!r || r.played === 0) return t('versus.noRecord');
  return t('versus.record', { won: r.won, lost: r.lost });
}

/* ------------------------------------------------------------------- difficulty select */

export function VersusSetupScreen({ state, actions, leaving }: Props) {
  const [bodyRef, more] = useScrollMore<HTMLDivElement>();
  const { level, format } = state.versusSetup;
  const full = state.fullVersion;
  return (
    <div
      class={`overlay sheet run-sheet vs-sheet${leaving ? ' is-leaving' : ''}`}
      data-testid="versus-setup"
    >
      <div class="sheet-frame">
        <SheetHeader title={t('versus.title')} onBack={() => actions.menu()} />
        <div class={`sheet-body${more ? ' has-more' : ''}`} ref={bodyRef}>
          <section class="section">
            <h3 class="section-title">{t('versus.chooseOpponent')}</h3>
            <div class="vs-levels" role="radiogroup" aria-label={t('versus.chooseOpponent')}>
              {VERSUS_LEVELS.map((lvl, i) => {
                const open = versusLevelAvailable(lvl, full);
                const selected = lvl === level;
                return (
                  <button
                    type="button"
                    key={lvl}
                    role="radio"
                    aria-checked={selected ? 'true' : 'false'}
                    class={`vs-level${selected ? ' is-selected' : ''}${open ? '' : ' is-locked'}`}
                    style={{ '--cpu': LEVEL_COLOR[lvl], animationDelay: `${40 + i * 45}ms` }}
                    data-testid={`vs-level-${lvl}`}
                    onClick={() => actions.versus.selectLevel(lvl)}
                  >
                    <CpuAvatar level={lvl} size={42} />
                    <span class="vs-level-text">
                      <span class="vs-level-top">
                        <span class="vs-level-name">{cpuName(lvl)}</span>
                        <span class="vs-level-pill">{levelName(lvl)}</span>
                      </span>
                      <span class="vs-level-desc">{cpuDesc(lvl)}</span>
                    </span>
                    <span class="vs-level-side">
                      {open ? (
                        <span class="vs-level-record" data-testid={`vs-record-${lvl}`}>
                          {recordText(state.versusRecords[String(lvl)])}
                        </span>
                      ) : (
                        <span class="pill pill-lock">
                          <IconLock size={11} />
                          {t('menu.fullVersion')}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <section class="section">
            <h3 class="section-title">{t('versus.format')}</h3>
            <div class="segmented vs-format" role="radiogroup" aria-label={t('versus.format')}>
              {(['single', 'bo3'] as const).map((f) => (
                <button
                  type="button"
                  key={f}
                  role="radio"
                  aria-checked={f === format ? 'true' : 'false'}
                  class={`seg${f === format ? ' seg-on' : ''}`}
                  data-testid={`vs-format-${f}`}
                  onClick={() => actions.versus.selectFormat(f)}
                >
                  {f === 'single' ? t('versus.single') : t('versus.bestOf3')}
                </button>
              ))}
            </div>
          </section>
        </div>
        <footer class="run-foot">
          <ScrollMore show={more} />
          <button
            type="button"
            class="btn btn-primary btn-play vs-fight"
            data-testid="vs-start"
            onClick={() => actions.versus.start()}
          >
            <IconPlay size={20} />
            {t('versus.fight')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------- HUD */

function GarbageQueue({
  items,
  unit,
  armMs,
  testId,
  rect,
  label,
  warn,
}: {
  items: GarbageIcon[];
  unit: number;
  armMs: number;
  testId: string;
  rect: UiRect;
  label?: string;
  warn?: boolean;
}) {
  return (
    <div
      class={`gq${warn ? ' gq-warn' : ''}${items.length > 0 ? ' gq-busy' : ''}`}
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
      }}
      data-testid={testId}
      data-count={items.length}
    >
      {label && <span class="gq-label">{label}</span>}
      <span class="gq-items">
        {items.map((g) => (
          <span
            key={g.id}
            class={`gq-slab${g.chain ? ' is-chain' : ''}${g.height > 1 ? ' is-tall' : ''}`}
            style={{ width: `${g.width * unit}px`, '--arm': `${armMs}ms` }}
          >
            {g.height > 1 && <span class="gq-rows">×{g.height}</span>}
          </span>
        ))}
      </span>
    </div>
  );
}

export function VersusHud({ state, actions }: { state: GameUiState; actions: GameActions }) {
  const fmt = useFormat();
  const hud = state.versusHud;
  const vs = state.versus;
  const vl = state.versusLayout;
  const score = useCountUp(state.score);
  if (!hud || !vs || !vl) return null;
  const left = vl.queue.x;
  const right = vl.card.x + vl.card.w;
  const style = {
    top: `${state.hudTop}px`,
    height: `${Math.max(0, vl.queue.y - state.hudTop)}px`,
    left: `${left}px`,
    width: `${right - left}px`,
  };
  const need = vs.format === 'bo3' ? 2 : 1;
  const warn = hud.queueCells > 0;
  return (
    <>
      <div
        class={`hud vs-hud${state.danger ? ' hud-danger' : ''}`}
        style={style}
        data-testid="versus-hud"
      >
        <div class="run-hud-top">
          <div class="run-stage-chip vs-round-chip" data-testid="vs-round">
            {vs.format === 'bo3' ? `R${vs.round}` : 'VS'}
            {vs.format === 'bo3' && (
              <span class="vs-pips">
                {Array.from({ length: need }, (_, i) => (
                  <span key={i} class={`vs-pip${i < vs.wins[0] ? ' is-won' : ''}`} />
                ))}
              </span>
            )}
          </div>
          <div class="run-clock" data-testid="vs-clock">
            {formatClock(state.seconds)}
          </div>
          <div class="stat vs-sent-stat">
            <span class="stat-label">{t('versus.sent')}</span>
            <span class="stat-value" data-testid="vs-sent">
              {fmt(hud.sent)}
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
        <div class="hud-score vs-score">
          <span class="score-label">{t('hud.score')}</span>
          <span class="score-value" data-testid="hud-score">
            {fmt(score)}
          </span>
        </div>
      </div>
      <GarbageQueue
        items={hud.queue}
        unit={7}
        armMs={hud.armMs}
        rect={vl.queue}
        testId="vs-queue"
        label={t('versus.incoming')}
        warn={warn}
      />
      <GarbageQueue
        items={hud.oppQueue}
        unit={Math.max(3, Math.floor(vl.miniQueue.w / 16))}
        armMs={hud.armMs}
        rect={vl.miniQueue}
        testId="vs-opp-queue"
      />
      <OpponentCard state={state} />
      {hud.warnKey > 0 && (
        <div
          class="vs-warning"
          key={hud.warnKey}
          style={{
            left: `${vl.queue.x}px`,
            top: `${vl.queue.y + vl.queue.h + 30}px`,
            width: `${vl.queue.w}px`,
          }}
          data-testid="vs-warning"
        >
          {t('versus.warning')}
        </div>
      )}
    </>
  );
}

function OpponentCard({ state }: { state: GameUiState }) {
  const fmt = useFormat();
  const vs = state.versus!;
  const hud = state.versusHud!;
  const card = state.versusLayout!.card;
  const need = vs.format === 'bo3' ? 2 : 1;
  const name = cpuName(vs.level);
  const nameRef = useFitText<HTMLSpanElement>(name, 13, 7);
  return (
    <div
      class={`vs-opp${hud.oppDanger ? ' is-danger' : ''}`}
      style={{
        left: `${card.x}px`,
        top: `${card.y}px`,
        width: `${card.w}px`,
        '--cpu': LEVEL_COLOR[vs.level],
      }}
      data-testid="vs-opponent"
    >
      <CpuAvatar level={vs.level} size={40} />
      <span class="vs-opp-name" ref={nameRef}>
        {name}
      </span>
      <span class="vs-level-pill">{levelName(vs.level)}</span>
      {vs.format === 'bo3' && (
        <span class="vs-pips vs-opp-pips">
          {Array.from({ length: need }, (_, i) => (
            <span key={i} class={`vs-pip is-cpu${i < vs.wins[1] ? ' is-won' : ''}`} />
          ))}
        </span>
      )}
      <span class="vs-opp-stat">
        <span class="stat-label">{t('versus.sent')}</span>
        <b data-testid="vs-opp-sent">{fmt(hud.oppSent)}</b>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------- result */

export function VersusResultScreen({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const r = state.versusResult;
  const sent = useCountUp(r?.sent ?? 0, 600);
  if (!r) return null;
  const won = r.matchOver ? r.matchWinner === 0 : r.winner === 0;
  const draw = r.winner === null && !r.matchOver;
  const title = r.matchOver
    ? won
      ? t('versus.victory')
      : t('versus.defeat')
    : draw
      ? t('versus.roundDraw')
      : won
        ? t('versus.roundWon')
        : t('versus.roundLost');
  return (
    <div
      class={`overlay overlay-dim vs-result${won ? ' is-win' : ' is-loss'}${leaving ? ' is-leaving' : ''}`}
      data-testid="versus-result"
    >
      <div class="panel vs-result-card" style={{ '--cpu': LEVEL_COLOR[r.level] }}>
        <span class="intro-kicker vs-kicker">
          {t('versus.vsName', { name: cpuName(r.level) })} · {levelName(r.level)}
        </span>
        <h2
          class={`panel-title${won ? ' title-win' : ' title-danger'}`}
          data-testid="vs-result-title"
        >
          {title}
        </h2>
        <div class="vs-scoreline" data-testid="vs-scoreline">
          <span class="vs-side vs-side-you">
            <span class="vs-side-label">{t('versus.you')}</span>
            <b>{r.wins[0]}</b>
          </span>
          <span class="vs-colon">:</span>
          <span class="vs-side vs-side-cpu">
            <b>{r.wins[1]}</b>
            <span class="vs-side-label">{cpuName(r.level)}</span>
          </span>
        </div>
        <div class="final-stats">
          <div class="final-stat">
            <span class="stat-label">{t('versus.garbageSent')}</span>
            <span class="stat-value" data-testid="vs-result-sent">
              {fmt(sent)}
            </span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('versus.garbageReceived')}</span>
            <span class="stat-value">{fmt(r.received)}</span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('versus.bestChain')}</span>
            <span class="stat-value">×{r.maxChain}</span>
          </div>
          <div class="final-stat">
            <span class="stat-label">{t('versus.matchTime')}</span>
            <span class="stat-value">{formatClock(r.seconds)}</span>
          </div>
        </div>
        {r.matchOver && (
          <div class="vs-record-line" data-testid="vs-result-record">
            <span>{t('versus.recordLine', { name: cpuName(r.level) })}</span>
            <b>{t('versus.record', { won: r.record.won, lost: r.record.lost })}</b>
          </div>
        )}
        {r.matchOver ? (
          <>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="vs-rematch"
              onClick={() => actions.versus.rematch()}
            >
              {t('versus.rematch')}
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              data-testid="vs-change"
              onClick={() => actions.versus.changeOpponent()}
            >
              {t('versus.changeOpponent')}
            </button>
          </>
        ) : (
          <button
            type="button"
            class="btn btn-primary"
            data-testid="vs-next-round"
            onClick={() => actions.versus.nextRound()}
          >
            {t('versus.nextRound')}
          </button>
        )}
        <button
          type="button"
          class="btn btn-ghost btn-quiet"
          data-testid="vs-menu"
          onClick={() =>
            versusNeedsLeaveConfirm(state) ? actions.openOverlay('leaveConfirm') : actions.menu()
          }
        >
          {t('gameOver.mainMenu')}
        </button>
      </div>
    </div>
  );
}

/** Leaving an undecided match (pause → menu, back between rounds) forfeits it: confirm first. */
export function LeaveMatchDialog({
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
      data-testid="leave-confirm"
      role="alertdialog"
      aria-modal="true"
    >
      <div class="panel panel-danger">
        <h2 class="panel-title title-danger">{t('versus.leaveTitle')}</h2>
        <p class="panel-body">{t('versus.leaveBody')}</p>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="leave-stay"
          onClick={() => actions.closeOverlay()}
        >
          {t('versus.leaveStay')}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-danger"
          data-testid="leave-yes"
          onClick={() => actions.menu()}
        >
          {t('versus.leaveConfirm')}
        </button>
      </div>
    </div>
  );
}
