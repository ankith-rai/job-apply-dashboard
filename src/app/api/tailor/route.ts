import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/src/lib/store";
import { requireAuth } from "@/src/lib/auth";
import { tailorFor } from "@/src/lib/tailor";

export const dynamic = "force-dynamic";

/** Generates (or regenerates) the tailored LaTeX resume for one job. */
export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const body = (await request.json()) as { id?: string; format?: "latex" | "json" };
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const job = await getJob(body.id);
  if (!job) {
    return NextResponse.json({ error: "No job with that id" }, { status: 404 });
  }

  const { plan, latex } = tailorFor(job);
  await updateJob(job.id, { tailoredResume: latex });

  if (body.format === "latex") {
    return new NextResponse(latex, {
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="resume-${job.company.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.tex"`,
      },
    });
  }

  return NextResponse.json({ plan, latex });
}
