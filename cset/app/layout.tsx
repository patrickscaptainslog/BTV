import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import SyncIndicator from "@/components/SyncIndicator";

export const metadata: Metadata = {
  title: "CSET Math Prep",
  description: "Adaptive practice for CSET Mathematics Subtests I & II",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/drill", label: "Drill" },
  { href: "/writing", label: "Writing" },
  { href: "/exam", label: "Exam Sim" },
  { href: "/review", label: "Review" },
  { href: "/lessons", label: "Lessons" },
  { href: "/flags", label: "Flags" },
  { href: "/login", label: "Login" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <nav className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-1 overflow-x-auto">
            <span className="font-bold text-lg mr-4 whitespace-nowrap">
              CSET<span className="text-sky-600 dark:text-sky-400">Math</span>
            </span>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {n.label}
              </Link>
            ))}
            <SyncIndicator />
          </nav>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
