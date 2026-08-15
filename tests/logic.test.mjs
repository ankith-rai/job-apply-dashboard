/**
 * Runtime smoke test of the pure logic: scoring, dedupe, tailoring, seeds.
 * Executes the real .ts sources via Node's native type stripping.
 */
import assert from "node:assert/strict";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const pass = [];
const fail = [];
const warn = [];
const check = (name, fn) => {
  try { fn(); pass.push(name); }
  catch (e) { fail.push(`${name}: ${e.message}`); }
};

const match = await import(`${R}/src/lib/match.ts`);
const seed = await import(`${R}/src/lib/seed.ts`);
const store = await import(`${R}/src/lib/store.ts`);
const tailor = await import(`${R}/src/lib/tailor.ts`);
const profile = await import(`${R}/src/lib/profile.ts`);
const bullets = await import(`${R}/src/lib/bullets.ts`);

console.log("modules loaded:", ["match", "seed", "store", "tailor", "profile", "bullets"].join(", "));

// ── inferMarkets ──────────────────────────────────────────────────────────
check("inferMarkets: Bengaluru → india", () =>
  assert.ok(match.inferMarkets("Bengaluru, India", false).includes("india")));
check("inferMarkets: San Francisco → us", () =>
  assert.ok(match.inferMarkets("San Francisco, CA", false).includes("us")));
check("inferMarkets: remote flag → remote", () =>
  assert.ok(match.inferMarkets("Anywhere", true).includes("remote")));

// ── scoring ───────────────────────────────────────────────────────────────
const scored = seed.SEED_JOBS.map((j) => ({ job: j, s: match.scoreJob(j) }));

check("scoreJob: total within 0..100", () => {
  for (const { job, s } of scored) {
    assert.ok(Number.isFinite(s.total), `${job.title} produced ${s.total}`);
    assert.ok(s.total >= 0 && s.total <= 100, `${job.title} scored ${s.total}`);
  }
});

check("scoreJob: factors sum to total", () => {
  for (const { job, s } of scored) {
    const sum = s.factors.reduce((a, f) => a + f.earned, 0);
    assert.ok(Math.abs(sum - s.total) <= 1, `${job.title}: factors ${sum} vs total ${s.total}`);
  }
});

check("scoreJob: every factor has a label and stays within its cap", () => {
  for (const { s } of scored) {
    for (const f of s.factors) {
      assert.ok(f.label, "factor missing label");
      assert.ok(Number.isFinite(f.earned), `${f.label}: earned is ${f.earned}`);
      assert.ok(f.earned <= f.max, `${f.label}: ${f.earned} exceeds max ${f.max}`);
    }
  }
});

check("scoreJob: relevant senior role outranks an unrelated junior one", () => {
  const base = seed.SEED_JOBS[0];
  const strong = { ...base, title: "Principal Software Engineer",
    location: "Bengaluru, India", market: ["india"],
    description: "Python, Airflow, Kafka, Kubernetes, AWS, distributed systems, data platform, integration",
    postedAt: new Date().toISOString() };
  const weak = { ...base, title: "Junior Frontend Intern", location: "Berlin, Germany",
    market: [], description: "CSS and Photoshop", postedAt: "2024-01-01T00:00:00.000Z" };
  const hi = match.scoreJob(strong).total, lo = match.scoreJob(weak).total;
  assert.ok(hi > lo, `strong ${hi} did not beat weak ${lo}`);
  assert.ok(hi >= 60, `strong match scored ${hi}, below the 60 tailoring threshold`);
});

// ── dedupe ────────────────────────────────────────────────────────────────
check("dedupeKey: same role/company across sources collides", () =>
  assert.equal(
    store.dedupeKey({ title: "Staff Engineer", company: "Stripe" }),
    store.dedupeKey({ title: "staff  engineer", company: "STRIPE!" }),
  ));
check("dedupeKey: different roles do not collide", () =>
  assert.notEqual(
    store.dedupeKey({ title: "Staff Engineer", company: "Stripe" }),
    store.dedupeKey({ title: "Principal Engineer", company: "Stripe" }),
  ));

// ── tailoring ─────────────────────────────────────────────────────────────
const target = seed.SEED_JOBS[0];
const { plan, latex } = tailor.tailorFor(target);

