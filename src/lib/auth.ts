import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Password gate for the whole dashboard.
 *
 * The store holds your salary expectations, every posting you passed on and why,
 * and a resume with your phone number in it. None of that should be one guessed
 * URL away from the open internet.
 *
 * Two independent checks, deliberately:
 *
 *   middleware      — redirects unauthenticated page requests to /login
 *   requireAuth()   — called inside every API route handler
 *
 * The duplication is the point. CVE-2025-29927 was a Next.js middleware bypass:
 * a crafted `x-middleware-subrequest` header skipped middleware entirely, and
 * every app that treated middleware as its only gate was wide open. We're on
 * 14.2.32, well past the 14.2.25 fix, so that specific hole is closed — but the
 * lesson is structural. Middleware is a routing concern that happens to be a
 * convenient chokepoint; it is not an authorization boundary. Anything that
 * reads or writes the store enforces its own access.
 */

/** Name of the session cookie. `__Host-` binds it to this exact origin: no
 *  subdomain can set or read it, and browsers require Secure + Path=/ for it.
 *  Dropped on http://localhost, which has no Secure context, so dev uses the
 *  plain name. */
const SECURE = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = SECURE ? "__Host-ap_session" : "ap_session";

/** How long a login lasts. Long enough to not re-type it every morning. */
export const SESSION_DAYS = 30;

/** Fallback salt when SESSION_SALT is unset. Exported because src/middleware.ts
 *  re-derives the same token on the Edge runtime and the two must not drift. */
export const SESSION_SALT_DEFAULT = "apply-pilot";

/**
 * Constant-time compare. Hashing first makes both buffers 32 bytes, which
 * timingSafeEqual requires (it throws on length mismatch), and stops the
 * length of the real secret leaking through how fast we reject.
 */
export function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The value we store in the cookie: a hash of the password plus a server-side
 * salt, never the password itself.
 *
 * Why hash at all, when possessing the cookie is equivalent to possessing the
 * password? Because the cookie travels through places the password shouldn't:
 * proxy logs, browser storage, a screenshot of devtools. Deriving it also means
 * changing APP_PASSWORD invalidates every existing session for free.
 *
 * SESSION_SALT is optional. Without it the token is derived from the password
 * alone, which still never exposes the password but means the token is stable
 * across deploys. Set it to make sessions revocable independently.
 */
export function sessionToken(password: string): string {
  const salt = process.env.SESSION_SALT ?? SESSION_SALT_DEFAULT;
  return createHash("sha256").update(`${salt}::${password}`).digest("hex");
}

/** Suggests a value for SESSION_SALT. Used by the setup docs, not at runtime. */
export function suggestSalt(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Whether the gate is switched on at all.
 *
 * No APP_PASSWORD means no gate — `npm run dev` on a laptop shouldn't demand a
 * login. The tradeoff is that forgetting to set it in production leaves the app
 * open, so `npm run build` fails when NODE_ENV is production and it's missing.
 * See scripts/check-env.mjs; that check is the reason this default is safe.
 */
export function gateEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/** Checks a submitted password against APP_PASSWORD. */
export function passwordMatches(submitted: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return secretsMatch(submitted, expected);
}

/** Checks a cookie value against what the configured password derives to. */
export function sessionValid(token: string | undefined): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true; // gate off
  if (!token) return false;
  return secretsMatch(token, sessionToken(expected));
}

/**
 * The check every API route calls first.
 *
 * Accepts either a browser session cookie or `Authorization: Bearer <secret>`
 * using CRON_SECRET, so scripted callers (GitHub Actions, scripts/daily-run.mjs)
 * keep working without a login. Returns null when the caller may proceed, or a
 * 401 Response to return as-is.
 */
export function requireAuth(request: Request): Response | null {
  if (bearerOk(request) || cookieOk(request)) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerOk(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  return secretsMatch(header, `Bearer ${secret}`);
}

function cookieOk(request: Request): boolean {
  if (!gateEnabled()) return true;
  return sessionValid(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}

/** Minimal cookie-header parser — API routes get a plain Request, not NextRequest. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Serialized Set-Cookie for a fresh session. */
export function sessionCookie(token: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly", // JS can't read it, so an XSS bug can't exfiltrate the session
    "SameSite=Lax", // blocks cross-site POSTs from carrying it; Lax not Strict so
    // following a link back into the app doesn't look logged out
    `Max-Age=${SESSION_DAYS * 86_400}`,
  ];
  if (SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

/** Serialized Set-Cookie that clears the session. */
export function clearedCookie(): string {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (SECURE) attrs.push("Secure");
  return attrs.join("; ");
}
