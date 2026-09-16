"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const L = require("../lib");

const cfg = L.loadConfig();
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "sample-snapshot.json"), "utf8"));
const roomRow = (log, room) => log.rows.find((r) => r.room === room);

test("config lists the 12 first-Fridays plus Oct 15, sorted", () => {
  assert.deepEqual(cfg.dates, [
    "2025-11-07", "2025-12-05", "2026-01-02", "2026-02-06", "2026-03-06", "2026-04-03", "2026-05-01",
    "2026-06-05", "2026-07-03", "2026-08-07", "2026-09-04", "2026-10-02", "2026-10-15",
  ]);
  for (const d of cfg.dates.slice(0, 12)) {
    const dt = new Date(`${d}T12:00:00Z`);
    assert.equal(dt.getUTCDay(), 5, `${d} should be a Friday`);
    assert.ok(dt.getUTCDate() <= 7, `${d} should be the first Friday of its month`);
  }
  assert.equal(cfg.rooms.length, 20);
  assert.ok(!cfg.rooms.includes("13"));
});

test("date helpers", () => {
  assert.equal(L.toIso("2025-11-07"), "2025-11-07");
  assert.equal(L.toIso("2025-11-07T08:00:00Z"), "2025-11-07");
  assert.equal(L.toIso("11/7/2025"), "2025-11-07");
  assert.equal(L.toIso(""), null);
  assert.equal(L.toIso(null), null);
  assert.equal(L.toIso("yesterday"), null);
  assert.equal(L.tabName("2025-11-07"), "11.7.25");
  assert.equal(L.tabName("2026-10-15"), "10.15.26");
  assert.equal(L.asOfLabel("2026-01-02"), "01/02/2026");
  assert.equal(L.longDate("2026-01-02"), "January 2, 2026");
  assert.match(L.todayIn("America/Los_Angeles"), /^\d{4}-\d{2}-\d{2}$/);
});

test("room mapping from AppFolio unit labels", () => {
  assert.equal(L.roomFromUnit("7"), "7");
  assert.equal(L.roomFromUnit("7 - 7"), "7");
  assert.equal(L.roomFromUnit("Room 07"), "7");
  assert.equal(L.roomFromUnit("Unit 14 (front)"), "14");
  assert.equal(L.roomFromUnit("Storage"), null);
  assert.equal(L.roomFromUnit("Penthouse", { Penthouse: "21" }), "21");
});

test("occupancy span rules", () => {
  assert.deepEqual(L.resolveSpan({ move_in: "2025-01-01", move_out: null }), { start: "2025-01-01", end: null });
  assert.deepEqual(L.resolveSpan({ move_in: null, lease_from: "2025-01-01", move_out: "2025-02-01" }), { start: "2025-01-01", end: "2025-02-01" });
  assert.deepEqual(L.resolveSpan({ move_in: "2025-01-01", move_out: null, lease_to: "2025-06-30", status_label: "past" }), { start: "2025-01-01", end: "2025-06-30" });
  assert.ok(L.resolveSpan({ move_in: "2025-01-01", move_out: null, lease_to: null, status_label: "past" }).skip);
  assert.ok(L.resolveSpan({ move_in: null, lease_from: null }).skip);
  const span = { start: "2025-01-10", end: "2025-01-20" };
  assert.equal(L.spanCovers(span, "2025-01-09"), false);
  assert.equal(L.spanCovers(span, "2025-01-10"), true, "move-in day counts");
  assert.equal(L.spanCovers(span, "2025-01-20"), true, "move-out day counts");
  assert.equal(L.spanCovers(span, "2025-01-21"), false);
  assert.equal(L.spanCovers({ start: "2025-01-10", end: null }, "2099-01-01"), true, "open-ended");
});

test("daily log for 2025-11-07 (first required date)", () => {
  const log = L.dailyLog("2025-11-07", snapshot, cfg);
  assert.deepEqual(roomRow(log, "1").tenants, ["Avery Sampleton"]);
  assert.equal(roomRow(log, "2").occupied, false);
  assert.deepEqual(roomRow(log, "3").tenants, ["Eli Coliving", "Frankie Coliving"]);
  assert.deepEqual(roomRow(log, "4").tenants, ["Gray Leaseonly"], "past tenant placed via lease_to");
  assert.equal(roomRow(log, "5").occupied, false, "undated past tenant is skipped");
  assert.ok(log.warnings.some((w) => w.includes("Harper Nodates")));
  assert.equal(roomRow(log, "7").occupied, false, "moves in the next day");
  assert.deepEqual(roomRow(log, "15").tenants, ["Pat Steady"]);
  assert.equal(roomRow(log, "12").occupied, false);
  assert.equal(log.occupied, 15);
  assert.deepEqual(log.vacantRooms, ["2", "5", "7", "12", "20"]);
  assert.ok(log.warnings.some((w) => w.includes('"22 - Storage"')), "unknown unit is reported");
});

