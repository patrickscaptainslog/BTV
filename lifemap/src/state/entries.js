// Entry store: reducer + a storage adapter. localStorage today; the adapter
// surface (load/save) is what a Supabase implementation replaces next slice.

import { DEMO_ENTRIES } from "./demoData.js";

const STORAGE_KEY = "lifemap-entries-v2";

export function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* fall through to seeds */
  }
  return DEMO_ENTRIES;
}

export function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage full or unavailable — in-memory only */
  }
}

export function entriesReducer(state, action) {
  switch (action.type) {
    case "add":
      return [...state, action.entry];
    case "resolve":
      // action.resolverId reports completion of action.targetId
      return state.map((e) =>
        e.id === action.targetId ? { ...e, status: "done", resolvedBy: action.resolverId } : e,
      );
    case "unresolve":
      return state.map((e) => {
        if (e.id === action.targetId) {
          const { resolvedBy, ...rest } = e;
          return { ...rest, status: "open" };
        }
        if (e.id === action.resolverId) {
          const { resolvesId, ...rest } = e;
          return rest;
        }
        return e;
      });
    case "markDone":
      return state.map((e) => (e.id === action.id ? { ...e, status: "done" } : e));
    case "reignite":
      // reopening is an orbit signal — the star grows
      return state.map((e) =>
        e.id === action.id ? { ...e, status: "open", boost: Math.min(3, (e.boost ?? 0) + 1) } : e,
      );
    case "boost":
      return state.map((e) =>
        e.id === action.id ? { ...e, boost: Math.min(3, (e.boost ?? 0) + 1) } : e,
      );
    default:
      return state;
  }
}
