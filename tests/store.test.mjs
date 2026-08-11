/**
 * Exercises the parts that touch disk and network: store round-trip, seeding on
 * first read, dedupe across runs, and a full pipeline run with every source
 * offline (no network here, which is exactly the offline path users hit first).
 * Runs in a temp cwd so the real data/jobs.json is never touched.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "applypilot-"));
process.chdir(tmp); // store.ts resolves data/ from process.cwd()

const pass = [], fail = [];
const check = async (name, fn) => {
  try { await fn(); pass.push(name); }
  catch (e) { fail.push(`${name}: ${e.message}`); }
};

const store = await import(`${R}/src/lib/store.ts`);
const pipeline = await import(`${R}/src/lib/run.ts`);

const DB = path.join(tmp, "data", "jobs.json");

await check("store: first read seeds the file that did not exist", async () => {
  assert.ok(!fs.existsSync(DB), "precondition: store should be absent");
  const s = await store.readStore();
  assert.ok(s.jobs.length > 0, "seeded store came back empty");
  assert.ok(fs.existsSync(DB), "readStore did not create data/jobs.json");
  JSON.parse(fs.readFileSync(DB, "utf8")); // must be valid JSON on disk
});

await check("store: seeded jobs arrive already scored", async () => {
  const s = await store.readStore();
  for (const j of s.jobs)
    assert.ok(Number.isFinite(j.score?.total), `${j.title} has no score`);
});

await check("store: getJobs sorts by score descending", async () => {
  const jobs = await store.getJobs();
  for (let i = 1; i < jobs.length; i++)
    assert.ok(
      (jobs[i - 1].score?.total ?? 0) >= (jobs[i].score?.total ?? 0),
      "getJobs returned out of order",
    );
});

await check("store: setStage persists across a re-read", async () => {
  const [first] = await store.getJobs();
  await store.setStage(first.id, "approved");
  const again = await store.getJob(first.id);
  assert.equal(again.stage, "approved");
  assert.ok(again.stageUpdatedAt, "stageUpdatedAt not set");
});

await check("store: upsert counts a repeat posting as a duplicate", async () => {
  const [first] = await store.getJobs();
  const clone = { ...first, id: "other-source-999", source: "Elsewhere" };
  const r = await store.upsertJobs([clone]);
  assert.equal(r.added, 0, "duplicate was added");
  assert.equal(r.duplicates, 1, "duplicate not counted");
});

await check("store: upsert adds a genuinely new posting and scores it", async () => {
  const [first] = await store.getJobs();
  const fresh = { ...first, id: "new-1", company: "Novel Corp", title: "Staff Platform Engineer" };
  delete fresh.score;
  const before = (await store.getJobs()).length;
  const r = await store.upsertJobs([fresh]);
  assert.equal(r.added, 1);
  assert.equal((await store.getJobs()).length, before + 1);
  const saved = await store.getJob("new-1");
  assert.ok(Number.isFinite(saved.score?.total), "new job was not scored on insert");
});

await check("store: run history is capped at 30", async () => {
  for (let i = 0; i < 33; i++)
    await store.recordRun({
      id: `r${i}`, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      fetched: 0, added: 0, duplicates: 0, tailored: 0, offline: true, stages: [],
    });
  const runs = await store.getRuns();
  assert.ok(runs.length <= 30, `kept ${runs.length} runs`);
  assert.equal(runs[0].id, "r32", "newest run is not first");
});

// ── full pipeline, all sources offline ────────────────────────────────────
const runFn = pipeline.runDailyPipeline;
await check("pipeline: completes with every source offline", async () => {
  assert.ok(typeof runFn === "function", `no run function; exports: ${Object.keys(pipeline)}`);
  const run = await runFn();
  assert.ok(run.id, "run has no id");
  assert.ok(Array.isArray(run.stages) && run.stages.length, "run produced no stages");
  for (const s of run.stages) {
    assert.ok(s.label, "stage missing label");
    assert.ok(["ok", "warn", "fail", "skip"].includes(s.status), `odd stage status: ${s.status}`);
  }
  assert.ok(Number.isFinite(run.added) && Number.isFinite(run.duplicates), "run counts not numeric");
});

await check("pipeline: a failed fetch never throws, it reports", async () => {
  const runs = await store.getRuns();
  assert.ok(runs.length, "pipeline recorded no run");
  assert.equal(runs[0].id, (await store.getRuns())[0].id);
});

await check("pipeline: store still valid JSON after a run", async () => {
  const raw = JSON.parse(fs.readFileSync(DB, "utf8"));
  assert.ok(Array.isArray(raw.jobs) && Array.isArray(raw.runs));
});

// ── pruning ─────────────────────────────────────────────────────────────────
// The rule that must never bend: a job you acted on is application history and
// is exempt from every prune operation, at any age. Everything else is a
// tradeoff; this one is a correctness property.

const mkScore = (total) => ({
  total, factors: [], matchedKeywords: [], missingKeywords: [], flags: [], scoredAt: "",
});

const mk = (over = {}) => ({
  id: "j-" + Math.random().toString(36).slice(2),
  title: "Staff Engineer",
  company: "Acme",
  location: "Remote",
  market: ["remote"],
  remote: true,
  url: "https://example.com/job",
  source: "test",
  postedAt: new Date().toISOString(),
  fetchedAt: new Date().toISOString(),
  stageUpdatedAt: new Date().toISOString(),
  description: "x".repeat(1000),
  tags: [],
  score: mkScore(90),
  stage: "matched",
  ...over,
});

const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const trimmed = (j) => String(j.description ?? "").includes("[pruned]");

await check("prune: an applied job survives at any age with its description", () => {
  const job = mk({ stage: "applied", fetchedAt: daysAgo(300), stageUpdatedAt: daysAgo(90) });
  const { store: out } = store.pruneStore({ jobs: [job], runs: [] });
  assert.equal(out.jobs.length, 1, "application history was dropped");
  assert.ok(!trimmed(out.jobs[0]), "application history lost its description");
});

await check("prune: every acted-on stage is exempt, not just applied", () => {
  const jobs = ["queued", "applied", "interview", "offer", "rejected"].map((stage) =>
    mk({ stage, fetchedAt: daysAgo(200), stageUpdatedAt: daysAgo(200), score: mkScore(5) }),
  );
  const { store: out } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 5, "an acted-on stage was dropped");
  assert.equal(out.jobs.filter(trimmed).length, 0, "an acted-on job was slimmed");
});

await check("prune: a stale never-touched posting is dropped", () => {
  const job = mk({ fetchedAt: daysAgo(60), stageUpdatedAt: daysAgo(60) });
  const { store: out, report } = store.pruneStore({ jobs: [job], runs: [] });
  assert.equal(out.jobs.length, 0);
  assert.equal(report.dropped, 1);
});

await check("prune: a low scorer keeps its record so dedupe still sees it", () => {
  const job = mk({ score: mkScore(20) });
  const { store: out } = store.pruneStore({ jobs: [job], runs: [] });
  assert.equal(out.jobs.length, 1, "tombstoned posting was removed entirely");
  assert.ok(trimmed(out.jobs[0]), "low scorer kept its full description");
});

await check("prune: a strong match keeps its description and resume", () => {
  const job = mk({ score: mkScore(85), tailoredResume: "\\resumeItem{x}" });
  const { store: out } = store.pruneStore({ jobs: [job], runs: [] });
  assert.ok(!trimmed(out.jobs[0]), "a 60+ match lost its description");
  assert.ok(out.jobs[0].tailoredResume, "a 60+ match lost its tailored resume");
});

await check("prune: a job passed on 20 days ago loses its resume", () => {
  const job = mk({ stage: "skipped", stageUpdatedAt: daysAgo(20), tailoredResume: "\\resumeItem{x}" });
  const { store: out } = store.pruneStore({ jobs: [job], runs: [] });
  assert.equal(out.jobs.length, 1, "record must survive so it stays deduped");
  assert.equal(out.jobs[0].tailoredResume, undefined, "resume survived on a closed job");
});

await check("prune: never grows the store, and reports honestly", () => {
  const jobs = [mk({ stage: "applied" }), mk({ score: mkScore(10) })];
  const { store: out, report } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 2);
  assert.equal(report.slimmed, 1, "expected exactly the low scorer to be slimmed");
  assert.ok(report.bytesAfter < report.bytesBefore, "prune made the store larger");
  assert.equal(report.before - report.after, report.dropped, "report is internally inconsistent");
});

await check("prune: is idempotent — running twice changes nothing further", () => {
  const jobs = [mk({ score: mkScore(10) }), mk({ stage: "applied" })];
  const once = store.pruneStore({ jobs, runs: [] }).store;
  const twice = store.pruneStore(once);
  assert.equal(twice.report.slimmed, 0, "second prune re-slimmed already-pruned jobs");
  assert.equal(JSON.stringify(once), JSON.stringify(twice.store), "prune is not stable");
});

console.log(`temp store: ${tmp}\n`);
console.log(`${pass.length} passed`);
for (const p of pass) console.log("  ok   " + p);
if (fail.length) {
  console.log(`\n${fail.length} FAILED`);
  for (const f of fail) console.log("  FAIL " + f);
  process.exit(1);
}
