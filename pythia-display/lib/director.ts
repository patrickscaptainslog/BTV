import { Shot, WorldEvent } from './types';

/**
 * The "camera director" picks where the globe looks next. It balances:
 *  - relevance: engine salience, domain weight, recency decay
 *  - visual interest: clusters of nearby events make better shots
 *  - variety: regions visited recently are penalized, and selection is a
 *    weighted lottery over the top candidates rather than pure argmax, so the
 *    camera wanders the world instead of ping-ponging between two hotspots
 *  - pacing: every few shots it pulls back to a slow full-globe "breather"
 */

const DOMAIN_WEIGHTS: Record<string, number> = {
  conflict: 1.25,
  security: 1.2,
  hazards: 1.15,
  earthquake: 1.15,
  weather: 1.0,
  humanitarian: 1.1,
  maritime: 0.95,
  markets: 0.85,
  cyber: 1.0,
  movement: 0.9,
};

const REVISIT_WINDOW_MS = 12 * 60 * 1000;
const REVISIT_RADIUS_DEG = 14; // ~1550 km
const CLUSTER_RADIUS_DEG = 8;
const GLOBAL_SHOT_EVERY = 5;
const CANDIDATE_POOL = 8;

export interface VisitRecord {
  lat: number;
  lng: number;
  at: number;
}

export function greatCircleDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(lat1 * rad) * Math.sin(lat2 * rad) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng1 - lng2) * rad);
  return Math.acos(Math.min(1, Math.max(-1, a))) / rad;
}

function domainWeight(category: string): number {
  for (const [key, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    if (category.includes(key)) return weight;
  }
  return 1;
}

export function scoreEvent(event: WorldEvent, now: number, history: VisitRecord[], all: WorldEvent[]): number {
  const ageHours = Math.max(0, (now - event.ts) / 3600000);
  const recency = Math.exp(-ageHours / 24);
  let score = (0.2 + event.salience) * domainWeight(event.category) * (0.25 + recency);

  const recentVisit = history.find(
    (v) => now - v.at < REVISIT_WINDOW_MS && greatCircleDeg(v.lat, v.lng, event.lat, event.lng) < REVISIT_RADIUS_DEG,
  );
  if (recentVisit) score *= 0.12;

  const neighbors = all.filter(
    (e) => e.id !== event.id && greatCircleDeg(e.lat, e.lng, event.lat, event.lng) < CLUSTER_RADIUS_DEG,
  ).length;
  score *= 1 + 0.12 * Math.min(neighbors, 5);

  // controlled randomness so the tour feels organic, not deterministic
  score *= 0.75 + Math.random() * 0.5;
  return score;
}

export function planNextShot(
  events: WorldEvent[],
  history: VisitRecord[],
  currentPov: { lat: number; lng: number },
  shotCount: number,
): Shot {
  const now = Date.now();

  if (events.length === 0 || (shotCount > 0 && shotCount % GLOBAL_SHOT_EVERY === 0)) {
    return {
      type: 'global',
      lat: 15,
      lng: currentPov.lng + 40,
      altitude: 2.3,
      transitionMs: 4000,
      dwellMs: 16000,
    };
  }

  const scored = events
    .map((event) => ({ event, score: scoreEvent(event, now, history, events) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_POOL);

  // weighted lottery over the top candidates
  const total = scored.reduce((sum, s) => sum + s.score, 0);
  let pick = scored[0];
  let roll = Math.random() * total;
  for (const s of scored) {
    roll -= s.score;
    if (roll <= 0) {
      pick = s;
      break;
    }
  }

  const { event } = pick;
  const close = event.salience >= 0.65;
  const distance = greatCircleDeg(currentPov.lat, currentPov.lng, event.lat, event.lng);
  const transitionMs = Math.round(2200 + Math.min(1, distance / 140) * 2600);
  const dwellMs = Math.round(9000 + event.salience * 8000);

  return {
    type: close ? 'close' : 'regional',
    lat: event.lat,
    lng: event.lng,
    altitude: close ? 0.5 : 0.95,
    transitionMs,
    dwellMs,
    event,
  };
}

/** A high-salience fresh event preempts the tour with a fast cut. */
export function isBreaking(event: WorldEvent, now = Date.now()): boolean {
  return event.salience >= 0.75 && now - event.ts < 10 * 60 * 1000;
}

export function breakingShot(event: WorldEvent, currentPov: { lat: number; lng: number }): Shot {
  const distance = greatCircleDeg(currentPov.lat, currentPov.lng, event.lat, event.lng);
  return {
    type: 'close',
    lat: event.lat,
    lng: event.lng,
    altitude: 0.5,
    transitionMs: Math.round(1400 + Math.min(1, distance / 140) * 1600),
    dwellMs: 15000,
    event,
  };
}
