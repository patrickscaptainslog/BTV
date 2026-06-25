import { describe, it, expect } from "@jest/globals";
import { dashboardToCsv } from "../export";
import type { DashboardData } from "../types";

const data: DashboardData = {
  move_ins: [
    { unit_id: "1", property_name: "15th", unit_number: "6 - 6", tenant_name: "Bo, Gabriel", date: "2026-06-12", days_until: 3, monthly_rent: 1060, has_replacement: true },
  ],
  move_outs: [
    { unit_id: "2", property_name: "McAllister", unit_number: "8 - 8", tenant_name: "Vivek, R", date: "2026-07-30", days_until: 44, monthly_rent: 1500, has_replacement: true },
  ],
  renewals: [],
  occupancy: {
    total_units: 53,
    occupied_units: 52,
    occupancy_pct: 98,
    vacant_units: [
      { unit_id: "3", property_name: "15th", unit_number: "7 - 7", beds: 1, baths: 1, market_rent: 1400, days_vacant: 12, estimated_lost_rent: 560 },
    ],
    avg_days_vacant: 12,
    expirations_by_month: [{ month: "2026-07", label: "Jul 2026", count: 2 }],
    by_property: [
      { property_name: "15th", total_units: 21, leased_units: 21, physical_units: 19, occupancy_pct: 100, physical_pct: 90, vacant_units: [] },
    ],
  },
  refreshed_at: "2026-06-16T18:00:00.000Z",
};

describe("dashboardToCsv", () => {
  const csv = dashboardToCsv(data);

  it("includes all section headers", () => {
    expect(csv).toContain("PORTFOLIO SUMMARY");
    expect(csv).toContain("OCCUPANCY BY PROPERTY");
    expect(csv).toContain("UPCOMING MOVE-INS (1)");
    expect(csv).toContain("UPCOMING MOVE-OUTS (1)");
    expect(csv).toContain("VACANT UNITS (1)");
    expect(csv).toContain("LEASE RENEWALS");
    expect(csv).toContain("LEASE EXPIRATIONS BY MONTH");
  });

  it("merges outreach status and notes into the renewals section", () => {
    const withRenewal = dashboardToCsv(
      {
        ...data,
        renewals: [
          { unit_id: "9", property_name: "15th", unit_number: "3 - 3", tenant_name: "Lee, Sam", email: "sam@example.com", phone: "415-555-0199", lease_end: "2026-05-01", days_until_end: -46, monthly_rent: 1500, status: "expired" },
        ],
      },
      { "9": { status: "no-reply", note: "emailed twice", tenant_name: "Lee, Sam", updated_at: "2026-06-16T00:00:00Z" } }
    );
    expect(withRenewal).toContain("No Reply");
    expect(withRenewal).toContain("emailed twice");
    expect(withRenewal).toContain("Expired");
    expect(withRenewal).toContain("sam@example.com");
    expect(withRenewal).toContain("415-555-0199");
  });

  it("ignores outreach status when the tenant has changed (stale entry)", () => {
    const stale = dashboardToCsv(
      {
        ...data,
        renewals: [
          { unit_id: "9", property_name: "15th", unit_number: "3 - 3", tenant_name: "New, Person", lease_end: "2026-05-01", days_until_end: -46, monthly_rent: 1500, status: "expired" },
        ],
      },
      { "9": { status: "renewing", note: "old tenant note", tenant_name: "Lee, Sam", updated_at: "2026-06-16T00:00:00Z" } }
    );
    expect(stale).not.toContain("old tenant note");
  });

  it("escapes cells containing commas", () => {
    // "Bo, Gabriel" must be wrapped in quotes
    expect(csv).toContain('"Bo, Gabriel"');
  });

  it("does NOT include rent figures", () => {
    expect(csv).not.toContain("1060");
    expect(csv).not.toContain("1500");
  });

  it("renders replacement flag as Yes/No", () => {
    expect(csv).toContain("Yes");
  });
});
