# Apply Pilot

A daily job-application dashboard for a Principal/Staff search across India and
the US. Every morning it collects postings from public APIs and company-owned ATS
boards, drops duplicates, scores each one against your actual experience, and
generates a tailored LaTeX resume for the strong matches. Then it stops and waits
for you.

That last part is the design decision that matters. The pipeline automates
everything up to the moment of submission and nothing after it. You get a review
queue where each posting arrives with a score, a breakdown of that score, and a
resume built for it; you approve or pass. Roughly ten minutes a day instead of an
hour, with every application still one you chose. The reasoning behind that split
— and the case against the fully-automatic alternatives — is in
[docs/automation-approaches.md](docs/automation-approaches.md).

## Running it

Requires Node 24 (see `.nvmrc`). The project relies on Node's built-in TypeScript
type stripping, so there is no `tsx` or `ts-node` in the toolchain.

```bash
npm install                  # not `npm ci` — see Status
cp .env.example .env.local   # optional — works offline without it
npm run dev                  # http://localhost:3000
```

It runs with no configuration. When no API credentials are present every source
reports itself offline and the dashboard falls back to seeded sample postings, so
you can see the whole interface working before deciding which sources to wire up.

To trigger a pipeline run without the server, use `npm run run:inline`. To trigger
one against a running instance, `npm run run:daily`.

## Sources

Adzuna is the best single source for your two markets and takes a free developer
key. Remotive and Arbeitnow need no credentials at all. The highest-signal source
is neither of those: `GREENHOUSE_BOARDS`, `LEVER_BOARDS` and `ASHBY_BOARDS` poll
company-owned ATS boards directly, which means you see a posting the day the
company publishes it rather than the day an aggregator scrapes it. Name forty
companies you would actually work for and this becomes the most useful part of
the setup.

Astronomer sits under Ashby, not Greenhouse — worth knowing because they are the
Airflow company and therefore the closest match in the file to what you do daily.

Check your boards before trusting them:

```bash
npm run check:boards              # are the configured tokens alive?
npm run check:boards -- --discover  # which ATS do the unconfirmed ones use?
```

This exists because a wrong ATS token is the quietest bug in the project. It does
not error; the source just returns nothing, every run, and reads exactly like a
company that isn't hiring. `netflix` sat in `LEVER_BOARDS` doing this — Netflix
moved to Eightfold, so the Lever endpoint was never going to answer. Anything in
`WATCHLIST` is a company worth watching whose ATS has not been confirmed yet, so
it stays inert until `--discover` proves where it lives.

There is deliberately no LinkedIn, Indeed or Naukri scraping. All three prohibit
automated access, enforcement lands on the personal account recruiters contact you
through, and headless-browser scraping breaks constantly. The risk is
disproportionate to the gain.

The supported way to reach those boards is their own job alerts: create alerts on
each platform, point them at a dedicated mailbox, and let the pipeline read that
mailbox over IMAP. Same postings, sent to you deliberately, with nothing staked on
the account recruiters use to reach you.

## Scheduling

Three options, all wired up; pick by where the app lives.

On your Mac, `launchd` is the right tool rather than `cron`, because it catches up
on runs missed while the machine was asleep instead of skipping them silently:

```bash
cp scripts/com.ankith.applypilot.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ankith.applypilot.plist
tail -f /tmp/applypilot.log
```

If you would rather not host anything, `.github/workflows/daily.yml` runs the
pipeline on GitHub's schedule and commits the updated store back to the repo. Free
hosting, a complete audit trail of every run, and version history of your own job
search. Note that GitHub cron is UTC — the workflow uses `0 2 * * 1-5`, which is
07:30 IST.

Use this option only in a private repo. The committed store records which
companies you are applying to and what stage each application is at, and git
history keeps it after deletion. Put the Adzuna credentials in repository
secrets, never in the workflow file.

On Vercel, its cron feature can call `POST /api/run` directly, which is the fewest
moving parts of the three.

## Access

The dashboard is password-gated. Set `APP_PASSWORD` and you get a login screen;
leave it empty and the gate is off, so `npm run dev` on your laptop doesn't ask
for anything. That default is convenient and would be dangerous if it could reach
production, so `npm run build` refuses to build when `NODE_ENV=production` or
`VERCEL` is set and no password is configured. Override with `SKIP_ENV_CHECK=1`
for a local production build you aren't deploying.

What's behind the gate is worth gating: which companies you're applying to, what
stage each application is at, your private notes, and a resume carrying your phone
number and email.

Enforcement is deliberately duplicated. `src/middleware.ts` redirects
unauthenticated page requests to `/login`, and `requireAuth()` runs inside every
API route handler. The redundancy is the point — CVE-2025-29927 was a Next.js
middleware bypass, and every app that treated middleware as its only gate was
readable by anyone who sent one extra header. This project is on a patched version,
but middleware is a routing concern that happens to make a convenient chokepoint;
it is not an authorization boundary. A test walks `src/app/api` and fails if any
exported handler is missing its check, so a route added later can't quietly skip it.

