"use client";

import { useEffect, useState } from "react";
import { CR_BANK } from "@/lib/bank";
import { getCRPractice, addCRPracticeAttempt } from "@/lib/storage";
import { DOMAINS, SUBTEST_INFO } from "@/content/smr";
import { CR_SCORE_DESCRIPTIONS } from "@/content/rubric";
import type { CRGrade, CRItem, CRPracticeState, Subtest } from "@/lib/types";
import MathText from "@/components/MathText";

function bestScore(state: CRPracticeState | undefined): number | null {
  if (!state || state.attempts.length === 0) return null;
  return Math.max(...state.attempts.map((a) => a.score));
}

export default function WritingPage() {
  const [practice, setPractice] = useState<Record<string, CRPracticeState>>({});
  const [active, setActive] = useState<CRItem | null>(null);

  useEffect(() => setPractice(getCRPractice()), []);

  if (active) {
    return (
      <Workspace
        item={active}
        state={practice[active.id]}
        onBack={() => {
          setPractice(getCRPractice());
          setActive(null);
        }}
        onGraded={() => setPractice(getCRPractice())}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-lg">Constructed-response gym</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          CRs are ~30% of your score and the part most people under-train. Write a full response, get it graded
          against the CTC-style rubric, then <strong>revise and resubmit until you earn a 4</strong> — the revision
          loop is where the skill builds.
        </p>
      </div>
      {([1, 2] as Subtest[]).map((st) => (
        <section key={st} className="space-y-2">
          <h2 className="font-semibold">{SUBTEST_INFO[st].name}</h2>
          <div className="space-y-2">
            {CR_BANK.filter((i) => i.subtest === st).map((item) => {
              const best = bestScore(practice[item.id]);
              const attempts = practice[item.id]?.attempts.length ?? 0;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item)}
                  className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-sky-400 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1">
                      {item.subdomain} {DOMAINS[item.domain].name}
                    </div>
                    <div className="text-sm truncate">{item.stem.split("\n")[0].replace(/\$/g, "")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {best !== null ? (
                      <span
                        className={`font-bold text-lg ${best === 4 ? "text-green-600" : best === 3 ? "text-amber-600" : "text-red-600"}`}
                      >
                        {best}/4
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">not attempted</span>
                    )}
                    {attempts > 0 && <div className="text-[10px] text-slate-400">{attempts} attempt{attempts > 1 ? "s" : ""}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Workspace({
  item,
  state,
  onBack,
  onGraded,
}: {
  item: CRItem;
  state: CRPracticeState | undefined;
  onBack: () => void;
  onGraded: () => void;
}) {
  const previous = state?.attempts ?? [];
  const [response, setResponse] = useState(previous.length > 0 ? previous[previous.length - 1].response : "");
  const [grade, setGrade] = useState<CRGrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!response.trim() || busy) return;
    setBusy(true);
    setError(null);
    setGrade(null);
    try {
      const res = await fetch("/api/grade-cr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, response }),
      });
      if (res.status === 401) {
        setError("Sign in on the Login page to use AI grading.");
        return;
      }
      if (!res.ok) {
        setError("Grading is unavailable right now — try again in a minute.");
        return;
      }
      const g = (await res.json()) as CRGrade;
      setGrade(g);
      addCRPracticeAttempt(item.id, {
        response,
        score: g.score,
        justification: g.justification,
        feedback: g.feedback,
        at: Date.now(),
      });
      onGraded();
    } catch {
      setError("Grading is unavailable right now — try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  const hasBeenGraded = previous.length > 0 || grade !== null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-sky-600 hover:underline">
        ← All prompts
      </button>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="text-xs text-slate-500">
          {item.subdomain} {DOMAINS[item.domain].name} · scored on the 4-point focused holistic scale
        </div>
        <MathText text={item.stem} />
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={14}
          placeholder="Write your complete response. State your strategy, justify every step, and check your result. You can write LaTeX like $x^2$."
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm font-mono"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={busy || !response.trim()}
            className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium disabled:opacity-40 hover:bg-sky-700"
          >
            {busy ? "Grading…" : grade || previous.length > 0 ? "Resubmit revision" : "Submit for grading"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {grade && (
        <div
          className={`rounded-xl border p-5 space-y-2 ${
            grade.score === 4
              ? "border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
              : "border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30"
          }`}
        >
          <div className="font-bold">
            Score: {grade.score}/4 — {CR_SCORE_DESCRIPTIONS[grade.score]}
          </div>
          <MathText text={grade.justification} className="text-sm" />
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-1">To reach a 4</div>
          <MathText text={grade.feedback} className="text-sm" />
          {grade.score < 4 && (
            <p className="text-sm font-medium pt-1">Now revise your response above and resubmit. 👆</p>
          )}
        </div>
      )}

      {hasBeenGraded && (
        <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <summary className="text-sm text-sky-600 cursor-pointer font-medium">Model 4-score response</summary>
          <div className="mt-3">
            <MathText text={item.modelAnswer} className="text-sm" />
          </div>
        </details>
      )}

      {previous.length > 0 && (
        <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <summary className="text-sm text-slate-500 cursor-pointer">
            Attempt history ({previous.length})
          </summary>
          <div className="mt-3 space-y-3">
            {previous
              .slice()
              .reverse()
              .map((a, i) => (
                <div key={i} className="border-l-2 border-slate-300 dark:border-slate-700 pl-3">
                  <div className="text-xs text-slate-500">
                    {new Date(a.at).toLocaleString()} — scored {a.score}/4
                  </div>
                  <pre className="text-xs whitespace-pre-wrap font-sans mt-1 text-slate-600 dark:text-slate-400 max-h-40 overflow-y-auto">
                    {a.response}
                  </pre>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
