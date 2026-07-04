"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DOMAINS, SUBDOMAINS, SUBTEST_INFO, subdomainsForSubtest } from "@/content/smr";
import { masteryPercent, userRating } from "@/lib/elo";
import { dueItems } from "@/lib/scheduler";
import {
  exportAll,
  getAttempts,
  getRatings,
  getReviewStates,
  importAll,
  isDiagnosticDone,
  resetAll,
} from "@/lib/storage";
import type { RatingState, Subtest } from "@/lib/types";
import DomainBar from "@/components/DomainBar";

export default function HomePage() {
  const [ratings, setRatings] = useState<RatingState | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [diagDone, setDiagDone] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setRatings(getRatings());
    setAttemptCount(getAttempts().length);
    setDueCount(dueItems(getReviewStates(), Date.now()).length);
    setDiagDone({ 1: isDiagnosticDone(1), 2: isDiagnosticDone(2) });
  };

  useEffect(refresh, []);

  if (!ratings) return null;

  const attemptedSubdomains = new Set(getAttempts().map((a) => a.subdomain));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold mb-1">CSET Mathematics — Subtests I &amp; II</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Adaptive practice targeting the CTC subject matter requirements. {attemptCount} questions answered so far.
        </p>
      </section>

      {([1, 2] as Subtest[]).map((st) => {
        const info = SUBTEST_INFO[st];
        return (
          <section key={st} className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-lg">{info.name}</h2>
              <div className="flex gap-2">
                {!diagDone[st] && (
                  <Link
                    href={`/diagnostic?subtest=${st}`}
                    className="text-sm px-3 py-1.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600"
                  >
                    Take diagnostic
                  </Link>
                )}
                <Link
                  href={`/drill?subtest=${st}`}
                  className="text-sm px-3 py-1.5 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700"
                >
                  Drill
                </Link>
                <Link
                  href={`/exam/${st}`}
                  className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-medium hover:border-sky-400"
                >
                  Timed exam
                </Link>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              {info.domains.map((d) => (
                <div key={d} className="space-y-3">
                  <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {DOMAINS[d].name}
                  </div>
                  {DOMAINS[d].subdomains.map((sd) => {
                    const r = userRating(sd, ratings);
                    const attempted = attemptedSubdomains.has(sd);
                    return (
                      <DomainBar
                        key={sd}
                        label={`${sd} ${SUBDOMAINS[sd].name}`}
                        percent={attempted ? masteryPercent(r) : 0}
                        detail={attempted ? `rating ${Math.round(r)}` : "not started"}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="font-semibold">Study queue</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {dueCount > 0 ? (
            <>
              <span className="font-semibold text-amber-600">{dueCount}</span> previously missed question
              {dueCount === 1 ? " is" : "s are"} due for review.{" "}
              <Link href="/review" className="text-sky-600 underline">
                Review now
              </Link>
            </>
          ) : (
            "No missed questions due for review. Drill your weakest areas instead."
          )}
        </p>
      </section>

      <section className="text-xs text-slate-500 dark:text-slate-400 flex gap-4 flex-wrap items-center">
        <button
          className="underline hover:text-slate-700 dark:hover:text-slate-200"
          onClick={() => {
            const blob = new Blob([exportAll()], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cset-progress-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export progress
        </button>
        <button className="underline hover:text-slate-700 dark:hover:text-slate-200" onClick={() => fileRef.current?.click()}>
          Import progress
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const result = importAll(await f.text());
            if (!result.ok) alert(`Import failed: ${result.error}`);
            refresh();
            e.target.value = "";
          }}
        />
        <button
          className="underline hover:text-red-600"
          onClick={() => {
            if (confirm("Erase all progress (ratings, attempts, review queue, flags, exam history)?")) {
              resetAll();
              refresh();
            }
          }}
        >
          Reset all data
        </button>
      </section>
    </div>
  );
}
