type Status = "expired" | "action-needed" | "expiring-soon" | "month-to-month" | "no-replacement" | "has-replacement";

const MAP: Record<Status, { label: string; cls: string }> = {
  "expired":          { label: "Expired",           cls: "bg-red-100 text-red-800 ring-red-300" },
  "action-needed":    { label: "Action needed",    cls: "bg-red-50 text-red-700 ring-red-200" },
  "expiring-soon":    { label: "Expiring soon",     cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  "month-to-month":   { label: "Month-to-month",    cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  "no-replacement":   { label: "No replacement",    cls: "bg-red-50 text-red-700 ring-red-200" },
  "has-replacement":  { label: "Replacement lined up", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

export default function StatusBadge({ status }: { status: Status }) {
  const { label, cls } = MAP[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}
