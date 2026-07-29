import React from "react";
import { categoryHue } from "../state/palette.js";

export default function StarPanel({ entry, magnitude, onMarkDone, onReignite, onClose }) {
  if (!entry) return null;
  const hue = categoryHue(entry.category);
  const isEmber = entry.status === "done";
  return (
    <aside className="starpanel glass">
      <span className="cat" style={{ color: isEmber ? "#8b91a8" : hue }}>
        {entry.category}
      </span>
      <h2>{entry.title}</h2>
      <p className="summary">{entry.summary}</p>
      {isEmber ? (
        <p className="ember-note">an ember — resolved, still part of the record</p>
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
    </aside>
  );
}
