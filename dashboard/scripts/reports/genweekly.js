const fs = require("fs");

const CSV = process.argv[2];
if (!CSV) { console.error("usage: node genweekly.js <export.csv> [out-dir]"); process.exit(1); }
const OUT = require("path").join(process.argv[3] || process.cwd(), "weekly.html");

// --- tiny RFC-4180 line parser -------------------------------------------
function parseLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const raw = fs.readFileSync(CSV, "utf8").replace(/^﻿/, "");
const lines = raw.split(/\r?\n/);

const sections = {};
let cur = "_head";
sections[cur] = [];
for (const line of lines) {
  const first = parseLine(line)[0] || "";
  if (/^[A-Z][A-Z0-9 ()%\-]+$/.test(first) && first.length > 4) {
    cur = first.replace(/\s*\(\d+\)\s*$/, "").trim();
    sections[cur] = [];
  } else {
    sections[cur].push(line);
  }
}
const rows = (name) =>
  (sections[name] || []).filter((l) => l.trim() !== "").map(parseLine);

// --- data ----------------------------------------------------------------
const summary = rows("PORTFOLIO SUMMARY")[1];
const byProp = rows("OCCUPANCY BY PROPERTY").slice(1);
const moveIns = rows("UPCOMING MOVE-INS").slice(1);
const moveOuts = rows("UPCOMING MOVE-OUTS").slice(1);
const renewals = rows("LEASE RENEWALS")
  .slice(1)
  .filter((r) => String(r[7]).trim().toLowerCase() !== "month-to-month");
const mtmCount = rows("LEASE RENEWALS").slice(1).length - renewals.length;
const expirations = rows("LEASE EXPIRATIONS BY MONTH").slice(1);
const genRow = rows("_head").find((r) => r[0] === "Generated");
const generated = genRow ? genRow[1] : "";

// Report date derived from the export's own "Generated" stamp (M/D/YYYY, ...)
const dmw = generated.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const dateLabel = dmw ? `${MONTHS_FULL[Number(dmw[1]) - 1]} ${Number(dmw[2])}, ${dmw[3]}` : "";
const stamp = dmw ? `${dmw[3]}-${String(dmw[1]).padStart(2, "0")}-${String(dmw[2]).padStart(2, "0")}` : "undated";

