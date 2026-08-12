/**
 * Auth coverage.
 *
 * The previous version of this file reimplemented the auth logic inline and
 * tested the copy, which proves only that the copy is self-consistent. This
 * imports src/lib/auth.ts directly, so a change there that breaks the gate
 * fails here.
 *
 * The property that matters most is the last group: every route that touches
 * the store must call requireAuth. That is checked by reading the source, not
 * by trusting that someone remembered.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const pass = [], fail = [];
const check = async (name, fn) => {
  try { await fn(); pass.push(name); }
  catch (e) { fail.push(`${name}: ${e.message}`); }
};

const auth = await import(`${R}/src/lib/auth.ts`);

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return await fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const req = (headers = {}) => new Request("https://example.test/api/jobs", { headers });
const PW = "correct horse battery staple";

// ── password checking ───────────────────────────────────────────────────────

await check("auth: the right password is accepted", async () => {
  await withEnv({ APP_PASSWORD: PW }, () => {
    assert.equal(auth.passwordMatches(PW), true);
  });
});

await check("auth: wrong, empty, prefix and case variants are all rejected", async () => {
  await withEnv({ APP_PASSWORD: PW }, () => {
    for (const bad of ["", "wrong", PW + "x", PW.slice(0, -1), PW.toUpperCase(), " " + PW]) {
      assert.equal(auth.passwordMatches(bad), false, `accepted ${JSON.stringify(bad)}`);
    }
  });
});

await check("auth: with no password configured nothing authenticates as a login", async () => {
  await withEnv({ APP_PASSWORD: undefined }, () => {
    assert.equal(auth.gateEnabled(), false);
    assert.equal(auth.passwordMatches("anything"), false, "logged in against an unset password");
  });
});

// ── session tokens ──────────────────────────────────────────────────────────

await check("auth: the session token never contains the password", async () => {
  await withEnv({ APP_PASSWORD: PW, SESSION_SALT: "s" }, () => {
    const t = auth.sessionToken(PW);
    assert.ok(!t.includes(PW), "password leaked into the cookie value");
    assert.match(t, /^[0-9a-f]{64}$/, "token is not a sha256 hex digest");
  });
});

await check("auth: changing the password invalidates the old session", async () => {
  const before = await withEnv({ APP_PASSWORD: PW, SESSION_SALT: "s" }, () =>
    auth.sessionToken(PW));
  await withEnv({ APP_PASSWORD: "a different password", SESSION_SALT: "s" }, () => {
    assert.equal(auth.sessionValid(before), false,
      "old cookie still worked after a password change");
  });
});

await check("auth: changing SESSION_SALT invalidates every session", async () => {
  const before = await withEnv({ APP_PASSWORD: PW, SESSION_SALT: "one" }, () =>
    auth.sessionToken(PW));
  await withEnv({ APP_PASSWORD: PW, SESSION_SALT: "two" }, () => {
    assert.equal(auth.sessionValid(before), false,
      "rotating the salt did not sign sessions out");
  });
});

await check("auth: a forged or absent session token is rejected", async () => {
  await withEnv({ APP_PASSWORD: PW }, () => {
    assert.equal(auth.sessionValid(undefined), false, "missing token accepted");
    assert.equal(auth.sessionValid(""), false, "empty token accepted");
    assert.equal(auth.sessionValid("f".repeat(64)), false, "forged token accepted");
    assert.equal(auth.sessionValid(auth.sessionToken(PW)), true, "valid token rejected");
  });
});

// ── requireAuth, the gate every route calls ─────────────────────────────────

await check("gate: a valid session cookie is let through", async () => {
  await withEnv({ APP_PASSWORD: PW, CRON_SECRET: undefined }, () => {
    const cookie = `${auth.SESSION_COOKIE}=${auth.sessionToken(PW)}`;
    assert.equal(auth.requireAuth(req({ cookie })), null, "valid session was refused");
  });
});

await check("gate: no cookie means 401", async () => {
  await withEnv({ APP_PASSWORD: PW, CRON_SECRET: undefined }, () => {
    const res = auth.requireAuth(req());
    assert.ok(res, "unauthenticated request was allowed through");
    assert.equal(res.status, 401);
  });
});

await check("gate: a cookie for a different password means 401", async () => {
  const stale = await withEnv({ APP_PASSWORD: "old password" }, () =>
    auth.sessionToken("old password"));
  await withEnv({ APP_PASSWORD: PW }, () => {
    const res = auth.requireAuth(req({ cookie: `${auth.SESSION_COOKIE}=${stale}` }));
    assert.equal(res?.status, 401, "a stale session was accepted");
  });
});

await check("gate: the bearer token still works for scripted callers", async () => {
  await withEnv({ APP_PASSWORD: PW, CRON_SECRET: "s3cret" }, () => {
    assert.equal(
      auth.requireAuth(req({ authorization: "Bearer s3cret" })), null,
      "GitHub Actions / daily-run.mjs would be locked out",
    );
    assert.equal(auth.requireAuth(req({ authorization: "Bearer wrong" }))?.status, 401);
    assert.equal(auth.requireAuth(req({ authorization: "bearer s3cret" }))?.status, 401,
      "case-variant bearer accepted");
  });
});

await check("gate: with no password set the API stays open for local dev", async () => {
  await withEnv({ APP_PASSWORD: undefined, CRON_SECRET: undefined }, () => {
    assert.equal(auth.requireAuth(req()), null, "local dev would need a login");
  });
});

// ── cookie flags ────────────────────────────────────────────────────────────

await check("cookie: session cookie is HttpOnly, SameSite and scoped to /", () => {
  const c = auth.sessionCookie("abc");
  assert.match(c, /HttpOnly/, "cookie readable by JavaScript");
  assert.match(c, /SameSite=Lax/, "no SameSite protection");
  assert.match(c, /Path=\//, "cookie not scoped to the whole app");
  assert.match(c, /Max-Age=\d+/, "session never expires");
});

await check("cookie: logging out sends an immediately-expiring cookie", () => {
  assert.match(auth.clearedCookie(), /Max-Age=0/, "logout did not clear the session");
});

await check("cookie: parser reads the right value among several cookies", () => {
  const header = `other=1; ${auth.SESSION_COOKIE}=wanted; another=2`;
  assert.equal(auth.readCookie(header, auth.SESSION_COOKIE), "wanted");
  assert.equal(auth.readCookie(header, "missing"), undefined);
  assert.equal(auth.readCookie(null, auth.SESSION_COOKIE), undefined);
  assert.equal(auth.readCookie(`prefix_${auth.SESSION_COOKIE}=no`, auth.SESSION_COOKIE), undefined,
    "matched a cookie whose name merely ends with the target");
});

// ── the two token implementations must agree ────────────────────────────────

await check("parity: middleware derives the same token as src/lib/auth.ts", async () => {
  // Middleware runs on the Edge runtime and cannot import node:crypto, so it
  // reimplements the derivation on Web Crypto. If these ever disagree, every
  // login would be rejected by middleware while the API accepted it.
  const salt = "some-salt";
  const nodeToken = await withEnv({ APP_PASSWORD: PW, SESSION_SALT: salt }, () =>
    auth.sessionToken(PW));

  const digest = await webcrypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`${salt}::${PW}`));
  const edgeToken = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  assert.equal(edgeToken, nodeToken, "middleware and API disagree on the session token");
});

await check("parity: both sides share one default salt constant", () => {
  const mw = fs.readFileSync(path.join(R, "src/middleware.ts"), "utf8");
  assert.ok(
    mw.includes("SESSION_SALT_DEFAULT"),
    "middleware hardcodes its own default salt instead of importing the shared one",
  );
});

// ── every store-touching route enforces auth ────────────────────────────────

function apiRoutes() {
  const dir = path.join(R, "src/app/api");
  const found = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name === "route.ts") found.push(p);
    }
  })(dir);
  return found;
}

/** /api/auth is the login endpoint — requiring a session to log in is a deadlock. */
const isLoginRoute = (p) => p.includes(`${path.sep}auth${path.sep}`);

