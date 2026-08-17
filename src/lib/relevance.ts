import { jobHaystack, skillGroupHits, titleBand } from "./match";
import type { Job } from "./types";

/**
 * The ingest gate: does this posting have anything to do with the resume?
 *
 * Needed because most sources cannot be asked a question. Remotive and Adzuna
 * take search terms, but the ATS feeds — Greenhouse, Lever, Ashby — return a
 * company's entire board, designers and sales roles included, and every one of
 * those used to be admitted to the store and scored. That is where the bulk of
 * the weak postings came from.
 *
 * Deliberately NOT a threshold on scoreJob().total. The total folds in freshness
 * and market fit, so gating on it would discard a perfect-fit posting for being
 * three weeks old. This answers "is this in my field", not "do I want it" —
 * ranking stays the scorer's job, and the review queue's.
 */

export interface Rejection {
  job: Job;
  why: string;
}

export interface GateResult {
  keep: Job[];
  rejected: Rejection[];
}

/**
 * Why the rules are this loose: a rejected posting leaves no trace. It never
 * reaches the store, so dedupeKey never learns it and there is no tombstone to
 * show it existed — unlike a low scorer, which store.ts keeps precisely so it
 * cannot come back through the queue tomorrow. A false negative here is
 * invisible, so both rules trigger only on postings that are unambiguously not
 * engineering roles in this profile's band.
 */
export function gateJob(job: Job): { keep: boolean; why: string } {
  const { band, matched } = titleBand(job.title);
  if (band === "reject") {
    return { keep: false, why: `title in reject band ("${matched}")` };
  }

  const hits = skillGroupHits(jobHaystack(job));
  if (hits.length === 0) {
    return { keep: false, why: "mentions none of your skills" };
  }

  return { keep: true, why: `${hits.length} skill group(s)` };
}

export function gateByResume(jobs: Job[]): GateResult {
  const keep: Job[] = [];
  const rejected: Rejection[] = [];

  for (const job of jobs) {
    const verdict = gateJob(job);
    if (verdict.keep) keep.push(job);
    else rejected.push({ job, why: verdict.why });
  }

  return { keep, rejected };
}

/** Rejection counts per source, so a run reports where its noise came from. */
export function rejectionsBySource(rejected: Rejection[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rejected) {
    counts.set(r.job.source, (counts.get(r.job.source) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
