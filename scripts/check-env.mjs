#!/usr/bin/env node
/**
 * Refuses to produce a production build that would be publicly readable.
 *
 * The password gate is off when APP_PASSWORD is unset, so that `npm run dev` on
 * a laptop doesn't demand a login. That default is only safe if it can't
 * silently survive into a deployment — otherwise the failure mode is a
 * dashboard full of your search history sitting on a public URL, and nothing
 * anywhere says so.
 *
 * Runs as part of `npm run build`. To build without it (a local production
 * build you're not deploying):  SKIP_ENV_CHECK=1 npm run build
 */

const problems = [];
const notes = [];

if (process.env.SKIP_ENV_CHECK) {
  console.log("  skip  environment check disabled by SKIP_ENV_CHECK");
  process.exit(0);
}

const isVercel = Boolean(process.env.VERCEL);
const isProd = process.env.NODE_ENV === "production" || isVercel;
const target = process.env.VERCEL_ENV ?? (isProd ? "production" : "development");

if (!process.env.APP_PASSWORD) {
  if (isProd) {
    problems.push(
      "APP_PASSWORD is not set. Anyone with the URL could read your job search,\n" +
        "    your notes, and your resume, and could change job stages.\n" +
        "    Set it in Vercel: Project → Settings → Environment Variables.",
    );
  } else {
    notes.push("APP_PASSWORD unset — the gate is off (fine for local dev).");
  }
} else if (process.env.APP_PASSWORD.length < 12) {
  problems.push(
    `APP_PASSWORD is ${process.env.APP_PASSWORD.length} characters. Use at least 12 —\n` +
      "    this is the only thing standing between the internet and your data.",
  );
}

if (isProd && !process.env.SESSION_SALT) {
  notes.push(
    "SESSION_SALT unset — sessions are derived from the password alone.\n" +
      "    Set it to a random value to be able to sign yourself out everywhere\n" +
      "    without changing the password. Suggested value:\n" +
      "      " + randomHex(),
  );
}

if (isProd && !process.env.CRON_SECRET) {
  notes.push(
    "CRON_SECRET unset — scripts/daily-run.mjs cannot authenticate against a\n" +
      "    gated deployment. The GitHub Actions workflow does not need it (it runs\n" +
      "    the pipeline in-process, not over HTTP).",
  );
}

function randomHex() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

for (const n of notes) console.log(`  note  ${n}`);

if (problems.length) {
  console.error(`\n  Build stopped — ${target} environment is not safe to deploy:\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  console.error("  Set the variable and build again, or SKIP_ENV_CHECK=1 to override.\n");
  process.exit(1);
}

console.log(`  ok    environment looks deployable (${target})`);
