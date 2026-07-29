import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { GalaxyScene } from "./three/GalaxyScene.js";
import { entriesReducer, loadEntries, saveEntries } from "./state/entries.js";
import { DEMO_PULSES } from "./state/demoData.js";
import { classifyEntry } from "./lib/classifyEntry.js";
import { setSoundEnabled, playChime } from "./audio/sound.js";
import SearchOverlay from "./ui/SearchOverlay.jsx";
import StarPanel from "./ui/StarPanel.jsx";
import "./styles.css";

let nextId = () => `e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [entries, dispatch] = useReducer(entriesReducer, undefined, loadEntries);
  const [selectedId, setSelectedId] = useState(null);
  const [layout, setLayout] = useState("nebulae");
  const [sound, setSound] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const toastTimer = useRef(null);
  const cometRef = useRef(null); // id of entry to animate on next sync

  // --- scene lifecycle
  useEffect(() => {
    const scene = new GalaxyScene(canvasRef.current, {
      onSelect: (id) => {
        setSelectedId(id);
        if (id) playChime("select");
      },
    });
    scene.setPulses(DEMO_PULSES);
    sceneRef.current = scene;
    return () => scene.dispose();
  }, []);

  // --- sync entries -> scene + storage
  useEffect(() => {
    saveEntries(entries);
    const cometFor = cometRef.current;
    cometRef.current = null;
    sceneRef.current?.setEntries(entries, cometFor ? { cometFor } : {});
  }, [entries]);

  useEffect(() => {
    sceneRef.current?.setLayout(layout);
  }, [layout]);

  // --- keyboard: cmd-k search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = useCallback((msg, undoFn) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undoFn });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }, []);

  // --- capture: classify, add star via comet, maybe auto-resolve
  const submit = useCallback(async () => {
    const raw = draft.trim();
    if (!raw || pending) return;
    setPending(true);
    try {
      const c = await classifyEntry(raw, entries);
      const entry = {
        id: nextId(),
        title: c.title,
        category: c.category,
        importance: c.importance,
        boost: 0,
        summary: c.summary,
        status: "open",
        raw,
        createdAt: new Date().toISOString(),
        ...(c.resolvesId ? { resolvesId: c.resolvesId } : {}),
      };
      cometRef.current = entry.id;
      dispatch({ type: "add", entry });
      playChime("add");
      setDraft("");

      if (c.resolvesId) {
        const target = entries.find((e) => e.id === c.resolvesId);
        // auto-resolution is always visible and reversible
        dispatch({ type: "resolve", targetId: c.resolvesId, resolverId: entry.id });
        setTimeout(() => sceneRef.current?.emberize(c.resolvesId), 1800);
        playChime("resolve");
        showToast(`Closed: ${target?.title ?? "an earlier entry"}`, () => {
          dispatch({ type: "unresolve", targetId: c.resolvesId, resolverId: entry.id });
        });
      }
    } finally {
      setPending(false);
    }
  }, [draft, pending, entries, showToast]);

  const markDone = useCallback(
    (id) => {
      const target = entries.find((e) => e.id === id);
      dispatch({ type: "markDone", id });
      sceneRef.current?.emberize(id);
      playChime("resolve");
      showToast(`Marked done: ${target?.title ?? ""}`, () =>
        dispatch({ type: "reignite", id }),
      );
      setSelectedId(null);
    },
    [entries, showToast],
  );

  const reignite = useCallback((id) => {
    dispatch({ type: "reignite", id });
    playChime("add");
  }, []);

  const pickFromSearch = useCallback((id) => {
    setSearchOpen(false);
    setSelectedId(id);
    sceneRef.current?.focusEntry(id);
    playChime("select");
  }, []);

  const toggleSound = useCallback(async () => {
    const next = !sound;
    setSound(next);
    await setSoundEnabled(next);
  }, [sound]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  return (
    <>
      <div className="stage">
        <canvas ref={canvasRef} />
      </div>

      <header className="topbar">
        <div className="wordmark">Lifemap</div>
        <div className="controls">
          <button className="iconbtn" onClick={() => setSearchOpen(true)}>
            search ⌘K
          </button>
          <button
            className={`iconbtn ${layout === "time" ? "active" : ""}`}
            onClick={() => setLayout(layout === "time" ? "nebulae" : "time")}
            title="Toggle time-spine layout"
          >
            {layout === "time" ? "timeline" : "nebulae"}
          </button>
          <button className={`iconbtn ${sound ? "active" : ""}`} onClick={toggleSound}>
            {sound ? "sound on" : "sound off"}
          </button>
        </div>
      </header>

      <StarPanel
        entry={selected}
        magnitude={selected ? sceneRef.current?.magnitude(selected) : 0}
        onMarkDone={markDone}
        onReignite={reignite}
        onClose={() => {
          setSelectedId(null);
          sceneRef.current?.pullBack();
        }}
      />

      <form
        className="capture glass"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {pending && <div className="pending" />}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Drop anything — it files itself…"
          disabled={pending}
        />
        <button type="submit" disabled={!draft.trim() || pending}>
          Add
        </button>
      </form>

      {toast && (
        <div className="toast glass">
          <span>{toast.msg}</span>
          {toast.undoFn && (
            <button
              onClick={() => {
                toast.undoFn();
                setToast(null);
              }}
            >
              UNDO
            </button>
          )}
        </div>
      )}

      <div className="hint">drag to orbit · scroll to zoom · tap a star</div>
    </>
  );
}
