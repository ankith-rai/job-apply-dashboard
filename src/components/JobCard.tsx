import Link from "next/link";
import JobActions from "./JobActions";
import { ScoreBadge, FactorBar } from "./ScoreMeter";
import type { Job } from "@/src/lib/types";

const MARKET_LABEL: Record<string, string> = {
  india: "India",
  us: "US",
  remote: "Remote",
};

function postedAgo(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(d)) return "date unknown";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export default function JobCard({ job }: { job: Job }) {
  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid #D8DEE9",
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <Link
            href={`/jobs/${job.id}`}
            style={{
              fontSize: 15,
              fontWeight: 650,
              lineHeight: 1.3,
              display: "block",
            }}
          >
            {job.title}
          </Link>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#6B7385",
            }}
          >
            {job.company} · {job.location}
          </p>
        </div>
        <ScoreBadge score={job.score} />
      </div>

      <FactorBar score={job.score} />

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {job.market.map((m) => (
          <span
            key={m}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 7px",
              borderRadius: 5,
              background: "#EEF1F6",
              color: "#5A6377",
            }}
          >
            {MARKET_LABEL[m] ?? m}
          </span>
        ))}
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "#9AA2B4",
          }}
        >
          {job.source} · {postedAgo(job.postedAt)}
        </span>
        {job.salary && (
          <span style={{ fontSize: 12, color: "#0B6B4A", fontWeight: 600 }}>
            {job.salary}
          </span>
        )}
      </div>

      {job.score?.flags && job.score.flags.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: "8px 10px",
            listStyle: "none",
            background: "#FDF3E0",
            borderRadius: 6,
            fontSize: 12,
            color: "#8A5D00",
            display: "grid",
            gap: 4,
          }}
        >
          {job.score.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}

      {job.tailoredResume && (
        <span
          style={{
            fontSize: 12,
            color: "#0B6B4A",
            fontWeight: 600,
          }}
        >
          Resume ready
        </span>
      )}

      <JobActions id={job.id} url={job.url} stage={job.stage} compact />
    </article>
  );
}
