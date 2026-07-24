"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/i18n";
import { signUp, signIn, verifySignupOtp, resendConfirmation, PENDING_SIGNUP_KEY } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Simple, permissive email check: something@something.something (no spaces).
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const fieldBase =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

export default function SignUpPage() {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const borderOf = (k: string) => ({ borderColor: errors[k] ? "var(--color-danger)" : "var(--color-border)" });

  // Clear the pending-signup flag and go straight to the app. Called from the
  // OTP verify path and from the poller (both establish a session on THIS tab).
  const finishSignedIn = () => {
    try {
      localStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch {
      // ignore
    }
    router.replace("/dashboard");
  };

  // Once the "check your email" screen is showing, poll for the account being
  // confirmed. Confirmation may happen on a DIFFERENT device (the email link
  // opened on a phone), so getSession() on THIS device would stay null forever.
  // Instead we retry signIn() with the retained credentials: it fails with
  // "email not confirmed" until the account is confirmed, then succeeds and
  // establishes the session here — advancing this tab. Polls every 4s, also
  // listens for the sign-in event, stops on unmount, and after 5 minutes gives
  // up (pollTimedOut) instead of spinning forever.
  useEffect(() => {
    if (!confirmSent) return;
    let redirected = false;
    let ticks = 0;
    const go = () => {
      if (redirected) return;
      redirected = true;
      finishSignedIn();
    };
    const check = async () => {
      ticks += 1;
      console.debug(`[signup] confirmation poll #${ticks}`);
      try {
        const res = await signIn(email, password);
        if (res.ok) {
          go();
          return;
        }
        // "unconfirmed" is the expected, quiet case while we wait; surface anything else.
        if (res.error !== "unconfirmed") {
          console.error("[signup] confirmation poll sign-in failed:", res.error, res.message);
        }
      } catch (err) {
        console.error("[signup] confirmation poll threw:", err);
      }
    };
    const interval = setInterval(check, 4000);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });
    check(); // check immediately too
    const cap = setTimeout(() => {
      clearInterval(interval);
      sub.subscription.unsubscribe();
      setPollTimedOut(true);
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(cap);
      sub.subscription.unsubscribe();
    };
  }, [confirmSent, email, password, router]);

  // Tick the "resend code" cooldown down to zero, one second at a time.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (token.length !== 6) {
      setOtpError(t("authOtpError"));
      return;
    }
    setVerifying(true);
    setOtpError("");
    const res = await verifySignupOtp(email, token);
    setVerifying(false);
    if (!res.ok) {
      setOtpError(t("authOtpError"));
      return;
    }
    finishSignedIn();
  };

  const resendCode = async () => {
    if (resendBusy || resendCooldown > 0) return;
    setResendBusy(true);
    setOtpError("");
    await resendConfirmation(email);
    setResendBusy(false);
    setResendCooldown(60);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("authErrName");
    if (!isValidEmail(email)) errs.email = t("authErrEmail");
    if (password.length < 8) errs.password = t("authErrPassword");
    if (confirm !== password) errs.confirm = t("authErrMatch");
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;

    setBusy(true);
    const res = await signUp(name, email, password);
    setBusy(false);
    if (!res.ok) {
      // The email already passed our client check, so only blame the email field
      // when the server specifically reports the address as invalid or taken.
      // Other failures (e.g. rate limits) show their real message instead of a
      // misleading "invalid email".
      if (res.error === "exists") {
        setErrors({ email: t("authEmailRegistered") });
      } else if (/email/i.test(res.message) && /invalid|valid/i.test(res.message)) {
        setErrors({ email: t("authErrEmail") });
      } else {
        setFormError(res.message || t("authErrEmail"));
      }
      return;
    }
    // Email confirmation is ON: do not sign the user in / redirect. Ask them to
    // confirm via the emailed link first. (If confirmation is ever turned off,
    // res.needsConfirmation will be false and we can go straight to the app.)
    if (res.needsConfirmation) {
      // Mark THIS device as the one that started signup, so the email-link
      // landing page can tell "same device" from "opened on another device".
      try {
        localStorage.setItem(PENDING_SIGNUP_KEY, email.trim());
      } catch {
        // ignore — the OTP code path still works without the flag
      }
      setConfirmSent(true);
      return;
    }
    router.push("/dashboard");
  };

  if (confirmSent) {
    return (
      <AuthLayout title={t("signUpTitle")} subtitle={t("signUpSubtitle")}>
        <div
          className="rounded-xl border px-4 py-4 text-sm leading-relaxed"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-primary-soft)",
            color: "var(--color-ink)",
          }}
        >
          {t("authCheckEmail")}
        </div>

        {/* 6-digit code — the reliable path. Typed here (on the device where you
            signed up) it signs you in on THIS device, even if the email link was
            opened elsewhere. */}
        <form onSubmit={verifyCode} className="mt-5 flex flex-col gap-2">
          <label htmlFor="signup-otp" className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            {t("authOtpLabel")}
          </label>
          <input
            id="signup-otp"
            className={`${fieldBase} text-center text-lg font-semibold tracking-[0.5em]`}
            style={{ borderColor: otpError ? "var(--color-danger)" : "var(--color-border)" }}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setOtpError("");
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="------"
            aria-label={t("authOtpLabel")}
          />
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>{t("authOtpHint")}</span>
          {otpError && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{otpError}</span>}
          <button
            type="submit"
            disabled={verifying || code.length !== 6}
            className="haven-btn mt-1 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
          >
            {verifying ? t("authOtpVerifying") : t("authOtpVerify")}
          </button>
        </form>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={resendCode}
            disabled={resendBusy || resendCooldown > 0}
            className="text-xs font-medium disabled:opacity-60"
            style={{ color: "var(--color-primary)" }}
          >
            {resendCooldown > 0
              ? t("authResendCooldown", { n: resendCooldown })
              : resendBusy
                ? t("authResending")
                : t("authResendCode")}
          </button>
        </div>

        <p
          className="text-center text-xs mt-5"
          style={{ color: pollTimedOut ? "var(--color-danger)" : "var(--color-muted)" }}
        >
          {pollTimedOut ? (
            <>
              {t("authWaitingTimeout")}{" "}
              <Link href="/signin" className="font-medium" style={{ color: "var(--color-primary)" }}>
                {t("welcomeGoToSignin")}
              </Link>
            </>
          ) : (
            t("authWaitingConfirm")
          )}
        </p>

        <p className="text-center text-sm mt-6" style={{ color: "var(--color-muted)" }}>
          <Link href="/signin" className="font-medium" style={{ color: "var(--color-primary)" }}>
            {t("authHaveAccount")}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("signUpTitle")} subtitle={t("signUpSubtitle")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t("authName")}>
          <input
            className={fieldBase}
            style={borderOf("name")}
            value={name}
            placeholder={t("authNamePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          <FieldError msg={errors.name} />
        </Field>

        <Field label={t("emailLabel")}>
          <input
            className={fieldBase}
            style={borderOf("email")}
            type="email"
            value={email}
            placeholder={t("emailPlaceholder")}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <FieldError msg={errors.email} />
        </Field>

        <Field label={t("authPassword")}>
          <div className="relative">
            <input
              className={`${fieldBase} pe-10`}
              style={borderOf("password")}
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
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
          <FieldError msg={errors.password} />
        </Field>

        <Field label={t("authConfirmPassword")}>
          <input
            className={fieldBase}
            style={borderOf("confirm")}
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          <FieldError msg={errors.confirm} />
        </Field>

        {formError && (
          <span className="text-xs" style={{ color: "var(--color-danger)" }}>{formError}</span>
        )}

        <button
          type="submit"
          disabled={busy}
          className="haven-btn mt-1 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("authCreateAccount")}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: "var(--color-muted)" }}>
        <Link href="/signin" className="font-medium" style={{ color: "var(--color-primary)" }}>
          {t("authHaveAccount")}
        </Link>
      </p>
    </AuthLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="text-xs mt-0.5" style={{ color: "var(--color-danger)" }}>{msg}</span>;
}
