export function daysUntil(dateStr: string, from: Date = new Date()): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function withinDays(dateStr: string | null, days: number, from?: Date): boolean {
  if (!dateStr) return false;
  const d = daysUntil(dateStr, from);
  return d >= 0 && d <= days;
}

export function monthBucket(dateStr: string): { key: string; label: string } {
  const [year, month] = dateStr.split("-");
  const label = new Date(`${year}-${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  return { key: `${year}-${month}`, label };
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
