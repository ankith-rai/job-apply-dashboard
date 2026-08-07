import { NextResponse } from "next/server";
import { setStage } from "@/src/lib/store";
import { STAGES, type Stage } from "@/src/lib/types";

export const dynamic = "force-dynamic";

const VALID = new Set(STAGES.map((s) => s.key));

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const body = (await request.json()) as { stage?: string };
  const stage = body.stage as Stage | undefined;

  if (!stage || !VALID.has(stage)) {
    return NextResponse.json(
      { error: `stage must be one of: ${[...VALID].join(", ")}` },
      { status: 400 },
    );
  }

  const job = await setStage(params.id, stage);
  if (!job) {
    return NextResponse.json({ error: "No job with that id" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
