import { promises as fs } from "fs";
import path from "path";
import type { Job, RunRecord, Stage, Store } from "./types";
import { SEED_JOBS } from "./seed";
import { scoreJob } from "./match";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "jobs.json");

const EMPTY: Store = { jobs: [], runs: [] };

/**
 * How the store is serialised. Indented because this file is committed to git,
 * and a single-line 19MB JSON blob has no reviewable diff at all.
 *
 * Shared with pruneStore so its byte counts describe the file you actually get.
 * Measured separately, the indentation is 18% of the store on top of the data —
 * so reporting compact bytes understated a 28MB file as 20MB.
 */
const serialise = (store: Store): string => JSON.stringify(store, null, 2);

/**
 * Bytes the serialised store occupies on disk.
 *
 * Buffer.byteLength, not String.length: the file is UTF-8 and the store is full of
 * non-ASCII — em dashes, accented company names, and the `…` in PRUNED_MARK, each
 * of which is one UTF-16 unit but three bytes. String.length under-reports every
 * one of them.
 */
const sizeOnDisk = (store: Store): number => Buffer.byteLength(serialise(store), "utf8");

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
  await fs.writeFile(DB_PATH, serialise(store), "utf8");
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

/**
 * How close to the stale cutoff a posting must be before a re-sighting restamps
 * its `fetchedAt`. See upsertJobs for why this is not simply "every time".
 */
const RESIGHT_MARGIN_DAYS = 7;

