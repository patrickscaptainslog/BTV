# Lifemap

Vite + React shell for the Lifemap prototype, with a small Express backend
that proxies Anthropic API calls so the API key never reaches the browser.

## Setup

```bash
cd lifemap
npm install
cp .env.example .env   # then paste your key into .env
npm run dev            # starts API (:3001) + Vite (:5173) together
```

Open http://localhost:5173.

## What is built

- Galaxy engine (three ^0.185, ACES + UnrealBloom): category nebulae with GLSL
  dust, stars sized by grown magnitude, diffraction spikes at mag ≥7, comet
  on capture (camera does not hijack), embers, resolution threads, loose-end
  filaments, custom orbit camera with idle drift and tap-to-fly.
- Capture bar → POST /api/classify (Claude) with a local heuristic fallback
  so the app runs keyless; auto-resolution with toast + Undo.
- ⌘K search overlay; picking a result flies the camera to the star.
- Layout toggle: category nebulae ⇄ time-spine spiral.
- Tone.js ambient pad + chimes, off by default.
- Persistence: localStorage adapter (Supabase replaces it next slice).

## Dropping in the prototype

1. Save the prototype as `src/LifemapCinematic.jsx`.
2. In its `classify()` function, replace the direct
   `https://api.anthropic.com/v1/messages` fetch with a call to
   `POST /api/classify` (or import the helper from `src/lib/classify.js`).
   Remove any `x-api-key` / `anthropic-*` headers — the backend adds them.
3. In `src/App.jsx`, render `<LifemapCinematic />` instead of the placeholder.

## iPhone (installable PWA)

The app is a PWA: manifest, service worker, home-screen icons, safe-area
insets, standalone display. To get it on your phone:

1. Deploy to Vercel (matches the other apps in this repo):
   - `npm i -g vercel && cd lifemap && vercel` — or create a Vercel project
     from the GitHub repo with **Root Directory = `lifemap`**.
   - In the Vercel project settings, add env var `ANTHROPIC_API_KEY`.
   - `/api/classify` runs as a serverless function (`api/classify.mjs`),
     sharing the same handler as the local Express server.
2. Open the deployed URL in Safari on the iPhone → Share → **Add to Home
   Screen**. It launches full-screen with the galaxy icon.

Note: entries live in localStorage, so phone and laptop have separate skies
until Supabase persistence lands (next slice).

## Notes

- `three` is `^0.185` (modern color pipeline + bloom); `tone` is installed.
- `.env` is gitignored. Never commit the key or expose it to the frontend.
- The backend route is `server/index.mjs`. It accepts
  `{ messages, system?, model?, max_tokens? }` and returns `{ text }`.
