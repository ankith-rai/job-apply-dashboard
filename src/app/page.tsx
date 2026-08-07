import JobCard from "@/src/components/JobCard";
import RunButton from "@/src/components/RunButton";
import RunStrip from "@/src/components/RunStrip";
import { TAILOR_THRESHOLD } from "@/src/lib/run";
import { getJobs, getRuns } from "@/src/lib/store";

export const dynamic = "force-dynamic";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 26,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}

export default async function TodayPage() {
  const [jobs, runs] = await Promise.all([getJobs(), getRuns()]);
  const lastRun = runs[0] ?? null;

  const review = jobs
    .filter((j) => j.stage === "matched")
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
  const strong = review.filter((j) => (j.score?.total ?? 0) >= TAILOR_THRESHOLD);
  const rest = review.filter((j) => (j.score?.total ?? 0) < TAILOR_THRESHOLD);
  const queued = jobs.filter((j) => j.stage === "queued");
  const applied = jobs.filter((j) =>
    ["applied", "interview", "offer", "rejected"].includes(j.stage),
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <p className="eyebrow" style={{ margin: "0 0 6px" }}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 800 }}>
            {strong.length > 0
              ? `${strong.length} worth your time today`
              : "Nothing strong in the queue"}
          </h1>
          <p style={{ margin: "8px 0 0", color: "var(--muted)", maxWidth: 60 + "ch" }}>
            Postings are collected, scored against your profile and pre-tailored.
            You decide what actually gets sent.
          </p>
        </div>
        <RunButton />
      </div>

      <RunStrip run={lastRun} />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          margin: "20px 0 32px",
        }}
      >
        <Stat value={review.length} label="Awaiting your review" />
        <Stat value={queued.length} label="Approved, not yet sent" />
        <Stat value={applied.length} label="Applications out" />
        <Stat
          value={jobs.filter((j) => ["interview", "offer"].includes(j.stage)).length}
          label="Replies and interviews"
        />
      </section>

      {strong.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Strong matches</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
              Scoring {TAILOR_THRESHOLD} or above. A tailored resume is already
              generated for each.
            </p>
          </div>
          <div className="grid-jobs">
            {strong.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {queued.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Approved, waiting to be sent
          </h2>
          <div className="grid-jobs">
            {queued.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Weaker matches</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
              Kept for transparency so you can see what the scoring set aside.
            </p>
          </div>
          <div className="grid-jobs">
            {rest.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {jobs.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing collected yet</p>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 14 }}>
            Run today&apos;s search to pull postings from your configured sources.
          </p>
        </div>
      )}
    </>
  );
}
