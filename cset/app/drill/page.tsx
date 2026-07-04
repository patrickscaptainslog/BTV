"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { MC_BANK } from "@/lib/bank";
import { pickDrillItem } from "@/lib/blueprint";
import { applyAttempt } from "@/lib/elo";
import { initialReviewState, reviewAttempt } from "@/lib/scheduler";
import { addAttempt, getAttempts, getRatings, getReviewStates, setRatings, setReviewState } from "@/lib/storage";
import { subdomainsForSubtest, SUBDOMAINS } from "@/content/smr";
import type { MCItem, SubdomainCode, Subtest } from "@/lib/types";
import QuestionCard from "@/components/QuestionCard";

function DrillInner() {
  const params = useSearchParams();
  const initialSubdomain = (params.get("subdomain") ?? "") as SubdomainCode | "";
  const [subtest, setSubtest] = useState<Subtest>(Number(params.get("subtest")) === 2 ? 2 : 1);
  const [subdomain, setSubdomain] = useState<SubdomainCode | "">(
    initialSubdomain && SUBDOMAINS[initialSubdomain as SubdomainCode] ? initialSubdomain : ""
  );
  const [item, setItem] = useState<MCItem | null>(null);
  const [streak, setStreak] = useState({ right: 0, total: 0 });

  const pick = (st: Subtest, sd: SubdomainCode | "") => {
    const next = pickDrillItem(MC_BANK, getRatings(), getAttempts(), {
      subtest: st,
      subdomain: sd === "" ? undefined : sd,
    });
    setItem(next);
  };

  useEffect(() => {
    pick(subtest, subdomain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtest, subdomain]);

  const onAnswered = (choice: number, correct: boolean, elapsed: number) => {
    if (!item) return;
    setRatings(applyAttempt(getRatings(), item, correct));
    addAttempt({
      itemId: item.id,
      subtest: item.subtest,
      domain: item.domain,
      subdomain: item.subdomain,
      correct,
      chosen: choice,
      elapsed,
      at: Date.now(),
      mode: "drill",
    });
    const review = getReviewStates()[item.id];
    if (!correct) {
      setReviewState(item.id, review ? reviewAttempt(review, false, Date.now()) : initialReviewState(Date.now()));
    } else if (review) {
      setReviewState(item.id, reviewAttempt(review, true, Date.now()));
    }
    setStreak((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-bold text-lg">Adaptive drill</h1>
        <div className="flex gap-2 items-center text-sm">
          <select
            value={subtest}
            onChange={(e) => {
              setSubtest(Number(e.target.value) as Subtest);
              setSubdomain("");
            }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
          >
            <option value={1}>Subtest I</option>
            <option value={2}>Subtest II</option>
          </select>
          <select
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value as SubdomainCode | "")}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 max-w-56"
          >
            <option value="">All areas (target weakest)</option>
            {subdomainsForSubtest(subtest).map((sd) => (
              <option key={sd} value={sd}>
                {sd} {SUBDOMAINS[sd].name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Session: {streak.right}/{streak.total} correct. Questions adapt to your rating — expect to miss ~40%.
        {subdomain && (
          <>
            {" · "}
            <Link href={`/lessons/${subdomain}`} className="text-sky-600 underline">
              Review the {subdomain} lesson
            </Link>
          </>
        )}
      </p>
      {item ? (
        <QuestionCard item={item} onAnswered={onAnswered} onNext={() => pick(subtest, subdomain)} />
      ) : (
        <p className="text-slate-500">No questions available for this filter.</p>
      )}
    </div>
  );
}

export default function DrillPage() {
  return (
    <Suspense>
      <DrillInner />
    </Suspense>
  );
}
