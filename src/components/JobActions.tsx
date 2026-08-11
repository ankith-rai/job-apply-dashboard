"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiFetch } from "@/src/lib/apiFetch";
import type { Stage } from "@/src/lib/types";

const BTN: React.CSSProperties = {
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 7,
  border: "1px solid #D8DEE9",
  background: "#fff",
  color: "#131A2A",
  cursor: "pointer",
};

const PRIMARY: React.CSSProperties = {
  ...BTN,
  background: "#3D5AFE",
  borderColor: "#3D5AFE",
  color: "#fff",
};

async function setStage(id: string, stage: Stage) {
  const res = await apiFetch(`/api/jobs/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Could not update");
}

/**
 * Approve opens the posting in a new tab and marks it applied. The submission
 * itself happens on the employer's own form, with you at the keyboard.
 */
export default function JobActions({
  id,
  url,
  stage,
  compact = false,
}: {
  id: string;
  url: string;
  stage: Stage;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (next: Stage, open = false) => {
    setError(null);
    if (open) window.open(url, "_blank", "noopener,noreferrer");
    start(async () => {
      try {
        await setStage(id, next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update");
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {stage === "matched" && (
        <>
          <button
            style={PRIMARY}
            onClick={() => move("applied", true)}
            disabled={pending}
          >
            Open and mark applied
          </button>
          <button style={BTN} onClick={() => move("queued")} disabled={pending}>
            Approve for later
          </button>
          <button style={BTN} onClick={() => move("skipped")} disabled={pending}>
            Pass
          </button>
        </>
      )}

      {stage === "queued" && (
        <>
          <button
            style={PRIMARY}
            onClick={() => move("applied", true)}
            disabled={pending}
          >
            Open and mark applied
          </button>
          <button style={BTN} onClick={() => move("skipped")} disabled={pending}>
            Pass
          </button>
        </>
      )}

      {stage === "applied" && !compact && (
        <>
          <button style={BTN} onClick={() => move("interview")} disabled={pending}>
            They replied
          </button>
          <button style={BTN} onClick={() => move("rejected")} disabled={pending}>
            Closed
          </button>
        </>
      )}

      {stage === "interview" && !compact && (
        <>
          <button style={BTN} onClick={() => move("offer")} disabled={pending}>
            Got an offer
          </button>
          <button style={BTN} onClick={() => move("rejected")} disabled={pending}>
            Closed
          </button>
        </>
      )}

      {(stage === "skipped" || stage === "rejected") && !compact && (
        <button style={BTN} onClick={() => move("matched")} disabled={pending}>
          Move back to review
        </button>
      )}

      {error && (
        <span style={{ color: "#A02225", fontSize: 12 }}>{error}</span>
      )}
    </div>
  );
}
