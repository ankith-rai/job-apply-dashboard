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

// Placeholder contact is the documented pre-first-use state, not a defect.
if (latex.includes("YOUR_EMAIL@example.com"))
  warn.push("PROFILE.contact still holds placeholders — fill before the first real application");

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
