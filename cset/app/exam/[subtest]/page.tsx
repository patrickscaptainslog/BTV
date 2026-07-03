"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { crForSubtest, mcForSubtest } from "@/lib/bank";
import { composeExam, estimateScaledScore } from "@/lib/blueprint";
import { applyAttempt } from "@/lib/elo";
import { initialReviewState, reviewAttempt } from "@/lib/scheduler";
import { addAttempt, addExamResult, getRatings, getReviewStates, setRatings, setReviewState } from "@/lib/storage";
import { DOMAINS, SUBTEST_INFO } from "@/content/smr";
import type { CRGrade, Subtest } from "@/lib/types";
import ChoiceList from "@/components/ChoiceList";
import ExamTimer from "@/components/ExamTimer";
import MathText from "@/components/MathText";

type Phase = "intro" | "mc" | "cr" | "report";

export default function ExamSimPage() {
  const params = useParams<{ subtest: string }>();
  const subtest = (Number(params.subtest) === 2 ? 2 : 1) as Subtest;
  const info = SUBTEST_INFO[subtest];

  const [seed] = useState(() => `${Date.now()}`);
  const form = useMemo(
    () => composeExam(subtest, mcForSubtest(subtest), crForSubtest(subtest), seed),
    [subtest, seed]
  );

  const [phase, setPhase] = useState<Phase>("intro");
  const [endsAt, setEndsAt] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [idx, setIdx] = useState(0);
  const [mcAnswers, setMcAnswers] = useState<(number | null)[]>(() => form.mc.map(() => null));
  const [crResponses, setCrResponses] = useState<string[]>(() => form.cr.map(() => ""));
  const [crIdx, setCrIdx] = useState(0);
  const [crGrades, setCrGrades] = useState<(CRGrade | null)[]>(() => form.cr.map(() => null));
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [estimated, setEstimated] = useState(0);

  const begin = () => {
    const now = Date.now();
    setStartedAt(now);
    setEndsAt(now + info.minutes * 60000);
    setPhase("mc");
  };

  const submittedRef = useRef(false);

  const submitExam = async () => {
    if (submittedRef.current) return; // timer expiry and submit click can race
    submittedRef.current = true;
    // Record MC attempts + ratings + review scheduling.
    let ratings = getRatings();
    const now = Date.now();
    const reviewStates = getReviewStates();
    form.mc.forEach((item, i) => {
      const chosen = mcAnswers[i];
      const correct = chosen === item.key;
      ratings = applyAttempt(ratings, item, correct);
      addAttempt({
        itemId: item.id,
        subtest,
        domain: item.domain,
        subdomain: item.subdomain,
        correct,
        chosen: chosen ?? -1,
        elapsed: 0,
        at: now,
        mode: "exam",
      });
      if (!correct) {
        const st = reviewStates[item.id];
        setReviewState(item.id, st ? reviewAttempt(st, false, now) : initialReviewState(now));
      }
    });
    setRatings(ratings);

    const mcCorrect = form.mc.filter((item, i) => mcAnswers[i] === item.key).length;
    setPhase("report");

    // Grade CRs (best-effort; report renders progressively).
    const grades: (CRGrade | null)[] = form.cr.map(() => null);
    setGrading(true);
    for (let i = 0; i < form.cr.length; i++) {
      const response = crResponses[i].trim();
      if (!response) continue;
      try {
        const res = await fetch("/api/grade-cr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: form.cr[i].id, response }),
        });
        if (res.status === 401) {
          setGradeError("Sign in on the Login page to enable AI grading of constructed responses.");
          break;
        }
        if (res.ok) {
          grades[i] = (await res.json()) as CRGrade;
          setCrGrades(grades.slice());
        } else {
          setGradeError("AI grading unavailable — showing model answers for self-scoring.");
        }
      } catch {
        setGradeError("AI grading unavailable — showing model answers for self-scoring.");
      }
    }
    setGrading(false);

    const est = estimateScaledScore(
      mcCorrect,
      form.mc.length,
      grades.map((g) => (g ? g.score : null))
    );
    setEstimated(est);
    addExamResult({
      id: `exam-${now}`,
      subtest,
      startedAt,
      finishedAt: now,
      mcItemIds: form.mc.map((i) => i.id),
      mcAnswers,
      mcCorrect,
      crItemIds: form.cr.map((i) => i.id),
      crResponses,
      crScores: grades.map((g) => (g ? g.score : null)),
      estimatedScaled: est,
    });
  };

  if (phase === "intro") {
    return (
      <div className="space-y-5 max-w-2xl">
        <h1 className="font-bold text-xl">{info.name}</h1>
        <ul className="text-sm space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-5">
          <li>{form.mc.length} multiple-choice questions, then {form.cr.length} constructed-response assignments.</li>
          <li>{info.minutes} minutes total — one timer across both sections, like the real exam.</li>
          <li>{info.calculator ? "A graphing calculator IS allowed on the real Subtest II — have yours out." : "No calculator on the real Subtest I — don't use one."}</li>
          <li>No feedback until you submit. You can move freely among MC questions.</li>
          <li>Type constructed responses; write LaTeX like $x^2$ if you wish. Aim for complete, justified arguments.</li>
        </ul>
        <button onClick={begin} className="px-5 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700">
          Begin timed exam
        </button>
      </div>
    );
  }

  if (phase === "mc") {
    const item = form.mc[idx];
    const answeredCount = mcAnswers.filter((a) => a !== null).length;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="font-bold">
            MC {idx + 1} / {form.mc.length}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{answeredCount} answered</span>
            <ExamTimer endsAt={endsAt} onExpire={submitExam} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {form.mc.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-8 h-8 rounded text-xs font-medium border ${
                i === idx
                  ? "border-sky-500 bg-sky-100 dark:bg-sky-900"
                  : mcAnswers[i] !== null
                    ? "border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800"
                    : "border-slate-300 dark:border-slate-700"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <MathText text={item.stem} />
          <ChoiceList
            choices={item.choices}
            selected={mcAnswers[idx]}
            onSelect={(i) => {
              const next = mcAnswers.slice();
              next[idx] = i;
              setMcAnswers(next);
            }}
          />
        </div>
        <div className="flex justify-between">
          <button
            onClick={() => setIdx(Math.max(0, idx - 1))}
            disabled={idx === 0}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40"
          >
            Back
          </button>
          {idx < form.mc.length - 1 ? (
            <button onClick={() => setIdx(idx + 1)} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700">
              Next
            </button>
          ) : (
            <button onClick={() => setPhase("cr")} className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700">
              Continue to constructed response →
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "cr") {
    const item = form.cr[crIdx];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-bold">
            Constructed response {crIdx + 1} / {form.cr.length} · {DOMAINS[item.domain].name}
          </h1>
          <ExamTimer endsAt={endsAt} onExpire={submitExam} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <MathText text={item.stem} />
          <textarea
            value={crResponses[crIdx]}
            onChange={(e) => {
              const next = crResponses.slice();
              next[crIdx] = e.target.value;
              setCrResponses(next);
            }}
            rows={12}
            placeholder="Write your complete response here. Show reasoning, justify each step, and state conclusions clearly."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm font-mono"
          />
        </div>
        <div className="flex justify-between">
          <button
            onClick={() => (crIdx === 0 ? setPhase("mc") : setCrIdx(crIdx - 1))}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700"
          >
            Back
          </button>
          {crIdx < form.cr.length - 1 ? (
            <button onClick={() => setCrIdx(crIdx + 1)} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700">
              Next
            </button>
          ) : (
            <button onClick={submitExam} className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700">
              Submit exam
            </button>
          )}
        </div>
      </div>
    );
  }

  // report
  const mcCorrect = form.mc.filter((item, i) => mcAnswers[i] === item.key).length;
  const byDomain = new Map<string, { right: number; total: number }>();
  form.mc.forEach((item, i) => {
    const cur = byDomain.get(item.domain) ?? { right: 0, total: 0 };
    cur.total++;
    if (mcAnswers[i] === item.key) cur.right++;
    byDomain.set(item.domain, cur);
  });

  return (
    <div className="space-y-6">
      <h1 className="font-bold text-xl">Score report — {info.name}</h1>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="text-lg">
          Multiple choice: <span className="font-bold">{mcCorrect} / {form.mc.length}</span>{" "}
          ({Math.round((100 * mcCorrect) / form.mc.length)}%)
        </div>
        {[...byDomain.entries()].map(([d, v]) => (
          <div key={d} className="flex justify-between text-sm">
            <span>{DOMAINS[d as keyof typeof DOMAINS].name}</span>
            <span>
              {v.right}/{v.total}
            </span>
          </div>
        ))}
        {estimated > 0 && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-sm">
            Estimated scaled score:{" "}
            <span className={`font-bold ${estimated >= 220 ? "text-green-600" : "text-red-600"}`}>{estimated}</span>
            /300 (220 passes; rough gauge only)
          </div>
        )}
      </div>

      <section className="space-y-4">
        <h2 className="font-semibold">Constructed responses {grading && "(grading…)"}</h2>
        {gradeError && <p className="text-sm text-amber-600">{gradeError}</p>}
        {form.cr.map((item, i) => (
          <div key={item.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <MathText text={item.stem} className="text-sm" />
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Your response</div>
              <pre className="text-sm whitespace-pre-wrap font-sans">{crResponses[i].trim() || "(blank)"}</pre>
            </div>
            {crGrades[i] && (
              <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 p-3 space-y-1">
                <div className="font-semibold text-sm">
                  Score: {crGrades[i]!.score}/4
                </div>
                <MathText text={crGrades[i]!.justification} className="text-sm" />
                <MathText text={crGrades[i]!.feedback} className="text-sm" />
              </div>
            )}
            <details>
              <summary className="text-sm text-sky-600 cursor-pointer">Model answer</summary>
              <div className="mt-2">
                <MathText text={item.modelAnswer} className="text-sm" />
              </div>
            </details>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Missed multiple-choice questions</h2>
        {form.mc.map((item, i) =>
          mcAnswers[i] === item.key ? null : (
            <details key={item.id} className="rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 p-4">
              <summary className="text-sm cursor-pointer">
                Q{i + 1} — you answered {mcAnswers[i] === null ? "nothing" : String.fromCharCode(65 + (mcAnswers[i] as number))},
                correct was {String.fromCharCode(65 + item.key)}
              </summary>
              <div className="mt-3 space-y-2">
                <MathText text={item.stem} className="text-sm" />
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
                  <MathText text={item.workedSolution} className="text-sm" />
                </div>
              </div>
            </details>
          )
        )}
      </section>

      <Link href="/" className="inline-block px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700">
        Back to overview
      </Link>
    </div>
  );
}
