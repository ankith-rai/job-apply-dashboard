import { NextResponse } from "next/server";
import { getJobs } from "@/src/lib/store";
import { requireAuth } from "@/src/lib/auth";
import type { Market, Stage } from "@/src/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage") as Stage | null;
  const market = searchParams.get("market") as Market | null;
  const min = Number(searchParams.get("min") ?? 0);
  const q = (searchParams.get("q") ?? "").toLowerCase();

  let jobs = await getJobs();

  if (stage) jobs = jobs.filter((j) => j.stage === stage);
  if (market) jobs = jobs.filter((j) => j.market.includes(market));
  if (min > 0) jobs = jobs.filter((j) => (j.score?.total ?? 0) >= min);
  if (q) {
    jobs = jobs.filter((j) =>
      `${j.title} ${j.company} ${j.tags.join(" ")}`.toLowerCase().includes(q),
    );
  }

  return NextResponse.json({ jobs, count: jobs.length });
}
