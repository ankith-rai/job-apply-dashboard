import {
  PROFILE,
  SKILL_GROUPS,
  TARGET_MARKETS,
  TARGET_TITLES,
} from "@/src/lib/profile";
import { TAILOR_THRESHOLD } from "@/src/lib/run";
import {
  ASHBY_BOARDS,
  FETCH_CONCURRENCY,
  GREENHOUSE_BOARDS,
  JOBICY_TAGS,
  LEVER_BOARDS,
  MUSE_CATEGORIES,
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
    [
      "GREENHOUSE / LEVER / ASHBY_BOARDS",
      "Replaces the verified default list rather than adding to it — leave unset unless you mean to narrow the search",
    ],
    ["FETCH_CONCURRENCY", "Board fetches in flight at once, default 10"],
    ["MUSE_CATEGORIES / MUSE_PAGES", "Case-sensitive category names; 20 postings per page"],
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
        <Row label="Always on">
          Remotive, Arbeitnow, Jobicy, The Muse
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            No key required. Jobicy has the best hit rate of any source here — 28%
            of what it returns scores fair or better, against 6% for the ATS
            boards, because it is the one keyword source that accepts free text.
            The Muse is the opposite trade: a poor 4% hit rate, kept because it is
            the only source configured that reaches non-remote India roles.
          </div>
        </Row>
        <Row label={`Greenhouse (${GREENHOUSE_BOARDS.length})`}>
          {GREENHOUSE_BOARDS.join(", ")}
        </Row>
        <Row label={`Lever (${LEVER_BOARDS.length})`}>{LEVER_BOARDS.join(", ")}</Row>
        <Row label={`Ashby (${ASHBY_BOARDS.length})`}>{ASHBY_BOARDS.join(", ")}</Row>
        <Row label="Board fetching">
          {GREENHOUSE_BOARDS.length + LEVER_BOARDS.length + ASHBY_BOARDS.length}{" "}
          boards, {FETCH_CONCURRENCY} at a time
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Every token here was verified to return postings. The failure that
            actually bites is the per-request deadline, not rate limiting: these
            boards return up to 11MB each and Lever can take 40s for 3MB, so a
            sweep was reporting up to 15 of them dead on a 12s budget while every
            one answered fine when probed alone. At 90s, with two retries per
            request, a full sweep comes back clean. Tune the fan-out with
            FETCH_CONCURRENCY — measured, 10 was both faster and cleaner than 5.
          </div>
        </Row>
        <Row label="Needs a key">Adzuna (India + US)</Row>
        <Row label="Search terms">
          {QUERIES.join(" · ")}
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Derived from your resume — target titles crossed with the skills your
            bullets and skill list actually back up. Edit the resume and these
            change. Override with SEARCH_QUERIES. Sent to Remotive and Adzuna;
            ATS boards take no query, so their whole board is fetched and gated
            instead.
          </div>
        </Row>
        <Row label="Jobicy tags">
          {JOBICY_TAGS.join(" · ")}
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Your strongest skill groups, same resume derivation as above. Override
            with JOBICY_TAGS.
          </div>
        </Row>
        <Row label="Muse categories">
          {MUSE_CATEGORIES.join(" · ")}
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Case-sensitive, and silently so — <code>software engineering</code>{" "}
            returns zero results with HTTP 200 where{" "}
            <code>Software Engineering</code> returns 40,519. This is the one
            configured list that is not lowercased, for that reason.
          </div>
        </Row>
        <Row label="Resume gate">
          Off-band titles and postings matching none of your skills
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Applied before anything reaches the store, which is the only filter an
            ATS board gets. Rejected postings are not stored, so they are
            re-checked every run — ranking of what survives stays with the scorer.
          </div>
        </Row>
        <Row label="Unconfirmed">
          {WATCHLIST.join(", ")}
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Not fetched. Answered on none of Greenhouse, Lever or Ashby — most run
            Workday, Eightfold or SuccessFactors, which expose no unauthenticated
            feed. A wrong token returns zero postings without erroring, which is
            indistinguishable from a company that is not hiring, so these stay out
            until verified. Run{" "}
            <code>npm run check:boards -- --discover</code> to re-test them.
          </div>
        </Row>
      </section>

      <section className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>Retention</h2>
        <p style={{ margin: "5px 0 6px", fontSize: 12.5, color: "var(--muted)" }}>
          src/lib/store.ts — data/jobs.json is committed to git every night, so
          every retained megabyte is paid for again on every future clone
        </p>
        <Row label="Application history">Kept forever, in full</Row>
        <Row label="Needs review">
          Dropped after 21 days untouched
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            Was 45 days, shortened when the board count went from 7 to 113. A
            posting still sitting unreviewed after three weeks is usually filled.
          </div>
        </Row>
        <Row label="Below 50">
          Record kept, description dropped
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)" }}>
            50 is the bottom of the &ldquo;fair&rdquo; band, so the rule is
            sayable: a description survives only if the posting is at least a fair
            match. The record itself has to stay, or every one of these comes back
            through the queue tomorrow.
          </div>
        </Row>
        <Row label="Passed on">Loses its tailored resume after 14 days</Row>
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
