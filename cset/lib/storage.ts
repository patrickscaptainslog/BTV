"use client";

import type {
  Attempt,
  CRPracticeAttempt,
  CRPracticeState,
  ExamResult,
  FlagEntry,
  RatingState,
  ReviewState,
} from "./types";
import { emptyRatingState } from "./elo";

/**
 * All progress lives in localStorage under one namespace, behind this
 * module. Every save stamps `updatedAt` and notifies listeners, which the
 * sync layer uses to push the store to the server (last-write-wins across
 * devices). Everything is exportable/importable as a single JSON blob.
 */

const NS = "cset-math-prep:v1";

export interface Store {
  ratings: RatingState;
  attempts: Attempt[];
  review: Record<string, ReviewState>;
  flags: FlagEntry[];
  exams: ExamResult[];
  diagnosticDone: { 1: boolean; 2: boolean };
  crPractice: Record<string, CRPracticeState>;
  updatedAt: number;
}

function emptyStore(): Store {
  return {
    ratings: emptyRatingState(),
    attempts: [],
    review: {},
    flags: [],
    exams: [],
    diagnosticDone: { 1: false, 2: false },
    crPractice: {},
    updatedAt: 0,
  };
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to local mutations (used by the sync layer). Returns unsubscribe. */
export function onStoreChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
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
  store.updatedAt = Date.now();
  window.localStorage.setItem(NS, JSON.stringify(store));
  listeners.forEach((fn) => fn());
}

// ---- sync-layer access (whole-store) ----

export function getStoreSnapshot(): Store {
  return load();
}

/** Replace the local store with a server copy WITHOUT re-stamping updatedAt. */
export function replaceStore(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NS, JSON.stringify({ ...emptyStore(), ...store }));
}

// ---- typed accessors ----

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

export function getCRPractice(): Record<string, CRPracticeState> {
  return load().crPractice;
}

export function addCRPracticeAttempt(itemId: string, attempt: CRPracticeAttempt) {
  const s = load();
  if (!s.crPractice[itemId]) s.crPractice[itemId] = { attempts: [] };
  s.crPractice[itemId].attempts.push(attempt);
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
