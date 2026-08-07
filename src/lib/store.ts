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

export async function getRuns(): Promise<RunRecord[]> {
  const { runs } = await readStore();
  return runs;
}

export async function resetStore(): Promise<void> {
  await writeStore(EMPTY);
}
