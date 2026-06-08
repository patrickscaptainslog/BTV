"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { ExpirationBucket } from "@/lib/types";

export default function ExpirationChart({ data }: { data: ExpirationBucket[] }) {
  if (data.every((d) => d.count === 0)) {
    return <p className="text-sm text-slate-400 py-6 text-center">No expirations in the next 12 months.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -10 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          contentStyle={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8 }}
          formatter={(value: number) => [`${value} lease${value === 1 ? "" : "s"}`, "Expiring"]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.count >= 3 ? "#f59e0b" : "#3b82f6"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
