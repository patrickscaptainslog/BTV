# Pythia Display

A cinematic, always-on tablet display for a local [Pythia](https://github.com/jangles-byte/Pythia)
world-state engine. It renders live global events on a WebGL night-lights globe and a "camera
director" slowly tours the world — panning to whatever is most salient, fresh, and visually
interesting right now, cutting to breaking events as they arrive over SSE.

## Architecture

```
┌──────────────┐   deploys    ┌─────────────────────┐
│    Vercel    │ ───────────► │  Tablet browser      │
│ (static UI)  │              │  (this app, kiosk)   │
└──────────────┘              └──────────┬──────────┘
                                         │ fetch /agent/view (60s)
                                         │ SSE  /state/stream (live deltas)
                                         ▼
                              ┌─────────────────────┐
                              │  Pythia engine :8088 │
                              │  (local, Ollama)     │
                              └─────────────────────┘
```

Vercel only serves the UI shell. The **tablet's browser talks directly to your local engine**
(Pythia's CORS is open), so Ollama and all data stay on your machine — Vercel never touches your
LAN. With no engine configured the display runs in demo mode with synthetic events.

## Deploy

Create a Vercel project pointed at this repo with **Root Directory = `pythia-display`**
(same pattern as `dashboard/` and `cset/`). No environment variables required.

## Connecting the tablet

Open the deployed URL on the tablet. Either use the setup screen, or pass query params:

- `?engine=http://192.168.1.50:8088` — connect to an engine (persisted in localStorage)
- `?demo=1` — force demo mode

### Mixed-content gotcha (read this)

Vercel serves over **https**; a plain `http://192.168.x.x:8088` request from an https page is
blocked as mixed content. Pick one:

1. **Tailscale Serve** (easiest): `tailscale serve --bg 8088` gives the engine a trusted
   `https://<machine>.<tailnet>.ts.net` URL; use that as the engine URL. Works off-LAN too.
2. **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8088` for a public https URL
   (add access rules — the engine has no auth).
3. **Per-site browser override**: in Chrome/Fully Kiosk on the tablet, allow "Insecure content"
   for the deployed site, then plain `http://<lan-ip>:8088` works.

## Kiosk setup

- Tap **⛶** for fullscreen; the app requests a screen Wake Lock so the tablet stays awake.
- Android: [Fully Kiosk Browser](https://www.fully-kiosk.com/) is ideal (autostart, screen
  always on, crash recovery). iPad: Add to Home Screen + Guided Access.
- Overlay chrome drifts a few pixels each minute to mitigate OLED burn-in.

## The camera director (`lib/director.ts`)

Every shot, each event is scored: `(0.2 + salience) × domainWeight × recencyDecay`, boosted for
clusters of nearby events, heavily penalized if the camera visited that region in the last
12 minutes, then multiplied by ±25% noise. The next target is drawn by **weighted lottery over the
top 8** — so the tour favors what matters but still wanders. High-salience shots zoom close;
every 5th shot pulls back to a slow-rotating full-globe breather. A fresh event with
salience ≥ 0.75 arriving over SSE preempts the tour with a fast "BREAKING" cut.

Tune the feel via the constants at the top of `lib/director.ts` (domain weights, revisit window,
breather cadence) — no other code needs to change.

## Texture credit

The 8K night-lights globe texture (`public/textures/earth-night-8k.jpg`) is from
[Solar System Scope](https://www.solarsystemscope.com/textures/), licensed CC-BY 4.0, based on
NASA imagery. The elevation bump map is copied from the `three-globe` package at build time.

## Development

```bash
cd pythia-display
npm install
npm run dev   # http://localhost:3100
```
