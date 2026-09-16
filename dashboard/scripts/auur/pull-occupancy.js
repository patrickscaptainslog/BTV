#!/usr/bin/env node
"use strict";
/**
 * pull-occupancy.js — pull, from the AppFolio Reports API, everything needed to
 * say who occupied each room of the AUUR property on any past date, and save it
 * as a snapshot JSON for build-daily-logs.js.
 *
 * Why not "rent roll as of <date>"? The Reports API has no as-of parameter for
 * rent_roll (see ../../docs/APPFOLIO-API.md). tenant_directory does return
 * move_in / move_out for current, past, future and notice tenants, and that is
 * enough to answer "who was in room N on date D" exactly — no projections.
 *
 * The script refuses to write a snapshot it cannot vouch for: a network/5xx
 * failure, a status code the API rejects, or a "past tenants" pull that comes
 * back empty or does not look like past tenants all stop the run, because a
 * snapshot missing move-outs would quietly mark rooms Vacant on earlier dates.
 *
 * Usage:
 *   node pull-occupancy.js [--config auur-2026.json] [--out out/occupancy-snapshot.json] [--allow-empty-past]
 *
 * Credentials: APPFOLIO_DATABASE, APPFOLIO_CLIENT_ID, APPFOLIO_CLIENT_SECRET from
 * the environment or dashboard/.env.local (gitignored). They are never printed
 * and never written to the snapshot.
 *
 * Test hooks (not for normal use): AUUR_API_BASE overrides the API origin;
 * AUUR_PACE_MS / AUUR_RETRY_MS shorten the rate-limit spacing; AUUR_ENV_FILE
 * points at a different .env file.
 */
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const USAGE = "usage: node pull-occupancy.js [--config auur-2026.json] [--out out/occupancy-snapshot.json] [--allow-empty-past]";

function parseArgs(argv) {
  const out = { config: null, out: null, allowEmptyPast: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--allow-empty-past") out.allowEmptyPast = true;
    else if (a === "-h" || a === "--help") { console.log(USAGE); process.exit(0); }
    else { console.error(`unknown argument: ${a}\n${USAGE}`); process.exit(1); }
  }
  return out;
}

