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
// The store's own predicate, not a re-spelling of the marker. rescore.mjs decides
// what to skip with this exact function, so asserting through it is what keeps the
// tombstone format and its only reader from drifting apart.
const trimmed = (j) => store.isPruned(j);

// ── the tombstone must stay recognisable to its reader ─────────────────────
// scripts/rescore.mjs skips pruned postings, because their descriptions are 240-char
// fragments and scoring one derives a lower total from text the prune already threw
// away — then writes it back as the record. Two runs ratchet the same posting down
// twice. That guard is only as good as isPruned agreeing with what pruneStore wrote,
// so pin the round trip: slim a posting for real, then ask the predicate.
await check("prune: a slimmed posting is recognisable as pruned afterwards", () => {
  const long = mk({
    id: "tombstone-round-trip",
    score: mkScore(20), // below REVIEW_FLOOR, so the description gets tombstoned
    description: "x".repeat(4000),
  });
  assert.equal(store.isPruned(long), false, "not pruned before the prune runs");

  const { store: out } = store.pruneStore({ jobs: [long], runs: [] });
  const after = out.jobs.find((j) => j.id === "tombstone-round-trip");

  assert.ok(after, "a below-floor posting keeps its record");
  assert.equal(store.isPruned(after), true, "rescore must be able to spot this");
});

// A posting that keeps its description must NOT be skipped by rescore — otherwise
// the guard would quietly stop the taxonomy edit from reaching anything at all.
await check("prune: a posting above the floor stays rescorable", () => {
  const strong = mk({
    id: "keeps-description",
    score: mkScore(90),
    description: "y".repeat(4000),
  });
  const { store: out } = store.pruneStore({ jobs: [strong], runs: [] });
  const after = out.jobs.find((j) => j.id === "keeps-description");

  assert.ok(after, "a strong posting is retained");
  assert.equal(store.isPruned(after), false, "and is still rescorable");
});

// ── re-sighting a still-open posting ──────────────────────────────────────
// `fetchedAt` is a last-seen stamp. It used to freeze at first sighting, so a role
// that stayed open past STALE_AFTER_DAYS was dropped while still listed, then
// re-added by the next run as a brand-new find — inflating "added", pushing an
// already-passed-over posting back into review, and restarting its clock so it
// could never actually leave. Tightening the window to 21 days made that common
// enough to matter, hence these.

await check("upsert: re-seeing a nearly-stale posting restamps it as still open", async () => {
  await store.resetStore();
  const old = mk({ fetchedAt: daysAgo(18), stageUpdatedAt: daysAgo(18) });
  await store.upsertJobs([old]);

  const now = new Date().toISOString();
  const r = await store.upsertJobs([{ ...old, id: "seen-again", fetchedAt: now }]);
  assert.equal(r.duplicates, 1, "re-sighting was not counted as a duplicate");
  assert.equal(r.added, 0, "re-sighting was added as a second record");

  const jobs = await store.getJobs();
  assert.equal(jobs.length, 1, "re-sighting created a second record");
  assert.equal(jobs[0].fetchedAt, now, "fetchedAt froze at first sighting");
  assert.equal(jobs[0].id, old.id, "the original record was replaced, not restamped");
});

await check("upsert: a posting seen recently is left alone, to keep the diff small", async () => {
  await store.resetStore();
  const recent = mk({ fetchedAt: daysAgo(3), stageUpdatedAt: daysAgo(3) });
  await store.upsertJobs([recent]);

  await store.upsertJobs([{ ...recent, fetchedAt: new Date().toISOString() }]);
  const [kept] = await store.getJobs();
  assert.equal(
    kept.fetchedAt,
    recent.fetchedAt,
    "restamped a posting nowhere near the cutoff — that rewrites every record nightly",
  );
});

// The whole point of the last-seen stamp: prune must not drop a role that is open.
await check("upsert + prune: a long-open role survives past the stale window", async () => {
  await store.resetStore();
  const listed = mk({ fetchedAt: daysAgo(40), stageUpdatedAt: daysAgo(40) });
  await store.upsertJobs([listed]);
  await store.upsertJobs([{ ...listed, fetchedAt: new Date().toISOString() }]);

  const { jobs } = await store.readStore();
  const { store: out } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 1, "a posting still listed on a board was pruned as stale");
});

await check("upsert + prune: a delisted posting still ages out", async () => {
  await store.resetStore();
  await store.upsertJobs([mk({ fetchedAt: daysAgo(40), stageUpdatedAt: daysAgo(40) })]);
  // No re-sighting: the board stopped listing it.
  const { jobs } = await store.readStore();
  const { store: out, report } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 0, "the last-seen stamp kept a delisted posting alive");
  assert.equal(report.dropped, 1);
});

// ── reported size ─────────────────────────────────────────────────────────
// The prune report is the only place store size is ever surfaced, and it was
// measuring a compact re-serialisation of a file written with indent 2 — so it
// described a 28MB file as 20MB.

await check("prune: reported bytes match the file writeStore actually writes", async () => {
  await store.resetStore();
  await store.upsertJobs([mk({ score: mkScore(10) }), mk({ score: mkScore(90) })]);
  const { report } = await store.prune();
  assert.equal(
    report.bytesAfter,
    fs.statSync(DB).size,
    "bytesAfter does not match data/jobs.json on disk",
  );
});

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

