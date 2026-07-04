"use client";

import { useEffect, useState } from "react";
import type { MCItem } from "@/lib/types";
import { SUBDOMAINS } from "@/content/smr";
import { addFlag } from "@/lib/storage";
import ChoiceList from "./ChoiceList";
import Figure from "./Figure";
import MathText from "./MathText";
import TutorChat from "./TutorChat";

interface Props {
  item: MCItem;
  /** called once when the user submits an answer */
  onAnswered: (choice: number, correct: boolean, elapsedMs: number) => void;
  onNext: () => void;
  /** advance without answering; falls back to onNext if omitted */
  onSkip?: () => void;
  nextLabel?: string;
}

/** Drill/review-style card: answer, get immediate feedback + worked solution. */
export default function QuestionCard({ item, onAnswered, onNext, onSkip, nextLabel = "Next question" }: Props) {
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
      <Figure svg={item.figure} />

      <ChoiceList
        choices={item.choices}
        selected={selected}
        onSelect={setSelected}
        revealKey={answered ? item.key : null}
      />

      {!answered ? (
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={submit}
              disabled={selected === null}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium disabled:opacity-40 hover:bg-sky-700"
            >
              Check answer
            </button>
            <button
              onClick={onSkip ?? onNext}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 hover:border-sky-400"
              title="Move on without answering — this won't count against your rating"
            >
              Skip
            </button>
          </div>
          <TutorChat item={item} answered={false} />
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
          <button
            onClick={onNext}
            className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700"
          >
            {nextLabel}
          </button>
          <TutorChat item={item} answered userAnswer={selected ?? undefined} />
        </div>
      )}
    </div>
  );
}
