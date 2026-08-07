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
        {score.factors.map((f) => (
          <div
            key={f.key}
            title={`${f.label}: ${f.earned}/${f.max} — ${f.detail ?? ""}`}
            style={{
              width: `${f.earned}%`,
              background: COLORS[f.key] ?? "#9AA2B4",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function FactorTable({ score }: { score?: MatchScore }) {
  if (!score) return null;
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
