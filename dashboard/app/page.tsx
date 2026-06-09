import { fetchRentRoll, fetchUnitVacancy, fetchFutureTenants, getManualOverrides } from "@/lib/appfolio";
import { buildDashboardData } from "@/lib/leasing";
import { formatDate } from "@/lib/dates";
import KpiCard from "@/components/KpiCard";
import SectionHeader from "@/components/SectionHeader";
import StatusBadge from "@/components/StatusBadge";
import ExpirationChart from "@/components/ExpirationChart";
import RefreshButton from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data;
  let fetchError: string | null = null;

  try {
    const rentRoll = await fetchRentRoll();
    const vacancyRows = await fetchUnitVacancy();
    const futureTenants = await fetchFutureTenants();
    if (rentRoll.length === 0) {
      fetchError = "AppFolio returned 0 rent-roll rows. The connection works but no data came back — try Refresh.";
    } else {
      // Merge manual overrides (for units not yet billed in AppFolio) into rent_roll
      // so Source 2 of upcomingMoveIns picks them up via future move_in date.
      const overrides = getManualOverrides();
      const augmentedRoll = overrides.length > 0 ? [...rentRoll, ...overrides] : rentRoll;
      data = await buildDashboardData(augmentedRoll, vacancyRows, futureTenants);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const refreshedAt = data
    ? new Date(data.refreshed_at).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Leasing Dashboard</h1>
            {refreshedAt && (
              <p className="text-xs text-slate-400 mt-0.5">Updated {refreshedAt}</p>
            )}
          </div>
          <RefreshButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <strong>API Error:</strong> {fetchError}
          </div>
        )}

        {data && (
          <>
            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Vacant"
                value={data.occupancy.vacant_units.length}
                sub={data.occupancy.avg_days_vacant != null ? `avg ${data.occupancy.avg_days_vacant}d vacant` : undefined}
                accent={data.occupancy.vacant_units.length === 0 ? "green" : data.occupancy.vacant_units.length <= 2 ? "amber" : "red"}
              />
              <KpiCard
                label="Move-Ins (60d)"
                value={data.move_ins.length}
                accent={data.move_ins.length > 0 ? "green" : "default"}
              />
              <KpiCard
                label="Move-Outs (90d)"
                value={data.move_outs.length}
                accent={data.move_outs.filter(m => !m.has_replacement).length > 0 ? "amber" : "default"}
              />
              <KpiCard
                label="Renewals"
                value={data.renewals.length}
                sub="to chase"
                accent={data.renewals.filter(r => r.status === "action-needed").length > 0 ? "red" : data.renewals.length > 0 ? "amber" : "green"}
              />
              <KpiCard
                label="Expiring (90d)"
                value={data.occupancy.expirations_by_month.slice(0, 3).reduce((s, b) => s + b.count, 0)}
                sub="leases"
                accent="default"
              />
            </div>

            {/* Occupancy by Property */}
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              <SectionHeader title="Occupancy by Property" count={data.occupancy.by_property.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.occupancy.by_property.map((p) => {
                  const accent = p.occupancy_pct >= 90 ? "text-emerald-600" : p.occupancy_pct >= 80 ? "text-amber-600" : "text-red-600";
                  return (
                    <div key={p.property_name} className="border border-slate-100 rounded-lg px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">{p.property_name}</p>
                        <p className={`text-lg font-semibold ${accent}`}>{p.occupancy_pct}%</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {p.leased_units} / {p.total_units} leased
                        {p.vacant_units.length > 0 && ` · ${p.vacant_units.length} vacant`}
                      </p>
                      {/* progress bar */}
                      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${p.occupancy_pct >= 90 ? "bg-emerald-500" : p.occupancy_pct >= 80 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${p.occupancy_pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Move-Ins */}
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              <SectionHeader title="Upcoming Move-Ins" count={data.move_ins.length} />
              {data.move_ins.length === 0 ? (
                <p className="text-sm text-slate-400">No move-ins in the next 60 days.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                        <th className="text-left pb-2 pr-4">Unit</th>
                        <th className="text-left pb-2 pr-4">Tenant</th>
                        <th className="text-left pb-2 pr-4">Move-In</th>
                        <th className="text-right pb-2 pr-4">Days</th>
                        <th className="text-right pb-2">Rent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.move_ins.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 pr-4 font-medium text-slate-800">{m.property_name} {m.unit_number}</td>
                          <td className="py-2 pr-4 text-slate-600">{m.tenant_name || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="py-2 pr-4 text-slate-600">{m.date ? formatDate(m.date) : <span className="text-slate-300 italic">check AppFolio</span>}</td>
                          <td className="py-2 pr-4 text-right">
                            {m.days_until < 999 ? (
                              <span className={`font-medium ${m.days_until <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                {m.days_until}d
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 text-right text-slate-600">{m.monthly_rent ? `$${m.monthly_rent.toLocaleString()}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Move-Outs */}
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              <SectionHeader title="Upcoming Move-Outs (90d)" count={data.move_outs.length} />
              {data.move_outs.length === 0 ? (
                <p className="text-sm text-slate-400">No move-outs in the next 60 days.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                        <th className="text-left pb-2 pr-4">Unit</th>
                        <th className="text-left pb-2 pr-4">Tenant</th>
                        <th className="text-left pb-2 pr-4">Move-Out</th>
                        <th className="text-right pb-2 pr-4">Days</th>
                        <th className="text-right pb-2 pr-4">Rent</th>
                        <th className="text-left pb-2">Replacement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.move_outs.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 pr-4 font-medium text-slate-800">{m.property_name} {m.unit_number}</td>
                          <td className="py-2 pr-4 text-slate-600">{m.tenant_name}</td>
                          <td className="py-2 pr-4 text-slate-600">{formatDate(m.date)}</td>
                          <td className="py-2 pr-4 text-right">
                            <span className={`font-medium ${m.days_until <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                              {m.days_until}d
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right text-slate-600">${m.monthly_rent.toLocaleString()}</td>
                          <td className="py-2">
                            <StatusBadge status={m.has_replacement ? "has-replacement" : "no-replacement"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Renewals */}
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              <SectionHeader title="Leases to Renew" count={data.renewals.length} />
              {data.renewals.length === 0 ? (
                <p className="text-sm text-slate-400">No leases requiring renewal attention in the next 120 days.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                        <th className="text-left pb-2 pr-4">Unit</th>
                        <th className="text-left pb-2 pr-4">Tenant</th>
                        <th className="text-left pb-2 pr-4">Lease End</th>
                        <th className="text-right pb-2 pr-4">Days Left</th>
                        <th className="text-right pb-2 pr-4">Rent</th>
                        <th className="text-left pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.renewals.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 pr-4 font-medium text-slate-800">{r.property_name} {r.unit_number}</td>
                          <td className="py-2 pr-4 text-slate-600">{r.tenant_name}</td>
                          <td className="py-2 pr-4 text-slate-600">{r.lease_end ? formatDate(r.lease_end) : "—"}</td>
                          <td className="py-2 pr-4 text-right">
                            {r.days_until_end != null ? (
                              <span className={`font-medium ${r.days_until_end <= 30 ? "text-red-600" : "text-amber-600"}`}>
                                {r.days_until_end}d
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right text-slate-600">${r.monthly_rent.toLocaleString()}</td>
                          <td className="py-2">
                            <StatusBadge status={r.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Occupancy + Vacants + Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Vacant Units */}
              <section className="bg-white rounded-xl border border-slate-200 p-5">
                <SectionHeader title="Vacant Units" count={data.occupancy.vacant_units.length} />
                {data.occupancy.vacant_units.length === 0 ? (
                  <p className="text-sm text-slate-400">All units occupied.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                        <th className="text-left pb-2 pr-4">Unit</th>
                        <th className="text-right pb-2 pr-4">Days Vacant</th>
                        <th className="text-right pb-2">Lost Rent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.occupancy.vacant_units.map((v, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 pr-4">
                            <p className="font-medium text-slate-800">{v.property_name} {v.unit_number}</p>
                            {(v.beds != null || v.baths != null) && (
                              <p className="text-xs text-slate-400">
                                {v.beds != null ? `${v.beds}bd` : ""}{v.baths != null ? ` ${v.baths}ba` : ""}
                                {v.market_rent ? ` · $${v.market_rent.toLocaleString()}/mo` : ""}
                              </p>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {v.days_vacant != null ? (
                              <span className={`font-medium ${v.days_vacant > 30 ? "text-red-600" : "text-amber-600"}`}>
                                {v.days_vacant}d
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-2 text-right text-slate-600">
                            {v.estimated_lost_rent != null ? `$${v.estimated_lost_rent.toLocaleString()}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* Expirations chart */}
              <section className="bg-white rounded-xl border border-slate-200 p-5">
                <SectionHeader title="Lease Expirations — Next 12 Months" />
                <ExpirationChart data={data.occupancy.expirations_by_month} />
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
