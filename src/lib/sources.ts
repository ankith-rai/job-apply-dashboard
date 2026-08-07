import type { Job, Market } from "./types";
import { inferMarkets } from "./match";

/**
 * Every source here is a documented public API or a company's own ATS feed.
 * None of them scrape a site that forbids it — see docs/automation-approaches.md
 * for why that boundary matters.
 */

export interface SourceResult {
  source: string;
  jobs: Job[];
  ok: boolean;
  detail: string;
}

const UA = "job-apply-dashboard/0.1 (personal job search)";
const TIMEOUT_MS = 12_000;

/** Reads a comma-separated env var, falling back to a default list. */
function envList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mkId(source: string, external: string | number): string {
  return `${source}-${String(external).replace(/[^a-zA-Z0-9]+/g, "").slice(0, 40)}`;
}

function baseJob(partial: Omit<Job, "stage" | "stageUpdatedAt" | "fetchedAt">): Job {
  const now = new Date().toISOString();
  return { ...partial, stage: "matched", stageUpdatedAt: now, fetchedAt: now };
}

/** The search terms used against keyword-capable sources. */
export const QUERIES = [
  "principal software engineer",
  "staff software engineer",
  "platform engineer python",
  "data engineer airflow",
];

// ── Remotive ────────────────────────────────────────────────────────────────
interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location: string;
  url: string;
  publication_date: string;
  description: string;
  tags?: string[];
  salary?: string;
}

export async function fetchRemotive(query = "engineer"): Promise<SourceResult> {
  try {
    const data = await getJson<{ jobs: RemotiveJob[] }>(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=50`,
    );
    const jobs = (data.jobs ?? []).map((j) =>
      baseJob({
        id: mkId("remotive", j.id),
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || "Remote",
        market: inferMarkets(j.candidate_required_location || "remote", true),
        remote: true,
        url: j.url,
        source: "Remotive",
        postedAt: j.publication_date,
        description: stripHtml(j.description ?? "").slice(0, 6000),
        tags: j.tags ?? [],
        salary: j.salary || undefined,
      }),
    );
    return { source: "Remotive", jobs, ok: true, detail: `${jobs.length} postings` };
  } catch (err) {
    return { source: "Remotive", jobs: [], ok: false, detail: msg(err) };
  }
}

// ── Arbeitnow ───────────────────────────────────────────────────────────────
interface ArbeitnowJob {
  slug: string;
  title: string;
  company_name: string;
  location: string;
  url: string;
  created_at: number;
  description: string;
  tags?: string[];
  remote?: boolean;
}

export async function fetchArbeitnow(): Promise<SourceResult> {
  try {
    const data = await getJson<{ data: ArbeitnowJob[] }>(
      "https://www.arbeitnow.com/api/job-board-api",
    );
    const jobs = (data.data ?? []).map((j) =>
      baseJob({
        id: mkId("arbeitnow", j.slug),
        title: j.title,
        company: j.company_name,
        location: j.location || "Unspecified",
        market: inferMarkets(j.location ?? "", Boolean(j.remote)),
        remote: Boolean(j.remote),
        url: j.url,
        source: "Arbeitnow",
        postedAt: new Date((j.created_at ?? 0) * 1000).toISOString(),
        description: stripHtml(j.description ?? "").slice(0, 6000),
        tags: j.tags ?? [],
      }),
    );
    return { source: "Arbeitnow", jobs, ok: true, detail: `${jobs.length} postings` };
  } catch (err) {
    return { source: "Arbeitnow", jobs: [], ok: false, detail: msg(err) };
  }
}

// ── Greenhouse public boards ────────────────────────────────────────────────
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  content?: string;
  location?: { name: string };
}

/** Companies whose Greenhouse board you want watched. Set GREENHOUSE_BOARDS to override. */
export const GREENHOUSE_BOARDS = envList(
  "GREENHOUSE_BOARDS",
  ["stripe", "databricks", "airbnb", "figma", "razorpay"],
);

export async function fetchGreenhouse(board: string): Promise<SourceResult> {
  const label = `Greenhouse:${board}`;
  try {
    const data = await getJson<{ jobs: GhJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
    );
    const jobs = (data.jobs ?? []).map((j) => {
      const loc = j.location?.name ?? "Unspecified";
      const remote = /remote/i.test(loc);
      return baseJob({
        id: mkId(`gh${board}`, j.id),
        title: j.title,
        company: board.charAt(0).toUpperCase() + board.slice(1),
        location: loc,
        market: inferMarkets(loc, remote),
        remote,
        url: j.absolute_url,
        source: label,
        postedAt: j.updated_at,
        description: stripHtml(j.content ?? "").slice(0, 6000),
        tags: [],
      });
    });
    return { source: label, jobs, ok: true, detail: `${jobs.length} postings` };
  } catch (err) {
    return { source: label, jobs: [], ok: false, detail: msg(err) };
  }
}

// ── Lever public boards ─────────────────────────────────────────────────────
interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number;
  descriptionPlain?: string;
  categories?: { location?: string; team?: string; commitment?: string };
}

/** Companies whose Lever board you want watched. Set LEVER_BOARDS to override. */
export const LEVER_BOARDS = envList("LEVER_BOARDS", ["netflix", "plaid"]);

export async function fetchLever(board: string): Promise<SourceResult> {
  const label = `Lever:${board}`;
  try {
    const data = await getJson<LeverJob[]>(
      `https://api.lever.co/v0/postings/${board}?mode=json`,
    );
    const jobs = (data ?? []).map((j) => {
      const loc = j.categories?.location ?? "Unspecified";
      const remote = /remote/i.test(loc);
      return baseJob({
        id: mkId(`lever${board}`, j.id),
        title: j.text,
        company: board.charAt(0).toUpperCase() + board.slice(1),
        location: loc,
        market: inferMarkets(loc, remote),
        remote,
        url: j.hostedUrl,
        source: label,
        postedAt: new Date(j.createdAt ?? 0).toISOString(),
        description: (j.descriptionPlain ?? "").slice(0, 6000),
        tags: [j.categories?.team, j.categories?.commitment].filter(Boolean) as string[],
      });
    });
    return { source: label, jobs, ok: true, detail: `${jobs.length} postings` };
  } catch (err) {
    return { source: label, jobs: [], ok: false, detail: msg(err) };
  }
}

