"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That password didn't work.");
        setPassword("");
        return;
      }
      // Full navigation, not router.push: the layout and every server component
      // above it were rendered for a logged-out request and need re-fetching
      // with the new cookie.
      window.location.href = from.startsWith("/") ? from : "/";
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label htmlFor="password" className="eyebrow" style={{ fontSize: 11 }}>
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          font: "inherit",
          fontSize: 15,
          padding: "10px 12px",
          border: "1px solid var(--rule)",
          borderRadius: 8,
          background: "#fff",
        }}
      />
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--bad, #a3282d)" }}>
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !password}
        style={{
          font: "inherit",
          fontSize: 14,
          fontWeight: 650,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid transparent",
          background: busy || !password ? "#c9d2e0" : "var(--ink)",
          color: "#fff",
          cursor: busy || !password ? "default" : "pointer",
        }}
      >
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