test("daily log boundary days", () => {
  const jan2 = L.dailyLog("2026-01-02", snapshot, cfg);
  assert.deepEqual(roomRow(jan2, "1").tenants, ["Avery Sampleton"], "counted on move-out day");
  assert.deepEqual(roomRow(L.dailyLog("2026-02-06", snapshot, cfg), "1").tenants, ["Blair Exampleton"]);
  assert.equal(roomRow(L.dailyLog("2025-12-05", snapshot, cfg), "7").occupied, true, "month-to-month tenant (no lease_to) is open-ended");
  assert.equal(roomRow(L.dailyLog("2026-01-02", snapshot, cfg), "4").occupied, false, "lease_to passed");
  const mar6 = L.dailyLog("2026-03-06", snapshot, cfg);
  assert.deepEqual(roomRow(mar6, "2").tenants, ["Casey Fixture"], "counted on move-in day");
  assert.equal(roomRow(L.dailyLog("2026-06-05", snapshot, cfg), "2").occupied, false, "left May 31");
  const jun5 = L.dailyLog("2026-06-05", snapshot, cfg);
  assert.equal(roomRow(jun5, "15").occupied, false, "between tenants on the day");
  assert.deepEqual(roomRow(L.dailyLog("2026-07-03", snapshot, cfg), "15").tenants, ["Val Newcomer"]);
  const sep4 = L.dailyLog("2026-09-04", snapshot, cfg);
  assert.deepEqual(roomRow(sep4, "6").tenants, ["Indigo Notice"], "notice tenant still there before move-out");
  assert.equal(roomRow(sep4, "2").occupied, false, "future tenant not counted before move-in");
});

test("display name is First Last from first_name/last_name, tenant column as fallback", () => {
  assert.equal(L.toOccupancy({ tenant: "Kristiani, Elly", first_name: "Elly", last_name: "Kristiani", primary_tenant: "Yes" }).tenant, "Elly Kristiani");
  assert.equal(L.toOccupancy({ tenant: "(Coliving), Samarth Agrawal", first_name: "Samarth Agrawal", last_name: "(Coliving)" }).tenant, "Samarth Agrawal (Coliving)");
  assert.equal(L.toOccupancy({ tenant: "St Luce  *, Ralph Casey", first_name: "Ralph Casey", last_name: "St Luce  *" }).tenant, "Ralph Casey St Luce *");
  assert.equal(L.toOccupancy({ tenant: "Ann  One" }).tenant, "Ann One", "no name columns (e.g. rent_roll) → tenant as is");
  assert.equal(L.toOccupancy({ tenant: "x", primary_tenant: "Yes" }).primary, true);
  assert.equal(L.toOccupancy({ tenant: "x", primary_tenant: "No" }).primary, false);
  assert.equal(L.toOccupancy({ tenant: "x" }).primary, null);
});

test("primary tenant is listed first in a shared room", () => {
  const snap = { occupancies: [
    { unit: "15", tenant: "Luke Bergstorm", primary: false, move_in: "2026-03-01", move_out: null },
    { unit: "15", tenant: "Christian Bergstrom", primary: true, move_in: "2026-03-01", move_out: null },
  ] };
  assert.deepEqual(roomRow(L.dailyLog("2026-06-05", snap, cfg), "15").tenants, ["Christian Bergstrom", "Luke Bergstorm"]);
});

test("duplicate names in a room are collapsed and whitespace cleaned", () => {
  const snap = { occupancies: [
    { unit: "9", tenant: "Lee  Steady", move_in: "2025-01-01", move_out: null },
    { unit: "9 - 9", tenant: " Lee Steady ", move_in: "2025-01-01", move_out: null },
  ] };
  const log = L.dailyLog("2026-01-02", snap, cfg);
  assert.deepEqual(roomRow(log, "9").tenants, ["Lee Steady"]);
});
