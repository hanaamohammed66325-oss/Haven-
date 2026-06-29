// ---------------------------------------------------------------------------
// Authentication. This is the single source of auth for the whole app — pages
// call ONLY this module. Passwords and sessions are handled entirely by
// Supabase Auth; nothing is stored or hashed here anymore.
//
// Email confirmation is ON: a brand-new account is NOT signed in until the user
// clicks the confirmation link emailed to them.
// ---------------------------------------------------------------------------

import { supabase } from "./supabase";

export interface HavenUser {
  id: string;
  name: string;
  email: string;
}

export type AuthResult =
  // `needsConfirmation` is set when sign up succeeded but the user must confirm
  // their email before they can sign in.
  | { ok: true; needsConfirmation?: boolean }
  | { ok: false; error: "exists" | "invalid" | "unconfirmed" | "unavailable"; message: string };

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (error) {
      const message = error.message;
      // Supabase reports an already-registered email as "User already registered".
      if (/already registered|already exists/i.test(message)) {
        return { ok: false, error: "exists", message };
      }
      return { ok: false, error: "invalid", message };
    }
    // With email confirmation ON there is no active session yet — the user must
    // confirm via the email link before signing in.
    const needsConfirmation = !data.session;
    return { ok: true, needsConfirmation };
  } catch (e) {
    return { ok: false, error: "unavailable", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      const message = error.message;
      if (/email not confirmed|not confirmed/i.test(message)) {
        return { ok: false, error: "unconfirmed", message };
      }
      return { ok: false, error: "invalid", message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "unavailable", message: e instanceof Error ? e.message : String(e) };
  }
}

// Resend the sign-up confirmation email for an account that hasn't confirmed yet.
export async function resendConfirmation(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    if (error) return { ok: false, error: "invalid", message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "unavailable", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
}

export async function getCurrentUser(): Promise<HavenUser | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    return {
      id: user.id,
      name: (user.user_metadata?.full_name as string) ?? "",
      email: user.email ?? "",
    };
  } catch {
    return null;
  }
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  } catch {
    return false;
  }
}
