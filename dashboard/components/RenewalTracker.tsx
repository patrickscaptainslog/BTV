"use client";

import { useState } from "react";
import type { RenewalAlert, ContactStatus, LeaseStatusEntry, LeaseStatusMap } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import { formatDate } from "@/lib/dates";

const CONTACT_OPTIONS: { value: ContactStatus | ""; label: string }[] = [
  { value: "", label: "— Set status" },
  { value: "contacted", label: "Contacted" },
  { value: "renewing", label: "Renewing" },
  { value: "not-renewing", label: "Not Renewing" },
  { value: "no-reply", label: "No Reply" },
];

const CONTACT_CLS: Record<ContactStatus | "", string> = {
  "": "bg-white text-slate-400 border-slate-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  renewing: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "not-renewing": "bg-slate-100 text-slate-600 border-slate-300",
  "no-reply": "bg-amber-50 text-amber-700 border-amber-200",
};

interface Props {
  renewals: RenewalAlert[];
  initialStatuses: LeaseStatusMap;
  kvAvailable: boolean;
}

export default function RenewalTracker({ renewals, initialStatuses, kvAvailable }: Props) {
  // Seed local state, dropping stale entries (a different tenant now occupies the unit).
  const [statuses, setStatuses] = useState<LeaseStatusMap>(() => {
    const clean: LeaseStatusMap = {};
    for (const r of renewals) {
      const e = initialStatuses[r.unit_id];
      if (e && e.tenant_name === r.tenant_name) clean[r.unit_id] = e;
    }
    return clean;
  });
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function persist(r: RenewalAlert, status: ContactStatus | "", note: string) {
    const entry: LeaseStatusEntry = {
      status,
      note,
      tenant_name: r.tenant_name,
      updated_at: new Date().toISOString(),
    };
    setStatuses((prev) => ({ ...prev, [r.unit_id]: entry }));
    setSaving((p) => ({ ...p, [r.unit_id]: true }));
    setError(null);
    try {
      const res = await fetch("/api/lease-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: r.unit_id, status, note, tenant_name: r.tenant_name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Could not save. Try again.");
      }
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving((p) => ({ ...p, [r.unit_id]: false }));
    }
  }

  if (renewals.length === 0) {
    return <p className="text-sm text-slate-400">No leases need renewal attention right now.</p>;
  }

  return (
    <div className="space-y-3">
      {!kvAvailable && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          Status changes won&apos;t be saved yet — a Vercel KV store needs to be connected. The list is still accurate; only the editable status/notes require storage.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="text-left pb-2 pr-4">Unit</th>
              <th className="text-left pb-2 pr-4">Tenant</th>
              <th className="text-left pb-2 pr-4">Lease End</th>
              <th className="text-right pb-2 pr-4">Days</th>
              <th className="text-left pb-2 pr-4">Lease</th>
              <th className="text-left pb-2 pr-4">Outreach</th>
              <th className="text-left pb-2">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {renewals.map((r) => {
              const entry = statuses[r.unit_id];
              const status = entry?.status ?? "";
              const note = entry?.note ?? "";
              return (
                <tr key={r.unit_id} className="hover:bg-slate-50 align-top">
                  <td className="py-2.5 pr-4 font-medium text-slate-800 whitespace-nowrap">{r.property_name} {r.unit_number}</td>
                  <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{r.tenant_name}</td>
                  <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{r.lease_end ? formatDate(r.lease_end) : "—"}</td>
                  <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                    {r.days_until_end != null ? (
                      <span className={`font-medium ${r.days_until_end < 0 ? "text-red-700" : r.days_until_end <= 30 ? "text-red-600" : "text-amber-600"}`}>
                        {r.days_until_end < 0 ? `${Math.abs(r.days_until_end)}d ago` : `${r.days_until_end}d`}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-2.5 pr-4"><StatusBadge status={r.status} /></td>
                  <td className="py-2.5 pr-4">
                    <select
                      value={status}
                      disabled={!kvAvailable || saving[r.unit_id]}
                      onChange={(e) => persist(r, e.target.value as ContactStatus | "", note)}
                      className={`text-xs rounded-md border px-2 py-1 outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60 ${CONTACT_CLS[status]}`}
                    >
                      {CONTACT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5">
                    <input
                      type="text"
                      defaultValue={note}
                      disabled={!kvAvailable}
                      placeholder="Add note…"
                      maxLength={500}
                      onBlur={(e) => {
                        if (e.target.value !== note) persist(r, status, e.target.value);
                      }}
                      className="w-full min-w-[10rem] text-xs rounded-md border border-slate-200 px-2 py-1 text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
