import { daysUntil, withinDays, monthBucket } from "./dates";
import type {
  MoveEvent,
  RenewalAlert,
  OccupancySummary,
  PropertyOccupancy,
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

// --- Status helpers --------------------------------------------------------
// Real AppFolio statuses confirmed via /api/inspect:
//   "Current" (45), "Vacant-Rented" (3), "Vacant-Unrented" (1),
//   "Notice-Rented" (2), "Notice-Unrented" (2)
function statusOf(r: Record<string, unknown>): string {
  return str(r, "status").toLowerCase();
}

// Physically in unit now (also includes notice-giving tenants — they're still there)
function isOccupied(r: Record<string, unknown>): boolean {
  const s = statusOf(r);
  return s === "current"
    || s === "notice-rented"
    || s === "notice-unrented"
    || s.includes("occupied"); // test-fixture compat
}

// Vacant with a signed lease — "Vacant-Rented" in AppFolio.
// Also handles test fixtures that use "Future" status or a future move-in date.
function isFutureTenant(r: Record<string, unknown>): boolean {
  const s = statusOf(r);
  if (s === "vacant-rented") return true;
  const mi = nullable(r, "move_in", "lease_from");
  if (mi != null && daysUntil(mi) > 0) return true;
  return s.includes("future") || s.includes("approved");
}

// Economically leased = currently occupied OR committed future tenant
function isRented(r: Record<string, unknown>): boolean {
  return isOccupied(r) || isFutureTenant(r);
}

// ---------------------------------------------------------------------------
// Upcoming move-ins (next `days` days)
// ---------------------------------------------------------------------------
export function upcomingMoveIns(
  rentRoll: Record<string, unknown>[],
  futureTenants: Record<string, unknown>[] = [],
  days = 90
): MoveEvent[] {
  // futureTenants comes from tenant_directory status-2 — all valid future occupancies,
  // no need to filter by Vacant-Rented (no double-count risk unlike aged_receivables).
  const futureByUnitId = new Map<string, Record<string, unknown>>();
  for (const ft of futureTenants) {
    const uid = str(ft, "unit_id");
    if (uid) futureByUnitId.set(uid, ft);
  }

  // Source 1: future tenants with a known move-in date within window.
  const fromFuture: MoveEvent[] = Array.from(futureByUnitId.values())
    .flatMap((ft) => {
      const uid = str(ft, "unit_id");
      const moveIn = nullable(ft, "move_in");
      if (moveIn == null || !withinDays(moveIn, days)) return [];
      return [{
        unit_id: uid,
        property_name: str(ft, "property_name"),
        unit_number: str(ft, "unit"),
        tenant_name: str(ft, "tenant"),
        date: moveIn,
        days_until: daysUntil(moveIn),
        monthly_rent: num(ft, "rent"),
        has_replacement: true,
      }];
    });

  // Source 2: rent_roll rows with a future move-in date (test fixtures + manual overrides).
  const coveredKeys = new Set(fromFuture.map((m) => m.property_name + "|" + m.unit_number));
  const fromRentRoll = rentRoll
    .filter((r) => {
      if (coveredKeys.has(unitKey(r))) return false;
      const moveIn = nullable(r, "move_in", "lease_from");
      return moveIn != null && withinDays(moveIn, days);
    })
    .map((r) => {
      const date = nullable(r, "move_in", "lease_from") ?? "";
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
    });

  // Source 3: Vacant-Rented units not covered by Sources 1/2 — move-in outside window
  // or not yet in tenant_directory. Enrich with tenant name from futureTenants if available.
  const allKeys = new Set([...fromFuture, ...fromRentRoll].map((m) => m.property_name + "|" + m.unit_number));
  const vacantRented = rentRoll
    .filter((r) => statusOf(r) === "vacant-rented" && !allKeys.has(unitKey(r)))
    .map((r): MoveEvent => {
      const uid = str(r, "unit_id");
      const ft = futureByUnitId.get(uid);
      return {
        unit_id: uid,
        property_name: str(r, "property_name"),
        unit_number: str(r, "unit"),
        tenant_name: ft ? str(ft, "tenant") : "",
        date: "",
        days_until: 999,
        monthly_rent: num(r, "rent", "market_rent"),
        has_replacement: true,
      };
    });

  return [...fromFuture, ...fromRentRoll, ...vacantRented].sort((a, b) => a.days_until - b.days_until);
}

// ---------------------------------------------------------------------------
// Upcoming move-outs (next `days` days)
// ---------------------------------------------------------------------------
export function upcomingMoveOuts(
  rentRoll: Record<string, unknown>[],
  days = 90
): MoveEvent[] {
  // Units that have a future tenant lined up (used to flag replacements)
  const futureUnits = new Set(rentRoll.filter(isFutureTenant).map(unitKey));

  // For Notice tenants, AppFolio may leave move_out null and only populate lease_to.
  function moveOutDate(r: Record<string, unknown>): string | null {
    const s = statusOf(r);
    const isNotice = s === "notice-rented" || s === "notice-unrented";
    return nullable(r, "move_out") ?? (isNotice ? nullable(r, "lease_to") : null);
  }

  return rentRoll
    .filter((r) => {
      const date = moveOutDate(r);
      return date != null && withinDays(date, days) && !isFutureTenant(r);
    })
    .map((r) => {
      const date = moveOutDate(r) ?? "";
      return {
        unit_id: str(r, "unit_id"),
        property_name: str(r, "property_name"),
        unit_number: str(r, "unit"),
        tenant_name: str(r, "tenant"),
        date,
        days_until: date ? daysUntil(date) : 0,
        monthly_rent: num(r, "rent"),
        // "Notice-Rented" = AppFolio confirms a replacement is signed in same row;
        // also check for a separate future-tenant row on the same unit.
        has_replacement: statusOf(r) === "notice-rented" || futureUnits.has(unitKey(r)),
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
      // Only chase tenants currently in place and NOT already giving notice.
      // "notice-rented" / "notice-unrented" have already decided to leave.
      const s = statusOf(r);
      const isCurrentTenant = s === "current" || s.includes("occupied"); // test-fixture compat
      if (!isCurrentTenant) return false;
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
  // Build a VacantUnit record from a unit's rows
  const buildVacant = (rows: Record<string, unknown>[]): VacantUnit => {
    const r =
      rows.find((row) => {
        const t = str(row, "tenant").toLowerCase();
        return statusOf(row).includes("vacant") || t === "" || t.includes("no tenant");
      }) ?? rows[0];

    const vacantSince = nullable(r, "move_out", "vacant_since", "vacancy_start");
    const marketRent = num(r, "market_rent", "rent");
    const daysVacant = vacantSince ? Math.max(0, -daysUntil(vacantSince)) : null;

    let beds: number | null = null;
    let baths: number | null = null;
    const bdBa = str(r, "bd_ba");
    if (bdBa && bdBa !== "--/--") {
      const parts = bdBa.split("/");
      beds = parts[0] ? parseInt(parts[0]) : null;
      baths = parts[1] ? parseFloat(parts[1]) : null;
    }

    return {
      unit_id: str(r, "unit_id"),
      property_name: str(r, "property_name"),
      unit_number: str(r, "unit", "unit_number"),
      beds,
      baths,
      market_rent: marketRent || null,
      days_vacant: daysVacant,
      estimated_lost_rent:
        daysVacant != null && marketRent ? Math.round((marketRent / 30) * daysVacant) : null,
    };
  };

  // Group all rows by unit. A unit counts as rented if ANY of its rows are
  // occupied or have a future tenant lined up (economic / leased occupancy).
  const units = new Map<string, { property: string; rented: boolean; physical: boolean; rows: Record<string, unknown>[] }>();
  rentRoll.forEach((r) => {
    const key = unitKey(r);
    const u = units.get(key) ?? { property: str(r, "property_name") || "(Unknown)", rented: false, physical: false, rows: [] };
    u.rented = u.rented || isRented(r);
    u.physical = u.physical || isOccupied(r);
    u.rows.push(r);
    units.set(key, u);
  });

  // Aggregate overall and per-property
  const propMap = new Map<string, { total: number; leased: number; physical: number; vacant: VacantUnit[] }>();
  const vacantUnits: VacantUnit[] = [];
  let rentedCount = 0;
  let physicalCount = 0;

  for (const u of Array.from(units.values())) {
    const p = propMap.get(u.property) ?? { total: 0, leased: 0, physical: 0, vacant: [] };
    p.total++;
    if (u.rented) { rentedCount++; p.leased++; }
    if (u.physical) { physicalCount++; p.physical++; }
    if (!u.rented) {
      const v = buildVacant(u.rows);
      vacantUnits.push(v);
      p.vacant.push(v);
    }
    propMap.set(u.property, p);
  }

  const totalUnits = units.size;
  const occupancyPct =
    totalUnits > 0 ? Math.round((rentedCount / totalUnits) * 100) : 0;

  const byProperty: PropertyOccupancy[] = Array.from(propMap.entries())
    .map(([property_name, v]) => ({
      property_name,
      total_units: v.total,
      leased_units: v.leased,
      physical_units: v.physical,
      occupancy_pct: v.total > 0 ? Math.round((v.leased / v.total) * 100) : 0,
      physical_pct: v.total > 0 ? Math.round((v.physical / v.total) * 100) : 0,
      vacant_units: v.vacant,
    }))
    .sort((a, b) => a.property_name.localeCompare(b.property_name));

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
    by_property: byProperty,
  };
}

// ---------------------------------------------------------------------------
// Assemble full dashboard data
// ---------------------------------------------------------------------------
export async function buildDashboardData(
  rentRoll: Record<string, unknown>[],
  vacancyRows: Record<string, unknown>[],
  futureTenants: Record<string, unknown>[] = []
): Promise<DashboardData> {
  return {
    move_ins: upcomingMoveIns(rentRoll, futureTenants),
    move_outs: upcomingMoveOuts(rentRoll),
    renewals: renewalsToChase(rentRoll),
    occupancy: occupancySummary(rentRoll, vacancyRows),
    refreshed_at: new Date().toISOString(),
  };
}
