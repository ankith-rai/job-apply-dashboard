"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Kicks off the daily pipeline by hand. The same work a cron job would do. */
export default function RunButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      start(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  };

  const working = busy || pending;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {error && (
        <span style={{ color: "#A02225", fontSize: 13 }}>{error}</span>
      )}
      <button
        onClick={run}
        disabled={working}
        style={{
          font: "inherit",
          fontSize: 14,
          fontWeight: 650,
          padding: "10px 18px",
          borderRadius: 8,
          border: "1px solid #3D5AFE",
          background: working ? "#8A9BFF" : "#3D5AFE",
          color: "#fff",
          cursor: working ? "wait" : "pointer",
        }}
      >
        {working ? "Running…" : "Run today's search"}
      </button>
    </div>
  );
}
