import { Prediction, WorldEvent, WorldState } from './types';

/**
 * Pythia's /agent/view returns { summary, domains, events, predictions, ... }
 * but events may arrive as a flat array or grouped by domain, and timestamps
 * may be epoch ms, epoch seconds, or ISO strings depending on the feed.
 * Normalize all of it into a flat, deduplicated WorldEvent list.
 */

function toEpochMs(ts: unknown): number {
  if (typeof ts === 'number') {
    // epoch seconds vs milliseconds
    return ts < 1e12 ? ts * 1000 : ts;
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return parsed;
    const asNum = Number(ts);
    if (!Number.isNaN(asNum)) return toEpochMs(asNum);
  }
  return Date.now();
}

function toNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function normalizeEvent(raw: any, fallbackCategory = 'general'): WorldEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const lat = toNumber(raw.lat ?? raw.latitude);
  const lng = toNumber(raw.lng ?? raw.lon ?? raw.longitude);
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const title = String(raw.title ?? raw.name ?? raw.headline ?? '').trim();
  if (!title) return null;
  const ts = toEpochMs(raw.ts ?? raw.time ?? raw.timestamp ?? raw.date);
  const salienceRaw = toNumber(raw.salience ?? raw.severity ?? raw.score);
  const salience = salienceRaw === null ? 0.4 : Math.max(0, Math.min(1, salienceRaw > 1 ? salienceRaw / 100 : salienceRaw));
  const category = String(raw.category ?? raw.domain ?? raw.type ?? fallbackCategory).toLowerCase();
  return {
    id: `${category}|${title}|${Math.round(ts / 60000)}`,
    title,
    summary: raw.summary ? String(raw.summary) : undefined,
    category,
    source: raw.source ? String(raw.source) : undefined,
    lat,
    lng,
    salience,
    ts,
    url: raw.url ? String(raw.url) : undefined,
  };
}

export function normalizeEvents(raw: any): WorldEvent[] {
  const out: WorldEvent[] = [];
  const push = (e: WorldEvent | null) => {
    if (e) out.push(e);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) push(normalizeEvent(item));
  } else if (raw && typeof raw === 'object') {
    // grouped by domain: { conflict: [...], hazards: [...] }
    for (const [domain, group] of Object.entries(raw)) {
      if (Array.isArray(group)) {
        for (const item of group) push(normalizeEvent(item, domain));
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export function normalizePredictions(raw: any): Prediction[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.predictions) ? raw.predictions : [];
  return list
    .map((p: any): Prediction | null => {
      const statement = String(p?.statement ?? p?.text ?? '').trim();
      if (!statement) return null;
      return {
        statement,
        horizon: p?.horizon ? String(p.horizon) : undefined,
        probability: toNumber(p?.probability) ?? undefined,
        location: p?.location ? String(p.location) : undefined,
        lat: toNumber(p?.lat) ?? undefined,
        lng: toNumber(p?.lng) ?? undefined,
      };
    })
    .filter((p: Prediction | null): p is Prediction => p !== null);
}

export function normalizeWorld(raw: any): WorldState {
  const events = normalizeEvents(raw?.events ?? raw?.live ?? raw);
  const domains = Array.isArray(raw?.domains)
    ? raw.domains.map((d: any) => String(d).toLowerCase())
    : Array.from(new Set(events.map((e) => e.category)));
  return {
    summary: typeof raw?.summary === 'string' ? raw.summary : undefined,
    events,
    predictions: normalizePredictions(raw?.predictions),
    domains,
    fetchedAt: Date.now(),
  };
}
