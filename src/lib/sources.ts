import type { Job, Market } from "./types";
import { inferMarkets } from "./match";
import { buildQueries } from "./resumeSearch";

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

/**
 * The search terms used against keyword-capable sources.
 *
 * Derived from the resume (see resumeSearch.ts), not hardcoded: these used to be
 * four fixed strings that resembled the profile by coincidence, so editing the
 * resume changed nothing about what was searched. Set SEARCH_QUERIES to override
 * with an explicit comma-separated list.
 */
export const QUERIES = envList("SEARCH_QUERIES", buildQueries());

/**
 * Runs one fetcher per query against the same host, one after another.
 *
 * Sequential on purpose. Firing four concurrent searches at Adzuna is the
 * quickest way to trip its free-tier rate limit, and these results get merged
 * anyway so there is nothing to gain from the parallelism.
 */
async function perQuery(
  queries: string[],
  fetcher: (q: string) => Promise<SourceResult>,
): Promise<SourceResult[]> {
  const out: SourceResult[] = [];
  for (const q of queries) out.push(await fetcher(q));
  return out;
}

/**
 * Collapses several searches of one source into a single result.
 *
 * Without this, wiring up four queries would turn two Adzuna rows in the run
 * history into eight, and the useful signal — did Adzuna answer at all — would
 * be buried. Duplicates across queries are dropped here so the reported count
 * is postings, not hits.
 *
 * Exported for the test suite: the all-failed vs partly-failed distinction is
 * what decides whether a source reads as dead or merely quiet.
 */
export function mergeResults(label: string, parts: SourceResult[]): SourceResult {
  const byId = new Map<string, Job>();
  for (const p of parts) for (const j of p.jobs) byId.set(j.id, j);
  const jobs = Array.from(byId.values());

  const failed = parts.filter((p) => !p.ok);
  if (failed.length === parts.length) {
    return { source: label, jobs: [], ok: false, detail: failed[0]?.detail ?? "no searches ran" };
  }

  const searches = `${parts.length} search${parts.length === 1 ? "" : "es"}`;
  const detail =
    `${jobs.length} postings across ${searches}` +
    (failed.length ? ` · ${failed.length} failed: ${failed[0].detail}` : "");
  return { source: label, jobs, ok: true, detail };
}

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

/**
 * Companies whose Lever board you want watched. Set LEVER_BOARDS to override.
 *
 * `netflix` used to be in this list and was dead: Netflix runs on Eightfold
 * (explore.jobs.netflix.net), so the Lever endpoint had nothing to return and
 * failed quietly every run. Run `npm run check:boards` before adding a token —
 * a wrong one costs you a source without ever raising an error.
 */
export const LEVER_BOARDS = envList("LEVER_BOARDS", ["plaid"]);

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

// ── Ashby public boards ─────────────────────────────────────────────────────
interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  isListed?: boolean;
  team?: string;
  department?: string;
  employmentType?: string;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
}

/**
 * Companies whose Ashby board you want watched. Set ASHBY_BOARDS to override.
 *
 * Astronomer is here rather than under Greenhouse: their careers page routes to
 * Ashby, which is also why their recruiter mail arrives from @ashbyhq.com. They
 * are the Airflow company, so this is the single most relevant board in the file
 * for your background.
 */
export const ASHBY_BOARDS = envList("ASHBY_BOARDS", ["astronomer"]);

/**
 * Companies worth watching whose ATS is not yet confirmed.
 *
 * Deliberately not fetched. Guessing a token and putting it in a live list is
 * how `netflix` ended up sitting in LEVER_BOARDS returning nothing: a wrong
 * token fails silently and looks identical to a company that isn't hiring. So
 * these stay inert until proven:
 *
 *     npm run check:boards -- --discover
 *
 * probes each against Greenhouse, Lever and Ashby and tells you which answers.
 * Move the ones that resolve into the list above, delete the ones that don't.
 *
 * The selection is Airflow-adjacent on purpose — orchestration, ingestion,
 * warehousing and streaming — because that is where your platform and
 * integration work reads strongest, not just where the headcount is.
 */
export const WATCHLIST = [
  "snowflake",
  "confluent",
  "fivetran",
  "airbyte",
  "dbtlabs",
  "prefect",
  "dagster",
  "starburst",
  "clickhouse",
  "temporal",
];

export async function fetchAshby(board: string): Promise<SourceResult> {
  const label = `Ashby:${board}`;
  try {
    const data = await getJson<{ jobs: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${board}`,
    );
    const jobs = (data.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const loc = j.location ?? "Unspecified";
        const remote = Boolean(j.isRemote) || /remote/i.test(loc);
        return baseJob({
          id: mkId(`ashby${board}`, j.id),
          title: j.title,
          company: board.charAt(0).toUpperCase() + board.slice(1),
          location: loc,
          market: inferMarkets(loc, remote),
          remote,
          url: j.jobUrl ?? j.applyUrl ?? "",
          source: label,
          postedAt: j.publishedAt ?? j.updatedAt ?? new Date().toISOString(),
          description: (j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? "")).slice(0, 6000),
          tags: [j.team, j.department, j.employmentType].filter(Boolean) as string[],
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

/**
 * Runs every configured source concurrently. Failures are reported, never thrown.
 *
 * Keyword-capable sources fan out across every term in QUERIES. They used to be
 * called with one hardcoded string each, which meant the Settings page advertised
 * four search terms while only "engineer" and two of the four were ever sent —
 * "platform engineer python" and "data engineer airflow" were never searched at
 * all. ATS boards take no query: you get the whole board, and the resume gate in
 * relevance.ts drops the postings unrelated to the profile before they reach the
 * store.
 */
export async function fetchAllSources(): Promise<SourceResult[]> {
  const tasks: Promise<SourceResult>[] = [
    perQuery(QUERIES, fetchRemotive).then((r) => mergeResults("Remotive", r)),
    fetchArbeitnow(),
    ...GREENHOUSE_BOARDS.map(fetchGreenhouse),
    ...LEVER_BOARDS.map(fetchLever),
    ...ASHBY_BOARDS.map(fetchAshby),
    perQuery(QUERIES, (q) => fetchAdzuna("in", q)).then((r) => mergeResults("Adzuna:IN", r)),
    perQuery(QUERIES, (q) => fetchAdzuna("us", q)).then((r) => mergeResults("Adzuna:US", r)),
  ];
  return Promise.all(tasks);
}
