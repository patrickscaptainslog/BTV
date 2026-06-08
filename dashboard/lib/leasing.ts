import { daysUntil, withinDays, monthBucket } from "./dates";
import type {
  MoveEvent,
  RenewalAlert,
  OccupancySummary,
  VacantUnit,
  ExpirationBucket,
  DashboardData,
} from "./types";

// ---------------------------------------------------------------------------
// Column name adapters — actual AppFolio column names confirmed via /api/columns
// rent_roll columns: property_name, unit, tenant, status, lease_from, lease_to,
//   move_in, move_out, rent, market_rent, bd_ba, unit_id, past_due
// ---------------------------------------------------------------------------

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== "") return String(row[k]);
  return "";
}

function num(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v != null) {
      const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

function nullable(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) if (row[k] != null && row[k] !== "") return String(row[k]);
  return null;
}

function isMtm(row: Record<string, unknown>): boolean {
  // AppFolio: lease_to is null for month-to-month leases
  return row["lease_to"] == null || row["lease_to"] === "";
}

function unitKey(r: Record<string, unknown>): string {
  return str(r, "property_name") + "|" + str(r, "unit");
}

// --- Status helpers (tolerant of AppFolio label variants) ------------------
function statusOf(r: Record<string, unknown>): string {
  return str(r, "status").toLowerCase();
}
// Currently physically occupied
function isOccupied(r: Record<string, unknown>): boolean {
  const s = statusOf(r);
  return s.includes("occupied") || s.includes("current");
}
// Leased but not yet moved in (e.g. "Vacant Rented" / "(Future)")
function isFutureTenant(r: Record<string, unknown>): boolean {
  const mi = nullable(r, "move_in");
  if (mi != null && daysUntil(mi) > 0) return true;
  const s = statusOf(r);
  return s.includes("future") || s.includes("approved");
}
// Rented = occupied now OR committed to a future tenant
function isRented(r: Record<string, unknown>): boolean {
  return isOccupied(r) || isFutureTenant(r) || statusOf(r).includes("rented");
}

// ---------------------------------------------------------------------------
// Upcoming move-ins (next `days` days)
// ---------------------------------------------------------------------------
export function upcomingMoveIns(
  rentRoll: Record<string, unknown>[],
  days = 60
): MoveEvent[] {
  // A move-in is any lease whose move-in date is in the future and within
  // the window — regardless of the status label (Future / Vacant Rented / etc.)
  return rentRoll
    .filter((r) => {
      const moveIn = nullable(r, "move_in");
      return moveIn != null && withinDays(moveIn, days);
    })
    .map((r) => {
      const date = nullable(r, "move_in") ?? "";
      return {
        unit_id: str(r, "unit_id"),
        property_name: str(r, "property_name"),
        unit_number: str(r, "unit"),
        tenant_name: str(r, "tenant"),
        date,
        days_until: date ? daysUntil(date) : 0,
        monthly_rent: num(r, "rent", "market_rent"),
        has_replacement: true,
      };
    })
    .sort((a, b) => a.days_until - b.days_until);
}

// ---------------------------------------------------------------------------
// Upcoming move-outs (next `days` days)
// ---------------------------------------------------------------------------
export function upcomingMoveOuts(
  rentRoll: Record<string, unknown>[],
  days = 60
): MoveEvent[] {
  // Units that have a future tenant lined up (used to flag replacements)
  const futureUnits = new Set(rentRoll.filter(isFutureTenant).map(unitKey));

  return rentRoll
    .filter((r) => {
      const moveOut = nullable(r, "move_out");
      return moveOut != null && withinDays(moveOut, days) && !isFutureTenant(r);
    })
    .map((r) => {
      const date = nullable(r, "move_out") ?? "";
      return {
        unit_id: str(r, "unit_id"),
        property_name: str(r, "property_name"),
        unit_number: str(r, "unit"),
        tenant_name: str(r, "tenant"),
        date,
        days_until: date ? daysUntil(date) : 0,
        monthly_rent: num(r, "rent"),
        has_replacement: futureUnits.has(unitKey(r)),
      };
    })
    .sort((a, b) => a.days_until - b.days_until);
}

