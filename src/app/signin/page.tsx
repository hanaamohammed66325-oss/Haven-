"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/i18n";
import { signIn } from "@/lib/auth";

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error === "unconfirmed" ? t("authErrUnconfirmed") : t("authErrInvalid"));
      return;
    }
    router.push("/dashboard");
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
