const fs = require("fs");

// Per-property leasing report generator.
// usage: node genreport.js <dashboard-export.csv>
// Writes one report-<slug>.html per property; prints the date stamp last.
const CSV = process.argv[2];
if (!CSV) { console.error("usage: node genreport.js <export.csv> [out-dir]"); process.exit(1); }
const DIR = process.argv[3] || process.cwd();

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
const byProp = rows("OCCUPANCY BY PROPERTY").slice(1);
const allMoveIns = rows("UPCOMING MOVE-INS").slice(1);
const allMoveOuts = rows("UPCOMING MOVE-OUTS").slice(1);
const allRenewals = rows("LEASE RENEWALS")
  .slice(1)
  .filter((r) => String(r[7]).trim().toLowerCase() !== "month-to-month");
const allVacant = rows("VACANT UNITS").slice(1);
const genRow = rows("_head").find((r) => r[0] === "Generated");
const generated = genRow ? genRow[1] : "";

// Report date derived from the export's own "Generated" stamp (M/D/YYYY, ...)
const dm = generated.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const dateLabel = dm ? `${MONTHS[Number(dm[1]) - 1]} ${Number(dm[2])}, ${dm[3]}` : "";
const stamp = dm ? `${dm[3]}-${String(dm[1]).padStart(2, "0")}-${String(dm[2]).padStart(2, "0")}` : "undated";

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
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]} ${day}, ${y}`;
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

const STYLE = `
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color:#1e293b; margin:0; font-size:11px; line-height:1.4; }
  header { border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-end; }
  .brand { font-size:22px; font-weight:800; letter-spacing:-0.02em; color:#0f172a; }
  .sub { font-size:12px; color:#64748b; margin-top:2px; }
  .summary { text-align:right; font-size:12px; color:#475569; }
  .summary .big { font-size:15px; font-weight:700; color:#0f172a; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; margin:18px 0 8px; font-weight:700; }
  .kpis { display:flex; gap:10px; }
  .kpi { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; }
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
  .note { color:#94a3b8; font-size:11px; }
  footer { margin-top:20px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:9px; color:#94a3b8; text-align:center; }
`;

function buildPropertyHtml(prop) {
  const p = byProp.find((r) => r[0] === prop);
  const [name, total, leased, leasedPct, phys, physPct] = p;
  const turnover = Number(leased) - Number(phys);
  const vacantUnits = allVacant.filter((v) => v[0] === prop);

  const summaryParts = [`${esc(leasedPct)} leased`, `${esc(physPct)} physically occupied`];
  if (vacantUnits.length > 0) summaryParts.push(`${vacantUnits.length} vacant`);
  if (turnover > 0) summaryParts.push(`${turnover} in turnover`);

  const moveIns = allMoveIns.filter((m) => m[0] === prop);
  const moveOuts = allMoveOuts.filter((m) => m[0] === prop);
  const renewals = allRenewals.filter((r) => r[0] === prop);
  const expiring90 = renewals.filter((r) => {
    const d = parseInt(r[6]);
    return !isNaN(d) && d >= 0 && d <= 90;
  }).length;

  const moveInRows = moveIns
    .map(
      (m) => `<tr>
        <td class="strong">${esc(m[1])}</td>
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
        <td class="strong">${esc(m[1])}</td>
        <td>${esc(m[2])}</td>
        <td>${fmtDate(m[3])}</td>
        <td class="right"><span class="days" style="${days <= 14 ? "color:#d97706" : ""}">${esc(m[4])}d</span></td>
        <td>${replBadge(yes)}</td>
      </tr>`;
    })
    .join("");

  const renewalRows = renewals
    .map((r) => {
      const [, unit, tenant, email, phone, leaseEnd, days, status] = r;
      const em = firstOf(email);
      const ph = cleanPhone(phone);
      const contact =
        em || ph ? `<div class="contact">${em ? esc(em) : ""}${em && ph ? " · " : ""}${ph ? esc(ph) : ""}</div>` : "";
      const dn = parseInt(days);
      let dcls = "";
      if (!isNaN(dn)) dcls = dn < 0 ? "color:#b91c1c" : dn <= 30 ? "color:#dc2626" : "color:#d97706";
      const daysTxt = days === "" || days == null ? "—" : dn < 0 ? `${Math.abs(dn)}d ago` : `${dn}d`;
      return `<tr>
        <td class="strong">${esc(unit)}</td>
        <td>${esc(tenant)}${contact}</td>
        <td>${fmtDate(leaseEnd)}</td>
        <td class="right"><span class="days" style="${dcls}">${daysTxt}</span></td>
        <td>${badge(status)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head>
<body>
  <header>
    <div>
      <div class="brand">NeighbourGood</div>
      <div class="sub">${esc(name)} · Leasing Report · ${esc(dateLabel)} · Prepared by Patrick Diederich</div>
    </div>
    <div class="summary">
      <div class="big">${esc(leased)} of ${esc(total)} units leased</div>
      <div>${summaryParts.join(" · ")}</div>
    </div>
  </header>

  <div class="section">
    <h2>Snapshot</h2>
    <div class="kpis">
      <div class="kpi"><div class="klabel">Leased</div><div class="kval" style="color:${occColor(leasedPct)}">${esc(leasedPct)}</div><div class="ksub">${esc(leased)}/${esc(total)} units</div></div>
      <div class="kpi"><div class="klabel">Physical</div><div class="kval" style="color:${occColor(physPct)}">${esc(physPct)}</div><div class="ksub">${esc(phys)}/${esc(total)} occupied</div></div>
      <div class="kpi"><div class="klabel">Move-Ins (90d)</div><div class="kval" style="color:#059669">${moveIns.length}</div></div>
      <div class="kpi"><div class="klabel">Move-Outs (90d)</div><div class="kval" style="color:#d97706">${moveOuts.length}</div></div>
      <div class="kpi"><div class="klabel">Expiring (90d)</div><div class="kval" style="color:#0f172a">${expiring90}</div></div>
    </div>
    ${turnover > 0 ? `<p class="note" style="margin-top:6px">${turnover} unit${turnover === 1 ? " is" : "s are"} currently between tenants — see Move-Ins for signed arrivals.</p>` : ""}
    ${vacantUnits.length > 0 ? `<p class="note" style="margin-top:4px">Vacant and available to lease: ${esc(vacantUnits.map((v) => v[1].split(" - ")[0]).join(", "))}.</p>` : ""}
  </div>

  <div class="section">
    <h2>Upcoming Move-Ins</h2>
    ${
      moveIns.length
        ? `<table><thead><tr><th>Unit</th><th>Tenant</th><th>Move-In</th><th class="right">Days</th></tr></thead><tbody>${moveInRows}</tbody></table>`
        : `<p class="note">No move-ins in the next 90 days.</p>`
    }
  </div>

  <div class="section">
    <h2>Upcoming Move-Outs</h2>
    ${
      moveOuts.length
        ? `<table><thead><tr><th>Unit</th><th>Tenant</th><th>Move-Out</th><th class="right">Days</th><th>Replacement</th></tr></thead><tbody>${moveOutRows}</tbody></table>`
        : `<p class="note">No move-outs in the next 90 days.</p>`
    }
  </div>

  <div>
    <h2>Lease Renewals</h2>
    ${
      renewals.length
        ? `<table><thead><tr><th>Unit</th><th>Tenant</th><th>Lease End</th><th class="right">Days</th><th>Status</th></tr></thead><tbody>${renewalRows}</tbody></table>`
        : `<p class="note">No leases need renewal attention right now.</p>`
    }
  </div>

  <footer>Generated from AppFolio · ${esc(generated)}</footer>
</body></html>`;
}

const PROPS = byProp.map((r) => r[0]);
for (const prop of PROPS) {
  const html = buildPropertyHtml(prop);
  const slug = prop.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  fs.writeFileSync(`${DIR}/report-${slug}.html`, html);
  console.log("wrote", slug);
}
console.log("stamp", stamp);
