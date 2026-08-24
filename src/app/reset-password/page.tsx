"use client";

// ---------------------------------------------------------------------------
// /reset-password — where the emailed reset link lands.
//
// This site is a STATIC EXPORT (next.config: output "export"), so there is no
// server to exchange an auth code. It uses Supabase's IMPLICIT flow instead:
// the client picks the recovery tokens out of the URL hash on load and fires
// onAuthStateChange with "PASSWORD_RECOVERY", which gives us a temporary
// session that is only good for setting a new password.
//
// The page is deliberately outside the (app) route group, so AuthGuard doesn't
// wrap it — it has to be reachable while logged out.
//
// Language comes from the ?lang= param the reset email carries, NOT from the
// store: the link is often opened on another device where the profile (and so
// the saved locale) hasn't loaded. We pick the dictionary directly and scope
// direction to this page, rather than calling setLanguage, which would persist
// a language change to the account as a side effect of clicking an email link.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { supabase } from "@/lib/supabase";
import { updatePassword, signOut } from "@/lib/auth";
import { en, type TranslationKey } from "@/i18n/translations/en";
import { ar } from "@/i18n/translations/ar";

const fieldBase =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

/** Matches the signup rule (see authErrPassword). */
const MIN_PASSWORD = 8;

/** How long to wait for a recovery session before calling the link invalid. */
const VERIFY_TIMEOUT_MS = 4000;

/** How long the success message stays up before we send them to sign in. */
const REDIRECT_DELAY_MS = 2000;

type Phase = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();

  // null until mounted — the URL isn't readable during the static prerender.
  const [lang, setLang] = useState<"en" | "ar" | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const dict = lang === "ar" ? ar : en;
  const t = useCallback(
    (key: TranslationKey) => (dict[key] ?? en[key] ?? key) as string,
    [dict]
  );
  const dir = lang === "ar" ? "rtl" : "ltr";

  /* Read ?lang= from the URL. Read directly off window rather than with
     useSearchParams, which forces a Suspense boundary / CSR bailout during a
     static export. Invalid or missing falls back to the app default. */
  useEffect(() => {
    let next: "en" | "ar" = "en";
    try {
      const raw = new URLSearchParams(window.location.search).get("lang");
      if (raw === "ar" || raw === "en") next = raw;
    } catch {
      /* fall through to the default */
    }
    setLang(next);
  }, []);

  /* Wait for the recovery session. The event fires once the client has parsed
     the hash; getSession covers the case where it already resolved before this
     effect ran. If neither produces a session we treat the link as expired. */
  useEffect(() => {
    let settled = false;
    const succeed = () => {
      if (settled) return;
      settled = true;
      setPhase("ready");
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) succeed();
    });

    // Two flows can land here:
    //   1) Send Email Hook builds ?token_hash=... URLs — verify with verifyOtp.
    //   2) Supabase's default link puts tokens in the URL hash (implicit) —
    //      onAuthStateChange + getSession above already handle that path.
    let tokenHash: string | null = null;
    try {
      tokenHash = new URLSearchParams(window.location.search).get("token_hash");
    } catch { /* ignore */ }
    if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error }) => { if (!error) succeed(); });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) succeed();
      });
    }

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setPhase("invalid");
      }
    }, VERIFY_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  // Cleared on unmount so a redirect can't fire into a dead component.
  const redirectTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (redirectTimer.current != null) window.clearTimeout(redirectTimer.current);
    },
    []
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORD) next.password = t("authErrPassword");
    if (confirm !== password) next.confirm = t("authErrMatch");
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);

    if (!res.ok) {
      setErrors({ form: res.message || t("authForgotError") });
      return;
    }

    setPhase("done");
    // Drop the temporary recovery session so they sign in fresh with the new
    // password, then move them along.
    await signOut();
    redirectTimer.current = window.setTimeout(() => {
      router.push("/signin");
    }, REDIRECT_DELAY_MS);
  };

  // Hold the frame until the locale is known, so copy never flashes in the
  // wrong language (and never in the wrong direction).
  if (lang === null) {
    return (
      <AuthLayout title="" subtitle="">
        <div className="h-24" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={phase === "invalid" ? t("authForgotTitle") : t("resetPwTitle")}
      subtitle={phase === "invalid" ? "" : t("resetPwSubtitle")}
    >
      {/* dir is scoped here rather than set on <html>, which the I18nProvider
          owns and would overwrite from the store's language after hydration. */}
      <div dir={dir} lang={lang}>
        {phase === "checking" && (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {t("resetPwChecking")}
          </p>
        )}

        {phase === "invalid" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              {t("resetPwInvalid")}
            </p>
            <Link
              href="/signin"
              className="haven-btn w-full rounded-xl py-3 text-sm font-semibold text-center"
            >
              {t("resetPwRequestNew")}
            </Link>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
              {t("resetPwSuccess")}
            </p>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              {t("resetPwRedirecting")}
            </p>
          </div>
        )}

        {phase === "ready" && (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                {t("resetPwNew")}
              </span>
              <div className="relative">
                <input
                  className={`${fieldBase} pe-10`}
                  style={{
                    borderColor: errors.password ? "var(--color-danger)" : "var(--color-border)",
                  }}
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? t("authHidePassword") : t("authShowPassword")}
                  className="absolute inset-y-0 end-2 flex items-center"
                  style={{ color: "var(--color-muted)" }}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && (
                <span className="text-xs" style={{ color: "var(--color-danger)" }}>
                  {errors.password}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                {t("resetPwConfirm")}
              </span>
              <input
                className={fieldBase}
                style={{
                  borderColor: errors.confirm ? "var(--color-danger)" : "var(--color-border)",
                }}
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {errors.confirm && (
                <span className="text-xs" style={{ color: "var(--color-danger)" }}>
                  {errors.confirm}
                </span>
              )}
            </label>

            {errors.form && (
              <span className="text-xs" style={{ color: "var(--color-danger)" }}>
                {errors.form}
              </span>
            )}

            <button
              type="submit"
              disabled={busy}
              className="haven-btn mt-1 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
            >
              {busy ? t("resetPwSubmitting") : t("resetPwSubmit")}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
