// Entry store: reducer + a storage adapter. localStorage today; the adapter
// surface (load/save) is what a Supabase implementation replaces next slice.

const STORAGE_KEY = "lifemap-entries-v1";

const day = 1000 * 60 * 60 * 24;
const ago = (d, h = 0) => new Date(Date.now() - d * day - h * 3600e3).toISOString();

export const SEED_ENTRIES = [
  { id: "s1", title: "Fix the leak at Mission St", category: "To Do", importance: 7, boost: 0, summary: "Kitchen sink leak at the Mission St house needs a plumber.", status: "open", raw: "the kitchen sink at mission st is leaking again, need to deal with it", createdAt: ago(9) },
  { id: "s2", title: "Watch Perfect Days", category: "Watch", importance: 4, boost: 0, summary: "Wim Wenders film recommendation from Nina.", status: "open", raw: "nina says perfect days is a must watch", createdAt: ago(12) },
  { id: "s3", title: "Galaxy journal app idea", category: "Ideas", importance: 9, boost: 0, summary: "A journal that files itself into a living galaxy.", status: "open", raw: "what if the journal organized itself... a galaxy of your life", createdAt: ago(21) },
  { id: "s4", title: "Try the tasting menu at Osito", category: "Eat & Drink", importance: 5, boost: 0, summary: "Live-fire tasting menu, book ahead.", status: "open", raw: "osito tasting menu - book ahead", createdAt: ago(17) },
  { id: "s5", title: "Room assignments for September", category: "Work", importance: 8, boost: 0, summary: "Sort out who goes in which room across 15th and Mission for the Sept move-ins.", status: "open", raw: "need to finalize sept move-ins across 15th and mission", createdAt: ago(3) },
  { id: "s6", title: "Call grandma", category: "To Do", importance: 6, boost: 0, summary: "It's been a few weeks.", status: "open", raw: "call grandma, been too long", createdAt: ago(5) },
  { id: "s7", title: "Why do I avoid mornings?", category: "On My Mind", importance: 6, boost: 0, summary: "Recurring thought about morning avoidance and sleep debt.", status: "open", raw: "keep noticing i schedule everything after noon. why", createdAt: ago(8) },
  { id: "s8", title: "Renew car registration", category: "To Do", importance: 5, boost: 0, summary: "DMV registration renewal was due.", status: "done", raw: "car reg due", createdAt: ago(20) },
  { id: "s9", title: "Registration renewed online", category: "To Do", importance: 3, boost: 0, summary: "Handled the DMV renewal online.", status: "done", raw: "did the car registration online, easy", createdAt: ago(15), resolvesId: "s8" },
  { id: "s10", title: "Learn GLSL properly", category: "Ideas", importance: 5, boost: 0, summary: "Shader skills for the galaxy renderer.", status: "open", raw: "should actually learn glsl instead of cargo-culting shaders", createdAt: ago(11) },
  { id: "s11", title: "Dim sum with Dad", category: "Eat & Drink", importance: 7, boost: 0, summary: "Plan a dim sum weekend with Dad.", status: "open", raw: "take dad for dim sum soon", createdAt: ago(6) },
  { id: "s12", title: "Pulse notification cadence", category: "Work", importance: 4, boost: 0, summary: "Rethink pulse pings — hourly felt like a lot.", status: "open", raw: "pulse pings maybe too frequent, felt naggy by day 3", createdAt: ago(2) },
  { id: "s13", title: "The Rehearsal season two", category: "Watch", importance: 3, boost: 0, summary: "Everyone keeps referencing it.", status: "open", raw: "the rehearsal s2, apparently unhinged", createdAt: ago(14) },
  { id: "s14", title: "Twenty-six things about turning 26", category: "On My Mind", importance: 8, boost: 0, summary: "Birthday reflection long-form entry.", status: "open", raw: "turning 26 thoughts...", createdAt: ago(1) },
];

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
  return SEED_ENTRIES;
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
