import type { SimEvent } from '../core/types';
import type { ImpactStrength } from '../platform/types';
import type { TranslationKey, TranslationParams } from '../i18n';

/**
 * Pure mapping from simulation events to presentation feedback (audio, haptics, popups, particles,
 * shake…). `applyFeedback` in `src/game/endless.ts` executes the commands; keeping the decision
 * logic here makes it unit-testable without Web Audio / Pixi.
 */

export type FeedbackSfx =
  | 'swap'
  | 'land'
  | 'match'
  | 'pop'
  | 'chain'
  | 'combo'
  | 'rowRise'
  | 'danger'
  | 'gameOver'
  | 'garbage';

/** Semantic popup tone; the renderer maps it to a palette color. */
export type PopupTone = 'chain' | 'combo' | 'score' | 'level';

export type Feedback =
  | { kind: 'sfx'; sfx: FeedbackSfx; a?: number; b?: number }
  | { kind: 'haptic'; strength: ImpactStrength }
  /** Floating label at a fractional grid position (row incl. fall, before the rise shift). */
  | { kind: 'popup'; text: string; row: number; col: number; tone: PopupTone; scale: number }
  /** Particle burst centered on a grid cell, in the block's color. */
  | { kind: 'burst'; row: number; col: number; color: number; chain: number }
  | { kind: 'shake'; amount: number }
  | { kind: 'flash'; tone: 'chain' | 'gameOver' }
  /** Momentary background / music excitement (0..1). */
  | { kind: 'excite'; amount: number }
  /** A clear scored: drives the HUD "base × mult" chips. */
  | { kind: 'scored'; base: number; mult: number; total: number; chain: number; combo: number }
  /** Garbage turned into blocks: sparks over the freed cells. */
  | { kind: 'garbageBurst'; row: number; col: number; color: number };

export interface FeedbackContext {
  /** Sim tick after the step that produced the events. */
  tick: number;
  /** Stack pinned against the ceiling (grace draining). */
  danger: boolean;
  /** Board height in rows (for centered popups). */
  rows: number;
  cols: number;
  translate: (key: TranslationKey, params?: TranslationParams) => string;
}

/** Heartbeat period while in danger, in ticks (~0.4 s). */
export const DANGER_BEAT_TICKS = 24;

/** Chain level from which the screen shakes. */
export const SHAKE_MIN_CHAIN = 3;

/** Garbage slabs of at least this many cells land with a heavy thud. */
export const GARBAGE_HEAVY_CELLS = 12;

/** Screen shake for a landing garbage slab of `cells` cells (0 for small ones). */
export function garbageShake(cells: number): number {
  if (cells < 6) return 0;
  return Math.min(0.75, 0.18 + 0.025 * cells);
}

/** Haptic strength for a chain level (≥2). */
export function chainHaptic(chain: number): ImpactStrength {
  return chain >= 4 ? 'heavy' : 'medium';
}

/** Screen shake trauma for a chain level; 0 below `SHAKE_MIN_CHAIN`. */
export function chainShake(chain: number): number {
  if (chain < SHAKE_MIN_CHAIN) return 0;
  return Math.min(0.85, 0.32 + 0.12 * (chain - SHAKE_MIN_CHAIN));
}

