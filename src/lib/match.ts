import { SKILL_GROUPS, TARGET_TITLES, DOMAIN_TERMS } from "./profile";
import type { Job, MatchScore, ScoreFactor, Market } from "./types";

const MAX = {
  skills: 45,
  seniority: 25,
  location: 15,
  domain: 10,
  freshness: 5,
};

function haystack(job: Job): string {
  return [job.title, job.company, job.description, job.tags.join(" ")]
    .join(" \n ")
    .toLowerCase();
}

function hasTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, "i").test(
    text,
  );
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 999;
  return Math.max(0, (Date.now() - then) / 86_400_000);
}

function scoreSkills(text: string) {
  const matched: string[] = [];
  let earned = 0;
  let possible = 0;

  for (const group of SKILL_GROUPS) {
    possible += group.weight;
    const hits = group.terms.filter((t) => hasTerm(text, t));
    if (hits.length > 0) {
      earned += group.weight;
      matched.push(...hits.slice(0, 4));
    }
  }

  const ratio = possible === 0 ? 0 : earned / possible;
  return {
    points: Math.round(ratio * MAX.skills),
    matched: Array.from(new Set(matched)),
    detail: `${matched.length} skill terms across ${SKILL_GROUPS.filter((g) => g.terms.some((t) => hasTerm(text, t))).length}/${SKILL_GROUPS.length} groups`,
  };
}

function scoreSeniority(title: string) {
  const t = title.toLowerCase();
  const flags: string[] = [];

  const rejected = TARGET_TITLES.reject.find((r) => t.includes(r));
  if (rejected) {
    flags.push(`Title says "${rejected}" — outside your target band`);
    return { points: 0, detail: `Rejected on "${rejected}"`, flags };
  }
  if (TARGET_TITLES.ideal.some((r) => t.includes(r))) {
    return { points: MAX.seniority, detail: "Principal/Staff band", flags };
  }
  if (TARGET_TITLES.acceptable.some((r) => t.includes(r))) {
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
  const text = haystack(job);

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
