"use strict";
/**
 * Shared helpers for the AUUR (Annual Unit Usage Report) daily-log scripts.
 * Zero dependencies. Used by pull-occupancy.js, build-daily-logs.js and tests.
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;

// --- config -----------------------------------------------------------------
function loadConfig(file) {
  const p = file || path.join(HERE, "auur-2026.json");
  const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(cfg.dates) || cfg.dates.length === 0) throw new Error(`${p}: "dates" must be a non-empty array`);
  for (const d of cfg.dates) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`${p}: bad date "${d}" (want YYYY-MM-DD)`);
  if (!Array.isArray(cfg.rooms) || cfg.rooms.length === 0) throw new Error(`${p}: "rooms" must be a non-empty array`);
  cfg.rooms = cfg.rooms.map(String);
  cfg.dates = Array.from(new Set(cfg.dates)).sort();
  cfg.unitRoomOverrides = cfg.unitRoomOverrides || {};
  cfg.tenantStatusCodes = cfg.tenantStatusCodes || { "0": "current", "1": "past", "2": "future", "3": "notice" };
  cfg.property = cfg.property || {};
  cfg.property.timeZone = cfg.property.timeZone || "America/Los_Angeles";
  cfg.configPath = p;
  return cfg;
}

// --- dates (all ISO YYYY-MM-DD strings; lexical compare == chronological) ----
function toIso(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** "2025-11-07" -> "11.7.25" (the workbook's tab naming convention) */
function tabName(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}.${d}.${String(y).slice(-2)}`;
}
/** "2025-11-07" -> "11/07/2025" (the "As of:" stamp on the log) */
function asOfLabel(iso) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
/** Calendar date right now in the given IANA time zone, as YYYY-MM-DD. */
function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// --- names / rooms ----------------------------------------------------------
function cleanName(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

/**
 * Map an AppFolio unit label to the room number used on the Daily Log.
 * AppFolio unit strings vary ("7", "7 - 7", "Room 7", "07"); the first integer
 * in the string is the room. Exact overrides from the config win.
 */
function roomFromUnit(unit, overrides = {}) {
  const u = String(unit == null ? "" : unit).trim();
  if (Object.prototype.hasOwnProperty.call(overrides, u)) return String(overrides[u]);
  const m = u.match(/\d+/);
  return m ? String(parseInt(m[0], 10)) : null;
}

// --- occupancy rule ---------------------------------------------------------
/**
 * Normalise one occupancy record (a tenant_directory / rent_roll row) into
 * { start, end } ISO dates. Returns { skip: reason } when it cannot be placed.
 *
 * Rule: start = move_in (fallback lease_from); end = move_out. A record with no
 * end date is open-ended (still there) UNLESS it is a past tenant, in which case
 * lease_to is used, and if that is missing too the record is skipped with a warning
 * rather than shown as occupying a room forever.
 */
function resolveSpan(o) {
  const start = toIso(o.move_in) || toIso(o.lease_from);
  if (!start) return { skip: "no move_in/lease_from date" };
  let end = toIso(o.move_out);
  const label = String(o.status_label || o.status || "").toLowerCase();
  if (!end && /past|moved.?out|prior/.test(label)) {
    end = toIso(o.lease_to);
    if (!end) return { skip: "past tenant with no move_out/lease_to date" };
  }
  return { start, end: end || null };
}

/** Inclusive on both ends: a tenant is counted on their move-in day and on their move-out day. */
function spanCovers(span, iso) {
  return span.start <= iso && (span.end == null || span.end >= iso);
}

/**
 * Build the Daily Log for one date from a snapshot.
 * Returns { date, rows:[{room, occupied, tenants}], occupied, vacantRooms, warnings }.
 */
function dailyLog(iso, snapshot, cfg) {
  const byRoom = new Map(cfg.rooms.map((r) => [r, []]));
  const warnings = [];
  const seenSkips = new Set();
  for (const o of snapshot.occupancies || []) {
    const span = resolveSpan(o);
    if (span.skip) {
      const k = `${o.unit}|${o.tenant}|${span.skip}`;
      if (!seenSkips.has(k)) { seenSkips.add(k); warnings.push(`skipped ${cleanName(o.tenant) || "(no name)"} in unit "${o.unit}": ${span.skip}`); }
      continue;
    }
    if (!spanCovers(span, iso)) continue;
    const room = o.room != null && o.room !== "" ? String(o.room) : roomFromUnit(o.unit, cfg.unitRoomOverrides);
    if (!byRoom.has(room)) { warnings.push(`unit "${o.unit}" maps to room "${room}", which is not in the room list`); continue; }
    const name = cleanName(o.tenant);
    if (name && !byRoom.get(room).includes(name)) byRoom.get(room).push(name);
  }
  const rows = cfg.rooms.map((room) => {
    const tenants = byRoom.get(room);
    return { room, occupied: tenants.length > 0, tenants };
  });
  return {
    date: iso,
    rows,
    occupied: rows.filter((r) => r.occupied).length,
    vacantRooms: rows.filter((r) => !r.occupied).map((r) => r.room),
    warnings,
  };
}

/** Normalise a raw AppFolio row into a snapshot occupancy record. */
function toOccupancy(row, extra = {}) {
  return {
    unit_id: row.unit_id == null ? "" : String(row.unit_id),
    property_name: row.property_name == null ? "" : String(row.property_name),
    unit: row.unit == null ? "" : String(row.unit),
    room: null,
    tenant: cleanName(row.tenant),
    move_in: toIso(row.move_in),
    move_out: toIso(row.move_out),
    lease_from: toIso(row.lease_from),
    lease_to: toIso(row.lease_to),
    status: row.status == null ? null : String(row.status),
    ...extra,
  };
}

function occupancyKey(o) {
  return [o.unit_id, o.unit, o.tenant.toLowerCase(), o.move_in || "", o.move_out || ""].join("|");
}

module.exports = {
  HERE, loadConfig, toIso, tabName, asOfLabel, longDate, todayIn,
  cleanName, roomFromUnit, resolveSpan, spanCovers, dailyLog, toOccupancy, occupancyKey,
};
