# CSET Math Prep

An adaptive practice app for the California CSET Mathematics **Subtest I (211: Number & Quantity; Algebra)** and **Subtest II (212: Geometry; Probability & Statistics)** exams. Practice-first: diagnostic → adaptive drill → timed exam simulation, with AI-graded constructed responses, lessons, and cross-device sync.

## How it works

- **Question bank** (~345 MC + 16 CR): a hybrid of
  - *generated items* — 43 parameterized template families (`generators/`) whose answers are computed programmatically and whose distractors encode specific misconceptions. Correct by construction; emitted deterministically to `content/questions/generated.json` by `npm run gen`. Ten families target the hard (1300–1450) multi-step end.
  - *curated items* — hand-authored conceptual questions with worked solutions (`content/questions/curated-*.json`).
  - Geometry items carry **SVG figures** (`generators/figures.ts`), theme-aware and generated alongside the item.
  - Every item carries a worked solution, and every question has a **flag** button; flags collect on `/flags` for review/export.
- **Adaptivity**: per-subdomain Elo ratings (seeded by the diagnostic) drive drill selection toward your weakest SMR areas at a slightly-above-your-level difficulty. Item ratings drift with your results, so the bank self-calibrates.
- **Spaced review**: missed questions enter an SM-2-style queue (`/review`) — same-day re-review, then stretching intervals until mastered.
- **Lessons** (`/lessons`): a compact review sheet per SMR subdomain — core facts, exam traps, one worked example — linked from the overview mastery bars and from drill.
- **CR gym** (`/writing`): standalone constructed-response practice with a grade → feedback → **revise → resubmit** loop and per-prompt attempt history.
- **Exam simulation**: 35 MC + 3 CR per subtest, blueprint-proportioned across domains (Subtest I: 10 N&Q + 25 Algebra; Subtest II: 25 Geometry + 10 P&S), one 150-minute timer, no feedback until submit, score report by domain with per-domain **pacing** (seconds per question vs. a ≈150s budget) and a rough scaled-score gauge (220/300 passes).
- **AI features** (Anthropic API): constructed responses are graded 1–4 against a CTC-style focused holistic rubric with targeted feedback; a tutor offers hints before answering and alternative explanations after.
- **Storage & sync**: progress lives in `localStorage` and, when a KV store is configured, syncs across devices (last-write-wins) for signed-in sessions via `/api/sync`. JSON export/import remains as a manual fallback.

## Development

```bash
npm install
npm run dev        # http://localhost:3100
npm test           # generator invariants, elo, scheduler, blueprint
npm run gen        # regenerate content/questions/generated.json (deterministic)
npm run verify     # structural checks over the whole content bank
```

Set `ANTHROPIC_API_KEY` in `.env.local` to use the tutor/grading locally (routes are open when `APP_PASSWORD` is unset).

## Deployment (Vercel)

Create a Vercel project with **root directory `cset/`**, then set environment variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | CR grading + tutor routes |
| `APP_PASSWORD` | Gates the AI routes and sync (sign in at `/login`) |
| `SESSION_SECRET` | Any random string; salts the session cookie |

Practice content works with no env vars at all — only the AI routes and sync need them.

### Enabling cross-device sync

Sync needs a Redis-compatible KV store. In the Vercel dashboard: your project → **Storage** → **Create Database** → **Upstash for Redis** (free tier) → connect it to the project. That injects `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`/`_TOKEN` — both naming conventions are supported) — then **Redeploy**. Sign in at `/login` on each device; the header indicator flips from "local only" to "synced". Without a KV store the app simply stays localStorage-only.

## Content correctness

The failure mode that matters most in a prep tool is a wrong answer key. Defenses:

1. Generated items compute their keys; Jest asserts structural invariants and determinism across the whole bank (`__tests__/generators.test.ts`).
2. `npm run verify` checks IDs, choices, keys, SMR consistency, and LaTeX delimiter balance for every item, curated included.
3. Worked solutions are required everywhere, and the in-app flag button routes suspected errors to `/flags` for export.

If you flag an item and confirm it's wrong: fix the generator or JSON, run `npm run gen && npm run verify && npm test`, and item IDs stay stable.
