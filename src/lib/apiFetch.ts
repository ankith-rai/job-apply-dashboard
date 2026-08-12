"use client";

/**
 * fetch() wrapper that handles an expired session.
 *
 * A 30-day session will expire mid-use eventually, and when it does the API
 * answers 401. Without this, clicking a button would surface "Unauthorized" as
 * an inline error next to a form that now silently does nothing — the user's
 * actual problem is that they need to log in again, so send them there.
 *
 * Returns the Response for every other status; callers handle their own errors.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    const from = window.location.pathname + window.location.search;
    window.location.href = `/login?from=${encodeURIComponent(from)}`;
    // Navigation is async; block the caller from acting on a 401 body meanwhile.
    await new Promise(() => {});
  }
  return res;
}
