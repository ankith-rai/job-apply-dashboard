#!/usr/bin/env node
/**
 * Prune the store on demand, with a backup.
 *
 * Pruning normally happens as stage 6 of the daily pipeline, which means the only
 * way to trigger it was a full run — network fetches included. This exposes it
 * directly, which is what you want after changing a prune rule, or to retire the
 * demo seed postings that readStore() wrote into the store on first read.
 *
 *   npm run prune
 *
 * Writes data/jobs.pre-prune.json first. That path is covered by the /data/*.json
 * rule in .gitignore, so the backup does not show up as an untracked file. To
 * undo, move it back over data/jobs.json.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const { pruneStore } = await import(`${R}/src/lib/store.ts`);

const DB = path.join(R, "data", "jobs.json");
const BACKUP = path.join(R, "data", "jobs.pre-prune.json");

let raw;
try {
  raw = await fs.readFile(DB, "utf8");
} catch {
  console.log("  no data/jobs.json — nothing to prune");
  process.exit(0);
}

await fs.writeFile(BACKUP, raw, "utf8");

const store = JSON.parse(raw);
const jobs = store.jobs ?? [];
const seedsBefore = jobs.filter((j) => j.source === "Seed");

const { store: pruned, report } = pruneStore({ jobs, runs: store.runs ?? [] });
await fs.writeFile(DB, JSON.stringify(pruned, null, 2), "utf8");

const mb = (n) => (n / 1_048_576).toFixed(2);

console.log(`\n  backup   data/jobs.pre-prune.json`);
console.log(`  postings ${report.before} → ${report.after}  (${report.dropped} dropped, ${report.slimmed} slimmed)`);
console.log(`  size     ${mb(report.bytesBefore)}MB → ${mb(report.bytesAfter)}MB`);

if (report.seedsDropped) {
  console.log(`\n  retired ${report.seedsDropped} demo seed posting(s):`);
  for (const s of seedsBefore) {
    console.log(`    ${s.id.padEnd(8)} ${String(s.stage).padEnd(9)} ${s.company.padEnd(18)} ${s.url}`);
  }
  const left = (pruned.jobs ?? []).filter((j) => j.source === "Seed").length;
  console.log(`\n  seeds remaining: ${left}`);
} else if (seedsBefore.length) {
  console.log(
    `\n  ${seedsBefore.length} seed(s) kept — they are the only postings in the store,\n` +
      "  so they are still doing their job of not showing you an empty dashboard.",
  );
}

console.log("");
