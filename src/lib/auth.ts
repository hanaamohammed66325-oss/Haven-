// ---------------------------------------------------------------------------
// Local-only authentication (localStorage). This is the single source of auth
// for the whole app — pages call ONLY this module. To move to a real backend
// (Firebase / Supabase) later, reimplement these four functions here; nothing
// else in the app needs to change.
//
// Passwords are never stored in plain text — only a SHA-256 hash is kept.
// (Note: client-side hashing is not real security; that arrives with a backend.)
// ---------------------------------------------------------------------------

export interface HavenUser {
  name: string;
  email: string;
}

interface StoredUser extends HavenUser {
  passwordHash: string;
}

export type AuthResult = { ok: true } | { ok: false; error: "exists" | "invalid" | "unavailable" };

const USER_KEY = "haven:user";
const SESSION_KEY = "haven:session";

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  try {
    const existing = readUser();
    if (existing && sameEmail(existing.email, email)) return { ok: false, error: "exists" };
    const passwordHash = await hashPassword(password);
    const user: StoredUser = { name: name.trim(), email: email.trim(), passwordHash };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(SESSION_KEY, "true");
    return { ok: true };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const user = readUser();
    const passwordHash = await hashPassword(password);
    if (!user || !sameEmail(user.email, email) || user.passwordHash !== passwordHash) {
      return { ok: false, error: "invalid" };
    }
    localStorage.setItem(SESSION_KEY, "true");
    return { ok: true };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export function signOut(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function getCurrentUser(): HavenUser | null {
  try {
    if (localStorage.getItem(SESSION_KEY) !== "true") return null;
    const user = readUser();
    return user ? { name: user.name, email: user.email } : null;
  } catch {
    return null;
  }
}
