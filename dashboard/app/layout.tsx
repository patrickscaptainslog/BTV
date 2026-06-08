import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leasing Dashboard",
  description: "Live AppFolio leasing status",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
