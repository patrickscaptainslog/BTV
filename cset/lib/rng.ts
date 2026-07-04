/** Deterministic seeded PRNG (mulberry32) with helpers. */

export type RNG = () => number;

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(key: string): RNG {
  return mulberry32(hashString(key));
}

/** Integer in [lo, hi] inclusive. */
export function randInt(rng: RNG, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Random element of a non-empty array. */
export function choice<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Non-zero integer in [-mag, mag]. */
export function randNonZero(rng: RNG, mag: number): number {
  const v = randInt(rng, 1, mag);
  return rng() < 0.5 ? -v : v;
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(rng: RNG, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sample k distinct elements. */
export function sample<T>(rng: RNG, arr: readonly T[], k: number): T[] {
  return shuffle(rng, arr).slice(0, Math.min(k, arr.length));
}
