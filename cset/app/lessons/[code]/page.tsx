"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { LESSONS } from "@/content/lessons/lessons";
import { SUBDOMAINS } from "@/content/smr";
import type { SubdomainCode } from "@/lib/types";
import MathText from "@/components/MathText";

export default function LessonPage() {
  const params = useParams<{ code: string }>();
  const code = params.code as SubdomainCode;
  const lesson = LESSONS[code];

  if (!lesson) {
    return (
      <div className="space-y-3">
        <p>No lesson found for “{params.code}”.</p>
        <Link href="/lessons" className="text-sky-600 underline">
          All lessons
        </Link>
      </div>
    );
  }

  const sub = SUBDOMAINS[code];

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/lessons" className="text-sm text-sky-600 hover:underline">
        ← All lessons
      </Link>
      <div>
        <div className="text-xs text-slate-500">{code}</div>
        <h1 className="font-bold text-xl">{lesson.title}</h1>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <MathText text={lesson.body} className="text-[15px]" />
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Covered topics</div>
        <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc pl-5 space-y-0.5">
          {sub.topics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <Link
        href={`/drill?subtest=${sub.domain === "1" || sub.domain === "2" ? 1 : 2}&subdomain=${code}`}
        className="inline-block px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700"
      >
        Drill {code} now
      </Link>
    </div>
  );
}
