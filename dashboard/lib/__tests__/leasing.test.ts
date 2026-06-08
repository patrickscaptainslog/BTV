import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { upcomingMoveIns, upcomingMoveOuts, renewalsToChase, occupancySummary } from "../leasing";

// Pin "today" to a fixed date so assertions are deterministic
const FAKE_TODAY = new Date("2025-01-15T00:00:00");
const RealDate = global.Date;

beforeAll(() => {
  // @ts-expect-error partial mock
  global.Date = class extends RealDate {
    constructor(...args: ConstructorParameters<typeof RealDate>) {
      if (args.length === 0) super(FAKE_TODAY.toISOString());
      else super(...args);
    }
    static now() { return FAKE_TODAY.getTime(); }
  };
});

afterAll(() => { global.Date = RealDate; });

const base = {
  unit_id: "u1",
  property_name: "Elm St",
  unit_number: "101",
  tenant_name: "Alice",
  rent: "1500.00",
};

describe("upcomingMoveIns", () => {
  it("returns future leases with move-in within window", () => {
    const rows = [
      { ...base, lease_status: "Future", move_in: "2025-01-30" },
      { ...base, unit_id: "u2", lease_status: "Future", move_in: "2025-04-01" }, // outside 60d
      { ...base, unit_id: "u3", lease_status: "Current", move_in: "2025-01-20" }, // not future
    ];
    const result = upcomingMoveIns(rows);
    expect(result).toHaveLength(1);
    expect(result[0].unit_id).toBe("u1");
    expect(result[0].days_until).toBe(15);
  });
});

describe("upcomingMoveOuts", () => {
  it("returns current leases with move-out in window and flags replacement", () => {
    const rows = [
      { ...base, unit_number: "101", lease_status: "Current", move_out: "2025-01-25" },
      { ...base, unit_id: "u2", unit_number: "101", lease_status: "Future", move_in: "2025-02-01" }, // replacement
      { ...base, unit_id: "u3", unit_number: "102", lease_status: "Current", move_out: "2025-02-10" }, // no replacement
    ];
    const result = upcomingMoveOuts(rows);
    expect(result.find(r => r.unit_number === "101")?.has_replacement).toBe(true);
    expect(result.find(r => r.unit_number === "102")?.has_replacement).toBe(false);
  });
});

describe("renewalsToChase", () => {
  it("excludes units that already have a future lease", () => {
    const rows = [
      { ...base, unit_number: "101", lease_status: "Current", lease_end: "2025-03-01" },
      { ...base, unit_id: "u2", unit_number: "101", lease_status: "Future", move_in: "2025-03-01" },
      { ...base, unit_id: "u3", unit_number: "102", lease_status: "Current", lease_end: "2025-03-15" },
    ];
    const result = renewalsToChase(rows);
    expect(result.map(r => r.unit_number)).not.toContain("101");
    expect(result.map(r => r.unit_number)).toContain("102");
  });

  it("marks month-to-month leases", () => {
    const rows = [
      { ...base, unit_number: "201", lease_status: "Month-to-Month", lease_end: null },
    ];
    const result = renewalsToChase(rows);
    expect(result[0].status).toBe("month-to-month");
  });

  it("marks action-needed for leases ending within 30 days", () => {
    const rows = [
      { ...base, unit_number: "301", lease_status: "Current", lease_end: "2025-01-25" }, // 10 days
    ];
    const result = renewalsToChase(rows);
    expect(result[0].status).toBe("action-needed");
  });
});

describe("occupancySummary", () => {
  it("calculates occupancy percentage", () => {
    const rentRoll = [
      { ...base, unit_number: "101", lease_status: "Current" },
      { ...base, unit_id: "u2", unit_number: "102", lease_status: "Current" },
    ];
    const vacancy = [
      { unit_id: "u3", property_name: "Elm St", unit_number: "103", market_rent: "1200.00" },
    ];
    const result = occupancySummary(rentRoll, vacancy);
    expect(result.occupied_units).toBe(2);
    expect(result.total_units).toBe(3);
    expect(result.occupancy_pct).toBe(67);
  });

  it("calculates estimated lost rent for vacant units", () => {
    const vacancy = [
      {
        unit_id: "u1",
        property_name: "Oak Ave",
        unit_number: "1A",
        market_rent: "3000.00",
        vacant_since: "2025-01-05", // 10 days ago (FAKE_TODAY = Jan 15)
      },
    ];
    const result = occupancySummary([], vacancy);
    expect(result.vacant_units[0].days_vacant).toBe(10);
    expect(result.vacant_units[0].estimated_lost_rent).toBe(1000); // 3000/30 * 10
  });
});
