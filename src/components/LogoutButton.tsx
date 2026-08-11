"use client";

import { useState } from "react";

/** Signs out by clearing the session cookie. Rendered only when the gate is on. */
export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } finally {
      // Full navigation so server components re-render without the session.
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      style={{
        font: "inherit",
        fontSize: 13,
        fontWeight: 600,
        padding: "6px 10px",
        borderRadius: 7,
        border: "1px solid var(--rule)",
        background: "#fff",
        color: "var(--muted)",
        cursor: busy ? "default" : "pointer",
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
