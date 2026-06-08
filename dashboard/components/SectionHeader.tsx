export default function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      {count !== undefined && (
        <span className="text-xs font-medium bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
          {count}
        </span>
      )}
    </div>
  );
}
