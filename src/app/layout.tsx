import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apply Pilot — your daily application queue",
  description:
    "Collects job postings, scores them against your profile, tailors your resume, and queues them for your approval. Nothing is submitted without you.",
};

const NAV = [
  { href: "/", label: "Today" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: "1px solid var(--rule)",
            background: "#fff",
            marginBottom: 28,
          }}
        >
          <div
            className="shell"
            style={{
              paddingTop: 16,
              paddingBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Link href="/" style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span
                style={{
                  fontFamily: "var(--display)",
                  fontWeight: 800,
                  fontSize: 19,
                  letterSpacing: "-0.02em",
                }}
              >
                Apply Pilot
              </span>
              <span className="eyebrow" style={{ fontSize: 10 }}>
                you approve every send
              </span>
            </Link>
            <nav style={{ display: "flex", gap: 4 }}>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "7px 12px",
                    borderRadius: 7,
                    color: "var(--ink)",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
