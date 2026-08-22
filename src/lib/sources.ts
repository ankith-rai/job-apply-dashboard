import type { Job, Market } from "./types";
import { inferMarkets } from "./match";
import { buildQueries, signatureSkills } from "./resumeSearch";

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

/**
 * Per-request deadline, covering the body read as well as the response — the
 * payloads here are the slow part, not the handshake.
 *
 * Was 12s, which was ample for 7 boards and wrong for 113. Measured serially, with
 * nothing else in flight:
 *
 *   ashby:openai          11.4MB   10.4s
 *   ashby:airwallex        9.9MB    3.9s
 *   greenhouse:databricks  8.7MB    6.3s
 *   greenhouse:anthropic   6.5MB    7.1s
 *   lever:paytm            3.4MB   17.9s, then 40.6s on a second measurement
 *
 * So openai used 87% of the old budget uncontended, and Lever blew past it outright
 * — Lever is slow out of proportion to its payload and varies by more than 2x run
 * to run. A full sweep was reporting up to 15 boards "dead — timed out" while every
 * one answered fine when probed alone. That is the worst possible failure: a real
 * board, a valid token, and a run that quietly drops several hundred postings.
 *
 * 90s is sized off Lever's worst observed 40.6s with room for contention on top.
 * A wrong token is unaffected — it 404s immediately, and a 404 is never retried —
 * so the only thing a long deadline buys is patience with a genuinely hung
 * connection, and the pool means that stalls one slot rather than the run. The
 * nightly workflow has no job timeout set, so GitHub's 6-hour default applies and
 * there is nothing to bump up against.
 */
const TIMEOUT_MS = 90_000;

/** First backoff in getJson's retry ladder. Long enough to outlast a blip. */
const RETRY_DELAY_MS = 750;

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

/**
 * Same, but preserves case.
 *
 * Needed because envList lowercases, and The Muse's `category` filter is
 * case-sensitive in the worst possible way: `Software Engineering` matches 40,519
 * postings and `software engineering` matches zero, with HTTP 200 both times. That
 * is the same silent-zero failure a wrong ATS token gives you, so the two helpers
 * stay separate rather than one growing a flag.
 */
function envListRaw(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length ? parsed : fallback;
}

/**
 * How many source requests may be in flight at once.
 *
 * This exists because the board lists grew from 7 entries to 113. `Promise.all`
 * over all of them fires 113 simultaneous requests, and the big boards are not
 * small — Greenhouse with `content=true` returns ~800 postings with full
 * descriptions for Databricks alone. Unbounded, that is tens of megabytes in
 * flight and a good way to get rate-limited into false negatives, which here look
 * identical to a company that stopped hiring.
 */
export const FETCH_CONCURRENCY = Math.max(1, Number(process.env.FETCH_CONCURRENCY ?? 10));

/**
 * Runs thunks with at most `size` in flight, preserving input order.
 *
 * Order matters: the run history and the Settings page read these results
 * positionally against the board lists, so a completion-ordered result array
 * would silently mislabel which board reported what.
 *
 * Exported for scripts/check-boards.mts, which probes the same 113 boards and
 * needs the same bound — a health check that trips the rate limit reports dead
 * boards that are fine.
 */
export async function pool<R>(tasks: Array<() => Promise<R>>, size: number): Promise<R[]> {
  const out: R[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return out;
}

async function getJsonOnce<T>(url: string): Promise<T> {
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

/**
 * A transient failure that says nothing about whether the token is valid.
 *
 * Retried; an HTTP 404 is not. That distinction is the point — a 404 means the
 * company moved ATS and the config needs editing, which is worth surfacing
 * immediately. A timeout means nothing at all.
 *
 * Exported for the test suite. Getting this wrong in the permissive direction
 * would triple every request for all 113 boards on a run where a token is
 * genuinely dead, which is the opposite of what the retry is for.
 */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|HTTP (429|5\d\d)/i.test(
    err.message,
  );
}

/**
 * Two retries on transient failures, with a widening backoff.
 *
 * Measured need, not defensive habit. Sweeping all 113 boards, a handful fail per
 * run — a different handful each time, and every one answers fine when probed
 * alone. Consecutive full sweeps reported 15, then 5, then 2, then 0 dead boards
 * with no config change between them. Without retries that variance means several
 * companies silently contribute zero postings on any given night, and a zero here
 * is indistinguishable from a company that stopped hiring. That is the failure this
 * whole project keeps tripping over, so it is worth the extra requests to close it.
 *
 * Two rather than one because the failures that survived a single retry were
 * `fetch failed` — a connection dropped mid-sweep, not a slow server — and 750ms
 * is not long enough for that to clear. The second wait is 3s.
 *
 * Still a short ladder, not an indefinite one: the first attempt already waits
 * TIMEOUT_MS, so a board that cannot answer three times is better reported as a
 * problem than waited on. A wrong token costs nothing extra either way, since a
 * 404 is not transient and is never retried.
 */
const RETRY_DELAYS_MS = [RETRY_DELAY_MS, 3_000];

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJsonOnce<T>(url);
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
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

// ── Jobicy (remote-first, tag-filterable) ───────────────────────────────────
interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo?: string;
  jobLevel?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
}

