"use client";

import { useState } from "react";
import type { MCItem } from "@/lib/types";
import MathText from "./MathText";

interface Props {
  item: MCItem;
  mode: "hint" | "explain";
  userAnswer?: number;
}

/** Ask-the-tutor button: hint before answering, deeper explanation after. */
export default function TutorPanel({ item, mode, userAnswer }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, mode, userAnswer }),
      });
      if (res.status === 401) {
        setError("Sign in on the Login page to use the AI tutor.");
        return;
      }
      if (!res.ok) {
        setError("Tutor is unavailable right now.");
        return;
      }
      const data = (await res.json()) as { text: string };
      setText(data.text);
    } catch {
      setError("Tutor is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1">
      {text === null ? (
        <button
          onClick={ask}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:border-sky-400 disabled:opacity-50"
        >
          {loading ? "Thinking…" : mode === "hint" ? "💡 Get a hint" : "🧑‍🏫 Explain it differently"}
        </button>
      ) : (
        <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300 mb-1">
            {mode === "hint" ? "Hint" : "Tutor"}
          </div>
          <MathText text={text} className="text-sm" />
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}
