#!/usr/bin/env node
/**
 * Triggers the daily pipeline against a running instance.
 * Used by cron, launchd or GitHub Actions — see README for setup.
 *
 *   node scripts/daily-run.mjs                    # hits localhost:3000
 *   APP_URL=https://... node scripts/daily-run.mjs
 */

const url = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

const headers = { "Content-Type": "application/json" };
if (secret) headers.Authorization = `Bearer ${secret}`;

const stamp = () => new Date().toISOString();

try {
  const res = await fetch(`${url}/api/run`, { method: "POST", headers });
  const body = await res.json();

  if (!res.ok) {
    console.error(`[${stamp()}] run failed (HTTP ${res.status}): ${body.error}`);
    process.exit(1);
  }

  const { run } = body;
  console.log(
    `[${stamp()}] run ${run.id}: ${run.fetched} fetched, ${run.added} new, ` +
      `${run.duplicates} duplicates, ${run.tailored} tailored` +
      (run.offline ? " (all sources offline)" : ""),
  );
  for (const s of run.stages) {
    console.log(`  ${s.status.padEnd(4)} ${s.label.padEnd(24)} ${s.detail}`);
  }
} catch (err) {
  console.error(`[${stamp()}] could not reach ${url}: ${err.message}`);
  console.error("Is the app running? Try: npm run dev");
  process.exit(1);
}
