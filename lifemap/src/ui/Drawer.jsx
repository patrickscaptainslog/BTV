import React, { useMemo, useState } from "react";
import { categoryHue } from "../state/palette.js";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "done", label: "Embers" },
];

export default function Drawer({ entries, onPick, onClose }) {
  const [filter, setFilter] = useState("open");

  const rows = useMemo(() => {
    const pool = [...entries].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
    if (filter === "all") return pool;
    if (filter === "done") return pool.filter((e) => e.status === "done");
    return pool.filter((e) => e.status === "open");
  }, [entries, filter]);

  return (
    <div className="drawer glass">
      <div className="drawer-head">
        <div className="drawer-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "on" : ""}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="drawer-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <ul>
        {rows.map((e) => (
          <li
            key={e.id}
            className={e.status === "done" ? "done" : ""}
            onClick={() => onPick(e.id)}
          >
            <span className="dot" style={{ background: categoryHue(e.category) }} />
            <span className="t">{e.title}</span>
            <span className="c">
              {e.category} · {Math.min(10, (e.importance ?? 5) + (e.boost ?? 0))}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="empty">nothing here</li>}
      </ul>
    </div>
  );
}
