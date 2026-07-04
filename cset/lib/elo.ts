import type { MCItem, RatingState, SubdomainCode } from "./types";

/**
 * Elo-style mastery model. Ratings live on the familiar chess scale:
 * a user rated equal to an item's difficulty answers it correctly ~50% of
 * the time. Item difficulties are authored around these anchors:
 *   1050 routine one-step, 1200 exam-typical, 1350 hard multi-step,
 *   1500 "ace territory" items harder than the real exam.
 */

export const DEFAULT_USER_RATING = 1100;
export const USER_K = 40;
export const ITEM_K = 12;
/** Rating at which we call a subdomain mastered (displayed as 100%) */
export const MASTERY_CEILING = 1500;
export const MASTERY_FLOOR = 800;

export function expectedScore(userRating: number, itemRating: number): number {
  return 1 / (1 + Math.pow(10, (itemRating - userRating) / 400));
}

export function itemRating(item: Pick<MCItem, "id" | "difficulty">, state: RatingState): number {
  return item.difficulty + (state.itemDelta[item.id] ?? 0);
}

export function userRating(subdomain: SubdomainCode, state: RatingState): number {
  return state.user[subdomain] ?? DEFAULT_USER_RATING;
}

/**
 * Update ratings after an attempt. Mutates and returns a new state object.
 * The item's rating also drifts (slowly) so the bank self-calibrates to the
 * single user over time.
 */
export function applyAttempt(
  state: RatingState,
  item: Pick<MCItem, "id" | "difficulty" | "subdomain">,
  correct: boolean
): RatingState {
  const u = userRating(item.subdomain, state);
  const q = itemRating(item, state);
  const exp = expectedScore(u, q);
  const score = correct ? 1 : 0;

  const nextUser = u + USER_K * (score - exp);
  // Item moves opposite the user: if the user beat expectations, the item was
  // easier than rated.
  const nextDelta = (state.itemDelta[item.id] ?? 0) - ITEM_K * (score - exp);

  return {
    user: { ...state.user, [item.subdomain]: nextUser },
    itemDelta: { ...state.itemDelta, [item.id]: nextDelta },
  };
}

/** Map a rating to a 0-100 mastery percentage for display. */
export function masteryPercent(rating: number): number {
  const pct = ((rating - MASTERY_FLOOR) / (MASTERY_CEILING - MASTERY_FLOOR)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function emptyRatingState(): RatingState {
  return { user: {}, itemDelta: {} };
}
