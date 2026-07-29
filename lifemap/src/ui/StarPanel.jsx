import React, { useState } from "react";
import { categoryHue } from "../state/palette.js";

function relativeDate(iso) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days <= 0) return `${when} · today`;
  if (days === 1) return `${when} · yesterday`;
  return `${when} · ${days} days ago`;
}

export default function StarPanel({
  entry,
  resolver,
  magnitude,
  onMarkDone,
  onReignite,
  onUnresolve,
  onPullBack,
  onClose,
}) {
  const [showRaw, setShowRaw] = useState(false);
  if (!entry) return null;
  const hue = categoryHue(entry.category);
  const isEmber = entry.status === "done";
  return (
    <aside className="starpanel glass">
      <span className="cat" style={{ color: isEmber ? "#8b91a8" : hue }}>
        {entry.category}
      </span>
      <h2>{entry.title}</h2>
      <div className="date">{relativeDate(entry.createdAt)}</div>
      <p className="summary">{entry.summary}</p>
      {entry.raw && entry.raw !== entry.summary && (
        <button className="rawtoggle" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? "hide original" : "show original"}
        </button>
      )}
      {showRaw && <p className="raw">“{entry.raw}”</p>}
      {isEmber ? (
        <p className="ember-note">
          {resolver ? (
            <>
              closed by “{resolver.title}”{" "}
              <button className="linkbtn" onClick={() => onUnresolve(entry.id, resolver.id)}>
                undo
              </button>
            </>
          ) : (
            "an ember — resolved, still part of the record"
          )}
        </p>
      ) : (
        <p className="mag">
          magnitude <b>{magnitude}</b>
          {entry.boost > 0 ? ` · grown +${entry.boost}` : ""}
        </p>
      )}
      <div className="actions">
        {isEmber ? (
          <button onClick={() => onReignite(entry.id)}>Reignite</button>
        ) : (
          <button onClick={() => onMarkDone(entry.id)}>Mark done</button>
        )}
        <button onClick={onClose}>Close</button>
      </div>
      <button className="skyreturn" onClick={onPullBack}>
        ↩ back to the whole sky
      </button>
    </aside>
  );
}