export async function upsertJobs(
  incoming: Job[],
): Promise<{ added: number; duplicates: number; jobs: Job[] }> {
  const store = await readStore();
  const seen = new Map(store.jobs.map((j) => [dedupeKey(j), j]));

  let added = 0;
  let duplicates = 0;

  for (const job of incoming) {
    const key = dedupeKey(job);
    const existing = seen.get(key);
    if (existing) {
      duplicates++;
      // A duplicate means the posting is still listed, so `fetchedAt` is a
      // last-seen stamp, not a first-seen one. Without this the date froze at
      // first sighting and pruneStore dropped roles that were still open — then
      // the next run re-added them as brand new, so they reported as fresh finds,
      // returned to "needs review" after being passed over, and restarted their
      // 21-day clock. Nothing displays this field; store.ts's age check is its
      // only reader, so widening its meaning costs nothing there.
      //
      // Only restamped near the cutoff, though. Touching all ~10k records nightly
      // would turn a 20-line commit into a whole-file rewrite of a store that is
      // committed to git every night, and the date only has to be right where the
      // prune rule actually reads it.
      if (daysSince(existing.fetchedAt) > STALE_AFTER_DAYS - RESIGHT_MARGIN_DAYS) {
        existing.fetchedAt = job.fetchedAt;
      }
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
 *
 * Was 40, raised to 50 when the board count went from 7 to 113. 50 is the bottom
 * of verdict()'s "fair" band, so the floor now means something you can say out
 * loud: a description survives only if the posting is at least a fair match. At
 * 40 it was a number between bands, and with ~13k postings arriving per run it
 * would have kept tens of MB of descriptions nobody will read.
 */
const REVIEW_FLOOR = 50;

/**
 * Postings you neither acted on nor passed on are dropped this long after a board
 * last listed them — `fetchedAt` is a last-seen stamp, so the clock starts when a
 * posting disappears, not when it was found.
 *
 * Was 45 days. At 7 boards the store took months to reach 6MB and a long window
 * cost nothing; at 113 boards it grows about seven times faster, and this file is
 * committed to git every night, so every retained MB is paid for again on every
 * future clone. 21 days of being delisted is also closer to honest — the role is
 * filled by then — and the record survives as a tombstone either way, so dedupe
 * does not regress.
 */
const STALE_AFTER_DAYS = 21;

/** How long a heavy field survives on a job you already closed out. */
const HEAVY_FIELD_DAYS = 14;

/** What a pruned description is replaced with — enough to see why it scored low. */
const TOMBSTONE_CHARS = 240;

/**
 * Demo postings from src/lib/seed.ts, identified by their source.
 *
 * These exist so a fresh clone renders something before any API key is wired up,
 * and readStore() writes them into the store on first read. They were never
 * removed once real postings arrived, so all eight sat permanently in a live
 * store with example.com URLs, four of them ranking in the top six by score.
 *
 * Worse, two ship with stage "queued" and "applied" so the demo funnel looks
 * populated — and ACTED_ON exempts those stages from every prune rule at any
 * age. That exemption exists to protect real application history; applied to
 * invented postings it made them immortal and skewed every funnel count.
 *
 * So seeds are handled before ACTED_ON, not after it: a fake "applied" is not
 * history worth keeping.
 */
const isSeed = (job: Job): boolean => job.source === "Seed";

/**
 * Marks a description as already pruned.
 *
 * Needed because the tombstone is TOMBSTONE_CHARS *plus* this suffix, so it is
 * still over the length threshold — without an explicit marker every prune
 * re-slims every previously-slimmed job, and the run history reports thousands
 * of slimmed postings a day when the real answer is zero.
 */
const PRUNED_MARK = "… [pruned]";

/**
 * Whether this posting's description was already truncated by a prune.
 *
 * Exported for scripts/rescore.mjs, where rescoring one of these is actively
 * destructive rather than merely pointless: `scoreJob` reads `job.description`,
 * which here is TOMBSTONE_CHARS of a fragment plus PRUNED_MARK, so it derives a
 * new and necessarily lower total from text the prune already threw away — then
 * writes it back as the record. Run twice and the same posting ratchets down
 * twice, until its "score" reflects nothing but the length of the tombstone.
 *
 * A predicate rather than an exported PRUNED_MARK because the marker is an
 * implementation detail of the tombstone format; callers only ever need the
 * question, and duplicating the literal across files is how the two drift.
 */
export const isPruned = (job: Job): boolean =>
  (job.description ?? "").endsWith(PRUNED_MARK);

export interface PruneReport {
  before: number;
  after: number;
  dropped: number;
  slimmed: number;
  /** How many of `dropped` were demo seeds evicted by the arrival of real data. */
  seedsDropped: number;
  /**
   * Size of data/jobs.json as written, indentation included — the number to
   * compare against `ls`, not a compact re-serialisation that reads 28% smaller
   * than the file on disk.
   */
  bytesBefore: number;
  bytesAfter: number;
}

function daysSince(iso: string | undefined): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

/**
 * Trims a job's bulky fields in place. Returns whether anything actually changed.
 *
 * The score breakdown goes too, not just the description. Measured on a real
 * 10,360-posting store: `score` is 31% of the file at ~640 bytes a record —
 * `factors`, `matchedKeywords` and `missingKeywords` are carried by every posting
 * including the 9,447 already tombstoned, which nothing will ever read. `total`
 * stays, because getJobs sorts on it and the whole dashboard ranks by it.
 *
 * The arrays are emptied rather than deleted so MatchScore keeps its shape: every
 * reader either guards with `?? []` or maps over the array, so an empty one
 * renders as no rows instead of a crash. FactorTable says so explicitly rather
 * than showing a blank breakdown.
 */
function slim(job: Job, dropResume: boolean): boolean {
  let touched = false;
  const d = job.description;
  if (d && !d.endsWith(PRUNED_MARK) && d.length > TOMBSTONE_CHARS) {
    job.description = d.slice(0, TOMBSTONE_CHARS) + PRUNED_MARK;
    touched = true;
  }
  const s = job.score;
  if (s && (s.factors.length || s.matchedKeywords.length || s.missingKeywords.length)) {
    job.score = {
      ...s,
      factors: [],
      matchedKeywords: [],
      missingKeywords: [],
    };
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
 * worth of postings every day, forever.
 *
 * Measured composition of a real 10,360-posting store, before the score breakdown
 * was added to what slim() throws away. Worth writing down because it is not what
 * you would guess — this comment previously claimed descriptions were ~80% of the
 * weight, which was wrong by more than a factor of two:
 *
 *   description      35%   (4.8MB of it in just 913 un-tombstoned postings)
 *   score            31%   (~640 B every posting carries, tombstoned or not)
 *   tailoredResume   12%
 *   everything else  22%   (~1.4 kB per record, irreducible without dropping it)
 *
 * Emptying the breakdown on the 9,480 postings below the floor took the file from
 * 28.0MB to 18.9MB on disk in one pass, so slimming was worth as much on the score
 * as on the text.
 *
 * What remains is mostly floor: 9,447 tombstones at ~865 B each are half the file,
 * and `dedupeKey` only reads two of their fields. Shrinking that further means
 * deciding whether a below-floor posting stays browsable at all, which is a product
 * question rather than a tuning one, so it is deliberately left alone here.
 *
 * Three rules, in increasing order of how much they throw away:
 *
 *   tombstone — keep the record, drop the description and the score breakdown.
 *               Applied immediately to anything scoring below REVIEW_FLOOR. The
 *               record itself has to stay: `dedupeKey` needs it, or every one of
 *               these comes back through the queue tomorrow.
 *   slim      — same, plus the tailored resume, for work you closed out a
 *               fortnight ago.
 *   drop      — remove entirely. Only postings you never touched that have gone
 *               stale — and staleness counts from the last time a board still
 *               listed the posting (see upsertJobs), so this means "delisted for
 *               STALE_AFTER_DAYS and never acted on", not "first seen that long
 *               ago". A role that stays open for two months is not dropped
 *               underneath you.
 *
 * Anything in ACTED_ON is exempt from all three, at any age. Losing the text of
 * a job you actually applied to would be the one genuinely costly mistake here.
 * Seeds are the sole exception, and are evicted ahead of that check — see isSeed.
 */
export function pruneStore(store: Store): { store: Store; report: PruneReport } {
  const bytesBefore = sizeOnDisk(store);
  const before = store.jobs.length;
  let slimmed = 0;
  let seedsDropped = 0;

  // Seeds are demo data, so they last exactly as long as there is nothing real
  // to show. One live posting from any source retires all of them.
  const hasLiveData = store.jobs.some((job) => !isSeed(job));

  const kept = store.jobs.filter((job) => {
    if (isSeed(job)) {
      if (hasLiveData) {
        seedsDropped++;
        return false;
      }
      return true;
    }
    if (ACTED_ON.includes(job.stage)) return true;
    const age = Math.min(daysSince(job.stageUpdatedAt), daysSince(job.fetchedAt));
    return age <= STALE_AFTER_DAYS;
  });

  for (const job of kept) {
    // A surviving seed is the only thing in the store, i.e. it *is* the demo.
    // Tombstoning the two seeds that score below REVIEW_FLOOR would strip the
    // descriptions out of a fresh clone's dashboard.
    if (isSeed(job)) continue;
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
      seedsDropped,
      bytesBefore,
      bytesAfter: sizeOnDisk(pruned),
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
