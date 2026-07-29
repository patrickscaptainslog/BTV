// PLACEHOLDER — the lifemap-cinematic.jsx prototype was not received in this
// session (the attachment never arrived). When it's available, save it as
// src/LifemapCinematic.jsx, point its classify() fetch at "/api/classify"
// (see src/lib/classify.js), and render it here instead of this shell.
import React from "react";

export default function App() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#888",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div>
        <h1 style={{ color: "#ccc", fontWeight: 300 }}>Lifemap</h1>
        <p>
          Scaffold is running. Drop the prototype in as{" "}
          <code>src/LifemapCinematic.jsx</code> and wire it into{" "}
          <code>src/App.jsx</code>.
        </p>
        <p style={{ fontSize: "0.85rem" }}>
          three@0.128 and tone are installed; the Anthropic call goes through{" "}
          <code>POST /api/classify</code>.
        </p>
      </div>
    </div>
  );
}