// ── Adzuna (needs free API credentials; covers India + US well) ──────────────
interface AdzunaJob {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  redirect_url: string;
  created: string;
  description: string;
  salary_min?: number;
  salary_max?: number;
}

export async function fetchAdzuna(country: "in" | "us", query: string): Promise<SourceResult> {
  const label = `Adzuna:${country.toUpperCase()}`;
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    return { source: label, jobs: [], ok: false, detail: "No ADZUNA_APP_ID / ADZUNA_APP_KEY set" };
  }
  try {
    const url =
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1` +
      `?app_id=${appId}&app_key=${appKey}` +
      `&results_per_page=50&what=${encodeURIComponent(query)}&max_days_old=14&content-type=application/json`;
    const data = await getJson<{ results: AdzunaJob[] }>(url);
    const jobs = (data.results ?? []).map((j) => {
      const loc = j.location?.display_name ?? "Unspecified";
      const remote = /remote/i.test(loc) || /remote/i.test(j.title);
      const markets: Market[] = country === "in" ? ["india"] : ["us"];
      return baseJob({
        id: mkId(`adzuna${country}`, j.id),
        title: j.title,
        company: j.company?.display_name ?? "Unknown",
        location: loc,
        market: remote ? [...markets, "remote"] : markets,
        remote,
        url: j.redirect_url,
        source: label,
        postedAt: j.created,
        description: stripHtml(j.description ?? "").slice(0, 6000),
        tags: [],
        salary:
          j.salary_min && j.salary_max
            ? `${Math.round(j.salary_min / 1000)}k–${Math.round(j.salary_max / 1000)}k`
            : undefined,
      });
    });
    return { source: label, jobs, ok: true, detail: `${jobs.length} postings` };
  } catch (err) {
    return { source: label, jobs: [], ok: false, detail: msg(err) };
  }
}

function msg(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "timed out" : err.message;
  return "unknown error";
}

/** Runs every configured source concurrently. Failures are reported, never thrown. */
export async function fetchAllSources(): Promise<SourceResult[]> {
  const tasks: Promise<SourceResult>[] = [
    fetchRemotive("engineer"),
    fetchArbeitnow(),
    ...GREENHOUSE_BOARDS.map(fetchGreenhouse),
    ...LEVER_BOARDS.map(fetchLever),
    fetchAdzuna("in", "principal software engineer"),
    fetchAdzuna("us", "staff software engineer"),
  ];
  return Promise.all(tasks);
}
