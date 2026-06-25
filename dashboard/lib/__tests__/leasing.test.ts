import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { upcomingMoveIns, upcomingMoveOuts, renewalsToChase, occupancySummary } from "../leasing";

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

// Real AppFolio column names: unit, tenant, status, lease_from, lease_to, move_in, move_out, rent
const base = {
  unit_id: "256",
  property_name: "15th",
  unit: "1 - 1",
  tenant: "Alice",
  status: "Current",
  rent: "1500.00",
  lease_from: "2024-01-01",
  lease_to: null, // null = month-to-month
};

describe("upcomingMoveIns", () => {
  it("returns any future move-in within window regardless of status label", () => {
    const rows = [
      { ...base, unit_id: "1", status: "Future", move_in: "2025-01-30" },
      { ...base, unit_id: "2", status: "Vacant Rented", move_in: "2025-02-05" }, // future tenant
      { ...base, unit_id: "3", status: "Future", move_in: "2025-06-01" }, // outside 90d window
      { ...base, unit_id: "4", status: "Occupied", move_in: "2024-06-01" }, // past move-in
    ];
    const result = upcomingMoveIns(rows);
    expect(result.map((r) => r.unit_id).sort()).toEqual(["1", "2"]);
    expect(result[0].days_until).toBe(15);
  });
});

describe("upcomingMoveOuts", () => {
  it("returns current leases with move-out in window and flags replacement", () => {
    const rows = [
      { ...base, unit_id: "1", unit: "101", status: "Current", move_out: "2025-01-25" },
      { ...base, unit_id: "2", unit: "101", status: "Future", move_in: "2025-02-01" },
      { ...base, unit_id: "3", unit: "102", status: "Current", move_out: "2025-02-10" },
    ];
    const result = upcomingMoveOuts(rows);
    expect(result.find(r => r.unit_number === "101")?.has_replacement).toBe(true);
    expect(result.find(r => r.unit_number === "102")?.has_replacement).toBe(false);
  });
});

describe("renewalsToChase", () => {
  it("excludes units that already have a future lease", () => {
    const rows = [
      { ...base, unit_id: "1", unit: "101", status: "Current", lease_to: "2025-03-01" },
      { ...base, unit_id: "2", unit: "101", status: "Future" },
      { ...base, unit_id: "3", unit: "102", status: "Current", lease_to: "2025-03-15" },
    ];
    const result = renewalsToChase(rows);
    expect(result.map(r => r.unit_number)).not.toContain("101");
    expect(result.map(r => r.unit_number)).toContain("102");
  });

  it("marks null lease_to as month-to-month", () => {
    const rows = [
      { ...base, unit_id: "1", unit: "201", status: "Current", lease_to: null },
    ];
    const result = renewalsToChase(rows);
    expect(result[0].status).toBe("month-to-month");
  });

  it("marks action-needed for leases ending within 30 days", () => {
    const rows = [
      { ...base, unit_id: "1", unit: "301", status: "Current", lease_to: "2025-01-25" },
    ];
    const result = renewalsToChase(rows);
    expect(result[0].status).toBe("action-needed");
  });

  it("marks already-passed lease_to as expired and sorts it first", () => {
    const rows = [
      { ...base, unit_id: "1", unit: "401", status: "Current", lease_to: "2025-02-10" }, // expiring soon
      { ...base, unit_id: "2", unit: "402", status: "Current", lease_to: "2024-12-01" }, // expired
    ];
    const result = renewalsToChase(rows);
    expect(result[0].unit_number).toBe("402");
    expect(result[0].status).toBe("expired");
    expect(result[0].days_until_end).toBeLessThan(0);
  });
});

describe("occupancySummary", () => {
  it("counts leased units (occupied + future tenant) toward occupancy", () => {
    const rentRoll = [
      { ...base, unit: "101", status: "Occupied", tenant: "Bob" },
      { ...base, unit: "102", status: "Vacant Rented", tenant: "Future Guy", move_in: "2025-02-01" }, // leased
      { ...base, unit: "103", status: "Vacant", tenant: "", market_rent: "1200.00" }, // truly vacant
    ];
    const result = occupancySummary(rentRoll, []);
    expect(result.total_units).toBe(3);
    expect(result.occupied_units).toBe(2); // 101 occupied + 102 future-leased
    expect(result.occupancy_pct).toBe(67);
    expect(result.vacant_units).toHaveLength(1);
    expect(result.vacant_units[0].unit_number).toBe("103");
  });

  it("splits occupancy by property", () => {
    const rentRoll = [
      { ...base, property_name: "15th", unit: "1", status: "Occupied", tenant: "A" },
      { ...base, property_name: "15th", unit: "7", status: "Vacant", tenant: "" },
      { ...base, property_name: "Oak", unit: "1", status: "Occupied", tenant: "B" },
      { ...base, property_name: "Oak", unit: "2", status: "Occupied", tenant: "C" },
    ];
    const result = occupancySummary(rentRoll, []);
    const by = Object.fromEntries(result.by_property.map((p) => [p.property_name, p]));
    expect(by["15th"].total_units).toBe(2);
    expect(by["15th"].leased_units).toBe(1);
    expect(by["15th"].occupancy_pct).toBe(50);
    expect(by["Oak"].occupancy_pct).toBe(100);
  });

  it("calculates estimated lost rent for vacant units", () => {
    const rentRoll = [
      {
        property_name: "Oak Ave",
        unit: "1A",
        status: "Vacant",
        tenant: "",
        market_rent: "3000.00",
        move_out: "2025-01-05",
      },
    ];
    const result = occupancySummary(rentRoll, []);
    expect(result.vacant_units[0].days_vacant).toBe(10);
    expect(result.vacant_units[0].estimated_lost_rent).toBe(1000);
  });
});
