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
// Column name adapters
// AppFolio column names are confirmed via scripts/check-appfolio.ts.
// These helpers extract values tolerantly so that minor column-name variance
// in different AppFolio tiers doesn't crash the dashboard.
// ---------------------------------------------------------------------------

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null) return String(row[k]);
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

// ---------------------------------------------------------------------------
// Upcoming move-ins (next `days` days)
// Source: rent_roll rows with status "Future" and a move_in date in window
// ---------------------------------------------------------------------------
export function upcomingMoveIns(
  rentRoll: Record<string, unknown>[],
  days = 60
): MoveEvent[] {
  return rentRoll
    .filter((r) => {
      const status = str(r, "lease_status", "status").toLowerCase();
      const moveIn = nullable(r, "move_in", "move_in_date", "lease_start");
      return (
        (status === "future" || status === "approved") &&
        moveIn &&
        withinDays(moveIn, days)
      );
    })
    .map((r) => {
      const date =
        nullable(r, "move_in", "move_in_date", "lease_start") ?? "";
      return {
        unit_id: str(r, "unit_id", "id"),
        property_name: str(r, "property_name", "property", "building"),
        unit_number: str(r, "unit_number", "unit", "unit_name"),
        tenant_name: str(r, "tenant_name", "tenant", "name"),
        date,
        days_until: date ? daysUntil(date) : 0,
        monthly_rent: num(r, "rent", "monthly_rent", "market_rent"),
        has_replacement: true,
      };
    })
    .sort((a, b) => a.days_until - b.days_until);
}

// ---------------------------------------------------------------------------
// Upcoming move-outs (next `days` days)
// Source: rent_roll rows with a move_out date in window
// has_replacement = another Future/Approved lease exists for the same unit
// ---------------------------------------------------------------------------
export function upcomingMoveOuts(
  rentRoll: Record<string, unknown>[],
  days = 60
): MoveEvent[] {
  const unitKey = (r: Record<string, unknown>) =>
    str(r, "property_name", "property", "building") + "|" + str(r, "unit_number", "unit", "unit_name");

  const futureUnits = new Set(
    rentRoll
      .filter((r) => {
        const status = str(r, "lease_status", "status").toLowerCase();
        return status === "future" || status === "approved";
      })
      .map(unitKey)
  );

  return rentRoll
    .filter((r) => {
      const moveOut = nullable(r, "move_out", "move_out_date", "lease_end");
      const status = str(r, "lease_status", "status").toLowerCase();
      return (
        moveOut &&
        withinDays(moveOut, days) &&
        status !== "future" &&
        status !== "approved"
      );
    })
    .map((r) => {
      const date =
        nullable(r, "move_out", "move_out_date", "lease_end") ?? "";
      return {
        unit_id: str(r, "unit_id", "id"),
        property_name: str(r, "property_name", "property", "building"),
        unit_number: str(r, "unit_number", "unit", "unit_name"),
        tenant_name: str(r, "tenant_name", "tenant", "name"),
        date,
        days_until: date ? daysUntil(date) : 0,
        monthly_rent: num(r, "rent", "monthly_rent"),
        has_replacement: futureUnits.has(unitKey(r)),
      };
    })
    .sort((a, b) => a.days_until - b.days_until);
}