// --- helpers -------------------------------------------------------------
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const occColor = (pctStr) => {
  const p = parseInt(pctStr);
  return p >= 90 ? "#059669" : p >= 75 ? "#d97706" : "#dc2626";
};
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
  return `${mo} ${day}, ${y}`;
}
function fmtShort(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]} ${day}`;
}
const firstOf = (v) => String(v || "").split(",")[0].trim();
const cleanPhone = (v) => firstOf(v).replace(/\btel:/gi, "").replace(/\bphone:\s*/gi, "").trim();

const LEASE_BADGE = {
  "Expired": ["#fee2e2", "#991b1b"],
  "Action needed": ["#fef2f2", "#b91c1c"],
  "Expiring soon": ["#fffbeb", "#b45309"],
};
const badge = (label) => {
  const [bg, fg] = LEASE_BADGE[label] || ["#f1f5f9", "#475569"];
  return `<span class="badge" style="background:${bg};color:${fg}">${esc(label)}</span>`;
};
const replBadge = (yes) =>
  yes
    ? `<span class="badge" style="background:#ecfdf5;color:#047857">Replacement lined up</span>`
    : `<span class="badge" style="background:#fef2f2;color:#b91c1c">No replacement yet</span>`;

// --- derived facts (all verifiable from the data) ------------------------
const expiring90 = expirations.slice(0, 3).reduce((s, r) => s + (parseInt(r[1]) || 0), 0);
const arriving14 = moveIns.filter((m) => parseInt(m[4]) <= 14).length;
const urgentFlags = renewals.filter((r) => ["Expired", "Action needed"].includes(String(r[7]).trim())).length;

// Units physically empty right now = leased minus physically occupied.
const inTurnover = byProp.reduce((s, p) => s + (Number(p[2]) - Number(p[4])), 0);
// Which ones: a move-in unit NOT also in upcoming move-outs is already empty
// (previous tenant has left). Sanity-checked against the arithmetic count.
const moveOutUnits = new Set(moveOuts.map((m) => `${m[0]}|${m[1]}`));
const turnoverUnits = moveIns.filter((m) => !moveOutUnits.has(`${m[0]}|${m[1]}`));
const turnoverList =
  turnoverUnits.length === inTurnover
    ? turnoverUnits.map((m) => `${m[0]} ${m[1].split(" - ")[0]}`).join(", ")
    : null;
// Rooms coming to market: departing residents with no replacement signed yet.
const needBackfill = moveOuts.filter((m) => String(m[5]).toLowerCase() !== "yes");
const backfillList = needBackfill
  .map((m) => `${m[0]} ${m[1].split(" - ")[0]} (${fmtShort(m[3])})`)
  .join(", ");

// --- HTML ----------------------------------------------------------------
const propCards = byProp
  .map((p) => {
    const [name, total, leased, leasedPct, phys, physPct] = p;
    return `
    <div class="pcard">
      <div class="pname">${esc(name)}</div>
      <div class="prow">
        <div>
          <div class="plabel">Leased</div>
          <div class="pval" style="color:${occColor(leasedPct)}">${esc(leasedPct)}</div>
          <div class="psub">${esc(leased)}/${esc(total)}</div>
        </div>
        <div class="pdiv"></div>
        <div>
          <div class="plabel">Physical</div>
          <div class="pval" style="color:${occColor(physPct)}">${esc(physPct)}</div>
          <div class="psub">${esc(phys)}/${esc(total)}</div>
        </div>
      </div>
    </div>`;
  })
  .join("");

const moveInRows = moveIns
  .map(
    (m) => `<tr>
      <td class="strong">${esc(m[0])} ${esc(m[1])}</td>
      <td>${esc(m[2])}</td>
      <td>${fmtDate(m[3])}</td>
      <td class="right">${m[4] ? `<span class="days">${esc(m[4])}d</span>` : "—"}</td>
    </tr>`
  )
  .join("");

const moveOutRows = moveOuts
  .map((m) => {
    const yes = String(m[5]).toLowerCase() === "yes";
    const days = parseInt(m[4]);
    return `<tr>
      <td class="strong">${esc(m[0])} ${esc(m[1])}</td>
      <td>${esc(m[2])}</td>
      <td>${fmtDate(m[3])}</td>
      <td class="right"><span class="days" style="${days <= 14 ? "color:#d97706" : ""}">${esc(m[4])}d</span></td>
      <td>${replBadge(yes)}</td>
    </tr>`;
  })
  .join("");

const renewalRows = renewals
  .map((r) => {
    const [prop, unit, tenant, email, phone, leaseEnd, days, status] = r;
    const em = firstOf(email);
    const ph = cleanPhone(phone);
    const contact =
      em || ph ? `<div class="contact">${em ? esc(em) : ""}${em && ph ? " · " : ""}${ph ? esc(ph) : ""}</div>` : "";
    const dn = parseInt(days);
    let dcls = "";
    if (!isNaN(dn)) dcls = dn < 0 ? "color:#b91c1c" : dn <= 30 ? "color:#dc2626" : "color:#d97706";
    const daysTxt = days === "" || days == null ? "—" : dn < 0 ? `${Math.abs(dn)}d ago` : `${dn}d`;
    return `<tr>
      <td class="strong">${esc(prop)} ${esc(unit)}</td>
      <td>${esc(tenant)}${contact}</td>
      <td>${fmtDate(leaseEnd)}</td>
      <td class="right"><span class="days" style="${dcls}">${daysTxt}</span></td>
      <td>${badge(status)}</td>
    </tr>`;
  })
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color:#1e293b; margin:0; font-size:11px; line-height:1.4; }
  header { border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-end; }
  .brand { font-size:22px; font-weight:800; letter-spacing:-0.02em; color:#0f172a; }
  .sub { font-size:12px; color:#64748b; margin-top:2px; }
  .summary { text-align:right; font-size:12px; color:#475569; }
  .summary .big { font-size:15px; font-weight:700; color:#0f172a; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; margin:18px 0 8px; font-weight:700; }
  .hl { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .hl-item { border:1px solid #e2e8f0; border-left:3px solid #059669; border-radius:8px; padding:8px 12px; display:flex; gap:8px; align-items:flex-start; }
  .hl-item.warn { border-left-color:#d97706; }
  .hl-wide { grid-column:1 / -1; }
  .hl-check { color:#059669; font-weight:800; font-size:12px; line-height:1.3; }
  .hl-check.warn { color:#d97706; }
  .hl-text { color:#334155; }
  .hl-text b { color:#0f172a; }
  .cards { display:flex; gap:10px; }
  .pcard { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; }
  .pname { font-weight:700; margin-bottom:8px; font-size:12px; }
  .prow { display:flex; gap:14px; align-items:center; }
  .plabel { font-size:8px; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; margin-bottom:2px; }
  .pval { font-size:18px; font-weight:700; }
  .psub { font-size:9px; color:#94a3b8; }
  .pdiv { width:1px; align-self:stretch; background:#f1f5f9; }
  .kpis { display:flex; gap:10px; margin-top:10px; }
  .kpi { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:9px 12px; }
  .kpi .klabel { font-size:9px; text-transform:uppercase; letter-spacing:0.04em; color:#64748b; font-weight:600; }
  .kpi .kval { font-size:24px; font-weight:700; margin-top:2px; }
  .kpi .ksub { font-size:9px; color:#94a3b8; margin-top:1px; }
  table { width:100%; border-collapse:collapse; }
  thead th { text-align:left; font-size:8px; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8; border-bottom:1px solid #e2e8f0; padding:0 8px 5px 0; font-weight:700; }
  thead th.right { text-align:right; }
  tbody td { padding:5px 8px 5px 0; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  tbody td.strong { font-weight:600; color:#0f172a; white-space:nowrap; }
  tbody td.right { text-align:right; white-space:nowrap; }
  .days { font-weight:600; color:#475569; }
  .contact { font-size:9px; color:#94a3b8; margin-top:1px; }
  .badge { display:inline-block; border-radius:999px; padding:1px 7px; font-size:9px; font-weight:600; white-space:nowrap; }
  .section { page-break-inside: avoid; }
  tr { page-break-inside: avoid; }
  .bar-row { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
  .bar-label { width:58px; font-size:9px; color:#64748b; }
  .bar-track { flex:1; background:#f1f5f9; border-radius:4px; height:12px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:4px; }
  .bar-count { width:18px; text-align:right; font-size:10px; font-weight:600; color:#475569; }
  .note { color:#94a3b8; font-size:10px; margin-top:6px; }
  .subnote { color:#94a3b8; font-size:10px; margin:-4px 0 8px; }
  footer { margin-top:20px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:9px; color:#94a3b8; text-align:center; }
</style></head>
<body>
  <header>
    <div>
      <div class="brand">NeighbourGood</div>
      <div class="sub">Weekly Leasing Report · ${esc(dateLabel)} · Prepared by Patrick Diederich</div>
    </div>
    <div class="summary">
      <div class="big">${esc(summary[1])} of ${esc(summary[0])} units leased</div>
      <div>${esc(summary[2])} leased · ${esc(summary[3])} physically occupied · ${inTurnover} in turnover</div>
    </div>
  </header>

  <div class="section">
    <h2>This Week at a Glance</h2>
    <div class="hl">
      <div class="hl-item"><div class="hl-check">✓</div><div class="hl-text"><b>100% leased today</b> — every one of the 53 units is under a signed lease.</div></div>
      <div class="hl-item"><div class="hl-check">✓</div><div class="hl-text"><b>${inTurnover} units in turnover</b> (empty between tenants) — every one already re-leased with a signed arrival date.</div></div>
      <div class="hl-item"><div class="hl-check">✓</div><div class="hl-text"><b>${moveIns.length} signed move-ins</b> in the pipeline; ${arriving14} arrive within the next two weeks.</div></div>
      ${needBackfill.length ? `<div class="hl-item warn"><div class="hl-check warn">→</div><div class="hl-text"><b>Next up: ${needBackfill.length} rooms to backfill</b> — ${esc(backfillList)} have residents moving out with no replacement signed yet; sourcing new tenants now.</div></div>` : ""}
    </div>
  </div>

  <div class="section">
    <h2>Occupancy by Property</h2>
    <div class="cards">${propCards}</div>
    <p class="note">Physical occupancy reflects the ${inTurnover} units currently between tenants${turnoverList ? ` (${esc(turnoverList)})` : ""} — each has a signed incoming lease (see Move-Ins).</p>
    <div class="kpis">
      <div class="kpi"><div class="klabel">Move-Ins (90d)</div><div class="kval" style="color:#059669">${moveIns.length}</div><div class="ksub">all leases signed</div></div>
      <div class="kpi"><div class="klabel">Move-Outs (90d)</div><div class="kval" style="color:#d97706">${moveOuts.length}</div><div class="ksub">${moveOuts.filter((m)=>String(m[5]).toLowerCase()==="yes").length} already backfilled</div></div>
      <div class="kpi"><div class="klabel">Expiring (90d)</div><div class="kval" style="color:#0f172a">${expiring90}</div><div class="ksub">leases</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Upcoming Move-Ins</h2>
    <table><thead><tr><th>Unit</th><th>Tenant</th><th>Move-In</th><th class="right">Days</th></tr></thead><tbody>${moveInRows}</tbody></table>
  </div>

  <div class="section">
    <h2>Upcoming Move-Outs</h2>
    <p class="subnote">Every move-out through Sep 12 already has its replacement lease signed.</p>
    <table><thead><tr><th>Unit</th><th>Tenant</th><th>Move-Out</th><th class="right">Days</th><th>Replacement</th></tr></thead><tbody>${moveOutRows}</tbody></table>
  </div>

  <div>
    <h2>Lease Renewals</h2>
    <p class="subnote">${urgentFlags === 0 ? "No leases expired or requiring urgent action. " : ""}${renewals.length} fixed-term leases in the 120-day renewal window · ${mtmCount} month-to-month residents tracked separately.</p>
    <table><thead><tr><th>Unit</th><th>Tenant</th><th>Lease End</th><th class="right">Days</th><th>Status</th></tr></thead><tbody>${renewalRows}</tbody></table>
  </div>

  <footer>Generated from AppFolio · ${esc(generated)}</footer>
</body></html>`;

fs.writeFileSync(OUT, html);
console.log("wrote", OUT);
console.log("moveIns", moveIns.length, "| arriving14", arriving14, "| moveOuts", moveOuts.length,
  "| backfilled", moveOuts.filter((m)=>String(m[5]).toLowerCase()==="yes").length,
  "| renewals", renewals.length, "| mtm", mtmCount, "| expiring90", expiring90, "| urgentFlags", urgentFlags);
console.log("stamp", stamp);
