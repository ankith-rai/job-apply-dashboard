# Automating a daily job search: the approaches, and what each one costs you

Written for a Principal/Staff-level search across India and the US. The short
version: the job hunt is a pipeline of six distinct stages, and they do not all
deserve the same amount of automation. Four of them should be fully automatic.
One should be assisted. One should stay manual, and the reason is not squeamishness
— it is that automating it is the single fastest way to get your accounts banned
and your applications discarded.

## The six stages

Discovery is finding postings that exist. Deduplication is recognising that the
same role reposted on four boards is one job. Matching is deciding whether a
posting is worth your time. Tailoring is rewriting your resume so it survives
keyword filters and reads as though you wrote it for that specific team.
Submission is filling in the employer's form and pressing send. Tracking is
knowing what you sent, when, and what came back.

Automate discovery, deduplication, matching and tracking completely. Assist
tailoring, because a machine can pick and reorder your evidence but should not
invent it. Keep submission manual.

## Discovery: four viable routes, in descending order of durability

The most durable option is **official public APIs**. Adzuna covers both India
and the US with a free developer key and is the best single source for your two
markets. Remotive and Arbeitnow are open, unauthenticated, and reasonable for
remote roles. USAJobs has a free key if US federal work is ever interesting.
These change rarely and will not break your setup or your standing with anyone.

Second, and underrated: **ATS boards belong to the companies, not to the job
sites**. Greenhouse and Lever both expose a plain JSON feed per company at a
predictable URL, and it is entirely intended for public consumption. If you can
name forty companies you would actually work for, polling their boards directly
gives you cleaner, earlier, higher-signal results than any aggregator, because
you see the posting the day the company publishes it rather than the day a
scraper picks it up. This is the highest-leverage source available and almost
nobody uses it.

Third, **RSS and email digests**. Several boards still publish RSS, and almost
all offer saved-search email alerts. Parsing your own inbox with the Gmail API
is a legitimate way to widen coverage without touching anyone's terms of service.
Lower signal, near-zero maintenance.

Fourth, and the one to avoid: **scraping LinkedIn, Indeed or Naukri**. All three
prohibit automated access in their terms. Enforcement is real and lands on your
personal account, which is also the account recruiters contact you through. The
downside is not a warning email, it is losing the professional identity you have
spent a decade building. Headless-browser scraping also breaks constantly, so you
pay maintenance costs forever in exchange for that risk. Read those sites in a
browser like everyone else.

## Matching: rules first, models later

A weighted keyword model gets you most of the way and has a property that matters
more than accuracy: you can see why it scored something. This app scores each
posting out of 100 across five factors — skill overlap against weighted groups
drawn from your actual experience, seniority fit inferred from the title, location
fit against your target markets, domain fit for the enterprise-integration and
data-platform work you have actually done, and freshness, because a three-week-old
posting has usually been filled.

The reason to prefer this over sending every posting to an LLM is not cost, it is
debuggability. When a rules engine ranks something absurdly, you can find the term
responsible and fix the weight in one line. When a model does it, you tune a prompt
and hope. Add an LLM as a second pass over the shortlist once the rules engine is
calibrated — semantic judgement on twelve postings is cheap and useful, on nine
hundred it is neither.

Explicit deal-breakers are worth encoding separately from the score, because a
posting can score well on skills and still be disqualifying — a junior title, a
contract-only arrangement, or an on-site requirement in a city you are not moving
to. Those should hard-flag rather than quietly subtract a few points.

## Tailoring: the honest kind

Real tailoring is selection and ordering, not invention. You maintain one bank of
accomplishment bullets, each tagged by skill group and each true. For a given
posting, the engine picks the bullets whose tags overlap the posting's emphasis,
orders them by relevance, rewrites the headline and summary to lead with what that
employer actually asked for, and reorders your skills section so the terms their
filter is scanning for appear early. Nothing is fabricated because everything in
the bank already happened.

This matters mechanically as well as ethically. Applicant tracking systems parse
for keyword presence and position, so surfacing terms you legitimately own is the
entire game. Inventing terms you do not own gets you into a screening call you
cannot survive, which wastes more of your time than not applying would have.

The output here is LaTeX in the Jake's Résumé format you already use, so it drops
straight into Overleaf or compiles locally with `pdflatex`. Keeping the resume as
source rather than a binary also means the diff between two tailored versions is
readable, which is quietly useful when you want to know what you actually claimed
to a company that just called you back.

An LLM pass over the selected bullets — tightening phrasing against the posting's
language, never adding facts — is a reasonable optional enhancement. Keep it off by
default and keep the deterministic path as the one that always works.

## Submission: why this stays manual

There are three ways to automate the send, and all three are worse than they look.

Browser automation against a job board, the Playwright-drives-LinkedIn-Easy-Apply
approach, violates the terms of every major board and is detectable. Autofill
extensions of the Simplify variety are more legitimate and genuinely save keystrokes,
but they are a browser tool you drive, not a scheduled job, so they do not remove
you from the loop. Direct ATS submission APIs mostly do not exist for candidates;
Greenhouse and Lever expose application endpoints to employers, not to applicants.

Beyond the terms-of-service problem there is an effectiveness one. Mass unreviewed
applications are precisely what the industry has spent five years building filters
against, and at Principal level the funnel is small enough that volume is not your
constraint anyway. Fifteen well-targeted applications a week from someone with your
background will outperform three hundred generic ones, and the three hundred will
also burn bridges at companies you might want later.

The genuinely defensible design is what this app does: automate up to the moment of
submission, then present a queue where each posting arrives with a score, a
breakdown of that score, and a tailored resume ready to attach. You review, you
press the button, the posting opens and gets marked applied. The work drops from an
hour a day to about ten minutes, and every application that goes out is one you
chose.

## Scheduling: pick by where it runs

If the app lives on your Mac, `launchd` is the correct tool rather than `cron`,
because it catches up on missed runs after the machine wakes rather than silently
skipping them. If you would rather not host anything, GitHub Actions on a cron
schedule can run the pipeline and commit the updated store back to the repository,
which gives you free hosting, a complete audit trail of every run, and version
history of your own job search. If you deploy to Vercel, its cron feature calls the
run endpoint directly and is the least moving parts of the three. All three are
wired up in this project; the README covers the setup for each.

Whichever you choose, protect the run endpoint with a shared secret before the app
is reachable from the internet. It is a write endpoint that makes outbound network
calls, which is exactly the shape of thing that gets abused when left open.

## Where the effort actually pays

The instinct is to automate the send, because that is the part that feels like
drudgery. The leverage is in discovery and matching, because those are where the
hours quietly go and where nobody is checking your work. Polling forty
company-owned ATS boards every morning and seeing the four postings that matter,
each already scored and each with a resume built for it, is a bigger change to your
week than shaving thirty seconds off a form you fill in fifteen times.