// ── retention thresholds ──────────────────────────────────────────────────
// STALE_AFTER_DAYS and REVIEW_FLOOR are not exported, so these pin them from the
// outside — through the only thing that actually matters, which is behaviour.
// They tightened from 45 days / score 40 when the board list went from 7 boards
// to 113: the store is committed to git nightly, and at the old settings a 7x
// wider fetch would have grown it to 20-40MB.

await check("prune: retention is 21 days, not the old 45", () => {
  const fresh = store.pruneStore({
    jobs: [mk({ fetchedAt: daysAgo(19), stageUpdatedAt: daysAgo(19) })],
    runs: [],
  }).store;
  assert.equal(fresh.jobs.length, 1, "dropped a posting still inside the window");

  const old = store.pruneStore({
    jobs: [mk({ fetchedAt: daysAgo(30), stageUpdatedAt: daysAgo(30) })],
    runs: [],
  }).store;
  assert.equal(old.jobs.length, 0, "a 30-day-old untouched posting survived — window is still 45");
});

// The floor is meant to sit exactly at the bottom of verdict()'s "fair" band, so
// the rule is sayable: a description survives only if the posting is at least a
// fair match. A floor between bands is a number with no meaning behind it.
await check("prune: the description floor lines up with the fair verdict band", () => {
  const fair = store.pruneStore({ jobs: [mk({ score: mkScore(50) })], runs: [] }).store;
  assert.ok(!trimmed(fair.jobs[0]), "a fair match lost its description");

  const under = store.pruneStore({ jobs: [mk({ score: mkScore(49) })], runs: [] }).store;
  assert.ok(trimmed(under.jobs[0]), "a below-fair posting kept its description");

  const oldFloor = store.pruneStore({ jobs: [mk({ score: mkScore(45) })], runs: [] }).store;
  assert.ok(trimmed(oldFloor.jobs[0]), "score 45 kept its description — floor is still 40");
});

// Tightening retention must not touch the one rule that is a correctness
// property rather than a tradeoff.
await check("prune: tighter retention still exempts application history", () => {
  const job = mk({ stage: "applied", score: mkScore(5), fetchedAt: daysAgo(400), stageUpdatedAt: daysAgo(400) });
  const { store: out } = store.pruneStore({ jobs: [job], runs: [] });
  assert.equal(out.jobs.length, 1, "history was dropped by the shorter window");
  assert.ok(!trimmed(out.jobs[0]), "history was tombstoned by the higher floor");
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

// ── demo seeds ────────────────────────────────────────────────────────────
// readStore() writes SEED_JOBS on first read so a fresh clone renders. Nothing
// used to take them back out, so all eight lived permanently in a real store —
// and the two shipping as "queued"/"applied" were protected by ACTED_ON, making
// invented postings immortal and skewing every funnel count.
const seedJob = (over = {}) => mk({ source: "Seed", ...over });

await check("prune: seeds are the whole store on a fresh clone, so they stay", () => {
  const jobs = [seedJob(), seedJob({ stage: "queued" })];
  const { store: out, report } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 2, "seeds were dropped with nothing to replace them");
  assert.equal(report.seedsDropped, 0);
});

await check("prune: one live posting retires every seed", () => {
  const jobs = [seedJob(), seedJob(), mk({ source: "Greenhouse:stripe" })];
  const { store: out, report } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 1, "seeds survived the arrival of real data");
  assert.equal(out.jobs[0].source, "Greenhouse:stripe");
  assert.equal(report.seedsDropped, 2, "seed evictions are not reported");
});

// The bug this guards: ACTED_ON exempts "applied" from every prune rule at any
// age, which is correct for real history and wrong for a demo posting.
await check("prune: an acted-on seed is still retired, unlike a real applied job", () => {
  const jobs = [
    seedJob({ stage: "applied" }),
    seedJob({ stage: "queued" }),
    mk({ stage: "applied", fetchedAt: daysAgo(300) }),
  ];
  const { store: out } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 1, "a fake applied posting outlived the purge");
  assert.notEqual(out.jobs[0].source, "Seed");
  assert.ok(!trimmed(out.jobs[0]), "the real applied job lost its description");
});

await check("prune: a surviving seed keeps its description", () => {
  // Two seeds score below REVIEW_FLOOR by design (the EM and junior postings).
  // Tombstoning those would gut the dashboard a fresh clone is meant to show.
  const jobs = [seedJob({ score: mkScore(12) })];
  const { store: out, report } = store.pruneStore({ jobs, runs: [] });
  assert.equal(out.jobs.length, 1);
  assert.ok(!trimmed(out.jobs[0]), "a demo seed was tombstoned on a fresh clone");
  assert.equal(report.slimmed, 0);
});

console.log(`temp store: ${tmp}\n`);
console.log(`${pass.length} passed`);
for (const p of pass) console.log("  ok   " + p);
if (fail.length) {
  console.log(`\n${fail.length} FAILED`);
  for (const f of fail) console.log("  FAIL " + f);
  process.exit(1);
}
