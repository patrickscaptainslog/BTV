#!/usr/bin/env node
"use strict";
/**
 * build-daily-logs.js — fill the Daily Log workbook (one tab per required date)
 * from an occupancy snapshot and render the combined PDF (one page per date),
 * in the layout the city has accepted in previous years.
 *
 * Usage:
 *   node build-daily-logs.js <occupancy-snapshot.json> [--out out/] [--config auur-2026.json]
 *        [--template template/2072-Mission-Daily-Log-template.xlsx]
 *        [--pdf-order chronological|newest-first] [--no-pdf]
 *   node build-daily-logs.js --blank [--out out/]     # dated but empty tabs, no snapshot needed
 *
 * Outputs (in --out, default ./out):
 *   2072 Mission Daily Log - 2026.xlsx        one tab per date, "Master Sheet" kept blank
 *   2072 Mission Daily Logs - AUUR 2026.pdf   one page per filled date
 *   daily-logs-summary.txt                    counts, vacant rooms, warnings
 *
 * Dates after the snapshot's pull date are left blank on purpose (the city wants
 * the exact status on the day, never a projection) — re-run after those dates.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const ExcelJS = require("exceljs");
const L = require("./lib");

const USAGE = "usage: node build-daily-logs.js <occupancy-snapshot.json> [--out dir] [--config file] [--template file] [--pdf-order chronological|newest-first] [--no-pdf]\n       node build-daily-logs.js --blank [--out dir]";

function parseArgs(argv) {
  const out = { snapshot: null, out: null, config: null, template: null, pdfOrder: null, pdf: true, blank: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.out = argv[++i];
    else if (a === "--config") out.config = argv[++i];
    else if (a === "--template") out.template = argv[++i];
    else if (a === "--pdf-order") out.pdfOrder = argv[++i];
    else if (a === "--no-pdf") out.pdf = false;
    else if (a === "--blank") out.blank = true;
    else if (a === "-h" || a === "--help") { console.log(USAGE); process.exit(0); }
    else if (a.startsWith("-")) { console.error(`unknown argument: ${a}\n${USAGE}`); process.exit(1); }
    else if (!out.snapshot) out.snapshot = a;
    else { console.error(`unexpected argument: ${a}\n${USAGE}`); process.exit(1); }
  }
  if (!out.blank && !out.snapshot) { console.error(USAGE); process.exit(1); }
  if (out.pdfOrder && !["chronological", "newest-first"].includes(out.pdfOrder)) { console.error(`--pdf-order must be chronological or newest-first`); process.exit(1); }
  return out;
}

// --- workbook ---------------------------------------------------------------
const FIRST_ROOM_ROW = 8; // template rows 8..27 hold the 20 rooms; row 28 is the total

function cloneSheet(wb, src, name, lastRow) {
  const ws = wb.addWorksheet(name, {
    properties: { ...src.properties },
    pageSetup: { ...src.pageSetup, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    views: Array.isArray(src.views) ? src.views.map((v) => ({ ...v })) : undefined,
  });
  src.columns.forEach((c, i) => { if (c && c.width) ws.getColumn(i + 1).width = c.width; });
  src.eachRow({ includeEmpty: true }, (row, rn) => {
    if (rn > lastRow) return; // the template carries ~1000 empty styled rows; keep the used range tight
    const nr = ws.getRow(rn);
    if (row.height) nr.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, cn) => {
      const nc = nr.getCell(cn);
      nc.value = cell.value;
      nc.style = JSON.parse(JSON.stringify(cell.style || {}));
    });
  });
  for (const m of (src.model && src.model.merges) || []) ws.mergeCells(m);
  ws.pageSetup.printArea = `A1:D${lastRow}`;
  return ws;
}

function fillSheet(ws, log, cfg) {
  if (cfg.property.workbookLabel) ws.getCell("A3").value = cfg.property.workbookLabel;
  ws.getCell("A5").value = `As of: ${L.asOfLabel(log.date)}`;
  cfg.rooms.forEach((room, i) => {
    const r = FIRST_ROOM_ROW + i;
    const row = log.filled ? log.rows[i] : null;
    ws.getCell(`A${r}`).value = String(room);
    const b = ws.getCell(`B${r}`);
    b.value = row ? (row.occupied ? "X" : "Vacant") : null;
    b.alignment = { ...(b.alignment || {}), horizontal: "center" };
    ws.getCell(`C${r}`).value = null;
    ws.getCell(`C${r}`).alignment = { horizontal: "center" };
    const d = ws.getCell(`D${r}`);
    d.value = row && row.occupied ? row.tenants.join(", ") : null;
    d.alignment = { ...(d.alignment || {}), wrapText: true, vertical: "top" };
  });
  const totalRow = FIRST_ROOM_ROW + cfg.rooms.length;
  ws.getCell(`A${totalRow}`).value = `Total Units - ${cfg.rooms.length}`;
  const total = ws.getCell(`B${totalRow}`);
  total.value = { formula: `COUNTIF(B${FIRST_ROOM_ROW}:B${totalRow - 1},"x")`, result: log.filled ? log.occupied : 0 };
  total.font = { name: "Calibri", size: 11, bold: true };
  total.alignment = { horizontal: "center" };
  ws.getCell(`C${totalRow}`).value = 0;
  ws.getCell(`C${totalRow}`).font = { name: "Calibri", size: 11, bold: true };
  ws.getCell(`C${totalRow}`).alignment = { horizontal: "center" };
}

// --- PDF --------------------------------------------------------------------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const STYLE = `
  @page { size: letter; margin: 0.6in 0.65in; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #222; }
  .page { page-break-after: always; padding-top: 0.45in; }
  .page:last-child { page-break-after: auto; }
  .head { background: #e9f1f9; padding: 8px 8px 8px; }
  .head h1 { margin: 0 0 14px; font-size: 17.5pt; color: #333; }
  .head p { margin: 2px 0; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead th { background: #f1f1f1; font-size: 11pt; font-weight: bold; color: #333; padding: 3px 6px; border-top: 1px solid #d0d0d0; border-bottom: 1px solid #d0d0d0; white-space: nowrap; }
  tbody td { font-size: 10.5pt; padding: 1.5px 6px; }
  .c { text-align: center; } .l { text-align: left; } .r { text-align: right; }
  .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 10.5pt; margin-top: 16px; padding: 0 6px 0 0; }
`;

function pageHtml(log, cfg) {
  const rows = log.rows.map((r) =>
    `<tr><td class="c">${esc(r.room)}</td><td class="l">${esc(r.tenants.join(", "))}</td><td class="c">${r.occupied ? "X" : "Vacant"}</td><td class="r">0</td></tr>`).join("\n");
  return `<section class="page">
  <div class="head">
    <h1>Daily Log</h1>
    <p><b>Properties:</b> ${esc(cfg.property.pdfLabel)}</p>
    <p><b>As of:</b> ${L.asOfLabel(log.date)}</p>
  </div>
  <table>
    <colgroup><col style="width:10%"><col style="width:42%"><col style="width:28%"><col style="width:20%"></colgroup>
    <thead><tr><th class="c">Unit</th><th class="l">Tenant</th><th class="c">Residential Guest room</th><th class="r">Tourist Guest Room</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <div class="total"><span>Total ${cfg.rooms.length} Units</span><span>0</span></div>
</section>`;
}

function documentHtml(logs, cfg) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(cfg.property.pdfLabel)} — Daily Logs — AUUR ${cfg.filingYear}</title><style>${STYLE}</style></head>
<body>
${logs.map((l) => pageHtml(l, cfg)).join("\n")}
</body></html>`;
}

function findChrome() {
  const candidates = [];
  if (process.env.CHROME) candidates.push(process.env.CHROME);
  for (const root of ["/opt/pw-browsers", path.join(process.env.HOME || "", "Library/Caches/ms-playwright"), path.join(process.env.HOME || "", ".cache/ms-playwright")]) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      candidates.push(path.join(root, d, "chrome-linux", "chrome"));
      candidates.push(path.join(root, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"));
      candidates.push(path.join(root, d, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"));
    }
  }
  candidates.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome",
  );
  for (const c of candidates) {
    if (c.includes("/")) { if (fs.existsSync(c)) return c; continue; }
    try { execFileSync(process.platform === "win32" ? "where" : "which", [c], { stdio: "pipe" }); return c; } catch { /* next */ }
  }
  return null;
}

