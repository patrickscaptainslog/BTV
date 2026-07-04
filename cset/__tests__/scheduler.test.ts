import { describe, expect, test } from "@jest/globals";
import { dueItems, initialReviewState, isGraduated, reviewAttempt } from "@/lib/scheduler";

const DAY = 24 * 60 * 60 * 1000;

describe("scheduler", () => {
  test("a miss schedules a same-day re-review", () => {
    const now = 1_000_000;
    const s = initialReviewState(now);
    expect(s.due).toBeGreaterThan(now);
    expect(s.due - now).toBeLessThan(DAY);
  });

  test("consecutive correct answers stretch the interval; graduation after a long streak", () => {
    let now = 1_000_000;
    let s = initialReviewState(now);
    let last = 0;
    for (let i = 0; i < 6; i++) {
      s = reviewAttempt(s, true, now);
      expect(s.intervalDays).toBeGreaterThan(last);
      last = s.intervalDays;
      now = s.due;
    }
    expect(isGraduated(s)).toBe(true);
  });

  test("a lapse resets the interval and drops ease", () => {
    let now = 1_000_000;
    let s = initialReviewState(now);
    s = reviewAttempt(s, true, now);
    s = reviewAttempt(s, true, s.due);
    const easeBefore = s.ease;
    s = reviewAttempt(s, false, s.due);
    expect(s.intervalDays).toBe(0);
    expect(s.ease).toBeLessThan(easeBefore);
    expect(s.lapses).toBe(2);
  });

  test("dueItems returns only due, ungraduated items, oldest first", () => {
    const now = 10 * DAY;
    const states = {
      a: { due: now - DAY, intervalDays: 1, ease: 2.5, lapses: 1 },
      b: { due: now - 2 * DAY, intervalDays: 2, ease: 2.5, lapses: 1 },
      future: { due: now + DAY, intervalDays: 1, ease: 2.5, lapses: 1 },
      graduated: { due: now - DAY, intervalDays: 30, ease: 2.5, lapses: 1 },
    };
    expect(dueItems(states, now)).toEqual(["b", "a"]);
  });
});
