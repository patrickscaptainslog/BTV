const fs = require("fs");
const path = require("path");

// Rent roll brief: a one-page summary of an AppFolio as-of rent roll export
// (the CSV from /api/rent-roll?as_of=YYYY-MM-DD&property=...).
//
//   node genrentroll.js <rent-roll.csv> [out-dir] [--compare <earlier.csv>] [--as-of YYYY-MM-DD]
//
// The as-of date comes from the file name (…-YYYY-MM-DD.csv) unless --as-of is
// given. --compare adds a "Changes since <date>" section. Writes
// rentroll-<property>-<date>.html; render it with headless Chrome
// (see make-reports.sh for the flags).

const args = process.argv.slice(2);
function takeFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}
const compareCsv = takeFlag("--compare");
const asOfFlag = takeFlag("--as-of");
const [CSV, outDir = process.cwd()] = args;
if (!CSV) {
  console.error("usage: node genrentroll.js <rent-roll.csv> [out-dir] [--compare <earlier.csv>] [--as-of YYYY-MM-DD]");
  process.exit(1);
}

// --- tiny RFC-4180 parser -------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((v) => v !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function load(file) {
  return parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
}

function asOfFromName(file) {
  const m = path.basename(file).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// --- formatting -------------------------------------------------------------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const ymd = (d) => d.split("-").map(Number);
const shortDate = (d) => { if (!d) return ""; const [y, m, dd] = ymd(d); return `${MON[m - 1]} ${dd}, ${y}`; };
const monthDay = (d) => { if (!d) return ""; const [, m, dd] = ymd(d); return `${MON[m - 1]} ${dd}`; };
const longDate = (d) => { const [y, m, dd] = ymd(d); return `${MONTH[m - 1]} ${dd}, ${y}`; };
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const money = (n, cents = true) =>
  "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const unitLabel = (u) => String(u).split(" - ")[0].trim();
const unitNum = (u) => { const m = String(u).match(/\d+/); return m ? parseInt(m[0], 10) : 9999; };
const cleanName = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const isOccupied = (r) => r.status === "Current" || r.status.startsWith("Notice");
const isLeased = (r) => isOccupied(r) || r.status === "Vacant-Rented";

function statusBadge(r) {
  const s = r.status;
  if (s === "Current") return badge("Occupied", "#ecfdf5", "#047857");
  if (s === "Notice-Unrented")
    return badge(`Notice${r.move_out ? " · out " + monthDay(r.move_out) : ""}`, "#fffbeb", "#b45309");
  if (s === "Notice-Rented")
    return badge(`Notice · re-leased${r.move_out ? " · out " + monthDay(r.move_out) : ""}`, "#ecfdf5", "#047857");
  if (s === "Vacant-Rented") return badge("Leased · not moved in", "#eff6ff", "#1d4ed8");
  if (s === "Vacant-Unrented") return badge("Vacant", "#fef2f2", "#b91c1c");
  return badge(s, "#f1f5f9", "#475569");
}
const badge = (t, bg, fg) => `<span class="badge" style="background:${bg};color:${fg}">${esc(t)}</span>`;

function leaseText(r) {
  if (!r.lease_from) return "";
  if (!r.lease_to) return `${shortDate(r.lease_from)} · month-to-month`;
  const [fy] = ymd(r.lease_from);
  const [ty] = ymd(r.lease_to);
  return fy === ty
    ? `${monthDay(r.lease_from)} – ${shortDate(r.lease_to)}`
    : `${shortDate(r.lease_from)} – ${shortDate(r.lease_to)}`;
}

function balanceCell(v) {
  const n = num(v);
  if (v === "" || n === 0) return `<span class="muted">—</span>`;
  if (n < 0) return `<span style="color:#047857">${money(n)} credit</span>`;
  return `<span style="color:#b45309">${money(n)}</span>`;
}

// --- data -------------------------------------------------------------------
const rows = load(CSV).sort((a, b) => unitNum(a.unit) - unitNum(b.unit));
const asOf = asOfFlag || asOfFromName(CSV);
if (!asOf) { console.error("Can't tell the as-of date from the file name; pass --as-of YYYY-MM-DD"); process.exit(1); }
const property = rows[0]?.property_name || "Property";
const street = rows[0]?.property_street || property;

const total = rows.length;
const occupied = rows.filter(isOccupied);
const leased = rows.filter(isLeased);
const vacant = rows.filter((r) => r.status === "Vacant-Unrented");
const notice = rows.filter((r) => r.status.startsWith("Notice"));
const monthly = rows.reduce((s, r) => s + num(r.total), 0);
const owed = rows.reduce((s, r) => s + Math.max(0, num(r.past_due)), 0);
const credits = rows.reduce((s, r) => s + Math.min(0, num(r.past_due)), 0);

// --- changes vs an earlier snapshot ----------------------------------------
let changes = null;
let compareAsOf = null;
if (compareCsv) {
  compareAsOf = asOfFromName(compareCsv);
  const before = new Map(load(compareCsv).map((r) => [r.unit_id, r]));
  changes = [];
  for (const r of rows) {
    const b = before.get(r.unit_id);
    const u = unitLabel(r.unit);
    if (!b) { changes.push(`<b>${esc(u)}</b> is new in this rent roll.`); continue; }
    const nowName = cleanName(r.tenant), thenName = cleanName(b.tenant);
    const chargesMoved = num(r.total) !== num(b.total) && (r.total !== "" || b.total !== "");
    const chargeNote = chargesMoved ? `; monthly charges ${money(num(b.total))} → ${money(num(r.total))}` : "";
    if (nowName !== thenName) {
      if (nowName && !thenName) changes.push(`<b>${esc(u)}</b>: ${esc(nowName)} now on the lease${r.move_in ? ` (move-in ${monthDay(r.move_in)})` : ""}${chargeNote}.`);
      else if (!nowName && thenName) changes.push(`<b>${esc(u)}</b>: ${esc(thenName)} no longer on the lease${chargeNote}.`);
      else changes.push(`<b>${esc(u)}</b>: tenant changed from ${esc(thenName)} to ${esc(nowName)}${chargeNote}.`);
      continue;
    } else if (r.status !== b.status) {
      const label = (x) => ({ "Current": "occupied", "Vacant-Rented": "leased, not moved in", "Vacant-Unrented": "vacant", "Notice-Unrented": "on notice", "Notice-Rented": "on notice (re-leased)" }[x] || x);
      changes.push(`<b>${esc(u)}</b>${nowName ? ` · ${esc(nowName)}` : ""}: ${label(b.status)} → ${label(r.status)}${r.status === "Current" && r.move_in ? `, moved in ${monthDay(r.move_in)}` : ""}.`);
    }
    if (num(r.total) !== num(b.total) && (r.total !== "" || b.total !== "")) {
      changes.push(`<b>${esc(u)}</b>${nowName ? ` · ${esc(nowName)}` : ""}: monthly charges ${money(num(b.total))} → ${money(num(r.total))}.`);
    }
  }
}

// --- HTML -------------------------------------------------------------------
const kpi = (label, value, sub, color = "#0f172a") =>
  `<div class="kpi"><div class="kl">${label}</div><div class="kv" style="color:${color}">${value}</div>${sub ? `<div class="ks">${sub}</div>` : ""}</div>`;
const occColor = (p) => (p >= 90 ? "#059669" : p >= 75 ? "#d97706" : "#dc2626");

const tableRows = rows.map((r) => {
  const vacantRow = !r.tenant;
  const monthlyCell = vacantRow
    ? `<span class="muted">mkt ${money(num(r.market_rent), false)}</span>`
    : r.total === "" ? `<span class="muted">—</span>` : money(num(r.total));
  return `<tr>
    <td class="strong">${esc(unitLabel(r.unit))}</td>
    <td>${vacantRow ? `<span class="muted">—</span>` : esc(cleanName(r.tenant))}</td>
    <td>${statusBadge(r)}</td>
    <td class="lease">${esc(leaseText(r))}</td>
    <td class="right">${monthlyCell}</td>
    <td class="right">${vacantRow ? `<span class="muted">—</span>` : balanceCell(r.past_due)}</td>
  </tr>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: letter; margin: 0.45in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color:#1e293b; margin:0; font-size:10.5px; line-height:1.35; }
  header { border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:flex-end; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-0.02em; color:#0f172a; }
  .title { font-size:13px; font-weight:600; color:#0f172a; margin-top:2px; }
  .sub { font-size:11px; color:#64748b; margin-top:1px; }
  .summary { text-align:right; font-size:11px; color:#475569; }
  .summary .big { font-size:15px; font-weight:700; color:#0f172a; }
  h2 { font-size:10.5px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; margin:14px 0 6px; font-weight:700; }
  .kpis { display:grid; grid-template-columns:repeat(6, 1fr); gap:7px; }
  .kpi { border:1px solid #e2e8f0; border-radius:8px; padding:7px 9px; }
  .kl { font-size:8px; text-transform:uppercase; letter-spacing:0.04em; color:#64748b; font-weight:600; }
  .kv { font-size:18px; font-weight:700; margin-top:1px; }
  .ks { font-size:8.5px; color:#94a3b8; margin-top:1px; }
  .changes { margin:0; padding-left:16px; color:#334155; }
  .changes li { margin-bottom:2px; }
  table { width:100%; border-collapse:collapse; }
  thead th { text-align:left; font-size:8px; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8; border-bottom:1px solid #e2e8f0; padding:0 6px 4px 0; font-weight:700; }
  thead th.right { text-align:right; }
  tbody td { padding:4px 6px 4px 0; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
  tbody td.strong { font-weight:600; color:#0f172a; white-space:nowrap; }
  tbody td.right { text-align:right; white-space:nowrap; }
  td.lease { color:#475569; white-space:nowrap; }
  .muted { color:#94a3b8; }
  .badge { display:inline-block; border-radius:999px; padding:1px 7px; font-size:8.5px; font-weight:600; white-space:nowrap; }
  tr { page-break-inside: avoid; }
  .foot { margin-top:10px; font-size:8.5px; color:#94a3b8; }
  footer { margin-top:10px; padding-top:6px; border-top:1px solid #e2e8f0; font-size:8.5px; color:#94a3b8; text-align:center; }
</style></head><body>
  <header>
    <div>
      <div class="brand">NeighbourGood</div>
      <div class="title">${esc(street)} · Rent Roll Brief</div>
      <div class="sub">As of ${longDate(asOf)} · Prepared by Patrick Diederich</div>
    </div>
    <div class="summary">
      <div class="big">${occupied.length} of ${total} rooms occupied</div>
      <div>${pct(leased.length, total)}% leased · ${money(monthly, false)} scheduled monthly</div>
    </div>
  </header>

  <div class="kpis">
    ${kpi("Occupied", pct(occupied.length, total) + "%", `${occupied.length}/${total} rooms`, occColor(pct(occupied.length, total)))}
    ${kpi("Leased", pct(leased.length, total) + "%", `${leased.length}/${total} rooms`, occColor(pct(leased.length, total)))}
    ${kpi("Vacant", vacant.length, vacant.length ? vacant.map((r) => unitLabel(r.unit)).join(", ") : "none", vacant.length ? "#dc2626" : "#059669")}
    ${kpi("On notice", notice.length, notice.length ? notice.map((r) => unitLabel(r.unit)).join(", ") : "none", notice.length ? "#d97706" : "#0f172a")}
    ${kpi("Scheduled monthly", money(monthly, false), "rent + recurring charges")}
    ${kpi("Balance owed", money(owed, false), credits < 0 ? `${money(credits, false)} in credits` : "no credits", owed > 0 ? "#b45309" : "#0f172a")}
  </div>

  ${changes ? `<h2>Changes since ${shortDate(compareAsOf)}</h2>
  ${changes.length ? `<ul class="changes">${changes.map((c) => `<li>${c}</li>`).join("")}</ul>` : `<p class="muted">No changes in tenants, status or monthly charges.</p>`}` : ""}

  <h2>Rent Roll</h2>
  <table>
    <thead><tr><th>Room</th><th>Tenant</th><th>Status</th><th>Lease</th><th class="right">Monthly</th><th class="right">Balance</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="foot">
    Monthly = scheduled rent plus recurring charges in effect on ${shortDate(asOf)}; for vacant rooms, the market rent.
    Balance = amount past due on ${shortDate(asOf)}; early in a month this includes that month's rent not yet collected.
  </div>

  <footer>Generated from AppFolio (rent roll as of ${shortDate(asOf)})</footer>
</body></html>`;

const slug = property.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const out = path.join(outDir, `rentroll-${slug}-${asOf}.html`);
fs.writeFileSync(out, html);
console.log(out);
console.log(`occupied ${occupied.length}/${total} | leased ${leased.length} | vacant ${vacant.length} | notice ${notice.length} | monthly ${monthly.toFixed(2)} | owed ${owed.toFixed(2)} | credits ${credits.toFixed(2)}${changes ? ` | changes ${changes.length}` : ""}`);
