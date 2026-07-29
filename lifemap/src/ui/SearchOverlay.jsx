import React, { useEffect, useMemo, useRef, useState } from "react";
import { categoryHue } from "../state/palette.js";

export default function SearchOverlay({ entries, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!needle) return pool.slice(0, 8);
    return pool
      .filter((e) =>
        [e.title, e.summary, e.raw, e.category].some((f) => f?.toLowerCase().includes(needle)),
      )
      .slice(0, 12);
  }, [q, entries]);

  useEffect(() => setSel(0), [q]);

  const onKey = (e) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, results.length - 1));
    else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
    else if (e.key === "Enter" && results[sel]) onPick(results[sel].id);
  };

  return (
    <div className="search-veil" onClick={onClose}>
      <div className="search-box glass" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          placeholder="Search your sky…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <ul>
          {results.length === 0 && <li className="empty">no stars match “{q}”</li>}
          {results.map((e, i) => (
            <li
              key={e.id}
              className={`${i === sel ? "sel" : ""} ${e.status === "done" ? "done" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => onPick(e.id)}
            >
              <span className="dot" style={{ background: categoryHue(e.category) }} />
              <span className="t">{e.title}</span>
              <span className="c">{e.category}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
