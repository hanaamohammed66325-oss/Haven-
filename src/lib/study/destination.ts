import { UUID } from "@/lib/study/parse";
// Only study/invitation destinations and the exact launch referral anchor may
// survive authentication. Never accept a caller-supplied host or arbitrary route.
const KEY = "study-pending-destination";
const MAX_AGE = 24 * 60 * 60 * 1000;
export function studyDestination(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, "https://haven.invalid");
    if (url.origin !== "https://haven.invalid") return null;
    if ((url.pathname === "/profile/" || url.pathname === "/profile") && !url.search && url.hash === "#profile-ambassador") return "/profile/#profile-ambassador";
    if (url.hash) return null;
    if ((url.pathname === "/study/" || url.pathname === "/study") && !url.search) return "/study/";
    const key = url.pathname === "/join/" || url.pathname === "/join" ? "t" :
      url.pathname === "/study/" || url.pathname === "/study" ? "g" : null;
    if (!key || [...url.searchParams.keys()].length !== 1) return null;
    const id = url.searchParams.get(key) ?? "";
    if (!(key === "t" ? /^[0-9a-f]{32}$/i : UUID).test(id)) return null;
    return `${key === "t" ? "/join/" : "/study/"}?${key}=${id.toLowerCase()}`;
  } catch { return null; }
}
export function rememberStudyDestination(value: string): void {
  const path = studyDestination(value);
  if (!path) return;
  try { localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* Storage may be unavailable. */ }
}
export function clearStudyDestination(): void {
  try { localStorage.removeItem(KEY); } catch { /* Storage may be unavailable. */ }
}
export function pendingStudyDestination(): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const path = typeof raw?.path === "string" ? studyDestination(raw.path) : null;
    if (path && Number.isFinite(raw.at) && raw.at <= Date.now() && Date.now() - raw.at < MAX_AGE) return path;
  } catch { /* Invalid or unavailable storage. */ }
  clearStudyDestination();
  return null;
}
