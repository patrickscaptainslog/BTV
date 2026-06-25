import { fetchRentRoll, fetchUnitVacancy, fetchFutureTenants, fetchTenantDirectory, getManualOverrides } from "@/lib/appfolio";
import { buildDashboardData } from "@/lib/leasing";
import { formatDate } from "@/lib/dates";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import ExpirationChart from "@/components/ExpirationChart";
import RefreshButton from "@/components/RefreshButton";
import ExportButton from "@/components/ExportButton";
import RenewalTracker from "@/components/RenewalTracker";
import { getLeaseStatuses, kvAvailable } from "@/lib/leaseStatus";

export const dynamic = "force-dynamic";

function occColor(pct: number) {
  return pct >= 90 ? "text-emerald-600" : pct >= 75 ? "text-amber-600" : "text-red-600";
}

export default async function DashboardPage() {
  let data;
  let fetchError: string | null = null;

  try {
    const rentRoll = await fetchRentRoll();
    const vacancyRows = await fetchUnitVacancy();
    const futureTenants = await fetchFutureTenants();
    const tenantContacts = await fetchTenantDirectory();
    if (rentRoll.length === 0) {
      fetchError = "AppFolio returned 0 rent-roll rows. The connection works but no data came back — try Refresh.";
    } else {
      const overrides = getManualOverrides();
      const augmentedRoll = overrides.length > 0 ? [...rentRoll, ...overrides] : rentRoll;
      data = await buildDashboardData(augmentedRoll, vacancyRows, futureTenants, tenantContacts);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  // Renewal outreach statuses (admin-editable, persisted in KV)
  const leaseStatuses = await getLeaseStatuses();
  const kvOn = kvAvailable();

  const refreshedAt = data
    ? new Date(data.refreshed_at).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : null;

  const occ = data?.occupancy;
  const expiring90 = data ? data.occupancy.expirations_by_month.slice(0, 3).reduce((s, b) => s + b.count, 0) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Leasing Dashboard</h1>
            {occ && (
              <p className="text-sm text-slate-500 mt-0.5">
                {occ.occupied_units} of {occ.total_units} units leased
                <span className="mx-1.5 text-slate-300">·</span>
                <span className={`${occColor(occ.occupancy_pct)} font-medium`}>
                  {occ.occupancy_pct}% occupied
                </span>
                {occ.vacant_units.length > 0 && (
                  <>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-slate-500">{occ.vacant_units.length} vacant</span>
                  </>
                )}
              </p>
            )}
            {refreshedAt && (
              <p className="text-xs text-slate-400 mt-0.5">Updated {refreshedAt}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <RefreshButton />
            <ExportButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <strong>API Error:</strong> {fetchError}
          </div>
        )}

        {data && (
          <>
            {/* Property occupancy summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.occupancy.by_property.map((p) => (
                <div key={p.property_name} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800 mb-2">{p.property_name}</p>
                  <div className="flex gap-4 text-xs">
                    <div>
                      <p className="text-slate-400 uppercase tracking-wide mb-0.5">Leased</p>
                      <span className={`text-base font-semibold ${occColor(p.occupancy_pct)}`}>
                        {p.occupancy_pct}%
                      </span>
                      <span className="text-slate-400 ml-1">{p.leased_units}/{p.total_units}</span>
                    </div>
                    <div className="w-px bg-slate-100" />
                    <div>
                      <p className="text-slate-400 uppercase tracking-wide mb-0.5">Physical</p>
                      <span className={`text-base font-semibold ${occColor(p.physical_pct)}`}>
                        {p.physical_pct}%
                      </span>
                      <span className="text-slate-400 ml-1">{p.physical_units}/{p.total_units}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-3 gap-3">
              <KpiCard
                label="Move-Ins (90d)"
                value={data.move_ins.length}
                accent={data.move_ins.length > 0 ? "green" : "default"}
                href="#move-ins"
              />
              <KpiCard
                label="Move-Outs (90d)"
                value={data.move_outs.length}
                accent={data.move_outs.filter(m => !m.has_replacement).length > 0 ? "amber" : "default"}
                href="#move-outs"
              />
              <KpiCard
                label="Expiring (90d)"
                value={expiring90}
                sub="leases"
                accent="default"
              />
            </div>

            {/* Move-Ins */}
            <section id="move-ins" className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <details open className="group">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none select-none hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-800">Upcoming Move-Ins (90d)</h2>
                    <span className="text-xs font-medium bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                      {data.move_ins.length}
                    </span>
                  </div>
                  <svg className="w-4 h-4 text-slate-400 rotate-0 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-5">
                  {data.move_ins.length === 0 ? (
                    <p className="text-sm text-slate-400">No move-ins in the next 90 days.</p>
                  ) : (
                    <>
                      {/* Mobile: stacked cards */}
                      <ul className="sm:hidden divide-y divide-slate-100">
                        {data.move_ins.map((m, i) => (
                          <li key={i} className="py-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800">{m.property_name} {m.unit_number}</p>
                              <p className="text-sm text-slate-600 truncate">{m.tenant_name || <span className="text-slate-300 italic">—</span>}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{m.date ? formatDate(m.date) : <span className="italic">check AppFolio</span>}</p>
                            </div>
                            {m.days_until < 999 && (
                              <span className={`shrink-0 text-sm font-medium ${m.days_until <= 7 ? "text-amber-600" : "text-slate-500"}`}>
                                {m.days_until}d
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {/* Desktop: table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                              <th className="text-left pb-2 pr-4">Unit</th>
                              <th className="text-left pb-2 pr-4">Tenant</th>
                              <th className="text-left pb-2 pr-4">Move-In</th>
                              <th className="text-right pb-2">Days</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {data.move_ins.map((m, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="py-2 pr-4 font-medium text-slate-800">{m.property_name} {m.unit_number}</td>
                                <td className="py-2 pr-4 text-slate-600">{m.tenant_name || <span className="text-slate-300 italic">—</span>}</td>
                                <td className="py-2 pr-4 text-slate-600">{m.date ? formatDate(m.date) : <span className="text-slate-300 italic">check AppFolio</span>}</td>
                                <td className="py-2 text-right">
                                  {m.days_until < 999 ? (
                                    <span className={`font-medium ${m.days_until <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                      {m.days_until}d
                                    </span>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </details>
            </section>

            {/* Move-Outs */}
            <section id="move-outs" className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <details open className="group">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none select-none hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-800">Upcoming Move-Outs</h2>
                    <span className="text-xs font-medium bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                      {data.move_outs.length}
                    </span>
                  </div>
                  <svg className="w-4 h-4 text-slate-400 rotate-0 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-5">
                  {data.move_outs.length === 0 ? (
                    <p className="text-sm text-slate-400">No move-outs in the next 90 days.</p>
                  ) : (
                    <>
                      {/* Mobile: stacked cards */}
                      <ul className="sm:hidden divide-y divide-slate-100">
                        {data.move_outs.map((m, i) => (
                          <li key={i} className="py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800">{m.property_name} {m.unit_number}</p>
                                <p className="text-sm text-slate-600 truncate">{m.tenant_name}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{formatDate(m.date)}</p>
                              </div>
                              <span className={`shrink-0 text-sm font-medium ${m.days_until <= 7 ? "text-amber-600" : "text-slate-500"}`}>
                                {m.days_until}d
                              </span>
                            </div>
                            <div className="mt-2">
                              <StatusBadge status={m.has_replacement ? "has-replacement" : "no-replacement"} />
                            </div>
                          </li>
                        ))}
                      </ul>
                      {/* Desktop: table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                              <th className="text-left pb-2 pr-4">Unit</th>
                              <th className="text-left pb-2 pr-4">Tenant</th>
                              <th className="text-left pb-2 pr-4">Move-Out</th>
                              <th className="text-right pb-2 pr-4">Days</th>
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
                                <td className="py-2">
                                  <StatusBadge status={m.has_replacement ? "has-replacement" : "no-replacement"} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </details>
            </section>

            {/* Lease Renewals — expiring/expired leases with outreach tracking */}
            <section id="renewals" className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-slate-800">Lease Renewals</h2>
                <span className="text-xs font-medium bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                  {data.renewals.length}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Expired, expiring (120d), and month-to-month leases. Set outreach status and notes per tenant.</p>
              <RenewalTracker renewals={data.renewals} initialStatuses={leaseStatuses} kvAvailable={kvOn} />
            </section>

            {/* Vacant Units */}
            {occ && occ.vacant_units.length > 0 && (
              <section className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-base font-semibold text-slate-800">Vacant Units</h2>
                  <span className="text-xs font-medium bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                    {occ.vacant_units.length}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="text-left pb-2 pr-4">Unit</th>
                      <th className="text-right pb-2 pr-4">Days Vacant</th>
                      <th className="text-right pb-2">Est. Lost Rent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {occ.vacant_units.map((v, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 pr-4">
                          <p className="font-medium text-slate-800">{v.property_name} {v.unit_number}</p>
                          {(v.beds != null || v.baths != null) && (
                            <p className="text-xs text-slate-400">
                              {v.beds != null ? `${v.beds}bd` : ""}{v.baths != null ? ` ${v.baths}ba` : ""}
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
              </section>
            )}

            {/* Lease Expirations chart */}
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-semibold text-slate-800">Lease Expirations — Next 12 Months</h2>
              </div>
              <ExpirationChart data={data.occupancy.expirations_by_month} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
