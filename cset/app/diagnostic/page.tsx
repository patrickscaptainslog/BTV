"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { mcForSubtest } from "@/lib/bank";
import { diagnosticSet } from "@/lib/blueprint";
import { applyAttempt } from "@/lib/elo";
import { addAttempt, getRatings, markDiagnosticDone, setRatings } from "@/lib/storage";
import { SUBDOMAINS } from "@/content/smr";
import type { Subtest } from "@/lib/types";
import ChoiceList from "@/components/ChoiceList";
import MathText from "@/components/MathText";

function DiagnosticInner() {
  const params = useSearchParams();
  const subtest = (Number(params.get("subtest")) === 2 ? 2 : 1) as Subtest;
  const items = useMemo(() => diagnosticSet(subtest, mcForSubtest(subtest)), [subtest]);
  const [answers, setAnswers] = useState<(number | null)[]>(() => items.map(() => null));
  const [idx, setIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  const finish = () => {
    // Apply all attempts to ratings at once, then persist.
    let ratings = getRatings();
    const now = Date.now();
    items.forEach((item, i) => {
      const chosen = answers[i];
      const correct = chosen === item.key;
      ratings = applyAttempt(ratings, item, correct);
      addAttempt({
        itemId: item.id,
        subtest: item.subtest,
        domain: item.domain,
        subdomain: item.subdomain,
        correct,
        chosen: chosen ?? -1,
        elapsed: 0,
        at: now,
        mode: "diagnostic",
      });
    });
    setRatings(ratings);
    markDiagnosticDone(subtest);
    setFinished(true);
  };

  if (finished) {
    const bySubdomain = new Map<string, { right: number; total: number }>();
    items.forEach((item, i) => {
      const cur = bySubdomain.get(item.subdomain) ?? { right: 0, total: 0 };
      cur.total++;
      if (answers[i] === item.key) cur.right++;
      bySubdomain.set(item.subdomain, cur);
    });
    const totalRight = items.filter((it, i) => answers[i] === it.key).length;
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Diagnostic complete — Subtest {subtest === 1 ? "I" : "II"}</h1>
        <p className="text-slate-600 dark:text-slate-400">
          You answered <span className="font-semibold">{totalRight}</span> of {items.length} correctly. Your mastery
          ratings are seeded — drill will now target your weakest areas.
        </p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
          {[...bySubdomain.entries()].map(([sd, v]) => (
            <div key={sd} className="flex justify-between text-sm">
              <span>
                {sd} {SUBDOMAINS[sd as keyof typeof SUBDOMAINS].name}
              </span>
              <span className={v.right / v.total >= 0.75 ? "text-green-600" : v.right / v.total >= 0.5 ? "text-amber-600" : "text-red-600"}>
                {v.right}/{v.total}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Link href={`/drill?subtest=${subtest}`} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700">
            Start drilling
          </Link>
          <Link href="/" className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-medium">
            Overview
          </Link>
        </div>
      </div>
    );
  }

  const item = items[idx];
  if (!item) return <p>No diagnostic items available.</p>;
  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold">
          Diagnostic — Subtest {subtest === 1 ? "I" : "II"} · Question {idx + 1} of {items.length}
        </h1>
        <span className="text-xs text-slate-500">{answeredCount} answered</span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        No feedback until the end — answer honestly, don&apos;t look things up. This seeds your mastery model.
      </p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <MathText text={item.stem} />
        <ChoiceList
          choices={item.choices}
          selected={answers[idx]}
          onSelect={(i) => {
            const next = answers.slice();
            next[idx] = i;
            setAnswers(next);
          }}
        />
      </div>
      <div className="flex gap-2 justify-between">
        <button
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40"
        >
          Back
        </button>
        {idx < items.length - 1 ? (
          <button onClick={() => setIdx(idx + 1)} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700">
            Next
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={answeredCount < items.length}
            className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-40"
            title={answeredCount < items.length ? "Answer every question first" : ""}
          >
            Finish diagnostic
          </button>
        )}
      </div>
    </div>
  );
}

export default function DiagnosticPage() {
  return (
    <Suspense>
      <DiagnosticInner />
    </Suspense>
  );
}
