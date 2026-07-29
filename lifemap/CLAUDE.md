# CLAUDE.md — Lifemap

## What this is

Lifemap is "a journal you never organize." Users dump anything — notes, photos, pulse check-ins — and the app files it automatically into a living 3D map of their life. The organizing is the product; the user never sorts, tags, or rates anything manually.

## Product thesis (do not drift from this)

- **Zero-effort capture.** Input is a single text box or a photo. No forms, no category pickers, no manual ratings. Capture is instant and almost invisible: type, enter, done — the comet fires, but the camera does NOT hijack. The full cinematic sequence is reserved for browse/return mode.
- **The galaxy is the ritual, not the interface.** Retrieval is a ⌘K search overlay and a pull-up index drawer (boring, instant — the map's legend); picking a result is a camera flight to the star. A "sky brief" chip has Claude narrate the recent sky in 2–3 sentences (the galaxy shows, Claude reads it aloud), and a "loose ends" chip orbits star-to-star through open threads. The galaxy is the reward surface you return to — an evening sky that replays your day — not the working surface you fight through.
- **Claude does the filing.** Every entry is classified by a Claude API call (via the backend proxy) that returns: title (≤6 words), category (existing if it fits, else a new 1–2 word one), a one-line summary, `resolvesId`, and a birth-importance guess.
- **Importance is grown, not guessed.** The language-based guess only sets a star's *birth* magnitude, weighted low. Stars grow from behavior: referenced by later entries or pulses, staying open, being reignited. What matters glows because you keep orbiting it. Still no manual rating UI, ever — self-correction comes from behavior, not sliders.
- **Auto-resolution is the magic moment and the engineering priority.** "Fixed the leak at Mission St today" finds and closes the earlier "Fix the leak at Mission St" entry. Pipeline: embedding search shortlists ~10 open candidates, Claude picks (or declines). Always visible and reversible — toast with Undo. One wrong silent merge destroys trust. Open entries show a faint "loose end" filament; resolution draws the thread taut before the old star embers. The differentiator is "a journal that closes its own loops."
- **History stays visible.** Resolved entries never disappear; they dim/collapse into "embers." The map is a record, not a todo list.

## Pulse (ambient capture)

Adopted from the Pulse app, gentled:

- Notification prompts at random intervals, **default 3–4/day** inside waking hours, adaptive back-off when ignored, quiet hours, one-tap guiltless skip. Hourly "research mode" is opt-in only.
- **Pulses are dust, not stars.** They render as nebula/spiral particles — the ambient texture of the galaxy becomes real data — and never compete visually with intentional entries. A heavy work stretch thickens the Work region; a good weekend glows warm.
- A pulse that references an open entry ("still stuck on the leak") is an orbit signal that brightens that star (feeds importance growth).
- Platform reality: v1 schedules pulses while the app/tab is open, plus web-push for installed PWA (iOS 16.4+). A native shell is a known future fork, not a v1 problem.

## Photos

- Photo is a first-class capture type and the preferred pulse response (snapping is cheaper than typing).
- Image → Claude vision → the same classify JSON contract. Blob lives in Supabase Storage; the star keeps a thumbnail.
- Tapping a photo star opens the image in a glass panel — finding an actual photograph inside the galaxy is a core moment.

## Visual identity: the galaxy

The user's life is rendered as a galaxy (Three.js, **current release** — see Architecture):

- Each **category** = a nebula region with its own hue; its particles are (increasingly) real pulse data.
- Each **entry** = a star. Size + brightness = grown magnitude. Magnitude ≥7 gets rotating diffraction spikes.
- **Adding an entry** launches a comet into the correct region; the camera stays put during capture. Flights and full cinematics happen in browse mode and on search.
- **Resolving** draws the thread taut, then collapses the old star into a gray ember over ~1s. Completed threads persist as faint constellation-lines.
- Custom orbit camera: drag to orbit, scroll/pinch to zoom, idle auto-rotate after 5s, tap star → camera flies to it, tap space → pull back.
- **Time-spine trial:** a second, toggleable layout where the spiral maps to *time* (now at the bright center, the past receding down the arm) and category only sets hue. The past never moves, so spatial memory holds and category drift is harmless. Live with both layouts, then keep the winner. Until then, category-nebulae remain the default identity.
- Ambient sound via Tone.js (reverb pad + chimes), off by default, toggle top-right.
- Palette: deep space `#03040c`; category hues — Watch `#ff8fbe`, Eat & Drink `#ffcf7d`, Ideas `#7dffc4`, To Do `#7db8ff`, On My Mind `#c89bff`, Work `#ff9670`. Type: Unbounded (display), Space Grotesk (UI).

Keep the aesthetic cinematic and restrained: glassmorphism panels, no chrome. **Semantic zoom governs labels** (star-atlas style, not hover-only): category names read from afar in thin Unbounded type, magnitude ≥7 stars carry captions as you approach, everything else stays quiet until selected. Every zoom level answers a question — far: "how is my life lately?" (labels + sky brief), mid: "what's alive here?", near: "what is this?". When in doubt, more depth and motion quality, not more UI. **Beauty is frame rate**: instanced particles, device-tiered particle caps, bloom doing the perceptual heavy lifting — motion quality over particle count, 60fps over spectacle.

## Architecture

- Frontend: Vite + React, single-page, Three.js, Tone.js.
- **Three.js is being unpinned from r128** as part of the prototype drop-in: migrate to current three for sRGB output, ACES filmic tone mapping, UnrealBloomPass/selective bloom, and instancing. Biggest beauty-per-hour change available; do it before the shader code accrues further.
- **classify() goes through the backend proxy** (`lifemap/server/index.mjs`, Express). `ANTHROPIC_API_KEY` lives in gitignored `.env`, never in the frontend. Route: `POST /api/classify` — accepts `{ messages, system?, model?, max_tokens? }` (images as base64 content blocks for vision), model `claude-sonnet-4-6`, max_tokens 1000, strict JSON with ```json fences stripped server-side.
- **Persistence: Supabase** (already in use elsewhere and working well) — Postgres for entries/pulses (pgvector for the resolution-shortlist embeddings), Storage for photos. Entry shape: `{ id, title, category, importance, summary, status: "open"|"done", raw, createdAt }` plus `resolvedBy`, `photoUrl`, `magnitudeEvents`.
- Pulse delivery: in-app scheduling while open; web-push via the Express server for installed PWA.

## Decisions already made (don't relitigate)

- No manual 1–10 rating UI — importance is birth-guessed then behavior-grown; the only manual controls are Mark done / Reignite / Undo.
- The galaxy is the identity; list/timeline are secondary views. ⌘K search exists precisely so the galaxy never has to be a retrieval tool.
- Capture never hijacks the camera.
- Pulses render as dust, never as stars.
- New categories are allowed but Claude should prefer existing ones. Drift guard: a brand-new category needs multiple orphaned entries before it condenses into a region; periodic Claude-proposed merges surface with the same toast + Undo as resolution.
- Resolved ≠ deleted, ever.

## Roadmap (rough order — ship working slices)

1. ~~Backend proxy for classify() + API key handling~~ ✅ done
2. Drop in the prototype (`lifemap-cinematic.jsx` — **still needs to be uploaded to Drive**) + three.js migration (unpin r128, ACES/bloom pipeline)
3. Supabase persistence (entries survive reload)
4. Decouple capture from camera + ⌘K search with fly-to results
5. Resolution pipeline: pgvector shortlist → Claude picks → thread animation, toast + Undo
6. Behavior-grown magnitude
7. Pulse: gentle adaptive scheduling, dust rendering, photo-first responses
8. Photo ingestion: upload/snap → vision → classify; glass-panel viewing
9. Time-spine layout as a toggleable trial
10. Performance: instancing, LOD, device-tiered particle caps, proper bloom

## Working style of the owner

Direct, honest assessments over optimism. Flag tradeoffs plainly. Minimal clean UI outside the 3D scene. Ship working slices over grand plans.
