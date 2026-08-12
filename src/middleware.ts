import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_SALT_DEFAULT } from "@/src/lib/auth";

/**
 * Redirects unauthenticated page requests to /login.
 *
 * This is a convenience layer, not the security boundary — it exists so you get
 * a login form instead of a broken-looking empty dashboard. The actual
 * enforcement is requireAuth() inside each API route, because middleware has
 * been bypassable before (CVE-2025-29927) and pages here render from the same
 * store the API guards.
 *
 * Uses the Web Crypto API rather than node:crypto: middleware runs on the Edge
 * runtime, where node:crypto isn't available. Same comparison, different import.
 */
export const config = {
  // Everything except Next's own assets, the login page, and the auth endpoints.
  // /api/run is excluded because it authenticates with a bearer token instead —
  // it's the one route a cron job, not a browser, is meant to call.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/run).*)"],
};

export async function middleware(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.next(); // gate off for local dev

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await edgeSessionValid(token, expected))) {
    return NextResponse.next();
  }

  // API routes get a 401 rather than an HTML redirect a fetch() can't use.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  // Remember where they were headed so login can send them back.
  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from && from !== "/") login.searchParams.set("from", from);
  return NextResponse.redirect(login);
}

/**
 * Edge-runtime equivalent of sessionToken().
 *
 * node:crypto isn't available here, so the same derivation is reimplemented on
 * Web Crypto. Both sides must agree on `${salt}::${password}` hashed with
 * SHA-256 and hex-encoded — SESSION_SALT_DEFAULT is imported rather than
 * retyped so a change to the fallback can't silently desync the two, and
 * tests/auth.test.mjs asserts the two implementations produce the same token.
 */
async function edgeSessionValid(token: string, password: string): Promise<boolean> {
  const salt = process.env.SESSION_SALT ?? SESSION_SALT_DEFAULT;
  const expected = await sha256Hex(`${salt}::${password}`);
  return timingSafeEqualHex(token, expected);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string compare. Length is not secret here — both sides are
 *  always 64 hex chars — but the content is, so every character is examined. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
