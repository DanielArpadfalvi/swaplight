// Tiny seeded PRNG for audio variation (mulberry32). Independent from the core RNG so that
// music variation never perturbs gameplay determinism.

export type Prng = () => number;

export function createPrng(seed: number): Prng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function prngInt(rng: Prng, n: number): number {
  return Math.floor(rng() * n);
}
