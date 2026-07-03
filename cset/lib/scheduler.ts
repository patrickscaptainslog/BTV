import type { ReviewState } from "./types";

/**
 * SM-2-lite spaced repetition for missed questions.
 * Only items the user has gotten wrong at least once enter the queue;
 * answering a queued item correctly stretches its interval, missing it
 * resets the interval and drops ease.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

export function initialReviewState(now: number): ReviewState {
  // First re-review the same day (10 minutes) so the correction sticks.
  return { due: now + 10 * 60 * 1000, intervalDays: 0, ease: DEFAULT_EASE, lapses: 1 };
}

export function reviewAttempt(state: ReviewState, correct: boolean, now: number): ReviewState {
  if (!correct) {
    return {
      due: now + 10 * 60 * 1000,
      intervalDays: 0,
      ease: Math.max(MIN_EASE, state.ease - 0.2),
      lapses: state.lapses + 1,
    };
  }
  const nextInterval = state.intervalDays === 0 ? 1 : Math.round(state.intervalDays * state.ease * 10) / 10;
  return {
    due: now + nextInterval * DAY_MS,
    intervalDays: nextInterval,
    ease: state.ease,
    lapses: state.lapses,
  };
}

/** An item graduates out of the review queue after a long correct streak. */
export function isGraduated(state: ReviewState): boolean {
  return state.intervalDays >= 21;
}

export function dueItems(states: Record<string, ReviewState>, now: number): string[] {
  return Object.entries(states)
    .filter(([, s]) => s.due <= now && !isGraduated(s))
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}
