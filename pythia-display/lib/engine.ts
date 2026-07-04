import { normalizeEvent, normalizeWorld } from './normalize';
import { WorldEvent, WorldState } from './types';

const FETCH_TIMEOUT_MS = 15000;

export async function fetchWorld(base: string): Promise<WorldState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/agent/view`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`engine responded ${res.status}`);
    return normalizeWorld(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Subscribe to /state/stream (SSE). Payload shape varies by delta type, so we
 * scan any parsed message for embedded event objects and surface the ones
 * that normalize cleanly. Returns a cleanup function.
 */
export function openStream(base: string, onEvents: (events: WorldEvent[]) => void, onError: () => void): () => void {
  const url = `${base.replace(/\/$/, '')}/state/stream`;
  let source: EventSource | null = null;
  let closed = false;

  const extractEvents = (node: any, depth = 0): WorldEvent[] => {
    if (!node || depth > 4) return [];
    if (Array.isArray(node)) {
      return node.flatMap((item) => extractEvents(item, depth + 1));
    }
    if (typeof node === 'object') {
      const direct = normalizeEvent(node);
      if (direct) return [direct];
      return Object.values(node).flatMap((v) => extractEvents(v, depth + 1));
    }
    return [];
  };

  const connect = () => {
    if (closed) return;
    source = new EventSource(url);
    source.onmessage = (msg) => {
      try {
        const events = extractEvents(JSON.parse(msg.data));
        if (events.length) onEvents(events);
      } catch {
        // non-JSON keepalive or unknown delta — ignore
      }
    };
    source.onerror = () => {
      source?.close();
      onError();
      if (!closed) setTimeout(connect, 10000);
    };
  };

  connect();
  return () => {
    closed = true;
    source?.close();
  };
}

// ---------------------------------------------------------------------------
// Demo mode: synthetic but plausible world state so the display runs (and can
// be styled / demoed on the tablet) with no engine reachable.
// ---------------------------------------------------------------------------

interface Hotspot {
  name: string;
  lat: number;
  lng: number;
  category: string;
  weight: number;
}

const HOTSPOTS: Hotspot[] = [
  { name: 'Kharkiv Oblast', lat: 49.99, lng: 36.23, category: 'conflict', weight: 1.0 },
  { name: 'Zaporizhzhia front', lat: 47.84, lng: 35.14, category: 'conflict', weight: 0.9 },
  { name: 'Red Sea corridor', lat: 14.5, lng: 42.5, category: 'maritime', weight: 0.8 },
  { name: 'Taiwan Strait', lat: 24.0, lng: 119.5, category: 'conflict', weight: 0.7 },
  { name: 'Sahel region', lat: 14.0, lng: 0.0, category: 'humanitarian', weight: 0.7 },
  { name: 'Gaza', lat: 31.4, lng: 34.4, category: 'humanitarian', weight: 0.9 },
  { name: 'Tokyo', lat: 35.68, lng: 139.69, category: 'markets', weight: 0.6 },
  { name: 'New York', lat: 40.71, lng: -74.0, category: 'markets', weight: 0.7 },
  { name: 'London', lat: 51.5, lng: -0.12, category: 'markets', weight: 0.6 },
  { name: 'Ring of Fire — Japan', lat: 38.3, lng: 142.4, category: 'hazards', weight: 0.8 },
  { name: 'Ring of Fire — Chile', lat: -33.4, lng: -71.6, category: 'hazards', weight: 0.7 },
  { name: 'Sulawesi', lat: -1.4, lng: 121.4, category: 'hazards', weight: 0.6 },
  { name: 'California wildlands', lat: 37.2, lng: -119.3, category: 'hazards', weight: 0.6 },
  { name: 'Gulf of Mexico', lat: 25.0, lng: -90.0, category: 'weather', weight: 0.6 },
  { name: 'Bay of Bengal', lat: 15.0, lng: 88.0, category: 'weather', weight: 0.6 },
  { name: 'Singapore Strait', lat: 1.2, lng: 103.8, category: 'maritime', weight: 0.5 },
  { name: 'Panama Canal', lat: 9.1, lng: -79.7, category: 'maritime', weight: 0.5 },
  { name: 'Baltic airspace', lat: 55.0, lng: 21.0, category: 'cyber', weight: 0.6 },
  { name: 'Horn of Africa', lat: 8.0, lng: 47.0, category: 'humanitarian', weight: 0.6 },
  { name: 'Andes — Peru', lat: -13.5, lng: -72.0, category: 'hazards', weight: 0.4 },
  { name: 'Reykjanes Peninsula', lat: 63.9, lng: -22.4, category: 'hazards', weight: 0.5 },
  { name: 'Strait of Hormuz', lat: 26.6, lng: 56.25, category: 'maritime', weight: 0.7 },
];

const DEMO_HEADLINES: Record<string, string[]> = {
  conflict: ['Shelling reported near front line', 'Drone activity detected', 'Position change on tracked front', 'GPS jamming spike observed'],
  maritime: ['Vessel cluster deviation from lane', 'AIS gap detected on tanker route', 'Port congestion rising', 'Naval transit underway'],
  humanitarian: ['Displacement flow increase reported', 'Aid corridor status update', 'Outbreak cluster flagged by WHO feed', 'Food insecurity alert raised'],
  markets: ['Oil futures moving on supply news', 'Index volatility spike', 'Crypto drawdown accelerating', 'Commodity squeeze developing'],
  hazards: ['M5.1 earthquake recorded', 'Wildfire perimeter expanding', 'Volcanic unrest indicators rising', 'Aftershock sequence continuing'],
  weather: ['Severe storm cell strengthening', 'Flood warning polygon issued', 'Tropical system organizing', 'Extreme heat advisory extended'],
  cyber: ['DDoS wave against regional ISPs', 'Certificate anomaly on gov domains', 'Botnet activity surge', 'Regional internet outage detected'],
};

let demoCounter = 0;

function jitter(v: number, amount: number): number {
  return v + (Math.random() - 0.5) * amount;
}

export function demoEvent(now = Date.now(), maxAgeMs = 0): WorldEvent {
  const spot = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)];
  const headlines = DEMO_HEADLINES[spot.category] ?? DEMO_HEADLINES.hazards;
  const title = `${headlines[Math.floor(Math.random() * headlines.length)]} — ${spot.name}`;
  const ts = now - Math.random() * maxAgeMs;
  demoCounter += 1;
  return {
    id: `demo-${demoCounter}`,
    title,
    summary: `Synthetic demo event near ${spot.name}. Connect a Pythia engine to replace this with live data.`,
    category: spot.category,
    source: 'demo',
    lat: jitter(spot.lat, 3),
    lng: jitter(spot.lng, 3),
    salience: Math.min(1, Math.max(0.15, spot.weight * (0.5 + Math.random() * 0.7))),
    ts,
  };
}

export function demoWorld(): WorldState {
  const now = Date.now();
  const events = Array.from({ length: 60 }, () => demoEvent(now, 24 * 3600 * 1000));
  return {
    summary:
      'Demo mode: synthetic events across conflict, hazards, markets, maritime, humanitarian, weather and cyber domains. Connect your local Pythia engine to go live.',
    events,
    predictions: [
      { statement: 'Renewed pressure along the eastern front within 72h', horizon: '24h–72h', probability: 0.62 },
      { statement: 'Oil volatility elevated through the week on shipping-lane risk', horizon: 'week', probability: 0.55 },
      { statement: 'Aftershock sequence continues in the Pacific ring', horizon: '24h', probability: 0.78 },
      { statement: 'Regional internet disruptions persist amid censorship events', horizon: 'week', probability: 0.44 },
    ],
    domains: Array.from(new Set(HOTSPOTS.map((h) => h.category))),
    fetchedAt: now,
  };
}
