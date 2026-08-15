#!/usr/bin/env node
/**
 * Is a generated resume actually safe to send?
 *
 * `tailor: invents nothing` proves every rendered bullet traces back to the
 * verified bank in src/lib/bullets.ts. That is the right check for fabrication
 * and it is useless against placeholders, because the bank itself ships with
 * "[N]" in it — a placeholder is perfectly traceable and passes. So the thing
 * that stops "Mentored [N] engineers" reaching a hiring manager has to be a
 * separate check, and this is it.
 *
 * Run before your first real application:  npm run check:resume
 *
 * Exits 1 when anything unfilled would print. The test suite imports
 * scanPlaceholders from here rather than restating the patterns, so the two
 * can't drift apart and disagree about what counts as unfilled.
 */

/**
 * Placeholder shapes, matched against LaTeX with escaping undone:
 *   [N], [N]%, [COUNT]     bracketed all-caps stand-ins for a real number
 *   YOUR_EMAIL, YOUR_PHONE the contact block as shipped
 *   example.com            the shipped email domain
 *   TODO / FIXME / TBD     anything left mid-edit
 */
const PATTERNS = [
  /\[[A-Z][A-Z0-9_ ]*\]/g,
  /YOUR_[A-Z_]+/g,
  /\bexample\.com\b/g,
  /\b(?:TODO|FIXME|TBD|XXX)\b/g,
];

/** A few words either side, so the report says which bullet to go fix. */
function context(text, at, width = 46) {
  const from = Math.max(0, at - width);
  const raw = text.slice(from, Math.min(text.length, at + width));
  return (from > 0 ? "…" : "") + raw.replace(/\s+/g, " ").trim() + "…";
}

/**
 * Undo escapeLatex before matching. Without this the scan misses things:
 * `YOUR_EMAIL` is emitted as `YOUR\_EMAIL` inside \underline{}, so a literal
 * search for "YOUR_" finds it only in the unescaped mailto: href — i.e. by
 * luck, depending on which code path happened to emit it.
 */
export function scanPlaceholders(text) {
  const plain = String(text).replace(/\\([&%$#_{}])/g, "$1");
  const raw = [];

  for (const re of PATTERNS)
    for (const m of plain.matchAll(re))
      raw.push({ found: m[0], at: m.index, end: m.index + m[0].length });

  // Collapse overlaps. "[TBD]" matches the bracket pattern and "TBD" the bare
  // word pattern, which is one problem, not two — reporting it twice inflates
  // the count and makes the fix list look longer than the work. Widest span at
  // a given position wins; anything contained inside it is dropped.
  raw.sort((a, b) => a.at - b.at || b.end - a.end);

  const hits = [];
  let covered = -1;
  for (const m of raw) {
    if (m.at < covered) continue;
    covered = m.end;
    hits.push({ found: m.found, where: context(plain, m.at) });
  }
  return hits;
}

/**
 * Reports per *location*, not per placeholder string. The first version of this
 * deduped on the matched text, so all six "[N]" occurrences collapsed into one
 * line — you would fix the bullet it named, re-run, and get told about the next
 * one. The actionable unit is "which bullet", so that is what it keys on.
 *
 * The bullet bank is the authoritative list, because a rendered resume only
 * contains the bullets *selected* for that posting; scanning one resume would
 * miss a placeholder in a bullet no seed job happened to choose. Rendering
 * across every seed posting then tells you which of them actually reach output
 * today versus which are lying in wait for a posting that matches their tags.
 */
export async function auditResume() {
  const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const { tailorFor } = await import(`${R}/src/lib/tailor.ts`);
  const { SEED_JOBS } = await import(`${R}/src/lib/seed.ts`);
  const { BULLETS, PROJECT_BULLETS } = await import(`${R}/src/lib/bullets.ts`);
  const { PROFILE } = await import(`${R}/src/lib/profile.ts`);

  const contact = Object.entries(PROFILE.contact)
    .filter(([, v]) => scanPlaceholders(v).length)
    .map(([field, value]) => ({ field, value }));

  // Which bullet ids make it into a resume for at least one seed posting.
  const emitted = new Set();
  for (const job of SEED_JOBS)
    for (const b of tailorFor(job).plan.selected) emitted.add(b.id);

  const bullets = [];
  for (const b of [...BULLETS, ...PROJECT_BULLETS]) {
    const hits = scanPlaceholders(b.text);
    if (!hits.length) continue;
    bullets.push({
      id: b.id,
      role: b.role,
      found: hits.map((h) => h.found),
      reachesResume: emitted.has(b.id),
      excerpt: b.text.length > 88 ? b.text.slice(0, 88) + "…" : b.text,
    });
  }

  // Anything in rendered output that isn't attributable to a bullet or contact
  // field — a placeholder introduced by the template or summary itself.
  const accounted = new Set([
    ...bullets.flatMap((b) => b.found),
    ...contact.flatMap((c) => scanPlaceholders(c.value).map((h) => h.found)),
  ]);
  const template = [];
  const seenTpl = new Set();
  for (const job of SEED_JOBS) {
    for (const h of scanPlaceholders(tailorFor(job).latex)) {
      if (accounted.has(h.found) || seenTpl.has(h.found)) continue;
      seenTpl.add(h.found);
      template.push(h);
    }
  }

  const total =
    contact.length +
    bullets.reduce((n, b) => n + b.found.length, 0) +
    template.length;

  return { contact, bullets, template, total };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = await auditResume();

  if (a.contact.length) {
    console.error("\n  Contact fields still hold placeholders. These print on every resume,\n" +
                  "  in the header, above everything else:\n");
    for (const c of a.contact) console.error(`    ✗ PROFILE.contact.${c.field} = "${c.value}"`);
    console.error("\n    → src/lib/profile.ts\n");
  }

  const live = a.bullets.filter((b) => b.reachesResume);
  const latent = a.bullets.filter((b) => !b.reachesResume);

  if (live.length) {
    console.error("  Bullets with placeholders that reach a rendered resume today:\n");
    for (const b of live)
      console.error(`    ✗ ${b.id.padEnd(22)} ${b.found.join(", ")}\n      ${b.excerpt}`);
    console.error("");
  }

  if (latent.length) {
    console.error("  Bullets with placeholders that no seed posting selected — these surface\n" +
                  "  as soon as a real posting matches their tags:\n");
    for (const b of latent)
      console.error(`    ✗ ${b.id.padEnd(22)} ${b.found.join(", ")}\n      ${b.excerpt}`);
    console.error("");
  }

  if (a.bullets.length) console.error("    → src/lib/bullets.ts\n");

  if (a.template.length) {
    console.error("  Placeholders coming from the template or summary, not the bank:\n");
    for (const h of a.template) console.error(`    ✗ ${h.found}  in  ${h.where}`);
    console.error("\n    → src/lib/tailor.ts\n");
  }

  if (a.total) {
    console.error(`  ${a.total} unfilled placeholder(s) across ${a.contact.length} contact field(s) ` +
                  `and ${a.bullets.length} bullet(s).\n` +
                  "  The numbers are the part an interviewer asks you to substantiate, so\n" +
                  "  they are worth getting right rather than removing.\n");
    process.exit(1);
  }

  console.log("  ok    no placeholders — resumes are safe to send");
}
