"use client";

import { useEffect, useState } from "react";
import { getItem } from "@/lib/bank";
import { getFlags, removeFlag } from "@/lib/storage";
import type { FlagEntry } from "@/lib/types";
import MathText from "@/components/MathText";

export default function FlagsPage() {
  const [flags, setFlags] = useState<FlagEntry[] | null>(null);

  useEffect(() => setFlags(getFlags()), []);

  if (flags === null) return null;

  return (
    <div className="space-y-4">
      <h1 className="font-bold text-lg">Flagged questions</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Questions you flagged as possibly wrong, ambiguous, or unclear. Export this list and report it so the bank
        can be fixed — a bad item is worse than no item.
      </p>
      {flags.length === 0 ? (
        <p className="text-slate-500">No flags. 🎉</p>
      ) : (
        <>
          <button
            className="text-xs underline text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            onClick={() => {
              const blob = new Blob([JSON.stringify(flags, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "cset-flags.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export flags as JSON
          </button>
          <div className="space-y-3">
            {flags.map((f) => {
              const item = getItem(f.itemId);
              return (
                <div key={f.itemId} className="rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 p-4 space-y-2">
                  <div className="flex justify-between items-start gap-3">
                    <span className="text-xs font-mono text-slate-500">{f.itemId}</span>
                    <button className="text-xs text-slate-500 underline hover:text-red-600" onClick={() => {
                      removeFlag(f.itemId);
                      setFlags(getFlags());
                    }}>
                      Remove flag
                    </button>
                  </div>
                  {item ? <MathText text={item.stem} className="text-sm" /> : <p className="text-sm text-slate-500">(item no longer in bank)</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
