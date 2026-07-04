"use client";

import { useEffect, useState } from "react";
import { getItem } from "@/lib/bank";
import { applyAttempt } from "@/lib/elo";
import { dueItems, reviewAttempt } from "@/lib/scheduler";
import { addAttempt, getRatings, getReviewStates, setRatings, setReviewState } from "@/lib/storage";
import type { MCItem } from "@/lib/types";
import QuestionCard from "@/components/QuestionCard";

export default function ReviewPage() {
  const [queue, setQueue] = useState<MCItem[] | null>(null);

  const loadQueue = () => {
    const ids = dueItems(getReviewStates(), Date.now());
    const items = ids.map((id) => getItem(id)).filter((i): i is MCItem => !!i && i.type === "mc");
    setQueue(items);
  };

  useEffect(loadQueue, []);

  if (queue === null) return null;

  if (queue.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-bold text-lg">Review queue</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Nothing due. Missed questions come back here on a spaced schedule (same day, then 1 day, then stretching
          out) until you&apos;ve mastered them.
        </p>
      </div>
    );
  }

  const item = queue[0];

  const onAnswered = (choice: number, correct: boolean, elapsed: number) => {
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
      mode: "review",
    });
    const state = getReviewStates()[item.id];
    if (state) setReviewState(item.id, reviewAttempt(state, correct, Date.now()));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg">Review queue</h1>
        <span className="text-sm text-slate-500">{queue.length} due</span>
      </div>
      <QuestionCard
        item={item}
        onAnswered={onAnswered}
        onNext={() => setQueue(queue.slice(1))}
        // Skip leaves the item due (nothing recorded) and rotates it to the
        // end of this session's queue so it comes back after the rest.
        onSkip={() => setQueue(queue.length > 1 ? [...queue.slice(1), queue[0]] : queue)}
        nextLabel={queue.length > 1 ? "Next review" : "Done"}
      />
    </div>
  );
}
