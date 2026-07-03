import { describe, expect, test } from "@jest/globals";
import { applyAttempt, emptyRatingState, expectedScore, masteryPercent, userRating } from "@/lib/elo";

describe("elo", () => {
  test("expected score is 0.5 at equal ratings and monotone in the gap", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
    expect(expectedScore(1400, 1200)).toBeGreaterThan(0.5);
    expect(expectedScore(1000, 1200)).toBeLessThan(0.5);
  });

  test("correct answers raise the user rating, misses lower it", () => {
    const item = { id: "q1", difficulty: 1200, subdomain: "2.3" as const };
    let s = emptyRatingState();
    const before = userRating("2.3", s);
    s = applyAttempt(s, item, true);
    expect(userRating("2.3", s)).toBeGreaterThan(before);
    const afterWin = userRating("2.3", s);
    s = applyAttempt(s, item, false);
    expect(userRating("2.3", s)).toBeLessThan(afterWin);
  });

  test("item rating drifts opposite the result (self-calibration)", () => {
    const item = { id: "q1", difficulty: 1200, subdomain: "2.3" as const };
    let s = emptyRatingState();
    s = applyAttempt(s, item, true);
    expect(s.itemDelta["q1"]).toBeLessThan(0); // user beat it → item was easier than rated
    s = emptyRatingState();
    s = applyAttempt(s, item, false);
    expect(s.itemDelta["q1"]).toBeGreaterThan(0);
  });

  test("mastery percent is clamped to [0, 100]", () => {
    expect(masteryPercent(500)).toBe(0);
    expect(masteryPercent(2000)).toBe(100);
    expect(masteryPercent(1150)).toBeGreaterThan(0);
    expect(masteryPercent(1150)).toBeLessThan(100);
  });
});
