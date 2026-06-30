"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/i18n";
import { supabase } from "@/lib/supabase";

// Landing page for email-confirmation links. Supabase parses the token from the
// URL hash on load and stores the session, so by the time getSession() resolves
// a confirmed link has an active session — we then forward to the dashboard.
type State = "checking" | "ok" | "invalid";

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
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setState("ok");
        timer = setTimeout(() => router.replace("/dashboard"), 2000);
      } else {
        setState("invalid");
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