// Minimal .env.local loader (same idea as scripts/check-appfolio.ts) — values
// already present in the environment win; only APPFOLIO_* keys are imported.
function loadEnvLocal() {
  const envPath = process.env.AUUR_ENV_FILE || path.join(L.HERE, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?(APPFOLIO_[A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    const q = v.match(/^(["'])(.*?)\1/);
    v = q ? q[2] : v.replace(/\s+#.*$/, "").trim();
    process.env[m[1]] = v;
  }
  return envPath;
}

function credentials() {
  const db = process.env.APPFOLIO_DATABASE;
  const id = process.env.APPFOLIO_CLIENT_ID;
  const secret = process.env.APPFOLIO_CLIENT_SECRET;
  const missing = [["APPFOLIO_DATABASE", db], ["APPFOLIO_CLIENT_ID", id], ["APPFOLIO_CLIENT_SECRET", secret]]
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}.\nPut them in dashboard/.env.local (copy .env.example) or export them in the shell.`);
    process.exit(1);
  }
  if (!/^[a-z0-9-]+$/i.test(db)) {
    console.error(`APPFOLIO_DATABASE must be the subdomain only (e.g. "acme" for acme.appfolio.com), got "${db}".`);
    process.exit(1);
  }
  return {
    db,
    base: process.env.AUUR_API_BASE || `https://${db}.appfolio.com`,
    auth: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
  };
}

const PACE_MS = Number(process.env.AUUR_PACE_MS ?? 3000);   // ~7 req / 15 s limit → keep well under
const RETRY_MS = Number(process.env.AUUR_RETRY_MS ?? 8000); // 429 back-off: 8 s, 16 s, 24 s
const TIMEOUT_MS = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** fetch with 429 back-off and two retries for network errors / 5xx. */
async function request(url, init, label) {
  let attempt = 0, netRetries = 0;
  for (;;) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (netRetries++ >= 2) throw new Error(`${label}: network error — ${e.cause?.code || e.cause?.message || e.name || e.message}`);
      console.log(`  ${label}: ${e.cause?.code || e.name}; retrying`);
      await sleep(RETRY_MS);
      continue;
    }
    if (res.status === 429 && attempt < 3) {
      attempt++;
      const wait = RETRY_MS * attempt;
      console.log(`  rate limited on ${label}; waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status >= 500 && netRetries++ < 2) {
      console.log(`  ${label}: HTTP ${res.status}; retrying`);
      await sleep(RETRY_MS);
      continue;
    }
    return res;
  }
}

function extractRows(json) {
  if (Array.isArray(json.results)) return json.results;
  if (json.results && Array.isArray(json.results.data)) return json.results.data;
  return [];
}

/** POST a report and follow next_page_url (top-level, GET, same origin, not rate-limited). */
async function report(creds, name, params = {}) {
  const url = `${creds.base}/api/v2/reports/${name}.json`;
  const headers = { Authorization: creds.auth, "Content-Type": "application/json", Accept: "application/json" };
  const res = await request(url, { method: "POST", headers, body: JSON.stringify({ paginate_results: true, ...params }) }, name);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300).replace(/\s+/g, " ");
    throw new ApiError(`${name} -> HTTP ${res.status}: ${body}`, res.status);
  }
  let json = await res.json();
  const rows = extractRows(json);
  let next = json.next_page_url || null;
  let pages = 1;
  while (next && pages < 500) {
    if (new URL(next).origin !== new URL(creds.base).origin) throw new Error(`${name}: refusing to send credentials to ${new URL(next).origin} (next_page_url on a different host)`);
    const r = await request(next, { method: "GET", headers: { Authorization: creds.auth, Accept: "application/json" } }, `${name} page ${pages + 1}`);
    if (!r.ok) throw new ApiError(`${name} page ${pages + 1} -> HTTP ${r.status}`, r.status);
    json = await r.json();
    rows.push(...extractRows(json));
    next = json.next_page_url || null;
    pages++;
  }
  return rows;
}

// Drop contact details from the raw rows kept in the snapshot — the log only needs names.
function stripContacts(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!/email|phone|ssn|birth/i.test(k)) out[k] = v;
  return out;
}

const str = (v) => (v == null ? "" : String(v));
function fail(msg) { console.error(`\nERROR: ${msg}`); process.exit(1); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = L.loadConfig(args.config);
  const outFile = path.resolve(args.out || path.join(L.HERE, "out", "occupancy-snapshot.json"));
  const envFile = loadEnvLocal();
  const creds = credentials();
  const warnings = [];

  const match = str(cfg.property.match).toLowerCase();
  if (!match) fail(`${cfg.configPath}: property.match is required`);
  const isMine = (row) => str(row.property_name).toLowerCase().includes(match);
  const namesSeen = new Set();
  const noteNames = (rows) => { for (const r of rows) if (r.property_name != null) namesSeen.add(str(r.property_name)); };
  const today = L.todayIn(cfg.property.timeZone);

  console.log(`AppFolio database: ${creds.db}${envFile ? `  (credentials from ${path.relative(process.cwd(), envFile)})` : ""}`);
  if (creds.base !== `https://${creds.db}.appfolio.com`) console.log(`API base overridden: ${creds.base}`);
  console.log(`Property filter:   property_name contains "${cfg.property.match}"`);
  console.log(`Today (${cfg.property.timeZone}): ${today}`);

  // 1. rent_roll — the unit list and today's status for every unit.
  console.log("→ rent_roll");
  const rentRollAll = await report(creds, "rent_roll");
  noteNames(rentRollAll);
  const rentRoll = rentRollAll.filter(isMine);
  console.log(`  ${rentRollAll.length} rows, ${rentRoll.length} for this property`);

  // 2. tenant_directory — one call per tenant status code (current / past / future / notice).
  //    A code the API rejects (4xx) is recorded; anything else (network, 5xx) is fatal.
  const directory = {};
  const rejected = [];
  for (const [code, label] of Object.entries(cfg.tenantStatusCodes)) {
    await sleep(PACE_MS);
    console.log(`→ tenant_directory tenant_statuses=["${code}"]  (${label})`);
    try {
      const rows = await report(creds, "tenant_directory", { tenant_statuses: [code] });
      noteNames(rows);
      directory[code] = rows.filter(isMine);
      console.log(`  ${rows.length} rows, ${directory[code].length} for this property`);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        directory[code] = [];
        rejected.push(code);
        warnings.push(`tenant_statuses=["${code}"] (${label}) was rejected by the API: ${e.message}`);
        console.log(`  rejected: ${e.message}`);
      } else {
        throw e;
      }
    }
  }

  if (rentRoll.length === 0 && Object.values(directory).every((r) => r.length === 0)) {
    console.error(`\nNo rows matched property "${cfg.property.match}". Property names seen in AppFolio:`);
    for (const n of [...namesSeen].sort()) console.error(`  - ${n}`);
    console.error(`Fix "property.match" in ${cfg.configPath} and re-run.`);
    process.exit(2);
  }

  // 3. Do the pulls look like what their labels say? (codes "1"/"3" were never
  //    verified against the live API — this is the check that catches a wrong code)
  const endOf = (r) => L.toIso(r.move_out) || L.toIso(r.lease_to);
  const checks = [];
  for (const [code, label] of Object.entries(cfg.tenantStatusCodes)) {
    const rows = directory[code] || [];
    if (label === "past") {
      if (rows.length === 0) {
        const msg = `tenant_statuses=["${code}"] (past tenants) returned no rows for this property${rejected.includes(code) ? " (the API rejected the code)" : ""}. Without move-outs, every earlier date would wrongly show rooms as Vacant. Check tenantStatusCodes in ${path.basename(cfg.configPath)}; if nobody has really moved out, re-run with --allow-empty-past.`;
        if (!args.allowEmptyPast) fail(msg);
        warnings.push(msg);
      } else {
        const ended = rows.filter((r) => endOf(r) && endOf(r) <= today).length;
        checks.push(`past: ${ended}/${rows.length} rows have a move-out on or before today`);
        if (ended < rows.length / 2) fail(`tenant_statuses=["${code}"] is labelled "past" but only ${ended} of ${rows.length} rows have a move-out date on or before today — this code does not look like past tenants. Fix tenantStatusCodes in ${path.basename(cfg.configPath)}.`);
      }
    } else if (label === "current" || label === "notice") {
      const here = rows.filter((r) => L.toIso(r.move_in) && L.toIso(r.move_in) <= today).length;
      checks.push(`${label}: ${here}/${rows.length} rows have a move-in on or before today`);
      if (rows.length && here < rows.length / 2) warnings.push(`tenant_statuses=["${code}"] (${label}): only ${here} of ${rows.length} rows have moved in already — check the code`);
    } else if (label === "future") {
      const later = rows.filter((r) => L.toIso(r.move_in) && L.toIso(r.move_in) > today).length;
      checks.push(`future: ${later}/${rows.length} rows have a move-in after today`);
      if (rows.length && later < rows.length / 2) warnings.push(`tenant_statuses=["${code}"] (future): only ${later} of ${rows.length} rows move in after today — check the code`);
    }
  }
  const anyMoveOut = Object.values(directory).flat().some((r) => L.toIso(r.move_out));
  if (!anyMoveOut && !args.allowEmptyPast) fail("no tenant_directory row for this property carries a move_out date — the report seems not to return move-outs, so past dates cannot be reconstructed from it.");

  // 4. Units (from rent_roll) and their room numbers.
  const units = rentRoll.map((r) => ({
    unit_id: str(r.unit_id), unit: str(r.unit), room: L.roomFromUnit(r.unit, cfg.unitRoomOverrides),
    status: str(r.status), tenant: L.cleanName(r.tenant),
    move_in: L.toIso(r.move_in), move_out: L.toIso(r.move_out), lease_from: L.toIso(r.lease_from), lease_to: L.toIso(r.lease_to),
  }));
  const roomsCovered = new Set(units.map((u) => u.room).filter(Boolean));
  for (const room of cfg.rooms) if (!roomsCovered.has(room)) warnings.push(`room ${room} has no unit in rent_roll — check the unit label mapping (unitRoomOverrides)`);
  for (const u of units) if (!u.room || !cfg.rooms.includes(u.room)) warnings.push(`unit "${u.unit}" (id ${u.unit_id}) maps to room "${u.room}", which is not in the room list`);
  const dupRooms = units.map((u) => u.room).filter((r, i, a) => r && a.indexOf(r) !== i);
  for (const r of new Set(dupRooms)) warnings.push(`more than one rent_roll unit maps to room ${r}: ${units.filter((u) => u.room === r).map((u) => `"${u.unit}"`).join(", ")}`);

  // 5. Occupancies = union of the tenant_directory pulls, de-duplicated.
  const occ = new Map();
  for (const [code, rows] of Object.entries(directory)) {
    const label = cfg.tenantStatusCodes[code];
    for (const r of rows) {
      const o = L.toOccupancy(r, { source: `tenant_directory:${code}`, status_label: label, also_in: [] });
      o.room = L.roomFromUnit(o.unit, cfg.unitRoomOverrides);
      const k = L.occupancyKey(o);
      const prev = occ.get(k);
      if (prev) { if (prev.status_label !== label && !prev.also_in.includes(label)) prev.also_in.push(label); }
      else occ.set(k, o);
    }
  }
  if (occ.size === 0) fail("tenant_directory returned no rows for this property — nothing to build the logs from.");
  const occupancies = [...occ.values()];

  // 6. Sanity check: derived occupancy for TODAY must agree with rent_roll's own status and names.
  const snapshotForCheck = { occupancies, pulled_on: today };
  const todayLog = L.dailyLog(today, snapshotForCheck, cfg);
  const mismatches = [];
  for (const u of units) {
    const row = todayLog.rows.find((r) => r.room === u.room);
    if (!row) continue;
    const rrOccupied = /^(current|notice)/i.test(u.status);
    if (rrOccupied !== row.occupied) {
      mismatches.push(`room ${u.room}: rent_roll says "${u.status || "?"}"${u.tenant ? ` (${u.tenant})` : ""}; move-in/move-out dates say ${row.occupied ? `occupied by ${row.tenants.join(", ")}` : "vacant"}`);
    } else if (rrOccupied && u.tenant) {
      const rr = u.tenant.toLowerCase();
      const extra = row.tenants.filter((n) => !rr.includes(n.toLowerCase()));
      if (extra.length) mismatches.push(`room ${u.room}: dates also list ${extra.join(", ")} today, but rent_roll shows "${u.tenant}" — a record that should have ended?`);
    }
  }

  const snapshot = {
    schema: "auur-occupancy-snapshot/1",
    pulled_at: new Date().toISOString(),
    pulled_on: today,
    time_zone: cfg.property.timeZone,
    database: creds.db,
    property_match: cfg.property.match,
    property_names_seen: [...namesSeen].sort(),
    status_codes: cfg.tenantStatusCodes,
    rows_per_status: Object.fromEntries(Object.entries(directory).map(([c, rows]) => [c, rows.length])),
    status_checks: checks,
    rejected_status_codes: rejected,
    units,
    occupancies,
    today_check: { date: today, mismatches },
    warnings: [...warnings, ...todayLog.warnings],
    raw: { rent_roll: rentRoll.map(stripContacts), tenant_directory: Object.fromEntries(Object.entries(directory).map(([c, rows]) => [c, rows.map(stripContacts)])) },
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));

  // 7. Summary.
  console.log(`\nSnapshot written: ${outFile}`);
  console.log(`Units for this property: ${units.length}  (rooms ${units.map((u) => u.room).filter(Boolean).sort((a, b) => a - b).join(", ")})`);
  console.log(`Occupancy records: ${occupancies.length}  (${Object.entries(snapshot.rows_per_status).map(([c, n]) => `${cfg.tenantStatusCodes[c]}: ${n}`).join(", ")})`);
  for (const c of checks) console.log(`  ${c}`);
  console.log(`\nPreview — occupied rooms per required date (as of ${today}):`);
  for (const iso of cfg.dates) {
    if (iso > today) { console.log(`  ${iso}  (future — will be left blank)`); continue; }
    const log = L.dailyLog(iso, snapshot, cfg);
    console.log(`  ${iso}  ${String(log.occupied).padStart(2)} occupied, ${String(log.vacantRooms.length).padStart(2)} vacant${log.vacantRooms.length ? ` (rooms ${log.vacantRooms.join(", ")})` : ""}${iso === today ? "  (same-day pull: re-run after today to confirm)" : ""}`);
  }
  if (mismatches.length) {
    console.log(`\nToday-check: ${mismatches.length} room(s) where rent_roll and the move-in/out dates disagree — review these:`);
    for (const m of mismatches) console.log(`  ! ${m}`);
  } else {
    console.log(`\nToday-check: derived occupancy for ${today} matches rent_roll for all ${units.length} units.`);
  }
  if (snapshot.warnings.length) {
    console.log(`\nWarnings:`);
    for (const w of snapshot.warnings) console.log(`  ! ${w}`);
  }
  console.log(`\nNext: node "${path.join(L.HERE, "build-daily-logs.js")}" "${outFile}"`);
}

main().catch((e) => { console.error(`\nERROR: ${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ""}`); process.exit(1); });