await check("coverage: every API route calls requireAuth", () => {
  const routes = apiRoutes();
  assert.ok(routes.length >= 6, `expected to find the API routes, found ${routes.length}`);

  const missing = routes
    .filter((p) => !isLoginRoute(p))
    .filter((p) => !fs.readFileSync(p, "utf8").includes("requireAuth("))
    .map((p) => path.relative(R, p));

  assert.equal(missing.length, 0,
    `these routes are reachable without authentication: ${missing.join(", ")}`);
});

await check("coverage: every exported handler calls requireAuth, not just the first", () => {
  // A route file can call requireAuth in GET and forget it in POST — the check
  // above would still pass. This one looks at each handler body separately.
  const HANDLER = /export async function (GET|POST|PATCH|PUT|DELETE)\b/g;
  const gaps = [];

  for (const p of apiRoutes()) {
    if (isLoginRoute(p)) continue;
    const src = fs.readFileSync(p, "utf8");
    const rel = path.relative(R, p);
    const hits = [...src.matchAll(HANDLER)];
    for (let i = 0; i < hits.length; i++) {
      const end = i + 1 < hits.length ? hits[i + 1].index : src.length;
      const body = src.slice(hits[i].index, end);
      if (!body.includes("requireAuth(")) gaps.push(`${rel}:${hits[i][1]}`);
    }
  }
  assert.equal(gaps.length, 0, `unguarded handlers: ${gaps.join(", ")}`);
});

await check("coverage: middleware exclusions do not create dead ends", () => {
  const mw = fs.readFileSync(path.join(R, "src/middleware.ts"), "utf8");
  assert.ok(mw.includes("api/run"),
    "/api/run is not excluded from the matcher — a bearer-token caller with no " +
    "session cookie would be redirected to /login and the daily run would fail");
  assert.ok(mw.includes("login"),
    "/login is not excluded — the login page would redirect to itself");
  assert.ok(mw.includes("api/auth"),
    "/api/auth is not excluded — submitting the login form would be blocked by the gate");
});

console.log(`${pass.length} passed`);
for (const p of pass) console.log("  ok   " + p);
if (fail.length) {
  console.log(`\n${fail.length} FAILED`);
  for (const f of fail) console.log("  FAIL " + f);
  process.exit(1);
}