// ---------------------------------------------------------------------------
// Renewals to chase
// Source: rent_roll rows with active/MTM leases expiring within `days` days
// and no future/approved lease waiting for that unit
// ---------------------------------------------------------------------------
export function renewalsToChase(
  rentRoll: Record<string, unknown>[],
  days = 120
): RenewalAlert[] {
  const unitKey = (r: Record<string, unknown>) =>
    str(r, "property_name", "property", "building") + "|" + str(r, "unit_number", "unit", "unit_name");

  const futureUnits = new Set(
    rentRoll
      .filter((r) => {
        const status = str(r, "lease_status", "status").toLowerCase();
        return status === "future" || status === "approved";
      })
      .map(unitKey)
  );

  return rentRoll
    .filter((r) => {
      const status = str(r, "lease_status", "status").toLowerCase();
      const isCurrent = status === "current" || status === "active" || status === "month-to-month";
      if (!isCurrent) return false;

      const leaseEnd = nullable(r, "lease_end", "lease_end_date");
      const isMtm =
        status === "month-to-month" ||
        str(r, "is_month_to_month", "mtm").toLowerCase() === "true";

      if (isMtm) return true;
      return leaseEnd ? daysUntil(leaseEnd) <= days : false;
    })
    .filter((r) => !futureUnits.has(unitKey(r)))
    .map((r): RenewalAlert => {
      const leaseEnd = nullable(r, "lease_end", "lease_end_date");
      const isMtm =
        str(r, "lease_status", "status").toLowerCase() === "month-to-month" ||
        str(r, "is_month_to_month", "mtm").toLowerCase() === "true";
      const daysLeft = leaseEnd ? daysUntil(leaseEnd) : null;

      let status: RenewalAlert["status"];
      if (isMtm) {
        status = "month-to-month";
      } else if (daysLeft !== null && daysLeft <= 30) {
        status = "action-needed";
      } else {
        status = "expiring-soon";
      }

      return {
        unit_id: str(r, "unit_id", "id"),
        property_name: str(r, "property_name", "property", "building"),
        unit_number: str(r, "unit_number", "unit", "unit_name"),
        tenant_name: str(r, "tenant_name", "tenant", "name"),
        lease_end: leaseEnd,
        days_until_end: daysLeft,
        monthly_rent: num(r, "rent", "monthly_rent"),
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
// Source: rent_roll (active leases) + unit_vacancy report
// ---------------------------------------------------------------------------
export function occupancySummary(
  rentRoll: Record<string, unknown>[],
  vacancyRows: Record<string, unknown>[]
): OccupancySummary {
  const occupied = new Set(
    rentRoll
      .filter((r) => {
        const s = str(r, "lease_status", "status").toLowerCase();
        return s === "current" || s === "active" || s === "month-to-month";
      })
      .map((r) => str(r, "unit_id", "id") + "|" + str(r, "unit_number", "unit", "unit_name"))
  );

  const vacantUnits: VacantUnit[] = vacancyRows.map((r) => {
    const vacantSince = nullable(r, "vacant_since", "vacancy_start", "move_out_date");
    const marketRent = num(r, "market_rent", "rent", "monthly_rent");
    const daysVacant = vacantSince ? Math.max(0, -daysUntil(vacantSince)) : null;
    return {
      unit_id: str(r, "unit_id", "id"),
      property_name: str(r, "property_name", "property", "building"),
      unit_number: str(r, "unit_number", "unit", "unit_name"),
      beds: r["beds"] != null ? Number(r["beds"]) : null,
      baths: r["baths"] != null ? Number(r["baths"]) : null,
      market_rent: marketRent || null,
      days_vacant: daysVacant,
      estimated_lost_rent:
        daysVacant != null && marketRent
          ? Math.round((marketRent / 30) * daysVacant)
          : null,
    };
  });

  const totalKnown = occupied.size + vacantUnits.length;
  const occupancyPct =
    totalKnown > 0 ? Math.round((occupied.size / totalKnown) * 100) : 0;

  const validVacantDays = vacantUnits
    .map((v) => v.days_vacant)
    .filter((d): d is number => d !== null);
  const avgDaysVacant =
    validVacantDays.length > 0
      ? Math.round(validVacantDays.reduce((a, b) => a + b, 0) / validVacantDays.length)
      : null;

  // Expirations by month (next 12 months)
  const buckets: Record<string, ExpirationBucket> = {};
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    buckets[key] = { month: key, label, count: 0 };
  }

  rentRoll.forEach((r) => {
    const end = nullable(r, "lease_end", "lease_end_date");
    if (!end) return;
    const { key } = monthBucket(end);
    if (buckets[key]) buckets[key].count++;
  });

  return {
    total_units: totalKnown,
    occupied_units: occupied.size,
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
