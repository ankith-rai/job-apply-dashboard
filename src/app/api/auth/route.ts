import { NextResponse } from "next/server";
import {
  clearedCookie,
  gateEnabled,
  passwordMatches,
  sessionCookie,
  sessionToken,
} from "@/src/lib/auth";

export const dynamic = "force-dynamic";

/** Slows down guessing. Not a substitute for a strong password — it just means
 *  an attacker gets a handful of attempts per second instead of thousands.
 *  In-memory, so it resets on redeploy and isn't shared across instances;
 *  that's an accepted limit for a single-user app, not an oversight. */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  rec.count++;
  return rec.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  if (!gateEnabled()) {
    return NextResponse.json(
      { error: "No password is configured on this deployment." },
      { status: 400 },
    );
  }

  // Vercel sets x-forwarded-for; falls back to a constant, which makes the
  // limit global rather than per-client. Fine for one user.
  const who = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(who)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!password || !passwordMatches(password)) {
    // Deliberately vague: distinguishing "wrong password" from anything else
    // just tells someone probing which half they got right.
    return NextResponse.json({ error: "That password didn't work." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookie(sessionToken(password)));
  return res;
}

/** Logout. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearedCookie());
  return res;
}
