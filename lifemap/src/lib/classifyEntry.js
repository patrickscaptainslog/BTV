import { classify } from "./classify.js";
import { CATEGORY_HUES } from "../state/palette.js";

// Resolution pipeline per CLAUDE.md: shortlist ~10 open candidates, Claude
// picks or declines. Lexical scoring stands in for pgvector until Supabase
// lands — same contract, swappable.
function shortlistCandidates(raw, entries, max = 10) {
  const tokens = tokenize(raw);
  return entries
    .filter((e) => e.status === "open")
    .map((e) => {
      const target = new Set([...tokenize(e.raw), ...tokenize(e.title)]);
      const overlap = tokens.filter((t) => target.has(t)).length;
      return { e, score: overlap / Math.max(4, tokens.length) };
    })
    .filter((c) => c.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

const STOP = new Set("the a an is are was were to of at in on for and or i my me it this that with need should".split(" "));
function tokenize(s) {
  return (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((t) => !STOP.has(t) && t.length > 2);
}

function buildSystem(categories) {
  return `You are the filing engine for Lifemap, a journal that organizes itself.
Given a raw journal entry, return ONLY strict JSON (no prose, no markdown fences):
{"title": string, "category": string, "importance": number, "summary": string, "resolvesId": string | null}

Rules:
- title: at most 6 words, evocative but plain.
- category: STRONGLY prefer one of the existing categories: ${JSON.stringify(categories)}. Only invent a new one (1-2 words, title case) if nothing fits at all.
- importance: 1-10, inferred from the language's urgency and emotional weight. Mundane logistics ~3-5; things with real emotional or practical stakes 6-8; reserve 9-10 for rare heavy entries.
- summary: one line, third person, no fluff.
- resolvesId: if this entry reports COMPLETING or resolving one of the open candidates provided, return that candidate's id. Only when clearly the same matter. Otherwise null.`;
}

export async function classifyEntry(raw, entries) {
  const categories = [
    ...new Set([...Object.keys(CATEGORY_HUES), ...entries.map((e) => e.category)]),
  ];
  const candidates = shortlistCandidates(raw, entries).map(({ e }) => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
  }));

  try {
    const text = await classify({
      system: buildSystem(categories),
      messages: [
        {
          role: "user",
          content: `Entry: ${JSON.stringify(raw)}\nOpen candidates it might resolve: ${JSON.stringify(candidates)}`,
        },
      ],
    });
    const parsed = JSON.parse(text);
    return normalize(parsed, raw, entries, candidates);
  } catch (err) {
    console.warn("classify() unavailable, using local heuristic:", err.message);
    return heuristicClassify(raw, entries, candidates);
  }
}

function normalize(p, raw, entries, candidates) {
  const validIds = new Set(candidates.map((c) => c.id));
  return {
    title: String(p.title ?? raw.slice(0, 40)).trim(),
    category: String(p.category ?? "On My Mind").trim(),
    importance: Math.max(1, Math.min(10, Math.round(Number(p.importance) || 5))),
    summary: String(p.summary ?? raw).trim(),
    resolvesId: validIds.has(p.resolvesId) ? p.resolvesId : null,
    classifiedBy: "claude",
  };
}

// Keyless/offline fallback so the app never hard-fails on capture
function heuristicClassify(raw, entries, candidates) {
  const lower = raw.toLowerCase();
  const rules = [
    ["Watch", /\b(watch|movie|film|series|show|episode|trailer)\b/],
    ["Eat & Drink", /\b(eat|dinner|lunch|restaurant|recipe|coffee|bar|drink|menu)\b/],
    ["Work", /\b(work|meeting|deadline|client|tenant|lease|room|invoice|ship)\b/],
    ["To Do", /\b(fix|call|buy|renew|schedule|book|clean|send|pay|todo|need to)\b/],
    ["Ideas", /\b(idea|what if|concept|build|prototype|imagine)\b/],
  ];
  const category = rules.find(([, re]) => re.test(lower))?.[0] ?? "On My Mind";
  const urgency = /\b(urgent|asap|now|today|!!|must)\b/.test(lower) ? 2 : 0;
  const emotion = /\b(love|hate|scared|excited|worried|amazing|awful)\b/.test(lower) ? 1 : 0;
  const importance = Math.max(1, Math.min(10, 4 + urgency + emotion + (raw.length > 120 ? 1 : 0)));
  const doneSignal = /\b(fixed|done|finished|resolved|completed|handled|solved)\b/.test(lower);
  const resolvesId = doneSignal && candidates.length ? candidates[0].id : null;
  const words = raw.trim().split(/\s+/);
  return {
    title: words.slice(0, 6).join(" "),
    category,
    importance,
    summary: raw.length > 90 ? raw.slice(0, 87) + "…" : raw,
    resolvesId,
    classifiedBy: "local",
  };
}
