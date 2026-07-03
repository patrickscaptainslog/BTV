"use client";

import { useEffect, useState } from "react";
import type { MCItem } from "@/lib/types";
import { SUBDOMAINS } from "@/content/smr";
import { addFlag } from "@/lib/storage";
import ChoiceList from "./ChoiceList";
import MathText from "./MathText";
import TutorPanel from "./TutorPanel";

interface Props {
  item: MCItem;
  /** called once when the user submits an answer */
  onAnswered: (choice: number, correct: boolean, elapsedMs: number) => void;
  onNext: () => void;
  nextLabel?: string;
}

/** Drill/review-style card: answer, get immediate feedback + worked solution. */
export default function QuestionCard({ item, onAnswered, onNext, nextLabel = "Next question" }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());

  useEffect(() => {
    setSelected(null);
    setAnswered(false);
    setFlagged(false);
    setStartedAt(Date.now());
  }, [item.id]);

  const submit = () => {
    if (selected === null || answered) return;
    setAnswered(true);
    onAnswered(selected, selected === item.key, Date.now() - startedAt);
  };

  const correct = answered && selected === item.key;
  const sub = SUBDOMAINS[item.subdomain];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {sub.code} {sub.name}
        </span>
        <button
          onClick={() => {
            addFlag({ itemId: item.id, reason: "flagged from question card", at: Date.now() });
            setFlagged(true);
          }}
          className="hover:text-amber-600"
          title="Flag this question as possibly wrong or unclear"
        >
          {flagged ? "🚩 Flagged" : "⚑ Flag"}
        </button>
      </div>

      <MathText text={item.stem} className="text-base" />

      <ChoiceList
        choices={item.choices}
        selected={selected}
        onSelect={setSelected}
        revealKey={answered ? item.key : null}
      />

      {!answered ? (
        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={selected === null}
            className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium disabled:opacity-40 hover:bg-sky-700"
          >
            Check answer
          </button>
          <TutorPanel item={item} mode="hint" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`font-semibold ${correct ? "text-green-600" : "text-red-600"}`}>
            {correct ? "Correct." : `Not quite — the answer is ${String.fromCharCode(65 + item.key)}.`}
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Worked solution</div>
            <MathText text={item.workedSolution} className="text-sm" />
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={onNext}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700"
            >
              {nextLabel}
            </button>
            <TutorPanel item={item} mode="explain" userAnswer={selected ?? undefined} />
          </div>
        </div>
      )}
    </div>
  );
}
