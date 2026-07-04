import type { Attempt, CRItem, MCItem, RatingState, SubdomainCode, Subtest } from "./types";
import { DOMAINS, SUBTEST_INFO, subdomainsForSubtest } from "@/content/smr";
import { expectedScore, itemRating, userRating } from "./elo";
import { rngFor, sample, shuffle, type RNG } from "./rng";

/**
 * Exam blueprint (matches the official structure):
 * Subtest I: 35 MC (Number & Quantity 10, Algebra 25) + 3 CR (1 N&Q, 2 Algebra)
 * Subtest II: 35 MC (Geometry 25, Prob & Stat 10) + 3 CR (2 Geometry, 1 P&S)
 */

export interface ExamForm {
  mc: MCItem[];
  cr: CRItem[];
}

function spreadAcrossSubdomains(pool: MCItem[], subdomains: SubdomainCode[], count: number, rng: RNG): MCItem[] {
  const bySub = new Map<SubdomainCode, MCItem[]>();
  for (const sd of subdomains) bySub.set(sd, shuffle(rng, pool.filter((i) => i.subdomain === sd)));
  const picked: MCItem[] = [];
  // Round-robin over subdomains so coverage matches the exam's breadth.
  let idx = 0;
  const cursors = new Map<SubdomainCode, number>(subdomains.map((sd) => [sd, 0]));
  while (picked.length < count) {
    const sd = subdomains[idx % subdomains.length];
    const items = bySub.get(sd)!;
    const cursor = cursors.get(sd)!;
    if (cursor < items.length) {
      picked.push(items[cursor]);
      cursors.set(sd, cursor + 1);
    } else if (subdomains.every((s) => cursors.get(s)! >= bySub.get(s)!.length)) {
      break; // pool exhausted
    }
    idx++;
  }
  return picked;
}

export function composeExam(
  subtest: Subtest,
  mcBank: MCItem[],
  crBank: CRItem[],
  seedKey: string
): ExamForm {
  const rng = rngFor(`exam:${seedKey}`);
  const info = SUBTEST_INFO[subtest];
  const mc: MCItem[] = [];
  for (const d of info.domains) {
    const domain = DOMAINS[d];
    const pool = mcBank.filter((i) => i.domain === d);
    mc.push(...spreadAcrossSubdomains(pool, domain.subdomains, domain.mcCount, rng));
  }
  const cr: CRItem[] = [];
  for (const d of info.domains) {
    const domain = DOMAINS[d];
    const pool = crBank.filter((i) => i.domain === d);
    cr.push(...sample(rng, pool, domain.crCount));
  }
  return { mc: shuffle(rng, mc), cr };
}

/** Deterministic diagnostic: 4 items per subdomain, spread across difficulty. */
export function diagnosticSet(subtest: Subtest, mcBank: MCItem[]): MCItem[] {
  const out: MCItem[] = [];
  for (const sd of subdomainsForSubtest(subtest)) {
    const pool = mcBank
      .filter((i) => i.subdomain === sd)
      .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
    if (pool.length === 0) continue;
    const picks = new Set<number>();
    for (const frac of [0.15, 0.4, 0.65, 0.9]) {
      let k = Math.min(pool.length - 1, Math.floor(frac * pool.length));
      while (picks.has(k) && k < pool.length - 1) k++;
      picks.add(k);
    }
    out.push(...[...picks].sort((a, b) => a - b).map((k) => pool[k]));
  }
  return out;
}

export interface DrillOptions {
  subtest: Subtest;
  /** restrict to one subdomain, or undefined for adaptive weak-area mix */
  subdomain?: SubdomainCode;
  /** avoid repeating anything answered in the last N attempts */
  recencyWindow?: number;
}

/**
 * Adaptive drill selection: weight subdomains by weakness (lower rating →
 * picked more), then pick an item whose rating is near the user's, with a
 * slight upward skew (train above your level), avoiding recent repeats.
 */
export function pickDrillItem(
  mcBank: MCItem[],
  ratings: RatingState,
  attempts: Attempt[],
  opts: DrillOptions
): MCItem | null {
  const rng = rngFor(`drill:${attempts.length}:${Date.now() >> 12}`);
  const subdomains = opts.subdomain ? [opts.subdomain] : subdomainsForSubtest(opts.subtest);

  const recent = new Set(attempts.slice(-(opts.recencyWindow ?? 30)).map((a) => a.itemId));

  // Weakness weights: subdomain at rating 1500 gets weight ~1, at 900 ~7.
  const weights = subdomains.map((sd) => {
    const r = userRating(sd, ratings);
    return Math.max(1, (1600 - r) / 100);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let sd = subdomains[0];
  for (let i = 0; i < subdomains.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      sd = subdomains[i];
      break;
    }
  }

  let pool = mcBank.filter((i) => i.subdomain === sd && !recent.has(i.id));
  if (pool.length === 0) pool = mcBank.filter((i) => i.subdomain === sd);
  if (pool.length === 0) return null;

  const u = userRating(sd, ratings);
  // Prefer items the user answers correctly ~60-70% of the time, slightly hard.
  const target = u + 50;
  const scored = pool
    .map((item) => ({ item, dist: Math.abs(itemRating(item, ratings) - target) }))
    .sort((a, b) => a.dist - b.dist);
  const top = scored.slice(0, Math.max(3, Math.floor(scored.length / 4)));
  return top[Math.floor(rng() * top.length)].item;
}

/**
 * Rough scaled-score estimate out of 300 (220 passes). The CTC doesn't
 * publish its conversion; this assumes MC is 70% of the total and CR 30%,
 * with the scaled range mapped linearly from raw percentage. Treat it as a
 * gauge, not a prediction.
 */
export function estimateScaledScore(mcCorrect: number, mcTotal: number, crScores: (number | null)[]): number {
  const mcFrac = mcTotal > 0 ? mcCorrect / mcTotal : 0;
  const graded = crScores.filter((s): s is number => s !== null);
  // Ungraded CRs assume the user's MC level to avoid skewing the gauge.
  const crFrac =
    crScores.length === 0
      ? mcFrac
      : (graded.reduce((a, b) => a + (b - 1) / 3, 0) + (crScores.length - graded.length) * mcFrac) / crScores.length;
  const raw = 0.7 * mcFrac + 0.3 * crFrac;
  return Math.round(100 + raw * 200);
}

export function probabilityCorrect(item: MCItem, ratings: RatingState): number {
  return expectedScore(userRating(item.subdomain, ratings), itemRating(item, ratings));
}
