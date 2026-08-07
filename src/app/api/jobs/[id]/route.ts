import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/src/lib/store";
import { tailorFor } from "@/src/lib/tailor";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const job = await getJob(params.id);
  if (!job) {
    return NextResponse.json({ error: "No job with that id" }, { status: 404 });
  }
  const plan = tailorFor(job).plan;
  return NextResponse.json({ job, plan });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const body = (await request.json()) as { notes?: string };
  const job = await updateJob(params.id, { notes: body.notes });
  if (!job) {
    return NextResponse.json({ error: "No job with that id" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
