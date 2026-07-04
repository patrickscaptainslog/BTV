"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LESSONS } from "@/content/lessons/lessons";
import { DOMAINS, SUBTEST_INFO } from "@/content/smr";
import { masteryPercent, userRating } from "@/lib/elo";
import { getAttempts, getRatings } from "@/lib/storage";
import type { RatingState, Subtest } from "@/lib/types";

export default function LessonsIndex() {
  const [ratings, setRatings] = useState<RatingState | null>(null);
  const [attempted, setAttempted] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRatings(getRatings());
    setAttempted(new Set(getAttempts().map((a) => a.subdomain)));
  }, []);

  if (!ratings) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-lg">Lessons</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Compact review sheets: core facts, the traps the exam sets, and a worked example. Start with your weakest
          areas (lowest bars), then drill to lock it in.
        </p>
      </div>
      {([1, 2] as Subtest[]).map((st) => (
        <section key={st} className="space-y-2">
          <h2 className="font-semibold">{SUBTEST_INFO[st].name}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {SUBTEST_INFO[st].domains.flatMap((d) =>
              DOMAINS[d].subdomains.map((sd) => {
                const lesson = LESSONS[sd];
                const pct = attempted.has(sd) ? masteryPercent(userRating(sd, ratings)) : null;
                return (
                  <Link
                    key={sd}
                    href={`/lessons/${sd}`}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-sky-400 space-y-1"
                  >
                    <div className="text-xs text-slate-500">{sd}</div>
                    <div className="font-medium text-sm">{lesson.title}</div>
                    {pct !== null ? (
                      <div
                        className={`text-xs font-semibold ${pct < 40 ? "text-red-600" : pct < 70 ? "text-amber-600" : "text-green-600"}`}
                      >
                        mastery {pct}%
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">not started</div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
