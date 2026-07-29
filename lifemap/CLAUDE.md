# CLAUDE.md — Lifemap

## What this is

Lifemap is "a journal you never organize." Users dump anything — notes, screenshot descriptions (later: actual screenshots from Instagram/Reddit) — and the app files it automatically into a living 3D map of their life. The organizing is the product; the user never sorts, tags, or rates anything manually.

## Product thesis (do not drift from this)

- **Zero-effort capture.** Input is a single text box (later: image upload). No forms, no category pickers, no manual ratings.
- **Claude does the filing.** Every entry is classified by a Claude API call that returns: title (≤6 words), category (existing if it fits, else a new 1–2 word one), importance 1–10 **inferred from the language's urgency and emotional weight** (never asked from the user), a one-line summary, and `resolvesId`.
- **Auto-resolution is the magic moment.** "Fixed the leak at Mission St today" should find and close the earlier "Fix the leak at Mission St" entry. It must always be visible and reversible — show a toast with Undo. One wrong silent merge destroys trust.
- **History stays visible.** Resolved entries never disappear; they dim/collapse into "embers." The map is a record, not a todo list.

## Visual identity: the galaxy

The user's life is rendered as a galaxy (Three.js, currently r128 pinned):

- Each **category** = a nebula of ~900 GLSL shader particles in spiral arms, with its own hue.
- Each **entry** = a star. Size + brightness = importance ("magnitude"). Magnitude ≥7 gets rotating diffraction spikes.
- **Adding an entry** launches a comet that arcs into the correct nebula, flashes on arrival, and the camera flies to the newborn star.
- **Resolving** collapses the old star into a gray ember over ~1s, threads fade.
- Custom orbit camera (no OrbitControls in r128): drag to orbit, scroll/pinch to zoom, idle auto-rotate after 5s, tap star → camera flies to it, tap space → pull back.
- Ambient sound via Tone.js (reverb pad + chimes), off by default, toggle top-right.
- Palette: deep space `#03040c`; category hues — Watch `#ff8fbe`, Eat & Drink `#ffcf7d`, Ideas `#7dffc4`, To Do `#7db8ff`, On My Mind `#c89bff`, Work `#ff9670`. Type: Unbounded (display), Space Grotesk (UI).

Keep the aesthetic cinematic and restrained: glassmorphism panels, no chrome, labels only on hover/select. The owner's bar is "awestruck" — when in doubt, more depth and motion quality, not more UI.

## Architecture

- Frontend: Vite + React, single-page, Three.js r128, Tone.js.
- **The classify() call must go through a backend proxy.** The keyless fetch to `api.anthropic.com` only works inside Claude.ai artifacts. In this repo: a small server route (Express or serverless) holds `ANTHROPIC_API_KEY` from `.env` (never in frontend, never committed) and forwards the classification prompt. Model: claude-sonnet-4-6 class, max_tokens 1000, response is strict JSON (strip ```json fences before parsing).
- State: currently in-memory with seed data. Next step is persistence (SQLite or Supabase). Entry shape: `{ id, title, category, importance, summary, status: "open"|"done", raw, createdAt }`.

## Decisions already made (don't relitigate)

- No manual 1–10 rating UI — importance is inferred; the only manual controls are Mark done / Reignite / Undo.
- Mind map is one *view* of an underlying knowledge graph; list/timeline views may return later, but the galaxy is the identity.
- New categories are allowed but Claude should prefer existing ones.
- Resolved ≠ deleted, ever.

## Roadmap (rough order)

1. Backend proxy for classify() + API key handling
2. Persistence (entries survive reload)
3. Real screenshot ingestion: image upload → Claude vision → same classify pipeline
4. Performance: LOD for mobile, proper bloom, cap particle counts on weak GPUs
5. Daily/temporal dimension (the original idea was "over the course of a day" — consider a time scrubber)

## Working style of the owner

Direct, honest assessments over optimism. Flag tradeoffs plainly. Minimal clean UI outside the 3D scene. Ship working slices over grand plans.
