import { fetchAllSources } from "./sources";
import { recordRun, upsertJobs, readStore, writeStore } from "./store";
import { tailorFor } from "./tailor";
import type { RunRecord, RunStageResult, Job } from "./types";

/** Auto-tailor resumes for anything scoring at or above this. */
export const TAILOR_THRESHOLD = 60;

/**
 * The daily pipeline: collect → dedupe → score → tailor → queue for review.
 * Nothing here submits an application. That stays a human decision.
 */
export async function runDailyPipeline(): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const stages: RunStageResult[] = [];
  let t = Date.now();
  const lap = () => {
    const ms = Date.now() - t;
    t = Date.now();
    return ms;
  };

  // 1. Collect
  const results = await fetchAllSources();
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const fetched = ok.reduce((n, r) => n + r.jobs.length, 0);
  const offline = ok.length === 0;

  stages.push({
    key: "collect",
    label: "Collect postings",
    status: offline ? "fail" : failed.length ? "warn" : "ok",
    count: fetched,
    detail: offline
      ? `All ${results.length} sources unreachable — showing existing data`
      : `${ok.length}/${results.length} sources responded` +
        (failed.length ? ` · quiet: ${failed.map((f) => f.source).join(", ")}` : ""),
    ms: lap(),
  });

  // 2. Dedupe + 3. Score (scoring happens inside upsertJobs)
  const incoming: Job[] = ok.flatMap((r) => r.jobs);
  const { added, duplicates } = await upsertJobs(incoming);

  stages.push({
    key: "dedupe",
    label: "Drop duplicates",
    status: "ok",
    count: duplicates,
    detail: `${added} new, ${duplicates} already tracked`,
    ms: lap(),
  });
  stages.push({
    key: "score",
    label: "Score against profile",
    status: "ok",
    count: added,
    detail: `Scored ${added} new postings on skills, seniority, market, domain, freshness`,
    ms: lap(),
  });

  // 4. Tailor resumes for strong matches awaiting review
  const store = await readStore();
  let tailored = 0;
  for (const job of store.jobs) {
    const strong = (job.score?.total ?? 0) >= TAILOR_THRESHOLD;
    if (strong && job.stage === "matched" && !job.tailoredResume) {
      job.tailoredResume = tailorFor(job).latex;
      tailored++;
    }
  }
  await writeStore(store);

  stages.push({
    key: "tailor",
    label: "Tailor resumes",
    status: "ok",
    count: tailored,
    detail: `${tailored} resumes generated for matches scoring ${TAILOR_THRESHOLD}+`,
    ms: lap(),
  });

  // 5. Queue for review — deliberately does not submit
  const awaiting = store.jobs.filter(
    (j) => j.stage === "matched" && (j.score?.total ?? 0) >= TAILOR_THRESHOLD,
  ).length;

  stages.push({
    key: "review",
    label: "Queue for your review",
    status: "ok",
    count: awaiting,
    detail: `${awaiting} waiting on your approval — nothing was submitted`,
    ms: lap(),
  });

  const run: RunRecord = {
    id: `run-${Date.now()}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    stages,
    fetched,
    added,
    duplicates,
    scored: added,
    tailored,
    offline,
  };

  await recordRun(run);
  return run;
}