/**
 * Tags sent to Jobicy, taken from the resume's signature skills.
 *
 * Reuses signatureSkills() rather than a literal list for the same reason QUERIES
 * does: a hardcoded set would drift from the resume the moment a skill changed.
 * Jobicy's `tag` is a loose full-text match, so a skill term works directly where
 * a strict tag vocabulary would not.
 *
 * This targeting is why Jobicy measured the best signal density of any source
 * tested — 18% of what it returns scores fair or better, against 6.4% for the ATS
 * boards, which have no way to be asked a question.
 */
export const JOBICY_TAGS = envList(
  "JOBICY_TAGS",
  signatureSkills().slice(0, 5).map((s) => s.term),
);

/**
 * Jobicy asks API consumers to credit them and to send applicants to the job URL
 * from the feed rather than a rewritten one. Both are honoured: `source` is shown
 * on every card in the UI, and `url` is passed through untouched.
 */
export async function fetchJobicy(tag: string): Promise<SourceResult> {
  const label = "Jobicy";
  try {
    const data = await getJson<{ jobs: JobicyJob[] }>(
      `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag)}`,
    );
    const jobs = (data.jobs ?? []).map((j) =>
      baseJob({
        id: mkId("jobicy", j.id),
        title: j.jobTitle,
        company: j.companyName,
        location: j.jobGeo || "Remote",
        market: inferMarkets(j.jobGeo ?? "remote", true),
        remote: true,
        url: j.url,
        source: label,
        postedAt: j.pubDate,
        description: stripHtml(j.jobDescription ?? j.jobExcerpt ?? "").slice(0, 6000),
        tags: [...(j.jobIndustry ?? []), ...(j.jobType ?? []), j.jobLevel].filter(
          Boolean,
        ) as string[],
        salary:
          j.salaryMin && j.salaryMax
            ? `${Math.round(j.salaryMin / 1000)}k–${Math.round(j.salaryMax / 1000)}k` +
              (j.salaryCurrency ? ` ${j.salaryCurrency}` : "")
            : undefined,
      }),
    );
    return { source: label, jobs, ok: true, detail: `${jobs.length} postings` };
  } catch (err) {
    return { source: label, jobs: [], ok: false, detail: msg(err) };
  }
}

// ── The Muse (large, filterable by category and level) ──────────────────────
interface MuseJob {
  id: number;
  name: string;
  contents?: string;
  publication_date: string;
  company?: { name: string };
  locations?: { name: string }[];
  levels?: { name: string }[];
  categories?: { name: string }[];
  refs?: { landing_page?: string };
}

/**
 * Muse categories to pull, and how deep.
 *
 * envListRaw, not envList: the category filter is case-sensitive and answers HTTP
 * 200 with `total: 0` for `software engineering`, so lowercasing these would
 * silently disable the source. `Software Engineering` alone holds 40,519 senior
 * postings, and unlike the remote-only feeds it covers Bangalore, which is half
 * the target market.
 *
 * Paging is capped at 99 by the API (page 100 returns HTTP 400) and each page is
 * 20 postings, so MUSE_PAGES trades requests for recall at 20 postings per
 * request. Six pages per category is 240 postings for 12 requests.
 */
export const MUSE_CATEGORIES = envListRaw("MUSE_CATEGORIES", [
  "Software Engineering",
  "Data and Analytics",
]);
const MUSE_PAGES = Math.min(99, Math.max(1, Number(process.env.MUSE_PAGES ?? 6)));
const MUSE_LEVEL = process.env.MUSE_LEVEL ?? "Senior Level";

