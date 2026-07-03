# CSET Math Prep

An adaptive practice app for the California CSET Mathematics **Subtest I (211: Number & Quantity; Algebra)** and **Subtest II (212: Geometry; Probability & Statistics)** exams. Practice-first: diagnostic → adaptive drill → timed exam simulation, with AI-graded constructed responses.

## How it works

- **Question bank** (~280 MC + 16 CR): a hybrid of
  - *generated items* — 33 parameterized template families (`generators/`) whose answers are computed programmatically and whose distractors encode specific misconceptions. Correct by construction; emitted deterministically to `content/questions/generated.json` by `npm run gen`.
  - *curated items* — hand-authored conceptual questions with worked solutions (`content/questions/curated-*.json`).
  - Every item carries a worked solution, and every question has a **flag** button; flags collect on `/flags` for review/export.
- **Adaptivity**: per-subdomain Elo ratings (seeded by the diagnostic) drive drill selection toward your weakest SMR areas at a slightly-above-your-level difficulty. Item ratings drift with your results, so the bank self-calibrates.
- **Spaced review**: missed questions enter an SM-2-style queue (`/review`) — same-day re-review, then stretching intervals until mastered.
- **Exam simulation**: 35 MC + 3 CR per subtest, blueprint-proportioned across domains (Subtest I: 10 N&Q + 25 Algebra; Subtest II: 25 Geometry + 10 P&S), one 150-minute timer, no feedback until submit, score report by domain with a rough scaled-score gauge (220/300 passes).
- **AI features** (Anthropic API): constructed responses are graded 1–4 against a CTC-style focused holistic rubric with targeted feedback; a tutor offers hints before answering and alternative explanations after.
- **Storage**: all progress lives in `localStorage` (single user), with JSON export/import on the overview page.

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
| `APP_PASSWORD` | Gates the AI routes (sign in at `/login`) |
| `SESSION_SECRET` | Any random string; salts the session cookie |

Practice content works with no env vars at all — only the AI routes need them.

## Content correctness

The failure mode that matters most in a prep tool is a wrong answer key. Defenses:

1. Generated items compute their keys; Jest asserts structural invariants and determinism across the whole bank (`__tests__/generators.test.ts`).
2. `npm run verify` checks IDs, choices, keys, SMR consistency, and LaTeX delimiter balance for every item, curated included.
3. Worked solutions are required everywhere, and the in-app flag button routes suspected errors to `/flags` for export.

If you flag an item and confirm it's wrong: fix the generator or JSON, run `npm run gen && npm run verify && npm test`, and item IDs stay stable.
