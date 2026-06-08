"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);
    await fetch("/api/refresh", { method: "POST" });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50 flex items-center gap-1 transition-colors"
    >
      <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {loading ? "Refreshing…" : "Refresh"}
    </button>
  );
}
