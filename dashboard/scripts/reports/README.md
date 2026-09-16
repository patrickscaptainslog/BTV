# PDF report generators

Turn a dashboard **Export CSV** file into boss-ready PDF reports that mirror
the dashboard's look. These run fully offline — no AppFolio access needed —
which is why they take the CSV as input (Claude Code web sessions can't reach
the live API; see `../../docs/APPFOLIO-API.md`).

## One command

```sh
./make-reports.sh <leasing-report-export.csv> [out-dir]
```

Produces, dated from the CSV's own "Generated" stamp:

- `NeighbourGood-Weekly-Leasing-Report-<date>.pdf` — combined weekly report:
  "This Week at a Glance" (three wins + amber "rooms to backfill" card),
  occupancy by property, KPIs, move-ins, move-outs, renewals.
- `NeighbourGood-<Property>-Leasing-Report-<date>.pdf` — one per property
  (snapshot KPI row, move-ins/outs, renewals).

Needs Node plus any headless Chrome/Chromium (`CHROME=/path` to override; in a
Claude Code web session the binary lives under `/opt/pw-browsers/`).

## Individual generators

```sh
node genweekly.js <export.csv> [out-dir]   # writes weekly.html
node genreport.js <export.csv> [out-dir]   # writes report-<Property>.html each
```

Render HTML → PDF with:

```sh
chrome --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=out.pdf in.html
```

## Approved wording/framing (don't regress these)

- Report date comes from the CSV's `Generated` stamp — never "today".
- **Never say "vacant"** for leased-but-empty units: those are "in turnover";
  "vacant" is only for truly unleased units (both shown when nonzero).
- Month-to-month tenants are **excluded** from the renewals tables.
- Tenant email/phone shown as plain text under the name (no mailto/tel links);
  first value only, `tel:`/type-label prefixes stripped.
- Header credit: "Prepared by Patrick **Diederich**" (note the spelling).
- No 12-month lease-expirations chart; no "no expired/overdue leases" bullet.
- The amber "Next up: N rooms to backfill" card is data-derived (move-outs
  without a signed replacement) and disappears on its own when the list is
  empty.
