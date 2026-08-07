/**
 * Runs the daily pipeline in-process, with no server involved.
 *
 * Used by CI (see .github/workflows/daily.yml) and handy for a one-off local
 * run:  npx tsx scripts/run-inline.mts
 *
 * Writes to data/jobs.json exactly as the API route would.
 */
import { runDailyPipeline } from "../src/lib/run";

const run = await runDailyPipeline();

console.log(`\nrun ${run.id}`);
console.log(
  `${run.fetched} fetched · ${run.added} new · ${run.duplicates} duplicates · ` +
    `${run.tailored} tailored${run.offline ? " (all sources offline)" : ""}\n`,
);

for (const s of run.stages) {
  const mark = s.status === "ok" ? "ok  " : s.status === "warn" ? "warn" : "fail";
  console.log(`  ${mark}  ${s.label.padEnd(24)} ${String(s.ms).padStart(5)}ms  ${s.detail}`);
}

// Fail CI if every source was unreachable — otherwise a silently broken
// integration looks like a clean green run forever.
if (run.offline) {
  console.error("\nEvery source failed. Check credentials and network.");
  process.exit(1);
}