Two ways to authenticate:

- **A session cookie**, from logging in. `HttpOnly`, `SameSite=Lax`, `Secure` and
  `__Host-`-prefixed in production, 30-day expiry. The value is a SHA-256 of
  `SESSION_SALT::APP_PASSWORD`, never the password itself — so changing either one
  invalidates every existing session, and a leaked cookie doesn't reveal what to
  type into the login form. Set `SESSION_SALT` if you want to sign yourself out
  everywhere without changing the password.
- **`Authorization: Bearer $CRON_SECRET`**, for callers that can't hold a cookie.
  `scripts/daily-run.mjs` uses this. The GitHub Actions workflow does not need it —
  it runs the pipeline in-process rather than over HTTP.

`/api/run` accepts either, which matters: it's a write endpoint that makes outbound
network calls, and before the gate existed it only accepted the bearer token. That
meant setting `CRON_SECRET` silently broke the dashboard's own Run button, since a
browser has no way to attach that header.

## How scoring works

Each posting gets a score out of 100 across five factors: skill overlap against
weighted groups drawn from your real experience, seniority fit inferred from the
title, location fit against your target markets, domain fit for
enterprise-integration and data-platform work, and freshness, since a three-week-old
posting has usually been filled. Anything at 60 or above gets a tailored resume
generated automatically.

The scoring is rules-based rather than model-based, and that is on purpose. When a
rules engine ranks something absurdly you can find the responsible term and fix
one weight; when a model does it you tune a prompt and hope. Every score in the UI
expands to show which factors contributed what. Adjust the weights in
`src/lib/profile.ts` — `SKILL_GROUPS`, `TARGET_TITLES`, `TARGET_MARKETS`.

## Tailoring

Tailoring here means selection and ordering, not invention. `src/lib/bullets.ts`
holds a bank of accomplishment bullets, each tagged by skill group and each true.
For a given posting the engine picks the bullets whose tags overlap what that
posting emphasises, orders them by relevance, rewrites the summary to lead with
what the employer asked for, and reorders the skills section so the terms their
filter scans for appear early. Nothing is fabricated, because everything in the
bank already happened.

Output is LaTeX in the Jake's Résumé format, so it pastes straight into Overleaf
or compiles locally with `pdflatex`. Keeping resumes as source rather than binaries
also means the diff between two tailored versions is readable, which is useful when
a company calls back and you want to know exactly what you claimed.

Before your first real application, run `npm run check:resume`. It exits nonzero
while anything unfilled would print, and right now it finds ten things: the four
`PROFILE.contact` fields in `src/lib/profile.ts`, which still read
`YOUR_EMAIL@example.com` and appear in the header of every resume, and six `[N]`
markers across five bullets in `src/lib/bullets.ts` — as shipped, a generated
resume says "Mentored [N] engineers".

Fill the numbers in rather than deleting them. They're the part an interviewer
asks you to substantiate, and a bullet with a real figure in it is the reason to
have a bullet bank at all.

There is no `.tex` file to edit, which is worth saying plainly: the LaTeX is
output, not source. Edit `profile.ts` and `bullets.ts`, then hit Regenerate on the
job — the pipeline caches each resume in `tailoredResume` and only generates when
that field is empty, so edits don't retroactively update resumes already produced.

## Layout

```
src/lib/          profile, bullets, scoring, sources, tailoring, store, pipeline
src/lib/auth.ts   the gate: password check, session token, requireAuth()
src/middleware.ts redirects unauthenticated page requests to /login
src/app/          dashboard, job detail, pipeline history, settings, login
src/app/api/      jobs, run, approve, auth endpoints — all behind requireAuth
scripts/          inline runner, HTTP trigger, launchd plist, env + resume checks
tests/            dependency-free suite — npm test
data/jobs.json    the store — plain JSON, no database, created on first run
docs/             the automation write-up
```

State is a single JSON file. For one person's job search that is the correct
amount of infrastructure, and it makes the whole thing greppable and diffable.

## Status

Types, logic and the gate are verified. The production build is not.

```bash
npm install          # regenerates the lockfile — required, see below
npm run typecheck    # passes clean
npm test             # 63 checks, nothing to install
npm run check:env    # would this be safe to deploy?
npm run check:resume # is a generated resume safe to send?
```

**Run `npm install`, not `npm ci`, the first time.** `package-lock.json` is stale:
it still pins `tsx` and the older `next` and `@types/node`. `npm ci` fails hard on
that mismatch, and it could not be regenerated where this was edited because the
npm registry was unreachable. One `npm install` fixes it — commit the result, or
the GitHub Actions workflow will fail on its `npm ci` step.

