"use client";

interface Props {
  label: string;
  percent: number;
  detail?: string;
}

export default function DomainBar({ label, percent, detail }: Props) {
  const hue = percent < 40 ? "bg-red-500" : percent < 70 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {detail ? `${detail} · ` : ""}
          {percent}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${hue}`} style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
    </div>
  );
}