/** Format a score delta for popups: "+1 240". Uses thin grouping so the bitmap font has the glyphs. */
export function formatPoints(n: number): string {
  const s = Math.round(n).toString();
  return '+' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Map the events of one tick to feedback commands (in a stable order). */
export function feedbackForEvents(events: readonly SimEvent[], ctx: FeedbackContext): Feedback[] {
  const out: Feedback[] = [];
  const centroids = new Map<number, { row: number; col: number }>();
  let landed = false;

  for (const e of events) {
    switch (e.type) {
      case 'swapped':
        out.push({ kind: 'sfx', sfx: 'swap' }, { kind: 'haptic', strength: 'light' });
        break;
      case 'landed':
        // Many blocks land together; one thud per tick is enough.
        if (!landed) out.push({ kind: 'sfx', sfx: 'land' });
        landed = true;
        break;
      case 'matched': {
        let rs = 0;
        let cs = 0;
        let top = Infinity;
        for (const b of e.blocks) {
          rs += b.row;
          cs += b.col;
          top = Math.min(top, b.row);
        }
        const n = Math.max(1, e.blocks.length);
        const center = { row: rs / n, col: cs / n };
        centroids.set(e.groupId, center);
        out.push({ kind: 'sfx', sfx: 'match' });
        // Labels sit above the group (but not above the board).
        const labelRow = Math.max(0.6, top - 0.35);
        if (e.chain >= 2) {
          out.push(
            { kind: 'sfx', sfx: 'chain', a: e.chain },
            {
              kind: 'popup',
              text: ctx.translate('hud.chainPopup', { count: e.chain }).toUpperCase(),
              row: labelRow,
              col: center.col,
              tone: 'chain',
              scale: Math.min(0.95, 0.55 + 0.07 * e.chain),
            },
            { kind: 'haptic', strength: chainHaptic(e.chain) },
            { kind: 'excite', amount: Math.min(1, 0.25 + 0.15 * e.chain) },
          );
          const shake = chainShake(e.chain);
          if (shake > 0) out.push({ kind: 'shake', amount: shake });
          if (e.chain >= 4) out.push({ kind: 'flash', tone: 'chain' });
        }
        if (e.combo >= 4) {
          out.push(
            { kind: 'sfx', sfx: 'combo', a: e.combo },
            {
              kind: 'popup',
              text: ctx.translate('hud.comboPopup', { count: e.combo }).toUpperCase(),
              row: e.chain >= 2 ? labelRow - 0.75 : labelRow,
              col: center.col,
              tone: 'combo',
              scale: Math.min(0.85, 0.5 + 0.04 * e.combo),
            },
          );
          if (e.chain < 2) {
            out.push(
              { kind: 'haptic', strength: e.combo >= 6 ? 'heavy' : 'medium' },
              { kind: 'excite', amount: Math.min(0.8, 0.1 * e.combo) },
            );
          }
        }
        break;
      }
      case 'scored': {
        const at = centroids.get(e.groupId) ?? { row: ctx.rows / 2, col: (ctx.cols - 1) / 2 };
        const { base, mult, total, chain, combo } = e.breakdown;
        out.push(
          {
            kind: 'popup',
            text: formatPoints(total),
            row: at.row + 0.15,
            col: at.col,
            tone: 'score',
            scale: Math.min(0.62, 0.38 + 0.02 * Math.log2(Math.max(1, total))),
          },
          { kind: 'scored', base, mult, total, chain, combo },
        );
        break;
      }
      case 'popped':
        out.push(
          { kind: 'sfx', sfx: 'pop', a: e.index, b: e.chain },
          { kind: 'burst', row: e.row, col: e.col, color: e.color, chain: e.chain },
        );
        break;
      case 'rowRisen':
        out.push({ kind: 'sfx', sfx: 'rowRise' });
        break;
      case 'levelUp':
        out.push({
          kind: 'popup',
          text: `${ctx.translate('hud.level')} ${e.level}`.toUpperCase(),
          row: ctx.rows * 0.4,
          col: (ctx.cols - 1) / 2,
          tone: 'level',
          scale: 0.6,
        });
        break;
      case 'garbageLanded': {
        const cells = e.width * e.height;
        out.push(
          { kind: 'sfx', sfx: 'garbage', a: cells },
          { kind: 'haptic', strength: cells >= GARBAGE_HEAVY_CELLS ? 'heavy' : 'medium' },
        );
        const shake = garbageShake(cells);
        if (shake > 0) out.push({ kind: 'shake', amount: shake });
        break;
      }
      case 'garbageConverting':
        out.push({ kind: 'sfx', sfx: 'match' });
        break;
      case 'garbageConverted':
        for (const b of e.blocks) {
          out.push({ kind: 'garbageBurst', row: b.row, col: b.col, color: b.color });
        }
        break;
      case 'gameOver':
        out.push(
          { kind: 'sfx', sfx: 'gameOver' },
          { kind: 'haptic', strength: 'heavy' },
          { kind: 'flash', tone: 'gameOver' },
          { kind: 'shake', amount: 0.6 },
        );
        break;
      default:
        break;
    }
  }

  if (ctx.danger && ctx.tick % DANGER_BEAT_TICKS === 0) {
    out.push({ kind: 'sfx', sfx: 'danger' });
  }
  return out;
}

/** Music intensity 0..1 from the speed level and danger state. */
export function musicIntensity(level: number, danger: boolean, nearTop: boolean): number {
  const base = 0.2 + Math.min(0.5, (level - 1) * 0.035);
  if (danger) return 1;
  if (nearTop) return Math.min(1, base + 0.25);
  return base;
}
