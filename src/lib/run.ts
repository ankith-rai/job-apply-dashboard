import { fetchAllSources } from "./sources";
import { gateByResume, rejectionsBySource } from "./relevance";
import { prune, recordRun, upsertJobs, readStore, writeStore } from "./store";
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

  // 2. Gate against the resume, before anything reaches the store.
  // Most sources cannot be asked a question — the ATS feeds hand back a whole
  // company board — so this is the only place a posting unrelated to the profile
  // can be turned away.
  const collected: Job[] = ok.flatMap((r) => r.jobs);
  const { keep, rejected } = gateByResume(collected);
  const bySource = rejectionsBySource(rejected)
    .slice(0, 4)
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");

  stages.push({
    key: "filter",
    label: "Gate against your resume",
    status: "ok",
    count: rejected.length,
    detail: rejected.length
      ? `${rejected.length} of ${collected.length} dropped — off-band titles and postings ` +
        `matching none of your skills · ${bySource || "no single source dominant"} · ` +
        `not stored, so they are re-checked every run`
      : `All ${collected.length} postings relate to your profile`,
    ms: lap(),
  });

  // 3. Dedupe + 4. Score (scoring happens inside upsertJobs)
  const { added, duplicates } = await upsertJobs(keep);

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

  // 5. Tailor resumes for strong matches awaiting review
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

  // 6. Prune before reporting, so the store this run commits is the trimmed one
  const { report: pr, store: pruned } = await prune();
  const mb = (n: number) => (n / 1_048_576).toFixed(1);
  stages.push({
    key: "prune",
    label: "Prune the store",
    status: "ok",
    count: pr.dropped + pr.slimmed,
    detail:
      `${pr.dropped} stale postings dropped, ${pr.slimmed} closed ones slimmed · ` +
      (pr.seedsDropped ? `${pr.seedsDropped} demo seeds retired · ` : "") +
      `${mb(pr.bytesBefore)}MB → ${mb(pr.bytesAfter)}MB · ` +
      `${pr.after} tracked`,
    ms: lap(),
  });

  // 7. Queue for review — deliberately does not submit.
  // Counted from the pruned store, not the snapshot above, or a stale posting
  // that prune just dropped would still show up as waiting on you.
  const awaiting = pruned.jobs.filter(
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
    filtered: rejected.length,
  };

  await recordRun(run);
  return run;
}
