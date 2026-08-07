import Link from "next/link";
import { notFound } from "next/navigation";
import JobActions from "@/src/components/JobActions";
import ResumePanel from "@/src/components/ResumePanel";
import { FactorTable, ScoreBadge } from "@/src/components/ScoreMeter";
import { getJob } from "@/src/lib/store";
import { buildPlan } from "@/src/lib/tailor";
import { STAGES } from "@/src/lib/types";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  if (!job) notFound();

  const plan = buildPlan(job);
  const stageLabel =
    STAGES.find((s) => s.key === job.stage)?.label ?? job.stage;

  return (
    <>
      <Link
        href="/"
        style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}
      >
        ← Back to today
      </Link>

      <div
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "space-between",
          alignItems: "flex-start",
          margin: "14px 0 20px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.2 }}>
            {job.title}
          </h1>
          <p style={{ margin: "7px 0 0", color: "var(--muted)" }}>
            {job.company} · {job.location} · {job.source}
          </p>
          <p
            className="eyebrow"
            style={{ margin: "10px 0 0", color: "var(--signal)" }}
          >
            {stageLabel}
          </p>
        </div>
        <ScoreBadge score={job.score} />
      </div>

      <JobActions id={job.id} url={job.url} stage={job.stage} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
          gap: 18,
          marginTop: 24,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 18 }}>
          <section className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              Why it scored {job.score?.total ?? 0}
            </h2>
            <FactorTable score={job.score} />
          </section>

          <section className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              Keyword overlap
            </h2>
            <p className="eyebrow" style={{ margin: "0 0 7px" }}>
              matched
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(job.score?.matchedKeywords ?? []).map((k) => (
                <span
                  key={k}
                  style={{
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 5,
                    background: "#E7F6EF",
                    color: "#0B6B4A",
                    fontWeight: 600,
                  }}
                >
                  {k}
                </span>
              ))}
              {(job.score?.matchedKeywords ?? []).length === 0 && (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Nothing from your profile appeared in this posting.
                </span>
              )}
            </div>

            {(job.score?.missingKeywords ?? []).length > 0 && (
              <>
                <p className="eyebrow" style={{ margin: "16px 0 7px" }}>
                  in the posting, not on your resume
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {job.score?.missingKeywords.map((k) => (
                    <span
                      key={k}
                      style={{
                        fontSize: 12,
                        padding: "3px 8px",
                        borderRadius: 5,
                        background: "#FDF3E0",
                        color: "#8A5D00",
                        fontWeight: 600,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 12.5,
                    color: "var(--muted)",
                  }}
                >
                  Worth a sentence in your cover note, or a talking point for the
                  screen.
                </p>
              </>
            )}
          </section>

          <section className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              Posting
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.6,
                color: "#2C3446",
                whiteSpace: "pre-wrap",
              }}
            >
              {job.description || "No description captured."}
            </p>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 14,
                fontSize: 13.5,
                fontWeight: 650,
                color: "var(--signal)",
              }}
            >
              Open the original posting ↗
            </a>
          </section>
        </div>

        <ResumePanel job={job} plan={plan} />
      </div>
    </>
  );
}
