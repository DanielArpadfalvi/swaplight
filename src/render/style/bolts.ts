import { Container, Graphics } from 'pixi.js';
import { mixColor } from './colorMath';

interface Bolt {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Bezier control point (the arc bulges upwards). */
  cx: number;
  cy: number;
  color: number;
  width: number;
  age: number;
  life: number;
  /** Seconds the impact ring lingers after arrival. */
  ring: number;
  onArrive?: () => void;
  arrived: boolean;
}

export interface BoltOptions {
  /** Flight time in seconds. */
  life?: number;
  /** Core thickness in px. */
  width?: number;
  /** Called once when the head reaches the target. */
  onArrive?: () => void;
}

const TRAIL = 14;
const RING_SECONDS = 0.35;

function bezier(b: Bolt, t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * b.x0 + 2 * u * t * b.cx + t * t * b.x1,
    y: u * u * b.y0 + 2 * u * t * b.cy + t * t * b.y1,
  };
}

/**
 * Energy bolts (versus attacks): a glowing comet with a tapered trail flying along an arc from the
 * sender to the receiver's incoming-garbage preview, ending in an expanding impact ring. Additive,
 * redrawn per frame only while bolts are alive.
 */
export class AttackBoltPool extends Container {
  private readonly gfx = new Graphics();
  private readonly bolts: Bolt[] = [];
  /** Reduced motion: shorter trail, no ring. */
  reduced = false;

  constructor() {
    super();
    this.gfx.blendMode = 'add';
    this.addChild(this.gfx);
  }

  get active(): number {
    return this.bolts.length;
  }

  fire(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
    opts: BoltOptions = {},
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    this.bolts.push({
      x0,
      y0,
      x1,
      y1,
      cx: (x0 + x1) / 2 - dy * 0.25,
      cy: Math.min(y0, y1) - Math.max(40, dist * 0.35),
      color,
      width: opts.width ?? 5,
      age: 0,
      life: opts.life ?? 0.5,
      ring: RING_SECONDS,
      onArrive: opts.onArrive,
      arrived: false,
    });
  }

  clear(): void {
    this.bolts.length = 0;
    this.gfx.clear();
  }

  update(dt: number): void {
    const g = this.gfx;
    g.clear();
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i] as Bolt;
      b.age += dt;
      const t = Math.min(1, b.age / b.life);
      // Ease-in: the bolt accelerates into the target.
      const head = t * t * (1.6 - 0.6 * t);
      if (t >= 1 && !b.arrived) {
        b.arrived = true;
        b.onArrive?.();
      }
      if (!b.arrived || b.age < b.life + 0.06) this.drawTrail(g, b, head);
      if (b.arrived) {
        const k = (b.age - b.life) / b.ring;
        if (k >= 1 || (this.reduced && b.age > b.life + 0.06)) {
          this.bolts.splice(i, 1);
          continue;
        }
        if (this.reduced) continue;
        const r = b.width * (2 + 7 * k);
        g.circle(b.x1, b.y1, r).stroke({
          width: b.width * (1 - k) * 1.2,
          color: b.color,
          alpha: 0.9 * (1 - k),
        });
        g.circle(b.x1, b.y1, r * 0.55).fill({
          color: mixColor(b.color, 0xffffff, 0.5),
          alpha: 0.45 * (1 - k),
        });
      }
    }
  }

  private drawTrail(g: Graphics, b: Bolt, head: number): void {
    const n = this.reduced ? 6 : TRAIL;
    const span = 0.32;
    const white = mixColor(b.color, 0xffffff, 0.7);
    let prev = bezier(b, Math.max(0, head - span));
    for (let k = 1; k <= n; k++) {
      const tt = Math.max(0, head - span + (span * k) / n);
      const p = bezier(b, tt);
      const f = k / n;
      g.moveTo(prev.x, prev.y)
        .lineTo(p.x, p.y)
        .stroke({
          width: b.width * (0.4 + 2.2 * f),
          color: b.color,
          alpha: 0.18 * f,
          cap: 'round',
        });
      g.moveTo(prev.x, prev.y)
        .lineTo(p.x, p.y)
        .stroke({ width: b.width * (0.2 + 0.8 * f), color: white, alpha: 0.85 * f, cap: 'round' });
      prev = p;
    }
    const p = bezier(b, head);
    g.circle(p.x, p.y, b.width * 2.6).fill({ color: b.color, alpha: 0.35 });
    g.circle(p.x, p.y, b.width * 1.1).fill({ color: 0xffffff, alpha: 0.95 });
  }
}