function pdfPageCount(pdfPath) {
  return (fs.readFileSync(pdfPath, "latin1").match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

function renderPdf(htmlPath, pdfPath) {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome/Chromium found — set CHROME=/path/to/chrome or install Google Chrome");
  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "auur-chrome-")); // a fresh profile: a Chrome already open would otherwise swallow the request
  try {
    execFileSync(chrome, [
      "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", `--user-data-dir=${profile}`,
      `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href,
    ], { stdio: "pipe", timeout: 180000 });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) throw new Error(`${chrome} exited without writing ${pdfPath}`);
  return chrome;
}

// --- main -------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = L.loadConfig(args.config);
  if (cfg.rooms.length !== 20) throw new Error(`the template workbook has rows for exactly 20 rooms; config lists ${cfg.rooms.length}`);
  const outDir = path.resolve(args.out || path.join(L.HERE, "out"));
  fs.mkdirSync(outDir, { recursive: true });
  const templatePath = path.resolve(args.template || path.join(L.HERE, "template", "2072-Mission-Daily-Log-template.xlsx"));

  let snapshot = null;
  let cutoff = null;
  if (!args.blank) {
    snapshot = JSON.parse(fs.readFileSync(args.snapshot, "utf8"));
    if (snapshot.schema !== "auur-occupancy-snapshot/1" || !Array.isArray(snapshot.occupancies)) throw new Error(`${args.snapshot} is not an occupancy snapshot from pull-occupancy.js`);
    cutoff = /^\d{4}-\d{2}-\d{2}$/.test(snapshot.pulled_on || "") ? snapshot.pulled_on
      : (snapshot.pulled_at ? L.todayIn(snapshot.time_zone || cfg.property.timeZone, new Date(snapshot.pulled_at)) : null);
    if (!cutoff) throw new Error("snapshot has no usable pulled_on / pulled_at date");
  }

  const label = cfg.property.match || "Daily Log";
  const xlsxPath = path.join(outDir, `${label} Daily Log - ${cfg.filingYear}.xlsx`);
  const pdfPathWanted = path.join(outDir, `${label} Daily Logs - AUUR ${cfg.filingYear}.pdf`);
  const htmlPathWanted = path.join(outDir, "daily-logs.html");
  const summaryPath = path.join(outDir, "daily-logs-summary.txt");
  for (const f of [xlsxPath, pdfPathWanted, htmlPathWanted, summaryPath]) if (fs.existsSync(f)) fs.unlinkSync(f); // never leave a stale deliverable next to a fresh one

  const logs = cfg.dates.map((iso) => {
    if (!snapshot) return { date: iso, filled: false, reason: "blank workbook" };
    if (iso > cutoff) return { date: iso, filled: false, reason: `after the snapshot date (${cutoff}) — no projections` };
    return { ...L.dailyLog(iso, snapshot, cfg), filled: true };
  });

  // Workbook: keep the template's "Master Sheet" blank, add one tab per date.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const master = wb.getWorksheet("Master Sheet") || wb.worksheets[0];
  for (const ws of [...wb.worksheets]) if (ws.id !== master.id) wb.removeWorksheet(ws.id);
  const lastRow = FIRST_ROOM_ROW + cfg.rooms.length; // the total row
  for (const log of logs) fillSheet(cloneSheet(wb, master, L.tabName(log.date), lastRow), log, cfg);
  wb.modified = new Date();
  wb.lastModifiedBy = "auur/build-daily-logs.js";
  await wb.xlsx.writeFile(xlsxPath);

  // PDF: one page per filled date.
  const filled = logs.filter((l) => l.filled);
  const order = args.pdfOrder || cfg.pdfOrder || "chronological";
  const pages = order === "newest-first" ? [...filled].reverse() : filled;
  let pdfPath = null, htmlPath = null, chrome = null, pdfProblem = null, pdfPages = 0;
  if (filled.length) {
    htmlPath = htmlPathWanted;
    fs.writeFileSync(htmlPath, documentHtml(pages, cfg));
    if (args.pdf) {
      try {
        chrome = renderPdf(htmlPath, pdfPathWanted);
        pdfPath = pdfPathWanted;
        pdfPages = pdfPageCount(pdfPath);
        fs.unlinkSync(htmlPath);
        htmlPath = null;
      } catch (e) {
        pdfProblem = e.message; // keep the HTML so it can be printed by hand; the summary says so
      }
    }
  }

  // Summary (also written next to the outputs).
  const lines = [];
  lines.push(`Daily Logs — ${cfg.property.pdfLabel} — AUUR ${cfg.filingYear}`);
  lines.push(snapshot ? `Snapshot: ${path.resolve(args.snapshot)} (pulled ${snapshot.pulled_at}, AppFolio database "${snapshot.database}")` : "Blank workbook (no snapshot)");
  lines.push(`Workbook: ${xlsxPath}`);
  if (pdfPath) lines.push(`PDF:      ${pdfPath}  (${pdfPages} page${pdfPages === 1 ? "" : "s"}, ${order})`);
  else if (filled.length) lines.push(`PDF:      not written${pdfProblem ? ` — ${pdfProblem}` : " (--no-pdf)"}`);
  if (htmlPath) lines.push(`HTML:     ${htmlPath}  (open in a browser and print to PDF)`);
  lines.push("");
  lines.push("Tab        Date         Occupied  Vacant rooms");
  for (const log of logs) {
    const tab = L.tabName(log.date).padEnd(10);
    if (!log.filled) { lines.push(`${tab} ${log.date}   —         (left blank: ${log.reason})`); continue; }
    lines.push(`${tab} ${log.date}   ${String(log.occupied).padStart(2)} / ${cfg.rooms.length}   ${log.vacantRooms.length ? log.vacantRooms.join(", ") : "none"}${log.date === cutoff ? "   (same-day pull — re-run after today to confirm)" : ""}`);
  }
  const warn = [];
  if (snapshot) {
    for (const w of snapshot.warnings || []) warn.push(`snapshot: ${w}`);
    for (const m of (snapshot.today_check && snapshot.today_check.mismatches) || []) warn.push(`today-check: ${m}`);
    const seen = new Set();
    for (const log of filled) for (const w of log.warnings) if (!seen.has(w)) { seen.add(w); warn.push(w); }
    for (const log of filled) for (const r of log.rows) if (r.tenants.length > 2) warn.push(`${log.date}: room ${r.room} lists ${r.tenants.length} names (${r.tenants.join(", ")}) — co-living, or an overlapping record?`);
    for (const log of filled) for (const r of log.rows) if (r.tenants.join(", ").length > 60) warn.push(`${log.date}: room ${r.room} has a long name list that will wrap in the workbook — check the printed tab`);
  }
  if (pdfPath && pdfPages !== pages.length) warn.push(`PDF has ${pdfPages} pages for ${pages.length} dates — a log spilled onto a second page; shorten the names or check the PDF`);
  if (warn.length) { lines.push(""); lines.push("Review:"); for (const w of warn) lines.push(`  ! ${w}`); }
  const summary = lines.join("\n") + "\n";
  fs.writeFileSync(summaryPath, summary);
  process.stdout.write(summary);
  if (chrome) console.log(`(PDF rendered with ${chrome})`);
  if (pdfProblem) process.exitCode = 3;
}

main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
