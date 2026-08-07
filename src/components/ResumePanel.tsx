"use client";

import { useState } from "react";
import type { TailorPlan } from "@/src/lib/tailor";
import type { Job } from "@/src/lib/types";

/**
 * Shows what the tailoring engine decided and hands you the LaTeX. Compiling to
 * PDF happens in Overleaf or a local pdflatex run — see the README.
 */
export default function ResumePanel({
  job,
  plan,
}: {
  job: Job;
  plan: TailorPlan;
}) {
  const [latex, setLatex] = useState<string | null>(job.tailoredResume ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate");
      setLatex(data.latex as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!latex) return;
    await navigator.clipboard.writeText(latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const download = () => {
    if (!latex) return;
    const blob = new Blob([latex], { type: "application/x-tex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-${job.company.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.tex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn: React.CSSProperties = {
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    padding: "7px 12px",
    borderRadius: 7,
    border: "1px solid var(--rule)",
    background: "#fff",
    cursor: "pointer",
    color: "var(--ink)",
  };

  return (
    <aside style={{ display: "grid", gap: 18, position: "sticky", top: 18 }}>
      <section className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
          Tailoring plan
        </h2>

        <p className="eyebrow" style={{ margin: "0 0 5px" }}>
          headline
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>
          {plan.headline}
        </p>

        <p className="eyebrow" style={{ margin: "0 0 5px" }}>
          summary
        </p>
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "#2C3446",
          }}
        >
          {plan.summary}
        </p>

        <p className="eyebrow" style={{ margin: "0 0 6px" }}>
          emphasised, in order
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {plan.emphasisGroups.map((g) => (
            <span
              key={g}
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 5,
                background: "#EEF1F6",
                color: "#5A6377",
                fontWeight: 600,
              }}
            >
              {g}
            </span>
          ))}
        </div>

        <p className="eyebrow" style={{ margin: "0 0 6px" }}>
          bullets selected ({plan.selected.length})
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "grid",
            gap: 7,
            fontSize: 13,
            lineHeight: 1.5,
            color: "#2C3446",
          }}
        >
          {plan.selected.map((b, i) => (
            <li key={i}>{b.text}</li>
          ))}
        </ul>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Resume (LaTeX)</h2>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button style={btn} onClick={generate} disabled={busy}>
              {busy ? "Generating…" : latex ? "Regenerate" : "Generate"}
            </button>
            {latex && (
              <>
                <button style={btn} onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <button style={btn} onClick={download}>
                  Download .tex
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <p style={{ margin: "0 0 10px", color: "#A02225", fontSize: 13 }}>
            {error}
          </p>
        )}

        {latex ? (
          <pre
            style={{
              margin: 0,
              maxHeight: 340,
              overflow: "auto",
              background: "#131A2A",
              color: "#D6DCEA",
              padding: 14,
              borderRadius: 8,
              fontFamily: "var(--mono)",
              fontSize: 11.5,
              lineHeight: 1.55,
            }}
          >
            {latex}
          </pre>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
            Nothing generated for this posting yet. Strong matches get a resume
            automatically on each run.
          </p>
        )}
      </section>
    </aside>
  );
}