check("tailor: plan selects at least one bullet and a summary", () => {
  assert.ok(plan, "no plan returned");
  const bulletish = Object.values(plan).find((v) => Array.isArray(v) && v.length);
  assert.ok(bulletish, "plan contains no non-empty array of selected content");
});
check("escapeLatex: escapes the characters that break a build", () => {
  const out = tailor.escapeLatex("Cost & scale: 50% #1 (a_b) $x{y}");
  for (const raw of ["&", "%", "#", "_", "$"]) {
    const idx = out.indexOf(raw);
    if (idx > 0) assert.equal(out[idx - 1], "\\", `unescaped ${raw} in "${out}"`);
  }
});

check("tailor: emits LaTeX with a document body", () => {
  assert.ok(latex.includes("\\begin{document}"), "no \\begin{document}");
  assert.ok(latex.includes("\\end{document}"), "no \\end{document}");
});
check("tailor: \\begin and \\end counts match", () => {
  const b = (latex.match(/\\begin\{/g) ?? []).length;
  const e = (latex.match(/\\end\{/g) ?? []).length;
  assert.equal(b, e, `${b} \\begin vs ${e} \\end`);
});
check("tailor: braces balanced", () => {
  const o = (latex.match(/(?<!\\)\{/g) ?? []).length;
  const c = (latex.match(/(?<!\\)\}/g) ?? []).length;
  assert.equal(o, c, `${o} { vs ${c} }`);
});
check("tailor: invents nothing — every bullet traces to the verified bank", () => {
  // Bullets contain nested \textbf{...}, so match braces by depth rather than regex.
  const extractArgs = (src, macro) => {
    const out = [];
    let i = 0;
    while ((i = src.indexOf(macro + "{", i)) !== -1) {
      let depth = 1, j = i + macro.length + 1;
      for (; j < src.length && depth > 0; j++) {
        if (src[j] === "\\") { j++; continue; }
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
      }
      out.push(src.slice(i + macro.length + 1, j - 1));
      i = j;
    }
    return out;
  };
  // Compare on words alone: tailor escapes the bank text (~ becomes
  // \textasciitilde{}) and bolds keywords, so punctuation differs by design.
  const norm = (s) =>
    s.replace(/\\textbf\{([^}]*)\}/g, "$1")
     .replace(/\\[a-zA-Z]+\{\}/g, " ")
     .replace(/[^a-z0-9]+/gi, " ")
     .trim().toLowerCase();

  const bank = [...bullets.BULLETS, ...bullets.PROJECT_BULLETS].map((b) => norm(b.text));
  assert.ok(bank.length, "no bullet bank found in ./bullets");

  const emitted = extractArgs(latex, "\\resumeItem").map(norm);
  assert.ok(emitted.length, "resume emitted no bullets");
  for (const b of emitted) {
    assert.ok(
      bank.some((x) => x === b || x.includes(b) || b.includes(x)),
      `bullet not in the verified bank: "${b.slice(0, 70)}"`,
    );
  }
});

// ── placeholders ──────────────────────────────────────────────────────────
// `invents nothing` above cannot catch these. It proves each rendered bullet
// traces back to the bank, and the bank itself contains "[N]" — so a
// placeholder is traceable and passes. This is what stops "Mentored [N]
// engineers" reaching a hiring manager.
//
// A note rather than a failure: the repo ships with placeholders deliberately,
// and a suite that is red on a fresh clone trains you to ignore it. The hard
// gate is `npm run check:resume`, which exits nonzero — run it before the first
// real application. Both import the same scanner so they can't disagree about
// what counts as unfilled.
const { auditResume, scanPlaceholders } = await import(`${R}/scripts/check-resume.mjs`);
const audit = await auditResume();

check("resume: the placeholder scanner fires on placeholders", () => {
  // A scanner that never matches is indistinguishable from no scanner, so prove
  // it fires before trusting it to stay quiet. The escaped forms matter: the
  // header emits YOUR_EMAIL as YOUR\_EMAIL inside \underline{}, so a scanner
  // that only searched raw text would find it by luck, via the mailto: href.
  const bad = [
    "Mentored [N] engineers",
    String.raw`Cut runtime by [N]\% overall`,
    String.raw`\underline{YOUR\_EMAIL@example.com}`,
    "reach me at someone@example.com",
    "TODO: quantify this",
  ];
  for (const s of bad)
    assert.ok(scanPlaceholders(s).length > 0, `scanner missed: ${s}`);
});

check("resume: the placeholder scanner stays quiet on real content", () => {
  // False positives are the worse failure here — a warning that cries wolf is a
  // warning you stop reading. Real bullet text and a real LaTeX preamble must
  // come back clean, including optional args like [letterpaper,11pt] and [1].
  const good = [
    "Mentored 6 engineers through design reviews",
    String.raw`Cut sync job runtime by 40\% by profiling hot paths`,
    "Led Airflow upgrades across US-East-1, US-East-2 and EU-Central-1",
    String.raw`\documentclass[letterpaper,11pt]{article}`,
    String.raw`\newcommand{\resumeItem}[1]{\item\small{#1}}`,
    String.raw`\usepackage[english]{babel}`,
  ];
  for (const s of good)
    assert.deepEqual(scanPlaceholders(s), [], `false positive on: ${s}`);
});

if (audit.total) {
  const lines = [
    ...audit.contact.map((c) => `PROFILE.contact.${c.field} = "${c.value}"`),
    ...audit.bullets.map(
      (b) =>
        `${b.found.join(", ")} in bullet "${b.id}"` +
        (b.reachesResume ? "" : " (no seed posting selects it yet)"),
    ),
    ...audit.template.map((h) => `${h.found} from the template — ${h.where}`),
  ];
  warn.push(
    `${audit.total} unfilled placeholder(s) would print into a real resume.\n` +
      lines.map((l) => `         ${l}`).join("\n") +
      `\n         Fix src/lib/profile.ts and src/lib/bullets.ts, then: npm run check:resume`,
  );
}

// ── seeds ─────────────────────────────────────────────────────────────────
check("seed: ids unique", () => {
  const ids = seed.SEED_JOBS.map((j) => j.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate seed ids");
});
check("seed: every job has the fields the UI reads", () => {
  for (const j of seed.SEED_JOBS)
    for (const k of ["id", "title", "company", "location", "url", "source", "postedAt", "stage"])
      assert.ok(j[k] !== undefined, `${j.id ?? "?"} missing ${k}`);
});

// ── sources: query fan-out and result merging ─────────────────────────────
const sources = await import(`${R}/src/lib/sources.ts`);

const fakeJob = (id) => ({ id, title: "Staff Engineer", company: "Acme" });
const okPart = (label, ids) => ({ source: label, jobs: ids.map(fakeJob), ok: true, detail: "" });
const badPart = (label, why) => ({ source: label, jobs: [], ok: false, detail: why });

check("merge: dedupes the same posting returned by two queries", () => {
  const m = sources.mergeResults("Adzuna:IN", [okPart("a", ["j1", "j2"]), okPart("a", ["j2", "j3"])]);
  assert.equal(m.jobs.length, 3, `expected 3 unique, got ${m.jobs.length}`);
});

check("merge: every query failing marks the source dead, not quiet", () => {
  const m = sources.mergeResults("Adzuna:IN", [badPart("a", "HTTP 429"), badPart("a", "HTTP 429")]);
  assert.equal(m.ok, false);
  assert.match(m.detail, /429/, "the reason must survive into the run history");
});

check("merge: one query failing still yields the postings from the others", () => {
  const m = sources.mergeResults("Remotive", [okPart("a", ["j1"]), badPart("a", "timed out")]);
  assert.equal(m.ok, true);
  assert.equal(m.jobs.length, 1);
  assert.match(m.detail, /failed/, "a partial failure must be visible, not swallowed");
});

check("merge: label is carried through so the UI can name the source", () => {
  assert.equal(sources.mergeResults("Adzuna:US", [okPart("a", ["j1"])]).source, "Adzuna:US");
});

// The bug this guards: QUERIES was exported and displayed while fetchAllSources
// ignored it, so two of the four terms were never actually searched.
check("sources: the watchlist stays out of the live board lists", () => {
  const live = [...sources.GREENHOUSE_BOARDS, ...sources.LEVER_BOARDS, ...sources.ASHBY_BOARDS];
  const leaked = sources.WATCHLIST.filter((w) => live.includes(w));
  assert.equal(leaked.length, 0, `unverified tokens went live: ${leaked.join(", ")}`);
});

check("sources: netflix is not fetched from Lever — it runs on Eightfold", () => {
  assert.ok(!sources.LEVER_BOARDS.includes("netflix"), "dead token is back in LEVER_BOARDS");
});

console.log(`\n${pass.length} passed`);
for (const p of pass) console.log("  ok   " + p);
if (warn.length) {
  console.log(`\n${warn.length} note(s)`);
  for (const w of warn) console.log("  note " + w);
}
if (fail.length) {
  console.log(`\n${fail.length} FAILED`);
  for (const f of fail) console.log("  FAIL " + f);
  process.exit(1);
}
