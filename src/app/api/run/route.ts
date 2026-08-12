import { NextResponse } from "next/server";
import { runDailyPipeline } from "@/src/lib/run";
import { getRuns } from "@/src/lib/store";
import { requireAuth } from "@/src/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Triggers the daily pipeline.
 *
 * Two kinds of caller, both handled by requireAuth: GitHub Actions and
 * scripts/daily-run.mjs present `Authorization: Bearer $CRON_SECRET`, while the
 * Run button in the dashboard arrives with a session cookie. Before the gate
 * existed only the bearer path worked, which meant setting CRON_SECRET silently
 * broke your own Run button — the browser has no way to send that header.
 *
 * This route is excluded from the middleware matcher precisely because it must
 * stay reachable by a token-only caller with no session.
 */
export async function GET(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  return NextResponse.json({ runs: await getRuns() });
}

export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const run = await runDailyPipeline();
    return NextResponse.json({ run });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Run failed: ${detail}` }, { status: 500 });
  }
}
