"use strict";
// End-to-end test of pull-occupancy.js against a local mock of the AppFolio Reports API:
// Basic auth, POST body, pagination via top-level next_page_url (both results shapes),
// one 429 with retry, a failing status code, property filtering, de-duplication.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// Run the script asynchronously: a synchronous child call would block the event
// loop that serves the mock API in this same process.
function run(args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env, encoding: "utf8", timeout: 30000 }, (err, stdout, stderr) =>
      resolve({ code: err ? (err.code == null ? null : err.code) : 0, signal: err && err.signal, stdout, stderr }));
  });
}

const SCRIPT = path.join(__dirname, "..", "pull-occupancy.js");
const EXPECTED_AUTH = "Basic " + Buffer.from("test-id:test-secret").toString("base64");

function mockServer(opts = {}) {
  const seen = { calls: [], rateLimited: 0 };
  // rent_roll rows show the tenant as "First Last"...
  const rr = (unit, tenant, status, extra = {}) => ({ property_name: "2072 Mission", unit_id: `u${unit}`, unit: `${unit} - ${unit}`, tenant, status, move_in: extra.move_in ?? "2025-01-01", move_out: extra.move_out ?? null, lease_from: extra.move_in ?? "2025-01-01", lease_to: extra.lease_to ?? null, rent: "1200.00", emails: "x@example.com", phone_numbers: "Mobile: 415-555-0100" });
  // ...while tenant_directory rows show "Last, First" plus first_name / last_name columns (as the live API does).
  const td = (unit, tenant, status, extra = {}) => {
    const [first, last] = tenant.split(" ");
    return { ...rr(unit, `${last}, ${first}`, status, extra), first_name: first, last_name: last, primary_tenant: extra.primary ?? "Yes" };
  };
  const rentRollPage1 = [rr(1, "Ann One", "Current"), rr(2, "", "Vacant-Unrented"), rr(3, "Cal Three", "Notice-Unrented", { move_out: "2099-12-31" }),
    { property_name: "15th Street", unit_id: "z1", unit: "1", tenant: "Other Person", status: "Current", move_in: "2025-01-01" }];
  const rentRollPage2 = [rr(4, "Dee Four", "Current"), rr(5, "", "Vacant-Rented")];
  const dir = {
    "0": [td(1, "Ann One", "Current"), td(4, "Dee Four", "Current"), td(1, "Ann One", "Current"), // same stay twice → de-duplicated
      { property_name: "15th Street", unit_id: "z1", unit: "1", tenant: "Person, Other", move_in: "2025-01-01" }],
    "1": [td(2, "Bo Past", "Past", { move_in: "2024-01-01", move_out: "2025-03-31" }), td(4, "Old Four", "Past", { move_in: "2023-01-01", move_out: "2024-12-31" })],
    "2": [td(5, "Fay Future", "Future", { move_in: "2099-01-01" })],
    "4": [td(3, "Cal Three", "Notice", { move_out: "2099-12-31" })], // notice tenants come ONLY from this code (verified live)
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.headers.authorization !== EXPECTED_AUTH) return send(401, { error: "bad auth" });
      const base = `http://127.0.0.1:${server.address().port}`;
      if (req.url === "/api/v2/reports/rent_roll.json" && req.method === "POST") {
        assert.equal(JSON.parse(body).paginate_results, true);
        return send(200, { results: rentRollPage1, next_page_url: `${base}/api/v2/reports/rent_roll.json?page=2&token=abc` });
      }
      if (req.url.startsWith("/api/v2/reports/rent_roll.json?page=2") && req.method === "GET") return send(200, { results: { data: rentRollPage2 } });
      if (req.url === "/api/v2/reports/tenant_directory.json" && req.method === "POST") {
        const code = JSON.parse(body).tenant_statuses[0];
        if (code === "0" && seen.rateLimited === 0) { seen.rateLimited++; return send(429, { error: "rate limited" }); }
        if (opts.failCode && code === opts.failCode) return send(400, { error: "Invalid tenant_statuses" });
        return send(200, { results: dir[code] || [] });
      }
      send(404, { error: "not found" });
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}` })));
}

test("pull-occupancy.js builds a snapshot from the mock API", async () => {
  const { server, seen, base } = await mockServer();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auur-"));
  try {
    const cfgPath = path.join(tmp, "cfg.json");
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "auur-2026.json"), "utf8"));
    cfg.rooms = ["1", "2", "3", "4", "5"];
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const out = path.join(tmp, "snap.json");
    const r = await run([SCRIPT, "--config", cfgPath, "--out", out],
      { ...process.env, APPFOLIO_DATABASE: "mockdb", APPFOLIO_CLIENT_ID: "test-id", APPFOLIO_CLIENT_SECRET: "test-secret", AUUR_API_BASE: base, AUUR_PACE_MS: "5", AUUR_RETRY_MS: "5" });
    assert.equal(r.code, 0, `pull-occupancy.js failed (${r.signal || r.code}); calls=${JSON.stringify(seen.calls.map((c) => c.method + " " + c.url))}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);
    const stdout = r.stdout;
    assert.ok(!stdout.includes("test-secret"), "secret must never be printed");
    const snap = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.ok(!JSON.stringify(snap).includes("test-secret"));
    assert.ok(!JSON.stringify(snap).includes("x@example.com"), "contact columns stripped from raw rows");
    assert.equal(snap.schema, "auur-occupancy-snapshot/1");
    assert.equal(snap.database, "mockdb");
    assert.deepEqual(snap.property_names_seen, ["15th Street", "2072 Mission"]);
    assert.equal(snap.units.length, 5, "rent_roll paginated across both result shapes and filtered by property");
    assert.deepEqual(snap.units.map((u) => u.room), ["1", "2", "3", "4", "5"]);
    assert.deepEqual(snap.rows_per_status, { "0": 3, "1": 2, "2": 1, "4": 1 });
    assert.deepEqual(snap.warnings, []);
    const names = snap.occupancies.map((o) => o.tenant).sort();
    assert.deepEqual(names, ["Ann One", "Bo Past", "Cal Three", "Dee Four", "Fay Future", "Old Four"], "First Last names, de-duplicated, other property excluded");
    assert.equal(snap.occupancies.find((o) => o.tenant === "Ann One").primary, true);
    assert.equal(seen.rateLimited, 1, "429 was retried");
    assert.deepEqual(snap.today_check.mismatches, []);
    assert.ok(stdout.includes("Preview"));
    const posts = seen.calls.filter((c) => c.method === "POST");
    assert.equal(posts.length, 1 + 4 + 1, "rent_roll + 4 status codes + 1 retry");
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("pull-occupancy.js turns a failing status code into a warning and a today-check mismatch", async () => {
  const { server, base } = await mockServer({ failCode: "4" });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auur-"));
  try {
    const out = path.join(tmp, "snap.json");
    const cfgPath = path.join(tmp, "cfg.json");
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "auur-2026.json"), "utf8"));
    cfg.rooms = ["1", "2", "3", "4", "5"];
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const r = await run([SCRIPT, "--config", cfgPath, "--out", out],
      { ...process.env, APPFOLIO_DATABASE: "mockdb", APPFOLIO_CLIENT_ID: "test-id", APPFOLIO_CLIENT_SECRET: "test-secret", AUUR_API_BASE: base, AUUR_PACE_MS: "5", AUUR_RETRY_MS: "5" });
    assert.equal(r.code, 0, r.stderr);
    const snap = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(snap.rows_per_status["4"], 0);
    assert.ok(snap.warnings.some((w) => w.includes('tenant_statuses=["4"]') && w.includes("HTTP 400")));
    assert.equal(snap.today_check.mismatches.length, 1, "the notice tenant is missing, so room 3 disagrees with rent_roll");
    assert.match(snap.today_check.mismatches[0], /room 3: rent_roll says "Notice-Unrented" \(Cal Three\)/);
    assert.ok(r.stdout.includes("Today-check: 1 room(s)"));
  } finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("pull-occupancy.js exits 2 when nothing matches the property", async () => {
  const { server, base } = await mockServer();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auur-"));
  try {
    const cfgPath = path.join(tmp, "cfg.json");
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "auur-2026.json"), "utf8"));
    cfg.property.match = "Nonexistent Building";
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const r = await run([SCRIPT, "--config", cfgPath, "--out", path.join(tmp, "s.json")],
      { ...process.env, APPFOLIO_DATABASE: "mockdb", APPFOLIO_CLIENT_ID: "test-id", APPFOLIO_CLIENT_SECRET: "test-secret", AUUR_API_BASE: base, AUUR_PACE_MS: "5", AUUR_RETRY_MS: "5" });
    const code = r.code, stderr = r.stderr;
    assert.equal(code, 2);
    assert.ok(stderr.includes("2072 Mission") && stderr.includes("15th Street"), "lists the property names it did see");
  } finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("pull-occupancy.js refuses to run without credentials", async () => {
  const r = await run([SCRIPT, "--out", "/nonexistent/x.json"], { PATH: process.env.PATH, HOME: "/nonexistent", AUUR_ENV_FILE: "/nonexistent/.env.local" });
  assert.equal(r.code, 1);
  assert.ok(r.stderr.includes("APPFOLIO_CLIENT_ID"));
});
