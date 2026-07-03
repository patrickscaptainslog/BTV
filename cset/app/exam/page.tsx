"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SUBTEST_INFO } from "@/content/smr";
import { getExamResults } from "@/lib/storage";
import type { ExamResult } from "@/lib/types";

export default function ExamLanding() {
  const [history, setHistory] = useState<ExamResult[]>([]);
  useEffect(() => setHistory(getExamResults()), []);

  return (
    <div className="space-y-6">
      <h1 className="font-bold text-lg">Timed exam simulation</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Full CSET format: 35 multiple-choice + 3 constructed-response, 2 hours 30 minutes, no feedback until you
        submit. Constructed responses are graded against the CTC-style rubric by AI.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {([1, 2] as const).map((st) => {
          const info = SUBTEST_INFO[st];
          return (
            <Link
              key={st}
              href={`/exam/${st}`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-sky-400 space-y-1"
            >
              <div className="font-semibold">{info.name}</div>
              <div className="text-xs text-slate-500">
                Test code {info.code} · {info.mcCount} MC + {info.crCount} CR · {info.minutes} min ·{" "}
                {info.calculator ? "graphing calculator allowed" : "no calculator"}
              </div>
            </Link>
          );
        })}
      </div>
      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-sm">Past attempts</h2>
          <div className="space-y-1">
            {history
              .slice()
              .reverse()
              .map((r) => (
                <div key={r.id} className="text-sm flex justify-between rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <span>
                    Subtest {r.subtest === 1 ? "I" : "II"} · {new Date(r.startedAt).toLocaleDateString()}
                  </span>
                  <span>
                    MC {r.mcCorrect}/{r.mcItemIds.length} · est. scaled{" "}
                    <span className={r.estimatedScaled >= 220 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                      {r.estimatedScaled}
                    </span>
                    /300
                  </span>
                </div>
              ))}
          </div>
          <p className="text-xs text-slate-500">Passing is a scaled 220. The estimate is a rough linear gauge — the CTC&apos;s true conversion is unpublished.</p>
        </section>
      )}
    </div>
  );
}
