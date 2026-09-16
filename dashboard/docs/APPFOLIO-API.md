# AppFolio Reports API — integration notes

Hard-won knowledge from building this dashboard (June–September 2026), verified
against the live NeighbourGood database. Read this before touching
`lib/appfolio.ts` or starting a new integration — it will save you the same
finicking.

## The basics

- **Endpoint**: `POST https://{APPFOLIO_DATABASE}.appfolio.com/api/v2/reports/{report_name}.json`
- **Auth**: HTTP Basic — `{APPFOLIO_CLIENT_ID}:{APPFOLIO_CLIENT_SECRET}`.
  Server-side only; `lib/appfolio.ts` is marked `import "server-only"` so the
  secret can never bundle into the client. Credentials live **only** in Vercel
  env vars (and `.env.local` locally, which is gitignored). Never commit them.
- **Body**: JSON. Always send `{"paginate_results": true, ...params}`.
- **Response shape**: `results` is a plain array of row objects;
  `next_page_url` (when present) is a **top-level sibling** of `results`, valid
  ~30 min, fetched with GET, and **not rate-limited**.
- **Dates** are `YYYY-MM-DD` strings; **amounts** are strings like `"1500.00"`.

## Rate limit (the big one)

~**7 requests / 15 seconds**. The integration handles this by:

1. Fetching reports **sequentially with spacing** (`setTimeout` delays of 2–6s
   between report calls — see `lib/appfolio.ts`).
2. A **module-scope in-memory TTL cache** (15 min) per report. Deliberately not
   `unstable_cache`/Data Cache so a bad value can never persist across deploys.
   Empty results are never cached (transient failures self-heal).
3. Retrying 429s with backoff (8s, 16s, 24s).
4. `/api/refresh` calls `clearCache()` for a manual refresh.

Adding a new report call? Add a delay before it and keep total calls per cold
load well under 7.

## Which report for what (the key discoveries)

| Need | Report | Params | Gotchas |
|---|---|---|---|
| All units + current leases | `rent_roll` | none | **`tenant: null` on all `Vacant-Rented` rows** — rent_roll will never tell you who the future tenant is. Statuses seen live: `Current`, `Vacant-Rented`, `Vacant-Unrented`, `Notice-Rented`, `Notice-Unrented`. `lease_to: null` = month-to-month. For Notice tenants `move_out` may be null — fall back to `lease_to`. |
| **Future tenants** (names + real move-in dates) | `tenant_directory` | `{"tenant_statuses": ["2"]}` | The discovery that fixed move-ins. Returns **all** future tenants, including ones who've only paid a deposit and aren't billed yet. `rent` shows `"0.00"` until invoiced. |
| Current tenants' **email/phone** | `tenant_directory` | `{"tenant_statuses": ["0"]}` | Contact columns are **plural**: `emails`, `phone_numbers` (multi-value, comma-joined; phone entries may carry a `Type:` label prefix — strip it). rent_roll has no contact columns at all. |
| Rent amounts for future tenants | `aged_receivables_detail` | `{"tenant_statuses": ["2"]}` | Only returns **billed** tenants (misses deposit-only ones) → use solely to overlay rent onto tenant_directory rows, matching `account_name == "Rent Income"` by `unit_id`. Old charges can produce spurious rows — never use it as the source of who is moving in. |
| Vacancy detail | `unit_vacancy` | none | Fallback chain: `unit_vacancy_detail`, `unit_directory`, `vacant_unit_detail`. |

Tenant-status codes for `tenant_directory`: `"0"` = current, `"2"` = future.

**What does NOT work**: passing date/as-of parameters to these reports. Probes
with every documented date-param variant returned identical row sets — there is
no "rent roll as of date X" through this API. Historical comparison has to be
done by saving exports over time.

## Derived metrics (lib/leasing.ts)

Two occupancy numbers, always shown together:

- **Leased %** (economic): unit has a signed lease — statuses Current, Notice-*,
  Vacant-Rented, or a future tenant exists.
- **Physical %** (bodies in building): Current + Notice-* only.
- `leased − physical` = units **in turnover** (empty between tenants).
  Do **not** call these "vacant" in user-facing copy — "vacant" is reserved for
  unleased units. This wording was explicitly requested.

Move-ins merge three sources (tenant_directory status-2 → rent_roll future
dates for overrides/fixtures → Vacant-Rented placeholders). Renewals exclude
tenants already on notice and units with a future lease; month-to-month is
tracked but excluded from boss-facing PDF reports (explicit request).

## Environment / deployment facts

- Vercel project deploys from `main`, **Root Directory = `dashboard`**.
  Live at `btv-ten.vercel.app`. Pushing to `main` redeploys the live site.
- Env vars: `APPFOLIO_DATABASE`, `APPFOLIO_CLIENT_ID`, `APPFOLIO_CLIENT_SECRET`,
  `DASHBOARD_PASSWORD`, `SESSION_SECRET`, optional `MOVE_IN_OVERRIDES` (JSON
  array), optional KV (`KV_REST_API_URL`/`KV_REST_API_TOKEN` or Upstash
  equivalents) for the renewal-outreach tracker.
- **Claude Code web sessions cannot reach** `*.appfolio.com`, `*.vercel.app`,
  or `api.vercel.com` (network policy). Live-data debugging goes through the
  user: the password-gated `/api/inspect` route dumps raw report rows, and the
  dashboard's **Export CSV** button produces the full dataset — the user pastes
  or uploads either one.
- `/api/inspect` is the probe harness — extend it to answer "what columns does
  report X return", have the user open it, and read the paste.

## Key files

- `dashboard/lib/appfolio.ts` — fetch layer: auth, pagination, rate-limit
  spacing, TTL cache, report fallback chains, the tenant_directory /
  aged_receivables merge.
- `dashboard/lib/leasing.ts` — pure derivations (move-ins/outs, renewals,
  occupancy); column-name adapters; contact extraction with plural/singular
  candidates and phone-label stripping.
- `dashboard/lib/export.ts` + `app/api/export/route.ts` — the CSV export the
  PDF report scripts consume.
- `dashboard/scripts/reports/` — offline PDF report generators (see its README).
- `dashboard/app/api/inspect/route.ts` — diagnostic dump of raw reports.
