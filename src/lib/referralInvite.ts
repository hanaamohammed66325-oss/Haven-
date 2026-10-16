import { normalizeReferralCode, validReferralCode } from "./referrals";
const KEY = "haven-referral-invite";
export function referralCodeFromSearch(search: string): string | null {
  const values = new URLSearchParams(search).getAll("ref");
  if (values.length !== 1 || !validReferralCode(values[0])) return null;
  return normalizeReferralCode(values[0]);
}
export function captureReferralInvite(search: string): void {
  const code = referralCodeFromSearch(search);
  if (!code || typeof window === "undefined") return;
  try { window.sessionStorage.setItem(KEY, code); } catch { /* Private storage can be unavailable. */ }
}
export function pendingReferralInvite(): string | null {
  if (typeof window === "undefined") return null;
  try { const code = window.sessionStorage.getItem(KEY); return code && validReferralCode(code) ? normalizeReferralCode(code) : null; } catch { return null; }
}
export function clearReferralInvite(): void {
  if (typeof window !== "undefined") try { window.sessionStorage.removeItem(KEY); } catch { /* No persistent fallback. */ }
}
export function referralInviteUrl(siteUrl: string, code: string): string | null {
  if (!validReferralCode(code)) return null;
  try {
    const url = new URL("/signup/", siteUrl);
    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    url.searchParams.set("ref", normalizeReferralCode(code));
    return url.toString();
  } catch { return null; }
}
