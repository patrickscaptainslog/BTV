export interface WorldEvent {
  id: string;
  title: string;
  summary?: string;
  category: string;
  source?: string;
  lat: number;
  lng: number;
  /** 0–1 importance score from the engine */
  salience: number;
  /** epoch milliseconds */
  ts: number;
  url?: string;
}

export interface Prediction {
  statement: string;
  horizon?: string;
  probability?: number;
  location?: string;
  lat?: number;
  lng?: number;
}

export interface WorldState {
  summary?: string;
  events: WorldEvent[];
  predictions: Prediction[];
  domains: string[];
  fetchedAt: number;
}

export type ShotType = 'close' | 'regional' | 'global';

export interface Shot {
  type: ShotType;
  lat: number;
  lng: number;
  altitude: number;
  transitionMs: number;
  dwellMs: number;
  event?: WorldEvent;
}

export type ConnectionStatus = 'demo' | 'connecting' | 'live' | 'error';
