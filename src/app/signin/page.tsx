"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/i18n";
import { signIn, resendConfirmation } from "@/lib/auth";

const fieldBase =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

export default function SignInPage() {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  // Resend-confirmation state — only relevant after an "email not confirmed" error.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUnconfirmed(false);
    setResent(false);
    setResendError("");
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) {
      const isUnconfirmed = res.error === "unconfirmed";
      setUnconfirmed(isUnconfirmed);
      setError(isUnconfirmed ? t("authErrUnconfirmed") : t("authErrInvalid"));
      return;
    }
    router.push("/dashboard");
  };

  const resend = async () => {
    setResending(true);
    setResendError("");
    const res = await resendConfirmation(email);
    setResending(false);
    if (res.ok) setResent(true);
    else setResendError(res.message || t("authErrInvalid"));
  };

  const errBorder = { borderColor: error ? "var(--color-danger)" : "var(--color-border)" };

  return (
    <AuthLayout title={t("signInTitle")} subtitle={t("signInSubtitle")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("emailLabel")}</span>
          <input
            className={fieldBase}
            style={errBorder}
            type="email"
            value={email}
            placeholder={t("emailPlaceholder")}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("authPassword")}</span>
          <div className="relative">
            <input
              className={`${fieldBase} pe-10`}
              style={errBorder}
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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
        </label>

        {error && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>}

        {unconfirmed && (
          resent ? (
            <span className="text-xs" style={{ color: "var(--color-primary)" }}>{t("authResendSent")}</span>
          ) : (
            <div className="flex flex-col gap-1 -mt-1">
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="self-start text-xs font-medium disabled:opacity-60"
                style={{ color: "var(--color-primary)" }}
              >
                {resending ? t("authResending") : t("authResend")}
              </button>
              {resendError && (
                <span className="text-xs" style={{ color: "var(--color-danger)" }}>{resendError}</span>
              )}
            </div>
          )
        )}

        <div className="flex justify-end -mt-1">
          <button
            type="button"
            onClick={() => setForgot(true)}
            className="text-xs font-medium"
            style={{ color: "var(--color-primary)" }}
          >
            {t("authForgot")}
          </button>
        </div>
        {forgot && (
          <span className="text-xs -mt-2" style={{ color: "var(--color-muted)" }}>{t("authForgotSoon")}</span>
        )}

        <button
          type="submit"
          disabled={busy}
          className="haven-btn mt-1 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("authSignIn")}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: "var(--color-muted)" }}>
        <Link href="/signup" className="font-medium" style={{ color: "var(--color-primary)" }}>
          {t("authNewHere")}
        </Link>
      </p>
    </AuthLayout>
  );
}
