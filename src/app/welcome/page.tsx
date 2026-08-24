"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { PENDING_SIGNUP_KEY } from "@/lib/auth";

// Landing page for email-confirmation links. Supabase parses the token from the
// URL hash on load and stores the session, so by the time getSession() resolves
// a confirmed link has an active session.
//
// Which device opened the link matters. We wrote PENDING_SIGNUP_KEY (the email)
// to localStorage on the device where signup started:
//   • flag matches the confirmed email  → same device → keep the session, go in.
//   • flag missing / mismatched         → a DIFFERENT device (e.g. the phone) →
//     sign out immediately so no session lingers there, and tell the user to go
//     back to their original device.
type State = "checking" | "ok" | "otherDevice" | "invalid";

const primaryBtn =
  "haven-btn mt-2 block w-full rounded-xl py-3 text-center text-sm font-semibold";

export default function WelcomePage() {
  const { t } = useT();
  const router = useRouter();
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      // Two flows land here:
      //   1) Send Email Hook builds ?token_hash=... URLs (signup/magiclink/invite).
      //   2) Supabase's default link puts tokens in the URL hash (implicit).
      let params: URLSearchParams | null = null;
      try {
        params = new URLSearchParams(window.location.search);
      } catch { /* ignore */ }
      const tokenHash = params?.get("token_hash");
      const linkType = params?.get("type"); // signup | magiclink | invite

      if (tokenHash) {
        const verifyType =
          linkType === "signup" ? "signup" :
          linkType === "magiclink" ? "magiclink" :
          linkType === "invite" ? "invite" : "email";
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: verifyType as "signup" | "magiclink" | "invite" | "email",
        });
        if (cancelled) return;
        if (error) {
          setState("invalid");
          return;
        }
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
        pending = localStorage.getItem(PENDING_SIGNUP_KEY);
      } catch {
        // localStorage unavailable — treat as a different device (fail safe).
      }
      const confirmedEmail = (session.user.email ?? "").toLowerCase();
      const sameDevice = !!pending && pending.trim().toLowerCase() === confirmedEmail;

      if (sameDevice) {
        try {
          localStorage.removeItem(PENDING_SIGNUP_KEY);
        } catch {
          // ignore
        }
        setState("ok");
        timer = setTimeout(() => router.replace("/dashboard"), 2000);
      } else {
        // A different device opened the link: don't leave a session behind here.
        await supabase.auth.signOut();
        if (cancelled) return;
        setState("otherDevice");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  if (state === "ok") {
    return (
      <AuthLayout title={t("welcomeConfirmedTitle")} subtitle={t("welcomeRedirecting")}>
        <button type="button" onClick={() => router.replace("/dashboard")} className={primaryBtn}>
          {t("welcomeGoToDashboard")}
        </button>
      </AuthLayout>
    );
  }

  if (state === "otherDevice") {
    return (
      <AuthLayout title={t("welcomeOtherDeviceTitle")} subtitle={t("welcomeOtherDeviceSubtitle")}>
        {null}
      </AuthLayout>
    );
  }

  if (state === "invalid") {
    return (
      <AuthLayout title={t("welcomeInvalidTitle")} subtitle={t("welcomeInvalidSubtitle")}>
        <Link href="/signin" className={primaryBtn}>
          {t("welcomeGoToSignin")}
        </Link>
      </AuthLayout>
    );
  }

  // Brief moment while Supabase resolves the session from the link.
  return (
    <AuthLayout title={t("welcomeChecking")} subtitle="">
      {null}
    </AuthLayout>
  );
}
