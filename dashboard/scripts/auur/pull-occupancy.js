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
 * Usage:
 *   node pull-occupancy.js [--config auur-2026.json] [--out out/occupancy-snapshot.json]
 *
 * Credentials: APPFOLIO_DATABASE, APPFOLIO_CLIENT_ID, APPFOLIO_CLIENT_SECRET from
 * the environment or dashboard/.env.local (gitignored). They are never printed
 * and never written to the snapshot.
 *
 * Test hooks (not for normal use): AUUR_API_BASE overrides the API origin;
 * AUUR_PACE_MS / AUUR_RETRY_MS shorten the rate-limit spacing.
 */
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const USAGE = "usage: node pull-occupancy.js [--config auur-2026.json] [--out out/occupancy-snapshot.json]";

function parseArgs(argv) {
  const out = { config: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "-h" || a === "--help") { console.log(USAGE); process.exit(0); }
    else { console.error(`unknown argument: ${a}\n${USAGE}`); process.exit(1); }
  }
  return out;
}

// Minimal .env.local loader (same idea as scripts/check-appfolio.ts) — values
// already present in the environment win.
function loadEnvLocal() {
  const envPath = path.join(L.HERE, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
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
  return {
    db,
    base: process.env.AUUR_API_BASE || `https://${db}.appfolio.com`,
    auth: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
  };
}

const PACE_MS = Number(process.env.AUUR_PACE_MS ?? 3000);   // ~7 req / 15 s limit → keep well under
const RETRY_MS = Number(process.env.AUUR_RETRY_MS ?? 8000); // 429 back-off: 8 s, 16 s, 24 s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, init, label) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= 3) return res;
    const wait = RETRY_MS * (attempt + 1);
    console.log(`  rate limited on ${label}; waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

function extractRows(json) {
  if (Array.isArray(json.results)) return json.results;
  if (json.results && Array.isArray(json.results.data)) return json.results.data;
  return [];
}

/** POST a report and follow next_page_url (top-level, GET, not rate-limited). */
async function report(creds, name, params = {}) {
  const url = `${creds.base}/api/v2/reports/${name}.json`;
  const headers = { Authorization: creds.auth, "Content-Type": "application/json", Accept: "application/json" };
  const res = await request(url, { method: "POST", headers, body: JSON.stringify({ paginate_results: true, ...params }) }, name);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300).replace(/\s+/g, " ");
    const err = new Error(`${name} -> HTTP ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  let json = await res.json();
  const rows = extractRows(json);
  let next = json.next_page_url || null;
  let pages = 1;
  while (next && pages < 500) {
    const r = await request(next, { method: "GET", headers: { Authorization: creds.auth, Accept: "application/json" } }, `${name} page ${pages + 1}`);
    if (!r.ok) throw new Error(`${name} page ${pages + 1} -> HTTP ${r.status}`);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = L.loadConfig(args.config);
  const outFile = path.resolve(args.out || path.join(L.HERE, "out", "occupancy-snapshot.json"));
  const envFile = loadEnvLocal();
  const creds = credentials();
  const warnings = [];

  const match = str(cfg.property.match).toLowerCase();
  if (!match) { console.error(`${cfg.configPath}: property.match is required`); process.exit(1); }
  const isMine = (row) => str(row.property_name).toLowerCase().includes(match);
  const namesSeen = new Set();
  const noteNames = (rows) => { for (const r of rows) if (r.property_name != null) namesSeen.add(str(r.property_name)); };

  console.log(`AppFolio database: ${creds.db}${envFile ? `  (credentials from ${path.relative(process.cwd(), envFile)})` : ""}`);
  console.log(`Property filter:   property_name contains "${cfg.property.match}"`);

  // 1. rent_roll — the unit list and today's status for every unit.
  console.log("→ rent_roll");
  const rentRollAll = await report(creds, "rent_roll");
  noteNames(rentRollAll);
  const rentRoll = rentRollAll.filter(isMine);
  console.log(`  ${rentRollAll.length} rows, ${rentRoll.length} for this property`);

  // 2. tenant_directory — one call per tenant status code (current / past / future / notice).
  const directory = {};
  for (const [code, label] of Object.entries(cfg.tenantStatusCodes)) {
    await sleep(PACE_MS);
    console.log(`→ tenant_directory tenant_statuses=["${code}"]  (${label})`);
    try {
      const rows = await report(creds, "tenant_directory", { tenant_statuses: [code] });
      noteNames(rows);
      directory[code] = rows.filter(isMine);
      console.log(`  ${rows.length} rows, ${directory[code].length} for this property`);
    } catch (e) {
      directory[code] = [];
      warnings.push(`tenant_directory tenant_statuses=["${code}"] (${label}) failed: ${e.message}`);
      console.log(`  failed: ${e.message}`);
    }
  }

  if (rentRoll.length === 0 && Object.values(directory).every((r) => r.length === 0)) {
    console.error(`\nNo rows matched property "${cfg.property.match}". Property names seen in AppFolio:`);
    for (const n of [...namesSeen].sort()) console.error(`  - ${n}`);
    console.error(`Fix "property.match" in ${cfg.configPath} and re-run.`);
    process.exit(2);
  }

  // 3. Units (from rent_roll) and their room numbers.
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

  // 4. Occupancies = union of the tenant_directory pulls, de-duplicated.
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
  if (occ.size === 0) {
    warnings.push("tenant_directory returned no rows for this property — falling back to rent_roll current tenants (past dates will NOT be accurate)");
    for (const r of rentRoll) {
      if (!L.cleanName(r.tenant)) continue;
      const o = L.toOccupancy(r, { source: "rent_roll", status_label: "current", also_in: [] });
      o.room = L.roomFromUnit(o.unit, cfg.unitRoomOverrides);
      occ.set(L.occupancyKey(o), o);
    }
  }
  const occupancies = [...occ.values()];

  // 5. Sanity check: derived occupancy for TODAY must agree with rent_roll's own status.
  const today = L.todayIn(cfg.property.timeZone);
  const todayLog = L.dailyLog(today, { occupancies }, cfg);
  const mismatches = [];
  for (const u of units) {
    const row = todayLog.rows.find((r) => r.room === u.room);
    if (!row) continue;
    const rrOccupied = /^(current|notice)/i.test(u.status);
    if (rrOccupied !== row.occupied) {
      mismatches.push(`room ${u.room}: rent_roll says "${u.status || "?"}"${u.tenant ? ` (${u.tenant})` : ""}; move-in/move-out dates say ${row.occupied ? `occupied by ${row.tenants.join(", ")}` : "vacant"}`);
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
    units,
    occupancies,
    today_check: { date: today, mismatches },
    warnings: [...warnings, ...todayLog.warnings],
    raw: { rent_roll: rentRoll.map(stripContacts), tenant_directory: Object.fromEntries(Object.entries(directory).map(([c, rows]) => [c, rows.map(stripContacts)])) },
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));

  // 6. Summary.
  console.log(`\nSnapshot written: ${outFile}`);
  console.log(`Units for this property: ${units.length}  (rooms ${units.map((u) => u.room).filter(Boolean).sort((a, b) => a - b).join(", ")})`);
  console.log(`Occupancy records: ${occupancies.length}  (${Object.entries(snapshot.rows_per_status).map(([c, n]) => `${cfg.tenantStatusCodes[c]}: ${n}`).join(", ")})`);
  console.log(`\nPreview — occupied rooms per required date (as of ${today}):`);
  for (const iso of cfg.dates) {
    if (iso > today) { console.log(`  ${iso}  (future — will be left blank)`); continue; }
    const log = L.dailyLog(iso, snapshot, cfg);
    console.log(`  ${iso}  ${String(log.occupied).padStart(2)} occupied, ${String(log.vacantRooms.length).padStart(2)} vacant${log.vacantRooms.length ? ` (rooms ${log.vacantRooms.join(", ")})` : ""}`);
  }
  if (mismatches.length) {
    console.log(`\nToday-check: ${mismatches.length} room(s) where rent_roll status and the move-in/out dates disagree — review these:`);
    for (const m of mismatches) console.log(`  ! ${m}`);
  } else {
    console.log(`\nToday-check: derived occupancy for ${today} matches rent_roll for all ${units.length} units.`);
  }
  if (snapshot.warnings.length) {
    console.log(`\nWarnings:`);
    for (const w of snapshot.warnings) console.log(`  ! ${w}`);
  }
  console.log(`\nNext: node build-daily-logs.js "${outFile}"`);
}

main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
