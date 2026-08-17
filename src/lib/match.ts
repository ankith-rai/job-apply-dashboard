import { SKILL_GROUPS, TARGET_TITLES, DOMAIN_TERMS } from "./profile";
import type { Job, MatchScore, ScoreFactor, Market } from "./types";

const MAX = {
  skills: 45,
  seniority: 25,
  location: 15,
  domain: 10,
  freshness: 5,
};

/**
 * The text the scorer reads. Exported so the ingest gate judges a posting on the
 * same haystack, rather than a near-copy that happens to omit a field.
 */
export function jobHaystack(job: Job): string {
  return [job.title, job.company, job.description, job.tags.join(" ")]
    .join(" \n ")
    .toLowerCase();
}

/**
 * The one definition of "this text mentions this term".
 *
 * Exported so the fetch layer (resumeSearch.ts, relevance.ts) asks the question
 * exactly the way the scorer does — two notions of a term hit would let the
 * pipeline search for terms it then refuses to credit.
 *
 * The boundaries are what make short acronyms usable as terms: a substring test
 * would find "rds" inside "words" and "ecr" inside "decrease". They are
 * lookarounds rather than consuming character classes so the same pattern can be
 * reused with the `g` flag to count occurrences — a consuming boundary eats the
 * separator and misses the second half of "python python".
 */
export function termPattern(term: string, flags = "i"): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9+#.])${escaped}(?![a-z0-9+#.])`, flags);
}

export function hasTerm(text: string, term: string): boolean {
  return termPattern(term).test(text);
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 999;
  return Math.max(0, (Date.now() - then) / 86_400_000);
}

/**
 * Which skill groups the text touches, and on which terms.
 *
 * Exported because the ingest gate's "mentions nothing you do" rule has to mean
 * the same thing as scoring zero on skills. Also collapses what used to be a
 * duplicated pass: scoreSkills computed the per-group hits, then recomputed the
 * same filter again just to count groups for its detail string.
 */
export function skillGroupHits(text: string): { key: string; weight: number; terms: string[] }[] {
  return SKILL_GROUPS.map((group) => ({
    key: group.key,
    weight: group.weight,
    terms: group.terms.filter((t) => hasTerm(text, t)),
  })).filter((g) => g.terms.length > 0);
}

function scoreSkills(text: string) {
  const hits = skillGroupHits(text);
  const possible = SKILL_GROUPS.reduce((n, g) => n + g.weight, 0);
  const earned = hits.reduce((n, g) => n + g.weight, 0);
  const matched = hits.flatMap((g) => g.terms.slice(0, 4));

  const ratio = possible === 0 ? 0 : earned / possible;
  return {
    points: Math.round(ratio * MAX.skills),
    matched: Array.from(new Set(matched)),
    detail: `${matched.length} skill terms across ${hits.length}/${SKILL_GROUPS.length} groups`,
  };
}

/**
 * Which band a title sits in. Exported so the ingest gate rejects on exactly the
 * same rule the scorer penalises on.
 *
 * Uses hasTerm, not `includes`. Substring matching rejected any title containing
 * a reject term as a fragment — "intern" sits inside "International" and
 * "Internal", so "Staff Engineer, Internal Platform" scored zero for seniority
 * and was flagged out of band.
 */
export function titleBand(title: string): {
  band: "reject" | "ideal" | "acceptable" | "unclear";
  matched?: string;
} {
  const t = title.toLowerCase();
  const rejected = TARGET_TITLES.reject.find((r) => hasTerm(t, r));
  if (rejected) return { band: "reject", matched: rejected };
  const ideal = TARGET_TITLES.ideal.find((r) => hasTerm(t, r));
  if (ideal) return { band: "ideal", matched: ideal };
  const acceptable = TARGET_TITLES.acceptable.find((r) => hasTerm(t, r));
  if (acceptable) return { band: "acceptable", matched: acceptable };
  return { band: "unclear" };
}

function scoreSeniority(title: string) {
  const flags: string[] = [];
  const { band, matched } = titleBand(title);

  if (band === "reject") {
    flags.push(`Title says "${matched}" — outside your target band`);
    return { points: 0, detail: `Rejected on "${matched}"`, flags };
  }
  if (band === "ideal") {
    return { points: MAX.seniority, detail: "Principal/Staff band", flags };
  }
  if (band === "acceptable") {
    return {
      points: Math.round(MAX.seniority * 0.6),
      detail: "Senior band — a step below target",
      flags,
    };
  }
  return { points: Math.round(MAX.seniority * 0.3), detail: "Band unclear from title", flags };
}

