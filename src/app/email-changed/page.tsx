"use client";

// ---------------------------------------------------------------------------
// /email-changed — where Supabase's email-change confirmation links land.
//
// Supabase sends two confirmation emails (one to the CURRENT address, one to
// the NEW address). Each contains a link that lands here with an auth token
// in the URL hash (implicit flow). Supabase parses the hash on load and
// creates a session; onAuthStateChange fires USER_UPDATED / SIGNED_IN once
// the token is verified.
//
// Which device opened the link matters (mirrors /welcome's model):
//   • The device that started the change wrote PENDING_EMAIL_CHANGE_KEY
//     into localStorage. If it's present, this is the SAME device — keep
//     the session and send the user to their profile.
//   • Missing / mismatched → a DIFFERENT device opened the link. Sign the
//     ephemeral session out so nothing lingers, and tell the user to go
//     back to their original device.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { PENDING_EMAIL_CHANGE_KEY } from "@/lib/auth";

type State = "checking" | "sameDevice" | "otherDevice" | "invalid";

const primaryBtn =
  "haven-btn mt-2 block w-full rounded-xl py-3 text-center text-sm font-semibold";

export default function EmailChangedPage() {
  const { t } = useT();
  const router = useRouter();
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Fail-safe: if Supabase never surfaces a session in a reasonable window,
    // treat the link as invalid.
    const invalidTimer = window.setTimeout(() => {
      if (!cancelled) setState((s) => (s === "checking" ? "invalid" : s));
    }, 5000);

    (async () => {
      // Two possible flows land here:
      //   1) Send Email Hook builds the URL with ?token_hash=... — verify it.
      //   2) Supabase's default URL puts the session in the URL hash (implicit).
      let params: URLSearchParams | null = null;
      try {
        params = new URLSearchParams(window.location.search);
      } catch { /* ignore */ }
      const tokenHash = params?.get("token_hash");

      if (tokenHash) {
        // PKCE / token-hash flow — exchange it for a session.
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "email_change",
        });
        if (cancelled) return;
        if (error) {
          setState("invalid");
          return;
        }
      } else {
        // Implicit flow — give the client a beat to parse the URL hash.
        await new Promise((r) => setTimeout(r, 300));
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        setState("invalid");
        return;
      }

      let pending: string | null = null;
      try {
        pending = localStorage.getItem(PENDING_EMAIL_CHANGE_KEY);
      } catch {
        // localStorage unavailable — fail safe to other-device.
      }
      const confirmedEmail = (session.user.email ?? "").toLowerCase();
      // Same device if we have any pending record — the confirmed link may
      // be either the current-email link or the new-email link, and both
      // land here on the same original device with the flag still set.
      const sameDevice =
        !!pending &&
        (pending.trim().toLowerCase() === confirmedEmail || confirmedEmail !== "");

      if (sameDevice) {
        try {
          localStorage.removeItem(PENDING_EMAIL_CHANGE_KEY);
        } catch {
          // ignore
        }
        setState("sameDevice");
        timer = setTimeout(() => router.replace("/profile"), 2000);
      } else {
        // Different device: don't leave a session behind on the phone/tablet
        // where the user just opened the link.
        await supabase.auth.signOut();
        if (cancelled) return;
        setState("otherDevice");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(invalidTimer);
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  if (state === "sameDevice") {
    return (
      <AuthLayout
        title={t("emailChangedSameDeviceTitle")}
        subtitle={t("emailChangedSameDeviceSubtitle")}
      >
        <button
          type="button"
          onClick={() => router.replace("/profile")}
          className={primaryBtn}
        >
          {t("emailChangedGoToProfile")}
        </button>
      </AuthLayout>
    );
  }

  if (state === "otherDevice") {
    return (
      <AuthLayout
        title={t("emailChangedOtherDeviceTitle")}
        subtitle={t("emailChangedOtherDeviceSubtitle")}
      >
        {null}
      </AuthLayout>
    );
  }

  if (state === "invalid") {
    return (
      <AuthLayout
        title={t("emailChangedInvalidTitle")}
        subtitle={t("emailChangedInvalidSubtitle")}
      >
        <Link href="/signin" className={primaryBtn}>
          {t("welcomeGoToSignin")}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("emailChangedChecking")} subtitle="">
      {null}
    </AuthLayout>
  );
}
