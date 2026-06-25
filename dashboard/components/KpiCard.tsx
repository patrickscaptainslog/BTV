interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "red" | "blue" | "default";
  href?: string;
}

const accentMap = {
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  blue: "text-blue-600",
  default: "text-slate-900",
};

export default function KpiCard({ label, value, sub, accent = "default", href }: Props) {
  const inner = (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-3 sm:px-5 sm:py-4">
      <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 leading-tight">{label}</p>
      <p className={`text-2xl sm:text-3xl font-semibold ${accentMap[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block transition-opacity hover:opacity-75">
        {inner}
      </a>
    );
  }
  return inner;
}
