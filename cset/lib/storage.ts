"use client";

import type { Attempt, ExamResult, FlagEntry, RatingState, ReviewState } from "./types";
import { emptyRatingState } from "./elo";

/**
 * All progress lives in localStorage under one namespace, behind this
 * module, so a server-backed store can replace it without touching callers.
 * Everything is exportable/importable as a single JSON blob.
 */

const NS = "cset-math-prep:v1";

interface Store {
  ratings: RatingState;
  attempts: Attempt[];
  review: Record<string, ReviewState>;
  flags: FlagEntry[];
  exams: ExamResult[];
  diagnosticDone: { 1: boolean; 2: boolean };
}

function emptyStore(): Store {
  return {
    ratings: emptyRatingState(),
    attempts: [],
    review: {},
    flags: [],
    exams: [],
    diagnosticDone: { 1: false, 2: false },
  };
}

function load(): Store {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(NS);
    if (!raw) return emptyStore();
    return { ...emptyStore(), ...(JSON.parse(raw) as Partial<Store>) };
  } catch {
    return emptyStore();
  }
}

function save(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NS, JSON.stringify(store));
}

export function getRatings(): RatingState {
  return load().ratings;
}

export function setRatings(ratings: RatingState) {
  const s = load();
  s.ratings = ratings;
  save(s);
}

export function getAttempts(): Attempt[] {
  return load().attempts;
}

export function addAttempt(attempt: Attempt) {
  const s = load();
  s.attempts.push(attempt);
  save(s);
}

export function getReviewStates(): Record<string, ReviewState> {
  return load().review;
}

export function setReviewState(itemId: string, state: ReviewState) {
  const s = load();
  s.review[itemId] = state;
  save(s);
}

export function removeReviewState(itemId: string) {
  const s = load();
  delete s.review[itemId];
  save(s);
}

export function getFlags(): FlagEntry[] {
  return load().flags;
}

export function addFlag(flag: FlagEntry) {
  const s = load();
  if (!s.flags.some((f) => f.itemId === flag.itemId)) {
    s.flags.push(flag);
    save(s);
  }
}

export function removeFlag(itemId: string) {
  const s = load();
  s.flags = s.flags.filter((f) => f.itemId !== itemId);
  save(s);
}

export function getExamResults(): ExamResult[] {
  return load().exams;
}

export function addExamResult(result: ExamResult) {
  const s = load();
  s.exams.push(result);
  save(s);
}

export function isDiagnosticDone(subtest: 1 | 2): boolean {
  return load().diagnosticDone[subtest];
}

export function markDiagnosticDone(subtest: 1 | 2) {
  const s = load();
  s.diagnosticDone[subtest] = true;
  save(s);
}

export function exportAll(): string {
  return JSON.stringify(load(), null, 2);
}

export function importAll(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json) as Partial<Store>;
    if (typeof parsed !== "object" || parsed === null || !("ratings" in parsed)) {
      return { ok: false, error: "Not a CSET prep export file." };
    }
    save({ ...emptyStore(), ...parsed });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

export function resetAll() {
  save(emptyStore());
}
