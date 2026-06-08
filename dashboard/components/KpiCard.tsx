interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "red" | "blue" | "default";
}

const accentMap = {
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  blue: "text-blue-600",
  default: "text-slate-900",
};

export default function KpiCard({ label, value, sub, accent = "default" }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-semibold ${accentMap[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
