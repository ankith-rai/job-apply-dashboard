import { verdict } from "@/src/lib/match";
import type { MatchScore } from "@/src/lib/types";

const TONE = {
  strong: { fg: "#0B6B4A", bg: "#E7F6EF", bar: "#0E9F6E" },
  fair: { fg: "#8A5D00", bg: "#FDF3E0", bar: "#F0A202" },
  weak: { fg: "#5A6377", bg: "#EEF1F6", bar: "#9AA2B4" },
} as const;

export function ScoreBadge({ score }: { score?: MatchScore }) {
  const total = score?.total ?? 0;
  const v = verdict(total);
  const tone = TONE[v.tone];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        background: tone.bg,
        color: tone.fg,
        borderRadius: 7,
        padding: "5px 9px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 17,
          fontWeight: 650,
          lineHeight: 1,
        }}
      >
        {total}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.01em" }}>
        {v.label}
      </span>
    </div>
  );
}

/** Stacked factor bar — shows *why* the score is what it is, not just the number. */
export function FactorBar({ score }: { score?: MatchScore }) {
  if (!score) return null;
  const COLORS: Record<string, string> = {
    skills: "#3D5AFE",
    seniority: "#6E56CF",
    location: "#0E9F6E",
    domain: "#F0A202",
    freshness: "#9AA2B4",
  };
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 7,
          borderRadius: 4,
          overflow: "hidden",
          background: "#E6EAF0",
        }}
      >
        {/*
          An archived posting has no factors left — the breakdown is dropped with
          the description once it scores below the review floor. Falling through to
          the map would paint an empty bar, which reads as a score of zero rather
          than as a missing breakdown, so fill it to the total in neutral grey.
        */}
        {score.factors.length === 0 ? (
          <div
            title={`${score.total}/100 — breakdown not retained`}
            style={{ width: `${score.total}%`, background: "#9AA2B4" }}
          />
        ) : (
          score.factors.map((f) => (
            <div
              key={f.key}
              title={`${f.label}: ${f.earned}/${f.max} — ${f.detail ?? ""}`}
              style={{
                width: `${f.earned}%`,
                background: COLORS[f.key] ?? "#9AA2B4",
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function FactorTable({ score }: { score?: MatchScore }) {
  if (!score) return null;

  // A pruned posting keeps its total and loses the breakdown — the score object is
  // ~640 bytes a record and 31% of the store, so it goes the same way the
  // description does once a posting scores below the review floor. Saying so beats
  // rendering an empty table that reads like a bug.
  //
  // Deliberately does not offer `npm run rescore` as a fix. Rescoring recomputes
  // from job.description, which for one of these is the 240-char tombstone the same
  // prune wrote — so it would quietly produce a thinner breakdown and a lower total
  // derived from a truncated posting, not recover the real one. upsertJobs treats a
  // re-sighting as a duplicate and never refreshes the description, so the original
  // text does not come back either. The breakdown is gone; the total is the record.
  if (score.factors.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "#6B7385", lineHeight: 1.55 }}>
        Scored {score.total}/100. The factor breakdown was dropped when this
        posting was archived — it scored below the review threshold, so the detail
        was not worth the space. The total above is what was kept; the breakdown
        cannot be rebuilt, because the description it was derived from was
        truncated in the same pass.
      </p>
    );
  }

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13,
      }}
    >
      <tbody>
        {score.factors.map((f) => (
          <tr key={f.key} style={{ borderTop: "1px solid #E6EAF0" }}>
            <td style={{ padding: "9px 0", fontWeight: 600, width: 130 }}>
              {f.label}
            </td>
            <td
              style={{
                padding: "9px 10px",
                fontFamily: "var(--mono)",
                color: "#131A2A",
                width: 62,
                whiteSpace: "nowrap",
              }}
            >
              {f.earned}/{f.max}
            </td>
            <td style={{ padding: "9px 0", color: "#6B7385" }}>{f.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
