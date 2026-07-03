"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Login failed — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="font-bold text-lg">Sign in</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The AI tutor and constructed-response grading call the Anthropic API, so they&apos;re gated behind a
        password. Practice questions work without signing in.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="w-full px-4 py-2 rounded-lg bg-sky-600 text-white font-medium disabled:opacity-40 hover:bg-sky-700"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
