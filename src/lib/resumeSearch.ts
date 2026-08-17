import { BULLETS, PROJECT_BULLETS } from "./bullets";
import { termPattern } from "./match";
import { PROFILE, SKILL_GROUPS, TARGET_TITLES } from "./profile";

/**
 * Turns the resume into the search terms sent to keyword sources.
 *
 * The point is derivation, not another list to maintain: QUERIES used to be four
 * hardcoded strings that merely resembled the profile, so editing the resume
 * changed nothing about what got searched. Everything here reads PROFILE,
 * SKILL_GROUPS and the bullet bank, so adding a skill to the resume changes what
 * gets fetched on the next run.
 *
 * Term hits use termPattern from match.ts rather than a local regex. If the fetch
 * layer and the scorer disagreed about what counts as a mention, the pipeline
 * would search for terms it then refuses to credit.
 */

/** Everything the resume actually claims, as one lowercase haystack. */
export function resumeHaystack(): string {
  return [
    PROFILE.headline,
    PROFILE.summary,
    ...PROFILE.skills.flatMap((row) => [row.label, ...row.items]),
    ...BULLETS.map((b) => b.text),
    ...PROJECT_BULLETS.map((b) => b.text),
  ]
    .join(" \n ")
    .toLowerCase();
}

/** How many times the resume mentions a term, on the scorer's own boundaries. */
function mentions(resume: string, term: string): number {
  return (resume.match(termPattern(term, "gi")) ?? []).length;
}

export interface SignatureSkill {
  group: string;
  weight: number;
  term: string;
  mentions: number;
}

/**
 * One representative term per skill group the resume can back up, strongest group
 * first.
 *
 * One per group rather than all matching terms, because these get crossed with
 * titles: emitting every Airflow-adjacent term would spend the whole query budget
 * on orchestration and never search cloud or integrations at all.
 *
 * The most-mentioned term wins, longest as the tie-break. Prominence on the
 * resume is the better proxy for a good search term than either specificity or
 * length: ranking the cloud group by length picks "codepipeline" over "aws",
 * which is more specific and far worse to search a job board with.
 */
export function signatureSkills(): SignatureSkill[] {
  const resume = resumeHaystack();

  return SKILL_GROUPS.slice()
    .sort((a, b) => b.weight - a.weight)
    .map((group) => {
      const backed = group.terms
        .map((term) => ({ term, n: mentions(resume, term) }))
        .filter((t) => t.n > 0)
        .sort((a, b) => b.n - a.n || b.term.length - a.term.length);
      return backed.length
        ? {
            group: group.key,
            weight: group.weight,
            term: backed[0].term,
            mentions: backed[0].n,
          }
        : null;
    })
    .filter((s): s is SignatureSkill => s !== null);
}

/**
 * Titles worth searching, best-fit first.
 *
 * Drawn from TARGET_TITLES because those are the roles being aimed at, which is
 * not the same question as the titles already held — searching "software
 * engineer" because it appears in the work history would pull in exactly the band
 * the reject list exists to exclude.
 */
export function targetTitles(): string[] {
  return dedupe([
    PROFILE.headline.toLowerCase(),
    ...TARGET_TITLES.ideal,
    ...TARGET_TITLES.acceptable,
  ]);
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

/**
 * How many search terms a run may use. Each one costs a request per keyword
 * source (Remotive, Adzuna:IN, Adzuna:US), so 8 terms is 24 requests — sent
 * sequentially per host by perQuery, which is what keeps Adzuna's free tier
 * happy. Raise it only alongside that constraint.
 */
export const QUERY_BUDGET = 8;

/**
 * The search terms for one run: broad titles first, then title+skill pairs.
 *
 * Both halves earn their place. Bare titles catch postings that never name a
 * tool, and every keyword source caps at 50 results per term, so a pair like
 * "principal software engineer airflow" reaches postings the bare title's first
 * 50 would have buried.
 */
export function buildQueries(budget = QUERY_BUDGET): string[] {
  const titles = targetTitles();
  const skills = signatureSkills();
  if (!titles.length) return [];

  const broad = titles.slice(0, 2);
  const pairs = skills.map((s, i) => `${titles[i % titles.length]} ${s.term}`);

  return dedupe([...broad, ...pairs]).slice(0, Math.max(0, budget));
}
