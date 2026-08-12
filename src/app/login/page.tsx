import { Suspense } from "react";
import LoginForm from "@/src/components/LoginForm";
import { gateEnabled } from "@/src/lib/auth";

export const metadata = { title: "Unlock — Apply Pilot" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 380, margin: "8vh auto 0" }}>
      <h1
        style={{
          fontFamily: "var(--display)",
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: "0 0 6px",
        }}
      >
        Apply Pilot
      </h1>
      <p style={{ margin: "0 0 22px", color: "var(--muted)", fontSize: 14.5 }}>
        {gateEnabled()
          ? "This dashboard holds your search history and resume. Enter the password to continue."
          : "No password is set on this deployment, so the dashboard is open. Set APP_PASSWORD to enable the gate."}
      </p>
      {gateEnabled() ? (
        // useSearchParams needs a Suspense boundary, or the whole route opts
        // out of static rendering at build time.
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      ) : (
        <a href="/" style={{ fontSize: 14, fontWeight: 600 }}>
          Go to the dashboard →
        </a>
      )}
    </div>
  );
}
