import {
  PROFILE,
  SKILL_GROUPS,
  TARGET_MARKETS,
  TARGET_TITLES,
} from "@/src/lib/profile";
import { TAILOR_THRESHOLD } from "@/src/lib/run";
import {
  ASHBY_BOARDS,
  GREENHOUSE_BOARDS,
  LEVER_BOARDS,
  QUERIES,
  WATCHLIST,
} from "@/src/lib/sources";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px, 190px) 1fr",
        gap: 14,
        padding: "12px 0",
        borderTop: "1px solid #E6EAF0",
        alignItems: "baseline",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 650 }}>{label}</span>
      <div style={{ fontSize: 13.5, color: "#2C3446", lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const envKeys = [
    ["ADZUNA_APP_ID / ADZUNA_APP_KEY", "Free Adzuna key — best India and US coverage"],
    ["CRON_SECRET", "Required before deploying anywhere reachable from the internet"],
  ];

  return (
    <>
      <h1 style={{ fontSize: 30, fontWeight: 800 }}>Settings</h1>
      <p style={{ margin: "8px 0 24px", color: "var(--muted)", maxWidth: "68ch" }}>
        Configuration lives in code so it is reviewable and version-controlled.
        The file paths below are where to make each change.
      </p>

      <section className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>Profile</h2>
        <p style={{ margin: "5px 0 6px", fontSize: 12.5, color: "var(--muted)" }}>
          src/lib/profile.ts
        </p>
        <Row label="Name">{PROFILE.name}</Row>
        <Row label="Headline">{PROFILE.headline}</Row>
        <Row label="Ideal titles">{TARGET_TITLES.ideal.join(", ")}</Row>
        <Row label="Also acceptable">{TARGET_TITLES.acceptable.join(", ")}</Row>
        <Row label="Markets">
          {TARGET_MARKETS.join(", ")} · min score to tailor: {TAILOR_THRESHOLD}
        </Row>
        <Row label="Skill groups">
          {SKILL_GROUPS.map((g) => `${g.label} (weight ${g.weight})`).join(" · ")}
        </Row>
        <Row label="Filtered out">{TARGET_TITLES.reject.join(", ")}</Row>
        <Row label="US sponsorship">
          {PROFILE.needsSponsorshipForUS
            ? "Needed — US roles are flagged when sponsorship is not mentioned"
            : "Not needed"}
        </Row>
      </section>

      <section className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>Sources</h2>
        <p style={{ margin: "5px 0 6px", fontSize: 12.5, color: "var(--muted)" }}>
          src/lib/sources.ts — all public APIs or company-owned ATS feeds
        </p>
        <Row label="Always on">Remotive, Arbeitnow</Row>
        <Row label="Greenhouse boards">{GREENHOUSE_BOARDS.join(", ")}</Row>
        <Row label="Lever boards">{LEVER_BOARDS.join(", ")}</Row>
        <Row label="Ashby boards">{ASHBY_BOARDS.join(", ")}</Row>
        <Row label="Needs a key">Adzuna (India + US)</Row>
        <Row label="Search terms">
          {QUERIES.join(" · ")}
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Every term is sent to each keyword source. ATS boards ignore them —
            those return the whole board and the scorer does the filtering.
          </div>
        </Row>
        <Row label="Unconfirmed">
          {WATCHLIST.join(", ")}
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Not fetched. Their ATS is unverified, and a wrong token returns zero
            postings without erroring — indistinguishable from a company that is
            not hiring. Run <code>npm run check:boards -- --discover</code> to
            find out which platform each one answers on, then promote it.
          </div>
        </Row>
      </section>

      <section className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>Environment</h2>
        <p style={{ margin: "5px 0 6px", fontSize: 12.5, color: "var(--muted)" }}>
          Copy .env.example to .env.local. Never commit real keys.
        </p>
        {envKeys.map(([k, why]) => (
          <Row key={k} label={k}>
            {why}
          </Row>
        ))}
      </section>

      <section
        className="card"
        style={{ padding: 18, borderColor: "#F3E2C0", background: "#FFFDF8" }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>Where the line is</h2>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "#2C3446",
            maxWidth: "72ch",
          }}
        >
          This app never submits an application on your behalf, and it never logs
          into a job board as you. Both would breach the terms of service on
          LinkedIn, Indeed and Naukri, and put your account at risk of a ban. It
          also does not scrape sites that forbid it — every source is either a
          documented public API or a company&apos;s own careers feed. What it
          automates is the part that is genuinely repetitive: finding the
          postings, judging fit, and rewriting your resume to match. The submit
          button stays yours.
        </p>
      </section>
    </>
  );
}
