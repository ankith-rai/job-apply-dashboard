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

```bash
npm install
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
is neither of those: `GREENHOUSE_BOARDS` and `LEVER_BOARDS` poll company-owned ATS
boards directly, which means you see a posting the day the company publishes it
rather than the day an aggregator scrapes it. Name forty companies you would
actually work for and this becomes the most useful part of the setup.

There is deliberately no LinkedIn, Indeed or Naukri scraping. All three prohibit
automated access, enforcement lands on the personal account recruiters contact you
through, and headless-browser scraping breaks constantly. The risk is
disproportionate to the gain.

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

Set `CRON_SECRET` before the app is reachable from the internet. `/api/run` is a
write endpoint that makes outbound network calls, which is exactly the shape of
thing that gets abused when left open. With the secret set, callers must send
`Authorization: Bearer $CRON_SECRET`; the bundled scripts do this for you.

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

Tailoring here means selection and ordering, not invention. `src/lib/profile.ts`
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

Before your first real application, fill in the placeholder contact details in
`PROFILE.contact` — they currently read `YOUR_EMAIL@example.com`.

## Layout

```
src/lib/          profile, bullets, scoring, sources, tailoring, store, pipeline
src/app/          dashboard, job detail, pipeline history, settings
src/app/api/      jobs, run, approve endpoints
scripts/          inline runner, HTTP trigger, launchd plist
tests/            dependency-free suite — npm test
data/jobs.json    the store — plain JSON, no database, created on first run
docs/             the automation write-up
```

State is a single JSON file. For one person's job search that is the correct
amount of infrastructure, and it makes the whole thing greppable and diffable.

## Status

The logic is tested; the Next.js build is not yet.

```bash
npm test   # 35 checks, no dependencies needed
```

The suite runs the real TypeScript sources through Node 22's native type
stripping, so it needs nothing installed. It covers scoring (totals stay in
range, factors sum to the total, no factor exceeds its cap, a relevant senior
role outranks an unrelated junior one), market inference, dedupe across sources,
the store round-trip including first-read seeding and the 30-run history cap, a
full pipeline run with every source offline, and the `/api/run` bearer check
against missing, empty, wrong, prefix-matching and case-variant tokens. It runs
in a temp directory, so it never touches your real `data/jobs.json`.

The check worth having is `tailor: invents nothing` — it extracts every bullet
from a generated resume and asserts each one traces back to the verified bank in
`src/lib/bullets.ts`. That is the property that would matter if a company asked
you to substantiate a claim.

What is still unverified: `npm install` could not run in the environment this was
built in, so `next build` and `tsc --noEmit` have never executed against it, and
no UI component has been rendered. Run `npm install && npm run typecheck && npm
run build` before trusting the dashboard itself; expect a small number of type or
JSX errors rather than none. The library layer underneath is exercised.
