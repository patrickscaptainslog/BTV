import type { DomainCode, MCItem, SubdomainCode, Subtest } from "@/lib/types";
import { rngFor, shuffle, type RNG } from "@/lib/rng";

/**
 * Template-generator framework. Each generator computes its correct answer
 * programmatically and derives distractors from specific misconceptions, so
 * every emitted item's key is right by construction. Emission is
 * deterministic: (generatorId, seed) always yields the same item, so item
 * IDs are stable across regenerations and flags stay meaningful.
 */

export interface RawVariant {
  stem: string;
  correct: string;
  /** exactly 3, distinct from each other and from `correct` */
  distractors: string[];
  solution: string;
  /** added to the generator's base difficulty */
  difficultyOffset?: number;
  /** optional inline SVG diagram */
  figure?: string;
}

export interface GeneratorDef {
  id: string;
  subtest: Subtest;
  domain: DomainCode;
  subdomain: SubdomainCode;
  baseDifficulty: number;
  variants: number;
  generate: (rng: RNG) => RawVariant;
}

const MAX_RETRIES = 40;

export function emitItems(def: GeneratorDef): MCItem[] {
  const items: MCItem[] = [];
  for (let seed = 0; seed < def.variants; seed++) {
    let emitted: MCItem | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const rng = rngFor(`${def.id}:${seed}:${attempt}`);
      let v: RawVariant;
      try {
        v = def.generate(rng);
      } catch {
        continue; // generator rejected this draw (e.g. degenerate parameters)
      }
      const all = [v.correct, ...v.distractors].map((s) => s.trim());
      if (v.distractors.length !== 3 || new Set(all).size !== 4) continue;
      const order = shuffle(rng, [0, 1, 2, 3]);
      const choices = order.map((i) => all[i]);
      emitted = {
        id: `${def.id}-${seed}`,
        type: "mc",
        subtest: def.subtest,
        domain: def.domain,
        subdomain: def.subdomain,
        difficulty: def.baseDifficulty + (v.difficultyOffset ?? 0),
        stem: v.stem,
        ...(v.figure ? { figure: v.figure } : {}),
        choices,
        key: choices.indexOf(all[0]),
        workedSolution: v.solution,
        tags: [],
        source: { kind: "generated", generatorId: def.id, seed },
      };
      break;
    }
    if (!emitted) {
      throw new Error(`Generator ${def.id} seed ${seed}: could not produce 4 distinct choices in ${MAX_RETRIES} tries`);
    }
    items.push(emitted);
  }
  return items;
}

// ---------- shared math/formatting helpers ----------

export function gcdInt(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function lcmInt(a: number, b: number): number {
  return Math.abs(a * b) / gcdInt(a, b);
}

/** Reduced LaTeX fraction; integer when denominator divides out. */
export function fracTex(n: number, d: number): string {
  if (d === 0) throw new Error("fracTex: zero denominator");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcdInt(n, d);
  n /= g;
  d /= g;
  if (d === 1) return `${n}`;
  return n < 0 ? `-\\frac{${-n}}{${d}}` : `\\frac{${n}}{${d}}`;
}

/** "3 - 2i", "-4 + i", "5", "3i" */
export function fmtComplex(re: number, im: number): string {
  if (im === 0) return `${re}`;
  const imPart = Math.abs(im) === 1 ? "i" : `${Math.abs(im)}i`;
  if (re === 0) return im < 0 ? `-${imPart}` : imPart;
  return `${re} ${im < 0 ? "-" : "+"} ${imPart}`;
}

/** Largest square factor: n = a^2 * b, returns [a, b]. */
export function extractSquare(n: number): [number, number] {
  let a = 1;
  let b = n;
  for (let k = 2; k * k <= b; k++) {
    while (b % (k * k) === 0) {
      a *= k;
      b /= k * k;
    }
  }
  return [a, b];
}

/** "5\sqrt{3}", "\sqrt{7}", "6" */
export function sqrtTex(n: number): string {
  const [a, b] = extractSquare(n);
  if (b === 1) return `${a}`;
  return a === 1 ? `\\sqrt{${b}}` : `${a}\\sqrt{${b}}`;
}

/** ax+b with proper signs, omitting 1 coefficients: "3x - 2", "x + 5", "-x" */
export function linTex(a: number, b: number, v = "x"): string {
  if (a === 0) return `${b}`;
  const ax = a === 1 ? v : a === -1 ? `-${v}` : `${a}${v}`;
  if (b === 0) return ax;
  return `${ax} ${b < 0 ? "-" : "+"} ${Math.abs(b)}`;
}

/** Polynomial from coefficients [a_n, ..., a_1, a_0], highest degree first. */
export function polyTex(coeffs: number[], v = "x"): string {
  const n = coeffs.length - 1;
  const parts: string[] = [];
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const deg = n - i;
    const abs = Math.abs(c);
    const coefStr = deg === 0 ? `${abs}` : abs === 1 ? "" : `${abs}`;
    const varStr = deg === 0 ? "" : deg === 1 ? v : `${v}^{${deg}}`;
    const term = `${coefStr}${varStr}` || "1";
    if (parts.length === 0) {
      parts.push(c < 0 ? `-${term}` : term);
    } else {
      parts.push(`${c < 0 ? "-" : "+"} ${term}`);
    }
  });
  return parts.length ? parts.join(" ") : "0";
}

/** Evaluate polynomial (highest degree first) at x. */
export function polyEval(coeffs: number[], x: number): number {
  return coeffs.reduce((acc, c) => acc * x + c, 0);
}

export function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1;
  }
  return result;
}

export function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function nCk(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return Math.round(factorial(n) / (factorial(k) * factorial(n - k)));
}

export function nPk(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return Math.round(factorial(n) / factorial(n - k));
}
