import type { DashboardData, LeaseStatusMap, ContactStatus } from "./types";

const CONTACT_LABEL: Record<ContactStatus | "", string> = {
  "": "",
  contacted: "Contacted",
  renewing: "Renewing",
  "not-renewing": "Not Renewing",
  "no-reply": "No Reply",
};

const LEASE_LABEL: Record<DashboardData["renewals"][number]["status"], string> = {
  expired: "Expired",
  "action-needed": "Action needed",
  "expiring-soon": "Expiring soon",
  "month-to-month": "Month-to-month",
};

// Escape a single CSV cell per RFC 4180: wrap in quotes if it contains
// a comma, quote, or newline; double any embedded quotes.
function cell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values: unknown[]): string {
  return values.map(cell).join(",");
}

// Build a single consolidated CSV with labeled sections stacked vertically,
// the way a monthly report is assembled in Excel: read top to bottom, copy blocks.
export function dashboardToCsv(data: DashboardData, leaseStatuses: LeaseStatusMap = {}): string {
  const occ = data.occupancy;
  const lines: string[] = [];

  const generated = new Date(data.refreshed_at).toLocaleString("en-US");
  lines.push(row(["Leasing Report"]));
  lines.push(row(["Generated", generated]));
  lines.push("");

  // --- Portfolio summary ---
  lines.push(row(["PORTFOLIO SUMMARY"]));
  lines.push(row(["Total Units", "Leased Units", "Leased %", "Physical Occupied %", "Vacant Units", "Avg Days Vacant"]));
  const physicalPct = occ.total_units > 0
    ? Math.round((occ.by_property.reduce((s, p) => s + p.physical_units, 0) / occ.total_units) * 100)
    : 0;
  lines.push(row([
    occ.total_units,
    occ.occupied_units,
    `${occ.occupancy_pct}%`,
    `${physicalPct}%`,
    occ.vacant_units.length,
    occ.avg_days_vacant ?? "",
  ]));
  lines.push("");

  // --- Occupancy by property ---
  lines.push(row(["OCCUPANCY BY PROPERTY"]));
  lines.push(row(["Property", "Total Units", "Leased", "Leased %", "Physically Occupied", "Physical %"]));
  for (const p of occ.by_property) {
    lines.push(row([
      p.property_name,
      p.total_units,
      p.leased_units,
      `${p.occupancy_pct}%`,
      p.physical_units,
      `${p.physical_pct}%`,
    ]));
  }
  lines.push("");

  // --- Move-ins ---
  lines.push(row([`UPCOMING MOVE-INS (${data.move_ins.length})`]));
  lines.push(row(["Property", "Unit", "Tenant", "Move-In Date", "Days Until"]));
  for (const m of data.move_ins) {
    lines.push(row([
      m.property_name,
      m.unit_number,
      m.tenant_name,
      m.date,
      m.days_until < 999 ? m.days_until : "",
    ]));
  }
  lines.push("");

  // --- Move-outs ---
  lines.push(row([`UPCOMING MOVE-OUTS (${data.move_outs.length})`]));
  lines.push(row(["Property", "Unit", "Tenant", "Move-Out Date", "Days Until", "Replacement Signed"]));
  for (const m of data.move_outs) {
    lines.push(row([
      m.property_name,
      m.unit_number,
      m.tenant_name,
      m.date,
      m.days_until,
      m.has_replacement ? "Yes" : "No",
    ]));
  }
  lines.push("");

  // --- Vacant units ---
  lines.push(row([`VACANT UNITS (${occ.vacant_units.length})`]));
  lines.push(row(["Property", "Unit", "Beds", "Baths", "Days Vacant"]));
  for (const v of occ.vacant_units) {
    lines.push(row([
      v.property_name,
      v.unit_number,
      v.beds ?? "",
      v.baths ?? "",
      v.days_vacant ?? "",
    ]));
  }
  lines.push("");

  // --- Lease renewals + outreach tracking ---
  lines.push(row([`LEASE RENEWALS (${data.renewals.length})`]));
  lines.push(row(["Property", "Unit", "Tenant", "Lease End", "Days Until End", "Lease Status", "Outreach Status", "Note"]));
  for (const r of data.renewals) {
    const entry = leaseStatuses[r.unit_id];
    const fresh = entry && entry.tenant_name === r.tenant_name ? entry : null;
    lines.push(row([
      r.property_name,
      r.unit_number,
      r.tenant_name,
      r.lease_end ?? "",
      r.days_until_end ?? "",
      LEASE_LABEL[r.status],
      fresh ? CONTACT_LABEL[fresh.status] : "",
      fresh ? fresh.note : "",
    ]));
  }
  lines.push("");

  // --- Lease expirations by month ---
  lines.push(row(["LEASE EXPIRATIONS BY MONTH"]));
  lines.push(row(["Month", "Expiring Leases"]));
  for (const b of occ.expirations_by_month) {
    lines.push(row([b.label, b.count]));
  }

  return lines.join("\n");
}
