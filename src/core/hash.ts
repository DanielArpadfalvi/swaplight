import type { BlockKind, BlockState, GarbageState, SimState } from './types';

/**
 * Cheap non-cryptographic state hash for AI transposition tables and per-frame
 * change detection. Covers everything that affects future play (cells, preview,
 * groups, garbage slabs + queue, rise/stop/grace, rng, score, chain, level, flags,
 * modifiers), but not
 * the frozen config, seed or stats. Order of `modifiers` keys does not matter.
 * Collisions are possible – use `hashState` (replay.ts) for replays and tests.
 */

const STATE_CODE: Readonly<Record<BlockState, number>> = {
  idle: 1,
  swapping: 2,
  hovering: 3,
  falling: 4,
  landing: 5,
  matched: 6,
  popping: 7,
  popped: 8,
};

const SLAB_CODE: Readonly<Record<GarbageState, number>> = {
  idle: 1,
  hovering: 2,
  falling: 3,
  landing: 4,
  converting: 5,
};

const KIND_CODE: Readonly<Record<BlockKind, number>> = {
  normal: 0,
  garbage: 1,
  wild: 2,
  bomb: 3,
};

let h1 = 0;
let h2 = 0;

function mix(x: number): void {
  h1 = Math.imul(h1 ^ x, 2654435761);
  h2 = Math.imul(h2 ^ x, 1597334677);
}

/** 53-bit hash of the playable state (see module comment). */
export function quickHash(sim: SimState): number {
  h1 = 0xdeadbeef;
  h2 = 0x41c6ce57;
  const cells = sim.cells;
  for (let i = 0; i < cells.length; i++) {
    const b = cells[i];
    if (!b) {
      mix(0);
      continue;
    }
    mix(b.id);
    mix(
      b.color |
        (STATE_CODE[b.state] << 4) |
        (KIND_CODE[b.kind] << 8) |
        ((b.swapDir + 1) << 10) |
        ((b.chain ? 1 : 0) << 12),
    );
    mix(b.timer | (b.fall << 16));
    mix(b.group | (b.popIndex << 20));
    if (b.slab !== 0) mix(b.slab);
  }
  for (const b of sim.preview) mix(b.id ^ (b.color << 24));
  for (const g of sim.groups) {
    mix(g.id);
    mix(g.size | (g.chain << 8) | (g.age << 16));
  }
  for (const s of sim.garbage) {
    mix(s.id);
    mix(s.row | (s.col << 8) | (s.width << 16) | (s.height << 24));
    mix(SLAB_CODE[s.state] | (s.chain ? 8 : 0) | (s.fall << 4) | (s.timer << 12));
    mix(s.convertTicks);
  }
  for (const q of sim.garbageQueue) {
    mix(q.id);
    mix(q.width | (q.height << 8) | (q.fromChain ? 1 << 30 : 0));
    mix(q.delay);
  }
  mix(sim.nextSlabId | (sim.garbageDrops << 20));
  const { rng } = sim;
  mix(rng.a);
  mix(rng.b);
  mix(rng.c);
  mix(rng.d);
  mix(sim.tick);
  mix(sim.nextBlockId);
  mix(sim.nextGroupId);
  mix(sim.riseOffset | (sim.riseAccum << 8));
  mix(sim.stopTicks);
  mix(sim.grace | (sim.graceClearTicks << 16));
  mix(
    (sim.raiseHeld ? 1 : 0) |
      (sim.manualRaising ? 2 : 0) |
      (sim.danger ? 4 : 0) |
      (sim.gameOver ? 8 : 0) |
      (sim.matchScanPending ? 16 : 0) |
      (sim.mode === 'endless' ? 32 : 0),
  );
  mix(sim.chain | (sim.level << 16));
  mix(sim.score | 0);
  mix(Math.floor(sim.score / 4294967296));
  // Modifiers: order-independent sum of per-entry hashes.
  let mods = 0;
  for (const key in sim.modifiers) {
    const value = sim.modifiers[key] as number;
    let k = 0x9e3779b9;
    for (let j = 0; j < key.length; j++) k = Math.imul(k ^ key.charCodeAt(j), 0x01000193);
    k = Math.imul(k ^ (value | 0), 0x85ebca6b);
    k = Math.imul(k ^ ((value * 65536) | 0), 0xc2b2ae35);
    mods = (mods + (k ^ (k >>> 15))) | 0;
  }
  mix(mods);

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