`tsc --noEmit` passes. It did not at first: `tsconfig.json` had no `target`, so
TypeScript defaulted to ES5 and rejected iterating a `Set` in
`src/app/api/jobs/[id]/status/route.ts`. Setting `"target": "ES2022"` fixed it.

The test suite runs the real TypeScript sources through Node's native type
stripping, so it needs nothing installed. It covers scoring (totals stay in range,
factors sum to the total, no factor exceeds its cap, a relevant senior role
outranks an unrelated junior one), market inference, dedupe across sources, the
store round-trip including first-read seeding and the 30-run history cap, a full
pipeline run with every source offline, and the gate — bearer tokens that are
missing, empty, wrong, prefix-matching or case-variant, session cookies derived
from a rotated salt, and the gate-off path. It runs in a temp directory, so it
never touches your real `data/jobs.json`.

The check worth having is `tailor: invents nothing` — it extracts every bullet
from a generated resume and asserts each one traces back to the verified bank in
`src/lib/bullets.ts`. That is the property that would matter if a company asked
you to substantiate a claim.

It has a blind spot, which `npm run check:resume` covers. `invents nothing` proves
each rendered bullet traces back to the bank, and the bank itself contains `[N]` —
so a placeholder is perfectly traceable and passes. Fabrication and unfinished
drafts are different failures and need different checks. The placeholder scan
reports per bullet rather than per placeholder, because deduping on the matched
text collapsed all six `[N]`s into one line: you'd fix the bullet it named, re-run,
and be told about the next one. It also un-escapes the LaTeX before matching,
since `YOUR_EMAIL` is emitted as `YOUR\_EMAIL` inside `\underline{}` and a raw
search finds it only via the `mailto:` href — that is, by luck. And it scans the
whole bank, not one rendered resume, because a resume only contains the bullets
selected for that posting; a placeholder in an unselected bullet would otherwise
lie in wait for the first real posting matching its tags. Verified in both
directions: ten findings against the repo as it stands, clean once the values are
filled in on a throwaway copy, and a placeholder injected into `tailor.ts` gets
attributed to the template rather than blamed on a bullet.

The auth tests import `src/lib/auth.ts` rather than restating its logic, which
matters more than it sounds: the previous version reimplemented the comparison and
then tested the copy, so it would have passed while the real route was broken. Two
of them earn their keep by scanning source rather than calling functions — one
walks every file in `src/app/api` and fails if any exported handler is missing its
`requireAuth` call, and one compares the Node `createHash` token derivation in
`auth.ts` against the Web Crypto derivation in `middleware.ts`, because Edge can't
use `node:crypto` and the two implementations have to agree or logging in would
succeed and then bounce you straight back to the login screen. Both were checked
by deliberately breaking the code first — removing the guard from `/api/stats`, and
guarding `GET` but not `PATCH` in `jobs/[id]` — and confirming each failure named
the exact file and method.

Two source bugs were found and fixed after the first pass. `QUERIES` was exported
and rendered on the Settings page while `fetchAllSources` ignored it entirely and
sent hardcoded strings instead, so `platform engineer python` and
`data engineer airflow` were advertised but never searched. Each keyword source
now fans out across all four terms, running them sequentially per host to stay
inside Adzuna's free-tier rate limit and merging the results so the run history
shows one row per source rather than one per search. Separately, `netflix` was
removed from `LEVER_BOARDS`: Netflix runs on Eightfold, so that source had been
failing silently since it was written. Both are covered by tests now, including
one that fails if an unconfirmed `WATCHLIST` token ever reaches a live board list.
`.env.example` had to be fixed too — it kept teaching the dead token to anyone
copying it, which is how a fixed bug comes back.

Each of the six API routes was verified against the running handler, not just
through unit tests: anonymous requests get 401, a valid session cookie gets
through, a bearer token gets through on `/api/run`, and everything returns 200
with the gate off. `scripts/check-env.mjs` was checked across six environments —
no password locally (a note, exit 0), an 8-character password (fails), a simulated
Vercel production build with no password (fails), the same with one (passes), and
`SKIP_ENV_CHECK=1` (skips).

`next build` remains unverified, for an environmental reason rather than a code
one. Two separate blockers, both network: the installed `node_modules` contains
only `@next/swc-darwin-arm64` where a Linux sandbox needs
`@next/swc-linux-arm64-gnu`, and `src/app/globals.css` opens with an `@import` of a
Google Fonts URL, which `next build` and `next dev` both block on until they time
out. On your Mac both resolve. Run `npm run build` once and expect JSX or type
errors in the UI layer rather than none — that layer has never been rendered, which
includes the login page and the middleware redirect, since middleware only runs
under a real Edge runtime. Everything beneath it is exercised.
