# AUUR Daily Logs — 2072 Mission St

Builds the **Daily Logs** that go with the San Francisco DBI *Annual Unit Usage
Report* (AUUR, SF Admin Code Chapter 41) for 2072 Mission St (block 3569 / lot
014): one log per required date, in the workbook template the city has seen
before, plus one combined PDF with a page per date.

The city's 2026 notice asks for the first Friday of every month from November
2025 to October 2026 (12 logs) and, for Sections 4–5 of the form, the log for
**October 15, 2026**. All 13 dates live in `auur-2026.json` — next year, change
that file only.

## One command

```sh
cd dashboard && npm install            # once — installs exceljs
scripts/auur/make-auur.sh              # pulls from AppFolio, fills the workbook, renders the PDF
```

Outputs land in `scripts/auur/out/` (gitignored — it contains tenant names):

| File | What it is |
|---|---|
| `2072 Mission Daily Log - 2026.xlsx` | The template with one tab per date (`11.7.25`, `12.5.25`, … `10.15.26`); blank `Master Sheet` kept first |
| `2072 Mission Daily Logs - AUUR 2026.pdf` | One page per date, same look as last year's submission |
| `occupancy-snapshot.json` | Everything pulled from AppFolio + the derived records (re-buildable offline) |
| `daily-logs-summary.txt` | Occupied count and vacant rooms per date, plus anything to double-check |

Needs Node 18+, AppFolio credentials in `dashboard/.env.local`
(`APPFOLIO_DATABASE`, `APPFOLIO_CLIENT_ID`, `APPFOLIO_CLIENT_SECRET` — see
`.env.example`), and a Chrome/Chromium for the PDF (`CHROME=/path/to/chrome` to
override; Google Chrome in `/Applications` on a Mac, or under Program Files on
Windows, is found automatically).

**Dates after the pull date are left blank on purpose** — the city wants the
exact status on the day, never a projection (that was the instruction from
Anneke in the 9/16/2026 meeting). Run again after October 2 and after October
15 to fill the last two tabs; every earlier tab is regenerated identically.

## The two steps, separately

```sh
node scripts/auur/pull-occupancy.js --out out/occupancy-snapshot.json   # needs AppFolio access
node scripts/auur/build-daily-logs.js out/occupancy-snapshot.json --out out/   # works offline
```

`build-daily-logs.js` options: `--pdf-order newest-first` (last year's PDF ran
newest to oldest; default is chronological), `--no-pdf`, `--blank` (dated but
empty tabs, no snapshot needed), `--config`, `--template`.

A Claude Code web session cannot reach AppFolio (network policy — see
`../../docs/APPFOLIO-API.md`), so the split matters: run the pull locally, then
either run the build locally too or hand the snapshot to Claude and let it
build, review, and package the files.

## How occupancy on a past date is worked out

The Reports API has **no "rent roll as of date"** — every date parameter is
ignored (verified, see the API notes). What it does have is `tenant_directory`,
which returns `move_in` / `move_out` for **current, past, future and notice**
tenants (`tenant_statuses` `"0"`, `"1"`, `"2"`, `"4"` — verified against the live
API on 2026-09-16; `"3"` returns nothing; the codes are in the config so they can
be corrected without touching code). From those, room *N* on date
*D* is occupied by every tenant whose stay covers *D*:

- start = `move_in` (fallback `lease_from`); end = `move_out`
- **inclusive on both ends** — a tenant counts on their move-in day and on their move-out day
- no `move_out` = still there, except for *past* tenants, where `lease_to` is used
  and a record with neither is skipped (and reported) rather than shown as
  occupying a room forever
- a signed-but-not-yet-moved-in tenant (`Vacant-Rented`) does **not** count — the room shows *Vacant*
- co-living rooms list every occupant, comma-separated, primary tenant first
- names are shown "First Last" as rent_roll and the AppFolio UI show them (rebuilt
  from tenant_directory's `first_name` / `last_name`, since its `tenant` column is
  "Last, First"); whitespace-cleaned, nothing else

The pull also fetches `rent_roll` for the unit list and cross-checks the
derivation for *today* against AppFolio's own unit statuses and primary tenant
names; any disagreement is
printed and written into the summary as a "today-check" line. Unit labels map to
room numbers by their first integer (`"7"`, `"7 - 7"`, `"Room 7"` → 7); odd
labels can be pinned in `unitRoomOverrides`.

`test/` has unit tests for the rules and an end-to-end run of the pull script
against a local mock of the API (auth, pagination, 429 retry, property filter):

```sh
node --test scripts/auur/test/*.test.js
```

## Things the scripts do not decide for you

- **Certified room counts.** Section 1 of the 2026 form lists 16 residential +
  4 tourist rooms; the log (as in previous years) lists all 20 rooms as
  residential with 0 tourist. Questions 4.5 / 5.5 will ask about that
  difference — same as last year.
- **Section 6.3 (average residential rent for October 2026)** is not computed here.
- **Names.** The log shows the tenant name exactly as AppFolio has it (minus
  double spaces). Notes like "(coliving)" or "(Property Manager)" are part of the
  last name in AppFolio and come through as-is; to change one, fix it in AppFolio
  and re-pull, or edit the snapshot and re-run the build (the PDF and the workbook
  are generated from the same data).
