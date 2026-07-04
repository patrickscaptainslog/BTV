"use client";

/** Renders a first-party inline-SVG figure emitted by the content pipeline. */
export default function Figure({ svg }: { svg?: string }) {
  if (!svg) return null;
  return <div className="flex justify-center py-1 text-slate-800 dark:text-slate-200" dangerouslySetInnerHTML={{ __html: svg }} />;
}
