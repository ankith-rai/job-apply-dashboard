import { promises as fs } from "fs";
import path from "path";
import type { Job, RunRecord, Stage, Store } from "./types";
import { SEED_JOBS } from "./seed";
import { scoreJob } from "./match";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "jobs.json");

const EMPTY: Store = { jobs: [], runs: [] };

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** First read seeds the store so the dashboard is never empty on a fresh clone. */
export async function readStore(): Promise<Store> {
  await ensureDir();
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return { jobs: parsed.jobs ?? [], runs: parsed.runs ?? [] };
  } catch {
    const seeded: Store = {
      jobs: SEED_JOBS.map((j) => ({ ...j, score: scoreJob(j) })),
      runs: [],
    };
    await writeStore(seeded);
    return seeded;
  }
}

export async function writeStore(store: Store): Promise<void> {
  await ensureDir();
  await fs.writeFile(DB_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function getJobs(): Promise<Job[]> {
  const { jobs } = await readStore();
  return jobs
    .slice()
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}

export async function getJob(id: string): Promise<Job | undefined> {
  const { jobs } = await readStore();
  return jobs.find((j) => j.id === id);
}

export async function updateJob(
  id: string,
  patch: Partial<Job>,
): Promise<Job | undefined> {
  const store = await readStore();
  const idx = store.jobs.findIndex((j) => j.id === id);
  if (idx === -1) return undefined;
  store.jobs[idx] = { ...store.jobs[idx], ...patch };
  await writeStore(store);
  return store.jobs[idx];
}

export async function setStage(id: string, stage: Stage): Promise<Job | undefined> {
  return updateJob(id, { stage, stageUpdatedAt: new Date().toISOString() });
}

/** Dedupe key — same role at the same company from any source counts once. */
export function dedupeKey(job: Pick<Job, "title" | "company">): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${norm(job.company)}::${norm(job.title)}`;
}

export async function upsertJobs(
  incoming: Job[],
): Promise<{ added: number; duplicates: number; jobs: Job[] }> {
  const store = await readStore();
  const seen = new Map(store.jobs.map((j) => [dedupeKey(j), j]));

  let added = 0;
  let duplicates = 0;

  for (const job of incoming) {
    const key = dedupeKey(job);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    const scored: Job = { ...job, score: scoreJob(job) };
    store.jobs.push(scored);
    seen.set(key, scored);
    added++;
  }

  await writeStore(store);
  return { added, duplicates, jobs: store.jobs };
}

export async function recordRun(run: RunRecord): Promise<void> {
  const store = await readStore();
  store.runs.unshift(run);
  store.runs = store.runs.slice(0, 30);
  await writeStore(store);
}

// ── Pruning ─────────────────────────────────────────────────────────────────

/**
 * Stages that represent a decision you made. Jobs in these are never dropped and
 * never lose their description — this is your application history, and it is the
 * whole reason for keeping a store rather than re-fetching every morning.
 */
const ACTED_ON: Stage[] = ["queued", "applied", "interview", "offer", "rejected"];

/**
 * Below this score a posting is never getting a tailored resume (the threshold
 * is 60) and realistically never getting read. Its description is dead weight
 * the moment it is scored.
 */
const REVIEW_FLOOR = 40;

/** Postings you neither acted on nor passed on are dropped after this long. */
const STALE_AFTER_DAYS = 45;

/** How long a heavy field survives on a job you already closed out. */
const HEAVY_FIELD_DAYS = 14;

/** What a pruned description is replaced with — enough to see why it scored low. */
const TOMBSTONE_CHARS = 240;

/**
 * Marks a description as already pruned.
 *
 * Needed because the tombstone is TOMBSTONE_CHARS *plus* this suffix, so it is
 * still over the length threshold — without an explicit marker every prune
 * re-slims every previously-slimmed job, and the run history reports thousands
 * of slimmed postings a day when the real answer is zero.
 */
const PRUNED_MARK = "… [pruned]";

export interface PruneReport {
  before: number;
  after: number;
  dropped: number;
  slimmed: number;
  bytesBefore: number;
  bytesAfter: number;
}

function daysSince(iso: string | undefined): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

/** Trims a job's bulky fields in place. Returns whether anything actually changed. */
function slim(job: Job, dropResume: boolean): boolean {
  let touched = false;
  const d = job.description;
  if (d && !d.endsWith(PRUNED_MARK) && d.length > TOMBSTONE_CHARS) {
    job.description = d.slice(0, TOMBSTONE_CHARS) + PRUNED_MARK;
    touched = true;
  }
  if (dropResume && job.tailoredResume) {
    delete job.tailoredResume;
    touched = true;
  }
  return touched;
}

/**
 * Keeps the store from growing without bound.
 *
 * `upsertJobs` only ever adds, so before this existed the store grew by a run's
 * worth of postings every day, forever. Descriptions are capped at 6 KB each and
 * are ~80% of the file by weight; tailored resumes are a distant second at 2%.
 *
 * Three rules, in increasing order of how much they throw away:
 *
 *   tombstone — keep the record, drop the description. Applied immediately to
 *               anything scoring below REVIEW_FLOOR. On a real store that is
 *               ~84% of postings and ~two thirds of the bytes. The record itself
 *               has to stay: `dedupeKey` needs it, or every one of these comes
 *               back through the queue tomorrow.
 *   slim      — same, plus the tailored resume, for work you closed out a
 *               fortnight ago.
 *   drop      — remove entirely. Only postings you never touched that have gone
 *               stale; still sitting in "needs review" after 45 days means it
 *               was filled.
 *
 * Anything in ACTED_ON is exempt from all three, at any age. Losing the text of
 * a job you actually applied to would be the one genuinely costly mistake here.
 */
export function pruneStore(store: Store): { store: Store; report: PruneReport } {
  const bytesBefore = JSON.stringify(store).length;
  const before = store.jobs.length;
  let slimmed = 0;

  const kept = store.jobs.filter((job) => {
    if (ACTED_ON.includes(job.stage)) return true;
    const age = Math.min(daysSince(job.stageUpdatedAt), daysSince(job.fetchedAt));
    return age <= STALE_AFTER_DAYS;
  });

  for (const job of kept) {
    if (ACTED_ON.includes(job.stage)) continue;

    const closed = job.stage === "skipped" && daysSince(job.stageUpdatedAt) > HEAVY_FIELD_DAYS;
    const unpromising = (job.score?.total ?? 0) < REVIEW_FLOOR;

    if (closed || unpromising) {
      if (slim(job, closed)) slimmed++;
    }
  }

  const pruned: Store = { jobs: kept, runs: store.runs };
  return {
    store: pruned,
    report: {
      before,
      after: kept.length,
      dropped: before - kept.length,
      slimmed,
      bytesBefore,
      bytesAfter: JSON.stringify(pruned).length,
    },
  };
}

/**
 * Prunes the store on disk. Returns the pruned store alongside the report so
 * callers count against what actually survived — reusing a snapshot read before
 * the prune would report postings that no longer exist.
 */
export async function prune(): Promise<{ report: PruneReport; store: Store }> {
  const { store, report } = pruneStore(await readStore());
  await writeStore(store);
  return { report, store };
}

export async function getRuns(): Promise<RunRecord[]> {
  const { runs } = await readStore();
  return runs;
}

export async function resetStore(): Promise<void> {
  await writeStore(EMPTY);
}
