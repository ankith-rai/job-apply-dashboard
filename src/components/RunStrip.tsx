import type { RunRecord } from "@/src/lib/types";

const TONE = {
  ok: { dot: "#0E9F6E", bg: "#E7F6EF", text: "#0B6B4A" },
  warn: { dot: "#F0A202", bg: "#FDF3E0", text: "#8A5D00" },
  fail: { dot: "#E5484D", bg: "#FDECEC", text: "#A02225" },
} as const;

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The daily pipeline as an ordered run strip. Numbering is real here — these
 * stages happen in sequence, and each one's output feeds the next.
 */
export default function RunStrip({ run }: { run: RunRecord | null }) {
  if (!run) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #D8DEE9",
          borderRadius: 10,
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, color: "#131A2A" }}>
          No runs yet
        </p>
        <p style={{ margin: "6px 0 0", color: "#6B7385", fontSize: 14 }}>
          Start a run to collect today&apos;s postings and score them against your
          profile.
        </p>
      </div>
    );
  }

  const totalMs = run.stages.reduce((n, s) => n + s.ms, 0);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #D8DEE9",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 18px",
          borderBottom: "1px solid #D8DEE9",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#6B7385",
            }}
          >
            Last run
          </span>
          <span style={{ fontWeight: 650, fontSize: 15 }}>
            {timeAgo(run.finishedAt)}
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "#6B7385",
          }}
        >
          {(totalMs / 1000).toFixed(1)}s · {run.added} new · {run.tailored}{" "}
          tailored
        </span>
      </div>

      {run.offline && (
        <div
          style={{
            background: "#FDF3E0",
            color: "#8A5D00",
            padding: "10px 18px",
            fontSize: 13,
            borderBottom: "1px solid #F3E2C0",
          }}
        >
          No sources responded on this run. The queue below is existing data —
          check your network or API keys in Settings.
        </div>
      )}

      <ol
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
          gap: 0,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {run.stages.map((stage, i) => {
          const tone = TONE[stage.status];
          return (
            <li
              key={stage.key}
              style={{
                padding: "14px 16px 16px",
                borderRight: i < run.stages.length - 1 ? "1px solid #E6EAF0" : "none",
                borderTop: "3px solid " + tone.dot,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginBottom: 7,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "#9AA2B4",
                    letterSpacing: "0.08em",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 13, fontWeight: 650, minWidth: 0 }}>
                  {stage.label}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: tone.text,
                  marginBottom: 6,
                }}
              >
                {stage.count}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "#6B7385",
                  lineHeight: 1.45,
                }}
              >
                {stage.detail}
              </p>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "#9AA2B4",
                }}
              >
                {stage.ms}ms
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