function scoreLocation(job: Job, text: string) {
  const flags: string[] = [];
  let points = 0;
  const bits: string[] = [];

  if (job.remote) {
    points += 8;
    bits.push("remote");
  }
  if (job.market.includes("india")) {
    points += 7;
    bits.push("India");
  }
  if (job.market.includes("us")) {
    points += 5;
    bits.push("US");
    const sponsors =
      hasTerm(text, "visa sponsorship") ||
      hasTerm(text, "sponsorship available") ||
      hasTerm(text, "h-1b") ||
      hasTerm(text, "h1b") ||
      hasTerm(text, "relocation");
    if (sponsors) {
      points += 3;
      bits.push("sponsorship signalled");
    } else {
      flags.push("US role with no sponsorship or relocation language — verify eligibility");
    }
  }
  if (hasTerm(text, "us citizens only") || hasTerm(text, "must be authorized to work in the us")) {
    points = Math.min(points, 3);
    flags.push("Posting restricts to US work authorization");
  }

  return {
    points: Math.min(points, MAX.location),
    detail: bits.length ? bits.join(", ") : "No market signal",
    flags,
  };
}

function scoreDomain(text: string) {
  const hits = DOMAIN_TERMS.filter((t) => hasTerm(text, t));
  const ratio = Math.min(hits.length / 3, 1);
  return {
    points: Math.round(ratio * MAX.domain),
    detail: hits.length ? hits.slice(0, 3).join(", ") : "No domain overlap found",
  };
}

function scoreFreshness(job: Job) {
  const d = daysSince(job.postedAt);
  const points =
    d <= 2 ? MAX.freshness : d <= 7 ? 4 : d <= 14 ? 3 : d <= 30 ? 1 : 0;
  return { points, detail: d >= 999 ? "Unknown post date" : `Posted ${Math.round(d)}d ago` };
}

/** Terms the posting emphasises that aren't in the profile — ATS gaps worth a look. */
function findGaps(text: string): string[] {
  const candidates = [
    "kafka", "spark", "snowflake", "dbt", "databricks", "flink", "graphql",
    "rust", "scala", "kotlin", "c#", ".net", "ruby", "php",
    "gcp", "azure", "openshift", "istio", "kafka streams",
    "machine learning", "llm", "pytorch", "tensorflow",
    "grpc", "elasticsearch", "mongodb", "cassandra", "dynamodb",
  ];
  const known = new Set(
    SKILL_GROUPS.flatMap((g) => g.terms.map((t) => t.toLowerCase())),
  );
  return candidates.filter((c) => !known.has(c) && hasTerm(text, c));
}

export function scoreJob(job: Job): MatchScore {
  const text = jobHaystack(job);

  const skills = scoreSkills(text);
  const seniority = scoreSeniority(job.title);
  const location = scoreLocation(job, text);
  const domain = scoreDomain(text);
  const freshness = scoreFreshness(job);

  const factors: ScoreFactor[] = [
    { key: "skills", label: "Skill overlap", earned: skills.points, max: MAX.skills, detail: skills.detail },
    { key: "seniority", label: "Seniority fit", earned: seniority.points, max: MAX.seniority, detail: seniority.detail },
    { key: "location", label: "Market fit", earned: location.points, max: MAX.location, detail: location.detail },
    { key: "domain", label: "Domain overlap", earned: domain.points, max: MAX.domain, detail: domain.detail },
    { key: "freshness", label: "Freshness", earned: freshness.points, max: MAX.freshness, detail: freshness.detail },
  ];

  return {
    total: factors.reduce((sum, f) => sum + f.earned, 0),
    factors,
    matchedKeywords: skills.matched,
    missingKeywords: findGaps(text),
    flags: [...seniority.flags, ...location.flags],
    scoredAt: new Date().toISOString(),
  };
}

export function verdict(total: number): { label: string; tone: "strong" | "fair" | "weak" } {
  if (total >= 70) return { label: "Strong match", tone: "strong" };
  if (total >= 50) return { label: "Worth a look", tone: "fair" };
  return { label: "Weak match", tone: "weak" };
}

export function inferMarkets(location: string, remote: boolean): Market[] {
  const l = location.toLowerCase();
  const markets: Market[] = [];
  const indiaHints = ["india", "bengaluru", "bangalore", "hyderabad", "pune", "mumbai", "delhi", "noida", "gurgaon", "chennai"];
  const usHints = ["united states", "usa", "u.s.", "new york", "san francisco", "seattle", "austin", "boston", "chicago", "remote us", "california", "texas"];
  if (indiaHints.some((h) => l.includes(h))) markets.push("india");
  if (usHints.some((h) => l.includes(h))) markets.push("us");
  if (remote || l.includes("remote") || l.includes("anywhere")) markets.push("remote");
  return markets.length ? Array.from(new Set(markets)) : ["remote"];
}
