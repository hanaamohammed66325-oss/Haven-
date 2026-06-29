"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { useT } from "@/i18n";
import { signUp } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const borderOf = (k: string) => ({ borderColor: errors[k] ? "var(--color-danger)" : "var(--color-border)" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("authErrName");
    if (!EMAIL_RE.test(email.trim())) errs.email = t("authErrEmail");
    if (password.length < 8) errs.password = t("authErrPassword");
    if (confirm !== password) errs.confirm = t("authErrMatch");
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    const res = await signUp(name, email, password);
    setBusy(false);
    if (!res.ok) {
      setErrors({ email: res.error === "exists" ? t("authErrExists") : t("authErrEmail") });
      return;
    }
    // Email confirmation is ON: do not sign the user in / redirect. Ask them to
    // confirm via the emailed link first. (If confirmation is ever turned off,
    // res.needsConfirmation will be false and we can go straight to the app.)
    if (res.needsConfirmation) {
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
