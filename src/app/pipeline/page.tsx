import Link from "next/link";
import JobActions from "@/src/components/JobActions";
import { ScoreBadge } from "@/src/components/ScoreMeter";
import { getJobs, getRuns } from "@/src/lib/store";
import { STAGES } from "@/src/lib/types";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [jobs, runs] = await Promise.all([getJobs(), getRuns()]);

  const submitted = jobs.filter((j) =>
    ["applied", "interview", "offer", "rejected"].includes(j.stage),
  ).length;
  const replied = jobs.filter((j) =>
    ["interview", "offer"].includes(j.stage),
  ).length;

  return (
    <>
      <h1 style={{ fontSize: 30, fontWeight: 800 }}>Pipeline</h1>
      <p style={{ margin: "8px 0 24px", color: "var(--muted)" }}>
        Every posting the system has seen, grouped by where it stands.{" "}
        {submitted > 0 && (
          <>
            Reply rate so far:{" "}
            <strong style={{ color: "var(--ink)" }}>
              {Math.round((replied / submitted) * 100)}%
            </strong>{" "}
            across {submitted} applications.
          </>
        )}
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        {STAGES.map((stage) => {
          const group = jobs
            .filter((j) => j.stage === stage.key)
            .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
          if (group.length === 0) return null;
          return (
            <section key={stage.key} className="card" style={{ padding: 0 }}>
              <div
                style={{
                  padding: "13px 18px",
                  borderBottom: "1px solid var(--rule)",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>{stage.label}</h2>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    color: "var(--muted)",
                  }}
                >
                  {group.length}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {stage.hint}
                </span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {group.map((job, i) => (
                  <li
                    key={job.id}
                    style={{
                      padding: "12px 18px",
                      borderTop: i === 0 ? "none" : "1px solid #E6EAF0",
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 220, flex: 1 }}>
                      <Link
                        href={`/jobs/${job.id}`}
                        style={{ fontSize: 14.5, fontWeight: 650 }}
                      >
                        {job.title}
                      </Link>
                      <p
                        style={{
                          margin: "3px 0 0",
                          fontSize: 12.5,
                          color: "var(--muted)",
                        }}
                      >
                        {job.company} · {job.location}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <ScoreBadge score={job.score} />
                      <JobActions
                        id={job.id}
                        url={job.url}
                        stage={job.stage}
                        compact
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {runs.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            Run history
          </h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                minWidth: 520,
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  {["Finished", "Fetched", "New", "Duplicates", "Tailored"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "11px 14px",
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} style={{ borderTop: "1px solid #E6EAF0" }}>
                    <td style={{ padding: "11px 14px" }}>
                      {new Date(run.finishedAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {run.offline && (
                        <span style={{ color: "#8A5D00", marginLeft: 7 }}>
                          offline
                        </span>
                      )}
                    </td>
                    {[run.fetched, run.added, run.duplicates, run.tailored].map(
                      (n, i) => (
                        <td
                          key={i}
                          style={{
                            padding: "11px 14px",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          {n}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
