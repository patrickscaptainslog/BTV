'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { demoEvent, demoWorld, fetchWorld, openStream } from '@/lib/engine';
import { breakingShot, isBreaking, planNextShot, VisitRecord } from '@/lib/director';
import { ConnectionStatus, Prediction, Shot, WorldEvent } from '@/lib/types';

const MAX_EVENTS = 400;
const POLL_MS = 60000;
const FRESH_RING_MS = 30 * 60 * 1000;

const DOMAIN_COLORS: Array<[string, string]> = [
  ['conflict', '#ff4d5e'],
  ['security', '#ff4d5e'],
  ['hazard', '#ff9f43'],
  ['quake', '#ff9f43'],
  ['fire', '#ff9f43'],
  ['weather', '#ffd166'],
  ['storm', '#ffd166'],
  ['market', '#2ee6a8'],
  ['econom', '#2ee6a8'],
  ['humanitarian', '#b78cff'],
  ['health', '#b78cff'],
  ['cyber', '#3fd6ff'],
  ['maritime', '#4d9fff'],
  ['shipping', '#4d9fff'],
  ['movement', '#7dd3fc'],
  ['flight', '#7dd3fc'],
];

function domainColor(category: string): string {
  for (const [key, color] of DOMAIN_COLORS) {
    if (category.includes(key)) return color;
  }
  return '#94a3b8';
}

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function Display() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const eventsRef = useRef<Map<string, WorldEvent>>(new Map());
  const historyRef = useRef<VisitRecord[]>([]);
  const shotCountRef = useRef(0);
  const shotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [engineUrl, setEngineUrl] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupInput, setSetupInput] = useState('http://192.168.1.100:8088');
  const [everLive, setEverLive] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<WorldEvent | null>(null);
  const [breaking, setBreaking] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [predictionIdx, setPredictionIdx] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [clock, setClock] = useState('');
  const [shift, setShift] = useState({ x: 0, y: 0 });

  // ------------------------------------------------------------------ globe
  const refreshLayers = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const events = Array.from(eventsRef.current.values());
    const now = Date.now();
    globe.pointsData(events);
    globe.ringsData(
      events.filter((e) => now - e.ts < FRESH_RING_MS || e.id === activeEventRef.current?.id),
    );
    setEventCount(events.length);
  }, []);

  const activeEventRef = useRef<WorldEvent | null>(null);
  useEffect(() => {
    activeEventRef.current = activeEvent;
  }, [activeEvent]);

  useEffect(() => {
    let disposed = false;
    let resize: (() => void) | null = null;
    (async () => {
      const GlobeFactory = (await import('globe.gl')).default;
      if (disposed || !containerRef.current) return;
      const globe = new GlobeFactory(containerRef.current)
        .globeImageUrl('/textures/earth-night-8k.jpg')
        .bumpImageUrl('/textures/earth-topology.png')
        .onGlobeReady(() => {
          // three.js defaults to anisotropy 1, which blurs the texture badly
          // at glancing angles; crank it to the GPU max for a sharp globe
          try {
            const mat: any = globe.globeMaterial();
            const maxAniso = globe.renderer().capabilities.getMaxAnisotropy();
            for (const tex of [mat?.map, mat?.bumpMap]) {
              if (tex) {
                tex.anisotropy = maxAniso;
                tex.needsUpdate = true;
              }
            }
          } catch {
            // cosmetic only — never block the display on it
          }
        })
        .backgroundColor('#04060f')
        .atmosphereColor('#3a70ff')
        .atmosphereAltitude(0.22)
        .pointAltitude(0.012)
        .pointLat('lat')
        .pointLng('lng')
        .pointColor((e: any) => domainColor(e.category))
        .pointRadius((e: any) => 0.1 + e.salience * 0.3)
        .ringLat('lat')
        .ringLng('lng')
        .ringColor((e: any) => () => domainColor(e.category))
        .ringMaxRadius((e: any) => 2.5 + e.salience * 3.5)
        .ringPropagationSpeed(1.6)
        .ringRepeatPeriod(1400);
      globe.controls().enableZoom = false;
      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.3 }, 0);
      globeRef.current = globe;
      resize = () => globe.width(window.innerWidth).height(window.innerHeight);
      resize();
      window.addEventListener('resize', resize);
      refreshLayers();
    })();
    return () => {
      disposed = true;
      if (resize) window.removeEventListener('resize', resize);
      globeRef.current?._destructor?.();
      globeRef.current = null;
    };
  }, [refreshLayers]);

  // --------------------------------------------------------------- director
  const runShot = useCallback((forced?: Shot) => {
    const globe = globeRef.current;
    if (!globe) {
      shotTimerRef.current = setTimeout(() => runShot(), 1500);
      return;
    }
    const pov = globe.pointOfView();
    const events = Array.from(eventsRef.current.values());
    const shot = forced ?? planNextShot(events, historyRef.current, pov, shotCountRef.current);
    shotCountRef.current += 1;

    globe.controls().autoRotate = shot.type === 'global';
    globe.controls().autoRotateSpeed = 0.4;
    globe.pointOfView({ lat: shot.lat, lng: shot.lng, altitude: shot.altitude }, shot.transitionMs);

    if (shot.event) {
      historyRef.current = [
        ...historyRef.current.filter((v) => Date.now() - v.at < 20 * 60 * 1000),
        { lat: shot.lat, lng: shot.lng, at: Date.now() },
      ];
    }

    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      setActiveEvent(shot.event ?? null);
      setBreaking(Boolean(forced));
      refreshLayers();
    }, shot.transitionMs * 0.7);

    if (shotTimerRef.current) clearTimeout(shotTimerRef.current);
    shotTimerRef.current = setTimeout(() => runShot(), shot.transitionMs + shot.dwellMs);
  }, [refreshLayers]);

  const mergeEvents = useCallback(
    (incoming: WorldEvent[], allowBreaking: boolean) => {
      let newest: WorldEvent | null = null;
      for (const event of incoming) {
        const isNew = !knownIdsRef.current.has(event.id);
        knownIdsRef.current.add(event.id);
        eventsRef.current.set(event.id, event);
        if (isNew && (!newest || event.ts > newest.ts)) newest = event;
      }
      if (eventsRef.current.size > MAX_EVENTS) {
        const sorted = Array.from(eventsRef.current.values()).sort((a, b) => b.ts - a.ts);
        eventsRef.current = new Map(sorted.slice(0, MAX_EVENTS).map((e) => [e.id, e]));
      }
      refreshLayers();
      if (allowBreaking && newest && isBreaking(newest) && globeRef.current) {
        runShot(breakingShot(newest, globeRef.current.pointOfView()));
      }
    },
    [refreshLayers, runShot],
  );

  // ------------------------------------------------------------- data feeds
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('engine');
    const demo = params.get('demo') === '1';
    const stored = localStorage.getItem('pythia-engine-url');
    if (fromQuery) {
      localStorage.setItem('pythia-engine-url', fromQuery);
      setEngineUrl(fromQuery);
    } else if (demo) {
      setEngineUrl(null);
    } else if (stored) {
      setEngineUrl(stored);
      setSetupInput(stored);
    } else {
      setShowSetup(true);
    }
    setConfigLoaded(true);
  }, []);

  useEffect(() => {
    if (!configLoaded) return;

    // fresh world when switching between demo and engine (or engines)
    eventsRef.current = new Map();
    knownIdsRef.current = new Set();
    historyRef.current = [];
    setActiveEvent(null);
    setEverLive(false);
    setLastError(null);
    refreshLayers();

    let cleanupStream: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let demoTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    if (!engineUrl) {
      const world = demoWorld();
      setSummary(world.summary ?? '');
      setPredictions(world.predictions);
      setStatus('demo');
      mergeEvents(world.events, false);
      const tick = () => {
        if (cancelled) return;
        mergeEvents([demoEvent()], true);
        demoTimer = setTimeout(tick, 20000 + Math.random() * 25000);
      };
      demoTimer = setTimeout(tick, 15000);
    } else {
      const poll = async () => {
        try {
          const world = await fetchWorld(engineUrl);
          if (cancelled) return;
          setStatus('live');
          setEverLive(true);
          setLastError(null);
          setSummary(world.summary ?? '');
          if (world.predictions.length) setPredictions(world.predictions);
          mergeEvents(world.events, false);
        } catch (err) {
          if (!cancelled) {
            setStatus('error');
            setLastError(err instanceof Error ? err.message : String(err));
          }
        }
      };
      setStatus('connecting');
      poll();
      pollTimer = setInterval(poll, POLL_MS);
      cleanupStream = openStream(
        engineUrl,
        (events) => mergeEvents(events, true),
        () => {},
      );
    }

    return () => {
      cancelled = true;
      cleanupStream?.();
      if (pollTimer) clearInterval(pollTimer);
      if (demoTimer) clearTimeout(demoTimer);
    };
  }, [configLoaded, engineUrl, mergeEvents, refreshLayers]);

  // director loop lives independently of the data source
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    shotTimerRef.current = setTimeout(() => runShot(), 3500);
    return () => {
      startedRef.current = false;
      if (shotTimerRef.current) clearTimeout(shotTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [runShot]);

  // -------------------------------------------------- tablet / kiosk chrome
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick();
    const clockTimer = setInterval(tick, 10000);

    // OLED burn-in mitigation: drift the overlay chrome a few px per minute
    const shiftTimer = setInterval(
      () => setShift({ x: Math.round(Math.random() * 8), y: Math.round(Math.random() * 8) }),
      60000,
    );

    let wakeLock: any = null;
    const acquireWakeLock = async () => {
      try {
        wakeLock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        // not supported or not visible — retried on visibilitychange
      }
    };
    acquireWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const cycleTimer = setInterval(() => setPredictionIdx((i) => i + 1), 12000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(shiftTimer);
      clearInterval(cycleTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLock?.release?.();
    };
  }, []);

  const connect = (url: string | null) => {
    if (url) {
      let clean = url.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(clean)) clean = `http://${clean}`;
      localStorage.setItem('pythia-engine-url', clean);
      setEngineUrl(clean);
      setSetupInput(clean);
    } else {
      localStorage.removeItem('pythia-engine-url');
      setEngineUrl(null);
    }
    setShowSetup(false);
  };

  // https pages cannot call plain-http LAN engines (mixed content)
  const isMixedContent = (url: string | null | undefined) =>
    Boolean(url && window.location.protocol === 'https:' && /^http:\/\//i.test(url.trim()) && !/^http:\/\/localhost/i.test(url.trim()));

  const prediction = predictions.length ? predictions[predictionIdx % predictions.length] : null;
  const statusLabel =
    status === 'live' ? 'LIVE' : status === 'demo' ? 'DEMO' : status === 'error' ? (everLive ? 'RECONNECTING' : 'UNREACHABLE') : 'CONNECTING';
  const showEngineHint = Boolean(engineUrl) && !everLive && (status === 'error' || status === 'connecting');

  return (
    <div className="stage">
      <div ref={containerRef} className="globe" />

      <div className="chrome" style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">PYTHIA</span>
            <span className="brand-sub">live world state</span>
          </div>
          <div className="topbar-right">
            <button
              className={`status status-${status}`}
              onClick={() => {
                setSetupInput(engineUrl ?? setupInput);
                setShowSetup(true);
              }}
              title="Change engine"
            >
              <span className="status-dot" />
              {statusLabel}
            </button>
            <span className="meta">{eventCount} events</span>
            <span className="clock">{clock}</span>
            <button
              className="fs-btn"
              onClick={() =>
                document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen()
              }
            >
              ⛶
            </button>
          </div>
        </header>

        {showEngineHint ? (
          <div className="event-card hint-card">
            <div className="event-domain" style={{ color: '#ff9f43' }}>
              ● ENGINE {status === 'connecting' ? 'CONNECTING' : 'UNREACHABLE'}
            </div>
            <div className="event-title">{engineUrl}</div>
            <div className="event-summary hint-summary">
              {isMixedContent(engineUrl)
                ? 'This page is served over https, so the browser blocks plain-http engine URLs (mixed content). Fix: give the engine an https address — e.g. run `tailscale serve --bg 8088` on the engine machine and use the https://….ts.net URL here — or allow "insecure content" for this site in the browser settings.'
                : `Can't reach the engine. Check: is Pythia running? Same network as this device? Try opening ${engineUrl}/health directly in this browser — it should return JSON. Also check the engine machine's firewall allows port 8088.`}
            </div>
            <div className="event-meta">
              {lastError ? `${lastError} · ` : ''}tap the status pill (top right) to change the engine or switch to demo mode
            </div>
          </div>
        ) : activeEvent ? (
          <div className={`event-card ${breaking ? 'event-card-breaking' : ''}`} key={activeEvent.id}>
            {breaking ? <div className="breaking-tag">BREAKING</div> : null}
            <div className="event-domain" style={{ color: domainColor(activeEvent.category) }}>
              ● {activeEvent.category.toUpperCase()}
            </div>
            <div className="event-title">{activeEvent.title}</div>
            {activeEvent.summary ? <div className="event-summary">{activeEvent.summary}</div> : null}
            <div className="event-meta">
              {activeEvent.source ? `${activeEvent.source} · ` : ''}
              {timeAgo(activeEvent.ts)} · {activeEvent.lat.toFixed(1)}°, {activeEvent.lng.toFixed(1)}°
            </div>
          </div>
        ) : summary ? (
          <div className="event-card">
            <div className="event-domain" style={{ color: '#8ea8ff' }}>● WORLD BRIEF</div>
            <div className="event-summary">{summary}</div>
          </div>
        ) : null}

        {prediction ? (
          <footer className="ticker" key={predictionIdx}>
            <span className="ticker-label">FORECAST{prediction.horizon ? ` · ${prediction.horizon}` : ''}</span>
            <span className="ticker-text">{prediction.statement}</span>
            {typeof prediction.probability === 'number' ? (
              <span className="ticker-prob">{Math.round(prediction.probability * 100)}%</span>
            ) : null}
          </footer>
        ) : null}
      </div>

      {showSetup ? (
        <div className="setup">
          <div className="setup-panel">
            <h1>PYTHIA display</h1>
            <p>
              Point this display at your local Pythia engine (port 8088). The tablet&apos;s browser talks to
              it directly — nothing leaves your network.
            </p>
            <input
              value={setupInput}
              onChange={(e) => setSetupInput(e.target.value)}
              placeholder="http://192.168.1.100:8088"
              inputMode="url"
            />
            {isMixedContent(setupInput) ? (
              <p className="setup-warning">
                ⚠ This page is https, so the browser will block this http:// address. Use an https tunnel
                URL instead — on the engine machine run <code>tailscale serve --bg 8088</code> and enter the
                https://….ts.net address it prints — or allow &quot;insecure content&quot; for this site in
                the browser settings.
              </p>
            ) : null}
            <div className="setup-actions">
              <button className="primary" onClick={() => connect(setupInput)}>
                Connect
              </button>
              <button onClick={() => connect(null)}>Run demo mode</button>
              <button onClick={() => setShowSetup(false)}>Close</button>
            </div>
            <p className="setup-hint">
              Tip: you can also open <code>?engine=http://host:8088</code> or <code>?demo=1</code>. Tap the
              status pill in the top-right corner any time to reopen this panel.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