export async function fetchTheMuse(category: string): Promise<SourceResult> {
  const label = "TheMuse";
  const collected: Job[] = [];
  let failure = "";

  // Sequential: pages of one category are the same host, and there is no reason
  // to race them. A mid-run failure keeps the pages already collected rather than
  // discarding the whole category.
  for (let page = 1; page <= MUSE_PAGES; page++) {
    try {
      const data = await getJson<{ results: MuseJob[] }>(
        `https://www.themuse.com/api/public/jobs?page=${page}` +
          `&category=${encodeURIComponent(category)}` +
          `&level=${encodeURIComponent(MUSE_LEVEL)}`,
      );
      const results = data.results ?? [];
      if (results.length === 0) break;
      for (const j of results) {
        const loc = (j.locations ?? []).map((l) => l.name).join("; ") || "Unspecified";
        const remote = /remote|flexible/i.test(loc);
        collected.push(
          baseJob({
            id: mkId("muse", j.id),
            title: j.name,
            company: j.company?.name ?? "Unknown",
            location: loc,
            market: inferMarkets(loc, remote),
            remote,
            url: j.refs?.landing_page ?? "",
            source: label,
            postedAt: j.publication_date,
            description: stripHtml(j.contents ?? "").slice(0, 6000),
            tags: [
              ...(j.categories ?? []).map((c) => c.name),
              ...(j.levels ?? []).map((l) => l.name),
            ],
          }),
        );
      }
    } catch (err) {
      failure = msg(err);
      break;
    }
  }

  if (!collected.length) {
    return { source: label, jobs: [], ok: false, detail: failure || `no results for ${category}` };
  }
  return {
    source: label,
    jobs: collected,
    ok: true,
    detail:
      `${collected.length} postings for ${category}` +
      (failure ? ` · stopped early: ${failure}` : ""),
  };
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

/**
 * Companies whose Greenhouse board you want watched. Set GREENHOUSE_BOARDS to override.
 *
 * Every token here answered with at least one posting when probed — see
 * `npm run check:boards`. `razorpay` used to be in this list and never resolved on
 * Greenhouse at all, so it contributed nothing for as long as it sat here.
 *
 * Weighted toward data platform, orchestration and iPaaS rather than headcount:
 * Workato returned the highest strong-match rate of anything measured (6 strong out
 * of 148 postings) because integration work is what this resume reads strongest on,
 * while OpenAI's 729 postings produced zero.
 */
export const GREENHOUSE_BOARDS = envList("GREENHOUSE_BOARDS", [
  // data platform / warehouse / orchestration
  "databricks", "fivetran", "clickhouse", "starburst", "singlestore", "neo4j",
  "cockroachlabs", "elastic", "mongodb", "hightouch", "sigmacomputing",
  "hextechnologies", "imply", "portable", "sisense",
  // integration / iPaaS — closest to this profile's own work
  "workato", "celigo", "make", "postman",
  // infra / devtools / observability
  "datadog", "grafanalabs", "gitlab", "cloudflare", "vercel", "netlify",
  "pagerduty", "launchdarkly", "honeycomb", "okta", "twilio", "webflow",
  // fintech / payments
  "stripe", "brex", "affirm", "coinbase", "robinhood", "chime",
  "mercury", "checkr", "gusto", "wise",
  // product SaaS
  "figma", "airbnb", "asana", "airtable", "smartsheet", "amplitude", "mixpanel",
  // enterprise / process / security
  "celonis", "samsara", "verkada", "netskope", "druva",
  // AI labs
  "anthropic", "scaleai",
  // India market
  "phonepe", "groww", "hackerrank",
]);

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
 * failed quietly every run. `plaid` was the same mistake with a subtler ending —
 * it is a real company on a real ATS, just Ashby rather than Lever, so it moved
 * down to ASHBY_BOARDS where it returns 102 postings instead of nothing.
 *
 * Run `npm run check:boards` before adding a token — a wrong one costs you a
 * source without ever raising an error.
 */
export const LEVER_BOARDS = envList("LEVER_BOARDS", [
  "sonarsource", "matillion", "snaplogic", "acceldata", "metabase",
  "tinybird", "keboola",
  // India market — Lever is where most of these actually live
  "paytm", "meesho", "cred", "zeta", "porter", "eternal", "nium",
]);

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
 *
 * Ashby has quietly become where the modern data stack lives — Snowflake,
 * Confluent, Airbyte, Prefect, Atlan, Materialize and Monte Carlo are all here
 * rather than on Greenhouse, which is why this list is no longer one entry.
 */
export const ASHBY_BOARDS = envList("ASHBY_BOARDS", [
  // orchestration / streaming / modern data stack
  "astronomer", "prefect", "confluent", "airbyte", "atlan", "materialize",
  "montecarlodata", "snowflake", "hex", "validio", "lightdash", "omni",
  // infra / devtools
  "docker", "supabase", "render", "railway", "sentry", "redis", "kong",
  "temporal", "n8n", "goteleport", "gruntwork", "vanta",
  // product SaaS
  "notion", "linear", "miro", "clickup", "zapier",
  // fintech
  "ramp", "plaid", "moderntreasury", "airwallex",
  // AI labs
  "openai", "cohere", "harvey", "abridge", "modal", "anyscale",
  // enterprise automation
  "uipath",
]);

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
 * The previous ten names have all been resolved and promoted. What is left are
 * companies that answered on none of the three — most run Workday, Eightfold or
 * SuccessFactors, none of which expose an unauthenticated board feed. They stay
 * listed because ATS migrations happen and a re-probe is one command.
 */
export const WATCHLIST = [
  "dbtlabs",
  "dagster",
  "hashicorp",
  "snyk",
  "boomi",
  "mulesoft",
  "informatica",
  "razorpay",
  "atlassian",
  "freshworks",
  "browserstack",
  "sprinklr",
  // Demoted from GREENHOUSE_BOARDS, and the reason this list exists. It sat in
  // the live list reporting "live but empty" on every single sweep — which reads
  // as "not hiring" and is why a wrong token is so expensive. Probing all three:
  // Greenhouse and Ashby each answer HTTP 200 with zero postings, Lever 404s. So
  // the Greenhouse token was simply wrong, and had been silently contributing
  // nothing for as long as it was listed.
  "marqeta",
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
 * Runs every configured source. Failures are reported, never thrown.
 *
 * Keyword-capable sources fan out across every term in QUERIES. They used to be
 * called with one hardcoded string each, which meant the Settings page advertised
 * four search terms while only "engineer" and two of the four were ever sent —
 * "platform engineer python" and "data engineer airflow" were never searched at
 * all. ATS boards take no query: you get the whole board, and the resume gate in
 * relevance.ts drops the postings unrelated to the profile before they reach the
 * store.
 *
 * The board fetches go through pool() rather than joining the same Promise.all as
 * the keyword sources. At 7 boards either worked; at 113 an unbounded fan-out holds
 * every response body in memory at once and invites the rate limiting that turns a
 * live board into a silent zero. The keyword sources stay outside the pool because
 * perQuery already serialises them per host — they are 5 slow tasks, not 113 fast
 * ones, and pooling them together would let boards starve them of slots.
 */
export async function fetchAllSources(): Promise<SourceResult[]> {
  const boardTasks: Array<() => Promise<SourceResult>> = [
    ...GREENHOUSE_BOARDS.map((b) => () => fetchGreenhouse(b)),
    ...LEVER_BOARDS.map((b) => () => fetchLever(b)),
    ...ASHBY_BOARDS.map((b) => () => fetchAshby(b)),
  ];

  const [keyword, boards] = await Promise.all([
    Promise.all([
      perQuery(QUERIES, fetchRemotive).then((r) => mergeResults("Remotive", r)),
      fetchArbeitnow(),
      perQuery(JOBICY_TAGS, fetchJobicy).then((r) => mergeResults("Jobicy", r)),
      perQuery(MUSE_CATEGORIES, fetchTheMuse).then((r) => mergeResults("TheMuse", r)),
      perQuery(QUERIES, (q) => fetchAdzuna("in", q)).then((r) => mergeResults("Adzuna:IN", r)),
      perQuery(QUERIES, (q) => fetchAdzuna("us", q)).then((r) => mergeResults("Adzuna:US", r)),
    ]),
    pool(boardTasks, FETCH_CONCURRENCY),
  ]);

  return [...keyword, ...boards];
}
