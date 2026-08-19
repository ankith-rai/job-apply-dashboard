/**
 * Board health check.
 *
 * A wrong ATS token is the worst kind of bug this project has: nothing throws,
 * nothing logs, the source just reports zero postings forever and you assume the
 * company isn't hiring. `netflix` sat in LEVER_BOARDS for exactly that reason —
 * Netflix runs on Eightfold, so the Lever endpoint was never going to answer.
 *
 *   npm run check:boards
 *       Probes every board configured in src/lib/sources.ts.
 *
 *   npm run check:boards -- --discover
 *       Probes the unresolved WATCHLIST in src/lib/sources.ts.
 *
 *   npm run check:boards -- --discover snowflake confluent dbt-labs
 *       Tries each name against Greenhouse, Lever and Ashby and tells you which
 *       one answers, so you can add the token to the right list.
 */
import {
  ASHBY_BOARDS,
  FETCH_CONCURRENCY,
  GREENHOUSE_BOARDS,
  LEVER_BOARDS,
  WATCHLIST,
  fetchAshby,
  fetchGreenhouse,
  fetchLever,
  pool,
  type SourceResult,
} from "../src/lib/sources";

type Ats = "greenhouse" | "lever" | "ashby";

const FETCHERS: Record<Ats, (board: string) => Promise<SourceResult>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const OFF = "\x1b[0m";

async function probe(ats: Ats, board: string) {
  const res = await FETCHERS[ats](board);
  return { ats, board, ok: res.ok, count: res.jobs.length, detail: res.detail };
}

function line(label: string, ok: boolean, count: number, detail: string) {
  const mark = ok ? `${GREEN}live${OFF}` : `${RED}dead${OFF}`;
  const note = ok ? `${count} postings` : detail;
  console.log(`  ${label.padEnd(28)} ${mark}  ${DIM}${note}${OFF}`);
}

/**
 * Tells a connectivity problem apart from a bad token.
 *
 * Worth the extra branch: offline, every board reports dead, and the honest
 * reading of that output is "seven companies moved ATS" — which would send you
 * off editing config that was never wrong. A real dead token returns HTTP 404
 * while its neighbours answer fine.
 */
function looksOffline(details: string[]): boolean {
  const networkish = /fetch failed|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|timed out/i;
  return details.length > 1 && details.every((d) => networkish.test(d));
}

/**
 * Says where each board list came from.
 *
 * Setting GREENHOUSE_BOARDS in .env.local *replaces* the 113 verified defaults in
 * sources.ts rather than adding to them, and the nightly GitHub Actions run
 * passes no board variables at all — so a stale .env.local means local runs and
 * CI runs quietly disagree about which companies get fetched. Printing the origin
 * turns that into something you can see.
 */
function origin(name: string, list: string[]): string {
  const overridden = Boolean(process.env[name]?.trim());
  const where = overridden ? `${DIM}from ${name}${OFF}` : `${DIM}sources.ts default${OFF}`;
  return `  ${name.padEnd(20)} ${String(list.length).padStart(3)} boards  ${where}`;
}

async function checkConfigured() {
  const planned: Array<[Ats, string]> = [
    ...GREENHOUSE_BOARDS.map((b) => ["greenhouse", b] as [Ats, string]),
    ...LEVER_BOARDS.map((b) => ["lever", b] as [Ats, string]),
    ...ASHBY_BOARDS.map((b) => ["ashby", b] as [Ats, string]),
  ];

  console.log(`\nChecking ${planned.length} configured boards\n`);
  console.log(origin("GREENHOUSE_BOARDS", GREENHOUSE_BOARDS));
  console.log(origin("LEVER_BOARDS", LEVER_BOARDS));
  console.log(origin("ASHBY_BOARDS", ASHBY_BOARDS));
  console.log("");

  // Bounded, for the same reason fetchAllSources is: 113 concurrent probes is a
  // fast route to a rate limit, and a rate-limited probe reports a healthy board
  // as dead — the exact false alarm this script exists to prevent.
  const results = await pool(
    planned.map(([ats, b]) => () => probe(ats, b)),
    FETCH_CONCURRENCY,
  );

  for (const r of results) line(`${r.ats}:${r.board}`, r.ok, r.count, r.detail);

  // A board that answers with zero postings is technically live but useless, and
  // it is the case most likely to be a renamed token rather than a quiet company.
  const dead = results.filter((r) => !r.ok);
  const empty = results.filter((r) => r.ok && r.count === 0);

  console.log("");
  if (looksOffline(dead.map((d) => d.detail)) && dead.length === results.length) {
    console.log(
      `${RED}Every board failed at the network layer${OFF} — this is almost certainly` +
        ` no internet access, not ${results.length} dead tokens. Nothing to fix here;` +
        ` re-run when you are online.\n`,
    );
    return 0;
  }
  if (dead.length) {
    console.log(`${RED}${dead.length} dead${OFF} — wrong token, or the company moved ATS.`);
    console.log(`  Try: npm run check:boards -- --discover ${dead.map((d) => d.board).join(" ")}`);
  }
  if (empty.length) {
    console.log(
      `${DIM}${empty.length} live but empty: ${empty.map((e) => e.board).join(", ")}` +
        ` — verify the token before assuming they are not hiring.${OFF}`,
    );
  }
  if (!dead.length && !empty.length) console.log(`${GREEN}All boards live and returning postings.${OFF}`);
  console.log("");

  return dead.length;
}

async function discover(names: string[]) {
  console.log(`\nProbing ${names.length} name(s) across Greenhouse, Lever and Ashby\n`);
  let unresolved = 0;

  for (const name of names) {
    const results = await Promise.all(
      (Object.keys(FETCHERS) as Ats[]).map((ats) => probe(ats, name)),
    );
    const hits = results.filter((r) => r.ok && r.count > 0);

    console.log(`  ${name}`);
    for (const r of results) line(`  ${r.ats}`, r.ok, r.count, r.detail);

    if (looksOffline(results.map((r) => r.detail))) {
      console.log(`  ${RED}→ no network${OFF} ${DIM}— cannot resolve anything offline.${OFF}\n`);
      return 0;
    }
    if (hits.length) {
      const best = hits.sort((a, b) => b.count - a.count)[0];
      const envVar = `${best.ats.toUpperCase()}_BOARDS`;
      console.log(`  ${GREEN}→ ${name} is on ${best.ats}${OFF} — add it to ${envVar}`);
    } else {
      unresolved++;
      console.log(
        `  ${RED}→ no match${OFF} ${DIM}— the token may differ from the company name` +
          ` (check the URL on their careers page), or they use another ATS such as` +
          ` Workday or Eightfold.${OFF}`,
      );
    }
    console.log("");
  }

  return unresolved;
}

const args = process.argv.slice(2);
const idx = args.indexOf("--discover");
const names = idx === -1 ? [] : args.slice(idx + 1);
const problems =
  idx === -1
    ? await checkConfigured()
    : await discover(names.length ? names : WATCHLIST);

// Non-zero exit so this is usable as a pre-deploy check, not just a human report.
process.exit(problems > 0 ? 1 : 0);
