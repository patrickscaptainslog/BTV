"use client";

import { useEffect, useRef, useState } from "react";
import type { MCItem } from "@/lib/types";
import MathText from "./MathText";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  item: MCItem;
  answered: boolean;
  userAnswer?: number;
}

/**
 * Conversational tutor scoped to the current question. Quick actions seed
 * the thread; free-form input lets the student ask anything. Before
 * answering, the server refuses to reveal the key.
 */
export default function TutorChat({ item, answered, userAnswer }: Props) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // New question → fresh conversation.
    setMessages([]);
    setInput("");
    setError(null);
    setOpen(false);
  }, [item.id]);

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  const send = async (content: string) => {
    if (!content.trim() || loading) return;
    const thread: ChatTurn[] = [...messages, { role: "user", content: content.trim() }];
    setMessages(thread);
    setInput("");
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, answered, userAnswer, messages: thread }),
      });
      if (res.status === 401) {
        setError("Sign in on the Login page to use the AI tutor.");
        return;
      }
      if (!res.ok) {
        setError("Tutor is unavailable right now — try again in a moment.");
        return;
      }
      const data = (await res.json()) as { text: string };
      setMessages([...thread, { role: "assistant", content: data.text }]);
    } catch {
      setError("Tutor is unavailable right now — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const quickActions = answered
    ? [
        { label: "🧑‍🏫 Explain it differently", prompt: "Can you explain the solution a different way than the worked solution does?" },
        ...(typeof userAnswer === "number" && userAnswer !== item.key
          ? [{ label: "🤔 Why was my answer wrong?", prompt: "Why exactly was the answer I chose wrong? What misconception does it represent?" }]
          : []),
        { label: "🔁 What should I practice?", prompt: "What underlying skill does this question test, and what should I practice if I found it hard?" },
      ]
    : [
        { label: "💡 Get a hint", prompt: "Give me a hint to get started — don't reveal the answer." },
        { label: "📖 Explain the concept", prompt: "Explain the concept this question is testing, without giving away the answer." },
      ];

  return (
    <div className="space-y-2">
      {messages.length === 0 && (
        <div className="flex gap-2 flex-wrap">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              onClick={() => send(qa.prompt)}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:border-sky-400 disabled:opacity-50"
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {open && messages.length > 0 && (
        <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30 p-3 space-y-2 max-h-96 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                  m.role === "user"
                    ? "bg-sky-600 text-white"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {m.role === "user" ? <span>{m.content}</span> : <MathText text={m.content} />}
              </div>
            </div>
          ))}
          {loading && <div className="text-xs text-slate-500 pl-1">Tutor is thinking…</div>}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <div className="text-xs text-red-600">{error}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={answered ? "Ask the tutor anything about this question…" : "Ask the tutor (it won't spoil the answer)…"}
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-sky-700"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
