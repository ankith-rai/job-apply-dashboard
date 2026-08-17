#!/usr/bin/env node
/**
 * Re-score every posting already in the store.
 *
 * `upsertJobs` scores a posting once, when it first arrives, and never again.
 * That is the right behaviour for a daily run — rescoring 2,000 postings to learn
 * nothing is waste — but it means a change to the scoring vocabulary (the
 * SKILL_GROUPS terms in src/lib/profile.ts) has no effect on anything already
 * stored. The dashboard keeps showing scores computed against the old taxonomy,
 * and the change looks like it did nothing.
 *
 * Run after editing SKILL_GROUPS, TARGET_TITLES or DOMAIN_TERMS:
 *   npm run rescore
 *
 * Scores are derived data, so this is safe to re-run. It reports the band
 * movement rather than just claiming success, because a taxonomy edit that moves
 * nothing is worth knowing about.
 */

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const { scoreJob, verdict } = await import(`${R}/src/lib/match.ts`);
const { readStore, writeStore } = await import(`${R}/src/lib/store.ts`);

const store = await readStore();
const jobs = store.jobs ?? [];

if (!jobs.length) {
  console.log("  store is empty — nothing to rescore");
  process.exit(0);
}

const band = (t) => verdict(t).tone;
const before = { strong: 0, fair: 0, weak: 0 };
const after = { strong: 0, fair: 0, weak: 0 };
const moved = [];

for (const job of jobs) {
  const old = job.score?.total ?? null;
  const next = scoreJob(job);

  if (old !== null) before[band(old)]++;
  after[band(next.total)]++;

  if (old !== null && band(old) !== band(next.total)) {
    moved.push({ job, from: old, to: next.total });
  }
  job.score = next;
}

await writeStore(store);

const line = (label, b) =>
  `  ${label.padEnd(8)} strong ${String(b.strong).padStart(4)}   ` +
  `fair ${String(b.fair).padStart(4)}   weak ${String(b.weak).padStart(5)}`;

console.log(`\n  rescored ${jobs.length} postings\n`);
console.log(line("before", before));
console.log(line("after", after));

if (moved.length) {
  const up = moved.filter((m) => m.to > m.from);
  const down = moved.filter((m) => m.to < m.from);
  console.log(`\n  ${moved.length} changed band — ${up.length} up, ${down.length} down\n`);
  for (const m of [...up, ...down]
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, 12)) {
    const arrow = m.to > m.from ? "↑" : "↓";
    console.log(
      `    ${arrow} ${String(m.from).padStart(3)} → ${String(m.to).padStart(3)}  ` +
        `${m.job.title.slice(0, 46).padEnd(46)} ${m.job.company.slice(0, 22)}`,
    );
  }
  console.log("");
} else {
  console.log("\n  no posting changed band\n");
}
