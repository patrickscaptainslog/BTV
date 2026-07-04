"use client";

import { useEffect, useState } from "react";

interface Props {
  /** epoch ms when the exam must end */
  endsAt: number;
  onExpire: () => void;
}

export default function ExamTimer({ endsAt, onExpire }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, endsAt - now);

  useEffect(() => {
    if (remaining === 0) onExpire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === 0]);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const low = remaining < 10 * 60000;

  return (
    <span
      className={`font-mono text-sm px-2 py-1 rounded ${
        low ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-slate-100 dark:bg-slate-800"
      }`}
    >
      {h}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