// ---------------------------------------------------------------------------
// Renewals to chase
// ---------------------------------------------------------------------------
export function renewalsToChase(
  rentRoll: Record<string, unknown>[],
  days = 120
): RenewalAlert[] {
  const futureUnits = new Set(rentRoll.filter(isFutureTenant).map(unitKey));

  return rentRoll
    .filter((r) => {
      // Only chase leases for tenants currently in place (not future move-ins)
      if (!isOccupied(r) || isFutureTenant(r)) return false;
      if (isMtm(r)) return true;
      const leaseEnd = nullable(r, "lease_to");
      return leaseEnd ? daysUntil(leaseEnd) <= days : false;
    })
    .filter((r) => !futureUnits.has(unitKey(r)))
    .map((r): RenewalAlert => {
      const leaseEnd = nullable(r, "lease_to");
      const mtm = isMtm(r);
      const daysLeft = leaseEnd ? daysUntil(leaseEnd) : null;

      let status: RenewalAlert["status"];
      if (mtm) {
        status = "month-to-month";
      } else if (daysLeft !== null && daysLeft <= 30) {
        status = "action-needed";
      } else {
        status = "expiring-soon";
      }

      return {
        unit_id: str(r, "unit_id"),
        property_name: str(r, "property_name"),
        unit_number: str(r, "unit"),
        tenant_name: str(r, "tenant"),
        lease_end: leaseEnd,
        days_until_end: daysLeft,
        monthly_rent: num(r, "rent"),
        status,
      };
    })
    .sort((a, b) => {
      const order = { "action-needed": 0, "expiring-soon": 1, "month-to-month": 2 };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return (a.days_until_end ?? 999) - (b.days_until_end ?? 999);
    });
}

// ---------------------------------------------------------------------------
// Occupancy summary + vacant units
// ---------------------------------------------------------------------------
export function occupancySummary(
  rentRoll: Record<string, unknown>[],
  vacancyRows: Record<string, unknown>[]
): OccupancySummary {
  // Group all rows by unit. A unit counts as rented if ANY of its rows are
  // occupied or have a future tenant lined up (economic / leased occupancy).
  const units = new Map<string, { rented: boolean; rows: Record<string, unknown>[] }>();
  rentRoll.forEach((r) => {
    const key = unitKey(r);
    const u = units.get(key) ?? { rented: false, rows: [] };
    u.rented = u.rented || isRented(r);
    u.rows.push(r);
    units.set(key, u);
  });

  const totalUnits = units.size;
  let rentedCount = 0;
  const vacantUnits: VacantUnit[] = [];

  for (const u of Array.from(units.values())) {
    if (u.rented) {
      rentedCount++;
      continue;
    }
    // Truly vacant unit (no current tenant and none lined up)
    const r =
      u.rows.find((row) => {
        const t = str(row, "tenant").toLowerCase();
        return statusOf(row).includes("vacant") || t === "" || t.includes("no tenant");
      }) ?? u.rows[0];

    const vacantSince = nullable(r, "move_out", "vacant_since", "vacancy_start");
    const marketRent = num(r, "market_rent", "rent");
    const daysVacant = vacantSince ? Math.max(0, -daysUntil(vacantSince)) : null;

    // Parse beds/baths from "bd_ba" field like "2/1" or "--/--"
    let beds: number | null = null;
    let baths: number | null = null;
    const bdBa = str(r, "bd_ba");
    if (bdBa && bdBa !== "--/--") {
      const parts = bdBa.split("/");
      beds = parts[0] ? parseInt(parts[0]) : null;
      baths = parts[1] ? parseFloat(parts[1]) : null;
    }

    vacantUnits.push({
      unit_id: str(r, "unit_id"),
      property_name: str(r, "property_name"),
      unit_number: str(r, "unit", "unit_number"),
      beds,
      baths,
      market_rent: marketRent || null,
      days_vacant: daysVacant,
      estimated_lost_rent:
        daysVacant != null && marketRent ? Math.round((marketRent / 30) * daysVacant) : null,
    });
  }

  const occupancyPct =
    totalUnits > 0 ? Math.round((rentedCount / totalUnits) * 100) : 0;

  const validVacantDays = vacantUnits
    .map((v) => v.days_vacant)
    .filter((d): d is number => d !== null);
  const avgDaysVacant =
    validVacantDays.length > 0
      ? Math.round(validVacantDays.reduce((a, b) => a + b, 0) / validVacantDays.length)
      : null;

  const buckets: Record<string, ExpirationBucket> = {};
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    buckets[key] = { month: key, label, count: 0 };
  }

  // Count expirations only for leases of tenants currently in place
  rentRoll.forEach((r) => {
    if (!isOccupied(r) || isFutureTenant(r)) return;
    const end = nullable(r, "lease_to");
    if (!end) return;
    const { key } = monthBucket(end);
    if (buckets[key]) buckets[key].count++;
  });

  return {
    total_units: totalUnits,
    occupied_units: rentedCount,
    occupancy_pct: occupancyPct,
    vacant_units: vacantUnits,
    avg_days_vacant: avgDaysVacant,
    expirations_by_month: Object.values(buckets),
  };
}

// ---------------------------------------------------------------------------
// Assemble full dashboard data
// ---------------------------------------------------------------------------
export async function buildDashboardData(
  rentRoll: Record<string, unknown>[],
  vacancyRows: Record<string, unknown>[]
): Promise<DashboardData> {
  return {
    move_ins: upcomingMoveIns(rentRoll),
    move_outs: upcomingMoveOuts(rentRoll),
    renewals: renewalsToChase(rentRoll),
    occupancy: occupancySummary(rentRoll, vacancyRows),
    refreshed_at: new Date().toISOString(),
  };
}
