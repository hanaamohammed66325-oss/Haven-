"use client";

import { useState } from "react";
import { Loader2, FlaskConical, Lock } from "lucide-react";
import { Logo } from "./Logo";
import { useT } from "@/i18n";
import { useSubscription } from "@/lib/subscription";
import { isVip, isBetaTester } from "@/lib/premium";
import { activateBetaCode } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { TranslationKey } from "@/i18n/translations/en";

export function BetaGate({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const { profile, loading, refresh } = useSubscription();

  const [code, setCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (loading) return null;

  if (isVip(profile) || isBetaTester(profile)) {
    return <>{children}</>;
  }

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setActivating(true);
    const res = await activateBetaCode(code);
    setActivating(false);
    if (res.ok) {
      setSuccess(true);
      await refresh();
    } else {
      const errKey = `betaErr_${res.error}` as TranslationKey;
      setError(t(errKey) !== errKey ? t(errKey) : t("betaErrGeneric"));
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (success) return null;

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-6"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-5">
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{
              width: 64,
              height: 64,
              background: "var(--color-primary-soft)",
            }}
          >
            <Lock size={28} style={{ color: "var(--color-primary)" }} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-2">
          <Logo size={24} mono />
          <span
            className="font-display text-xl"
            style={{ color: "var(--color-ink)" }}
          >
            Haven
          </span>
        </div>

        <h1
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--color-ink)" }}
        >
          {t("betaGateTitle")}
        </h1>
        <p
          className="text-[14px] leading-relaxed mb-6"
          style={{ color: "var(--color-muted)" }}
        >
          {t("betaGateDesc")}
        </p>

        <form onSubmit={handleActivate} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="HVN-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="haven-input flex-1 text-center tracking-widest font-mono"
              style={{ letterSpacing: "0.1em" }}
              dir="ltr"
            />
            <button
              type="submit"
              disabled={activating || !code.trim()}
              className="haven-btn rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {activating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FlaskConical size={16} />
              )}
              {t("betaActivate")}
            </button>
          </div>
          {error && (
            <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 text-[13px] font-medium"
          style={{
            color: "var(--color-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {t("betaGateSignOut")}
        </button>
      </div>
    </div>
  );
}
