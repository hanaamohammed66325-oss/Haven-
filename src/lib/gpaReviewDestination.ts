const KEY = "haven:gpa-review-destination";

/** Only these two explicit local review routes may survive sign-in. */
export function gpaReviewDestination(value: string): string | null {
  try {
    const url = new URL(value, "https://haven.local");
    if (url.origin !== "https://haven.local") return null;
    const path = url.pathname.replace(/\/$/, "");
    if (path === "/dashboard" && url.searchParams.get("review") === "prior") return "/dashboard?review=prior";
    if (path === "/profile" && url.searchParams.get("review") === "past") return "/profile?review=past";
  } catch { /* Invalid URL is not a navigation destination. */ }
  return null;
}

export function rememberGpaReviewDestination(value: string) {
  try {
    const path = gpaReviewDestination(value);
    if (path) sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
    else sessionStorage.removeItem(KEY);
  } catch { /* Navigation still works without session storage. */ }
}

export function takeGpaReviewDestination(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value.at !== "number" || Date.now() - value.at < 0 || Date.now() - value.at > 60 * 60 * 1000) return null;
    return typeof value.path === "string" ? gpaReviewDestination(value.path) : null;
  } catch { return null; }
}
