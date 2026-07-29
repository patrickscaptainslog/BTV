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
import { fetchSkyBrief } from "./lib/skyBrief.js";
import { setSoundEnabled, playChime } from "./audio/sound.js";
import SearchOverlay from "./ui/SearchOverlay.jsx";
import StarPanel from "./ui/StarPanel.jsx";
import Drawer from "./ui/Drawer.jsx";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brief, setBrief] = useState(null); // null | "loading" | text
  const [region, setRegion] = useState(null); // nebula the camera is inside
  const toastTimer = useRef(null);
  const cometRef = useRef(null); // id of entry to animate on next sync
  const tourIdx = useRef(0);

  // --- scene lifecycle
  useEffect(() => {
    const scene = new GalaxyScene(canvasRef.current, {
      onSelect: (id) => {
        if (id) {
          setSelectedId(id);
          playChime("select");
        } else {
          // empty-space tap: first closes the panel, second pulls back
          setSelectedId((prev) => {
            if (!prev) scene.pullBack();
            return null;
          });
        }
      },
    });
    scene.onRegion = setRegion;
    scene.onListPick = (id) => {
      setSelectedId(id);
      scene.focusEntry(id);
      playChime("select");
    };
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

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.selectedFlag = Boolean(selectedId);
  }, [selectedId]);

  // iOS keyboard: lift the capture bar above it via visualViewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${kb}px`);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // --- keyboard: cmd-k search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setDrawerOpen(false);
        setBrief(null);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = useCallback((msg, undoFn) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undoFn });
    toastTimer.current = setTimeout(() => setToast(null), 12000);
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

  const unresolve = useCallback((targetId, resolverId) => {
    dispatch({ type: "unresolve", targetId, resolverId });
    playChime("add");
  }, []);

  const reignite = useCallback((id) => {
    dispatch({ type: "reignite", id });
    playChime("add");
  }, []);

  const flyTo = useCallback((id) => {
    setSearchOpen(false);
    setDrawerOpen(false);
    setSelectedId(id);
    sceneRef.current?.focusEntry(id);
    playChime("select");
  }, []);

  // --- loose ends: each tap orbits to the next open, weighty star
  const looseEnds = entries
    .filter((e) => e.status === "open" && (e.importance ?? 5) + (e.boost ?? 0) >= 6)
    .sort(
      (a, b) =>
        (b.importance ?? 5) + (b.boost ?? 0) - ((a.importance ?? 5) + (a.boost ?? 0)),
    );

  const tourNext = useCallback(() => {
    if (!looseEnds.length) return;
    const target = looseEnds[tourIdx.current % looseEnds.length];
    tourIdx.current += 1;
    flyTo(target.id);
  }, [looseEnds, flyTo]);

  // --- sky brief: Claude narrates the recent sky
  const runBrief = useCallback(async () => {
    if (brief === "loading") return;
    setBrief("loading");
    try {
      const text = await fetchSkyBrief(entries, DEMO_PULSES);
      setBrief(text);
    } catch {
      setBrief("The sky is quiet — the narrator is unreachable right now.");
    }
  }, [brief, entries]);

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
        <div>
          <div className="wordmark">Lifemap</div>
          {region && <div className="region-crumb">◦ {region}</div>}
        </div>
        <div className="controls">
          <button className="iconbtn" onClick={() => setSearchOpen(true)}>
            search <span className="kbd">⌘K</span>
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

      <div className="chips">
        <button className="chip" onClick={runBrief}>
          ✦ sky brief
        </button>
        {looseEnds.length > 0 && (
          <button className="chip" onClick={tourNext}>
            ◉ {looseEnds.length} loose end{looseEnds.length === 1 ? "" : "s"}
          </button>
        )}
        <button className="chip" onClick={() => setDrawerOpen((v) => !v)}>
          ☰ index
        </button>
      </div>

      {brief && (
        <div className="brief glass" onClick={() => brief !== "loading" && setBrief(null)}>
          <div className="brief-head">tonight’s sky</div>
          {brief === "loading" ? (
            <div className="brief-loading">reading the stars…</div>
          ) : (
            <p>{brief}</p>
          )}
        </div>
      )}

      {searchOpen && (
        <SearchOverlay
          entries={entries}
          onPick={flyTo}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {drawerOpen && (
        <Drawer entries={entries} onPick={flyTo} onClose={() => setDrawerOpen(false)} />
      )}

      <StarPanel
        entry={selected}
        resolver={
          selected?.resolvedBy
            ? entries.find((e) => e.id === selected.resolvedBy) ?? null
            : null
        }
        magnitude={selected ? sceneRef.current?.magnitude(selected) : 0}
        onMarkDone={markDone}
        onReignite={reignite}
        onUnresolve={(targetId, resolverId) => {
          unresolve(targetId, resolverId);
          setSelectedId(null);
        }}
        onPullBack={() => {
          setSelectedId(null);
          sceneRef.current?.pullBack();
        }}
        onClose={() => setSelectedId(null)}
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
