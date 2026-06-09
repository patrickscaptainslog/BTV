export interface Unit {
  unit_id: string;
  property_name: string;
  unit_number: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
}

export interface Lease {
  unit_id: string;
  tenant_name: string;
  lease_start: string; // YYYY-MM-DD
  lease_end: string | null; // YYYY-MM-DD or null for MTM
  move_in: string | null;
  move_out: string | null;
  status: string; // "Current", "Future", "Past", "Month-to-Month", etc.
  monthly_rent: number;
  is_month_to_month: boolean;
}

export interface MoveEvent {
  unit_id: string;
  property_name: string;
  unit_number: string;
  tenant_name: string;
  date: string; // YYYY-MM-DD
  days_until: number;
  monthly_rent: number;
  has_replacement: boolean; // move-out only: is there a future lease?
}

export interface RenewalAlert {
  unit_id: string;
  property_name: string;
  unit_number: string;
  tenant_name: string;
  lease_end: string | null;
  days_until_end: number | null;
  monthly_rent: number;
  status: "expiring-soon" | "month-to-month" | "action-needed";
}

export interface VacantUnit {
  unit_id: string;
  property_name: string;
  unit_number: string;
  beds: number | null;
  baths: number | null;
  market_rent: number | null;
  days_vacant: number | null;
  estimated_lost_rent: number | null;
}

export interface ExpirationBucket {
  month: string; // "YYYY-MM"
  label: string; // "Jan 2025"
  count: number;
}

export interface PropertyOccupancy {
  property_name: string;
  total_units: number;
  leased_units: number;    // occupied + vacant-rented (signed lease)
  physical_units: number;  // current + notice only (bodies in building)
  occupancy_pct: number;
  physical_pct: number;
  vacant_units: VacantUnit[];
}

export interface OccupancySummary {
  total_units: number;
  occupied_units: number;
  occupancy_pct: number;
  vacant_units: VacantUnit[];
  avg_days_vacant: number | null;
  expirations_by_month: ExpirationBucket[];
  by_property: PropertyOccupancy[];
}

export interface DashboardData {
  move_ins: MoveEvent[];
  move_outs: MoveEvent[];
  renewals: RenewalAlert[];
  occupancy: OccupancySummary;
  refreshed_at: string; // ISO datetime
}
