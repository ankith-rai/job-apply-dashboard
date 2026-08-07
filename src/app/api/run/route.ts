import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runDailyPipeline } from "@/src/lib/run";
import { getRuns } from "@/src/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Triggers the daily pipeline. If CRON_SECRET is set, callers must present it
 * as `Authorization: Bearer <secret>`. Set it before deploying anywhere public —
 * without it this route is open to anyone who can reach the app.
 */
/** Constant-time compare. Hashing first keeps the buffers equal-length, which
 *  timingSafeEqual requires, and stops length itself leaking. */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization");
  if (!header) return false;
  return secretsMatch(header, `Bearer ${secret}`);
}

export async function GET() {
  return NextResponse.json({ runs: await getRuns() });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const run = await runDailyPipeline();
    return NextResponse.json({ run });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Run failed: ${detail}` }, { status: 500 });
  }
}
