"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, User, Trash2, Mail, Lock } from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import { PENDING_EMAIL_CHANGE_KEY } from "@/lib/auth";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { useSubscription } from "@/lib/subscription";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { SubscriptionSection } from "@/components/SubscriptionSection";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

const CHANGE_PASSWORD_URL = `${SUPABASE_URL}/functions/v1/change-password`;
const CHANGE_EMAIL_URL = `${SUPABASE_URL}/functions/v1/change-email`;

// Downscale + compress an uploaded image so it fits comfortably in localStorage.
function resizeImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { t } = useT();
  const router = useRouter();
  const { refresh } = useSubscription();
  const {
    hydrated,
    profileName,
    email,
    profilePhoto,
    setProfileName,
    setProfilePhoto,
  } = useStore();

  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [trialToast, setTrialToast] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Returning from checkout: /profile?subscribed=1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscribed") === "1") {
      refresh();
      setTrialToast(true);
      router.replace("/profile");
    }
  }, [refresh, router]);

  useEffect(() => {
    if (!trialToast) return;
    const id = window.setTimeout(() => setTrialToast(false), 6000);
    return () => window.clearTimeout(id);
  }, [trialToast]);

  useEffect(() => {
    if (hydrated && !ready) {
      setName(profileName);
      setPhoto(profilePhoto);
      setReady(true);
    }
  }, [hydrated, ready, profileName, profilePhoto]);

  if (!hydrated) return <div className="h-40" />;

  const border = { borderColor: "var(--color-border)" };
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await resizeImage(file));
    } catch {
      // ignore unreadable image
    }
    e.target.value = "";
  }

  function save() {
    setProfileName(name.trim());
    setProfilePhoto(photo);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="haven-fade-in max-w-2xl">
      <h1 className="font-display text-[34px] leading-tight" style={{ color: "var(--color-ink)" }}>
        {t("profileTitle")}
      </h1>
      <p className="text-[15px] mt-3 mb-12" style={{ color: "var(--color-muted)" }}>
        {t("profileSubtitle")}
      </p>

      <Card padding="p-5 sm:p-8" className="haven-stagger" data-havi-role="profile">
        {/* Photo */}
        <div className="flex items-center gap-4 sm:gap-6 pb-8 border-b" style={border}>
          <span
            className="flex items-center justify-center rounded-full shrink-0 overflow-hidden"
            style={{ width: 76, height: 76, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : initial ? (
              <span className="font-display text-2xl">{initial}</span>
            ) : (
              <User size={28} />
            )}
          </span>
          <div className="flex flex-col gap-2 min-w-0">
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{t("profilePhoto")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
              >
                <Camera size={15} />
                {photo ? t("changePhoto") : t("uploadPhoto")}
              </button>
              {photo && (
                <button
                  onClick={() => setPhoto(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-black/5"
                  style={{ color: "var(--color-muted)" }}
                >
                  <Trash2 size={15} />
                  {t("remove")}
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </div>

        {/* Name field */}
        <div className="flex flex-col gap-6 pt-8">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("profileLabel")}</label>
            <input className={fieldClass} style={border} value={name} placeholder={t("profilePlaceholder")} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {/* Save name */}
        <div className="flex items-center justify-end gap-3 pt-8">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--color-success)" }}>
              <Check size={15} />
              {t("savedToast")}
            </span>
          )}
          <button onClick={save} className="haven-btn px-6 py-2.5 rounded-xl text-sm font-medium">
            {t("save")}
          </button>
        </div>
      </Card>

      {/* Sign-in & security — email + password change */}
      <div className="mt-8">
        <h2 className="font-display text-lg mb-4" style={{ color: "var(--color-ink)" }}>
          {t("accountSecurityHeading")}
        </h2>
        <Card padding="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 pb-5 border-b" style={border}>
            <div className="min-w-0">
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{t("emailLabel")}</div>
              <div className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }} dir="ltr">
                {email || "—"}
              </div>
            </div>
            <button
              onClick={() => setEmailOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors shrink-0"
              style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
            >
              <Mail size={14} />
              <span className="hidden sm:inline">{t("changeEmailBtn")}</span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 pt-5">
            <div className="min-w-0">
              <div className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{t("newPasswordLabel")}</div>
              <div className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>••••••••</div>
            </div>
            <button
              onClick={() => setPasswordOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors shrink-0"
              style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
            >
              <Lock size={14} />
              <span className="hidden sm:inline">{t("changePasswordBtn")}</span>
            </button>
          </div>
        </Card>
      </div>

      {/* Subscription management */}
      <SubscriptionSection />

      {/* Modals */}
      <ChangeEmailModal open={emailOpen} onClose={() => setEmailOpen(false)} />
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />

      {/* Trial-activated confirmation */}
      {trialToast && (
        <div
          className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
          style={{ background: "var(--color-ink)", color: "#fff" }}
          role="status"
        >
          <Check size={16} strokeWidth={3} style={{ color: "var(--color-brass)" }} />
          {t("trialActivated")}
        </div>
      )}
    </div>
  );
}

/* ---------- Change-email modal ---------- */
function ChangeEmailModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const [pw, setPw] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setPw(""); setNewEmail(""); setError(""); setSuccess(false); setLoading(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!pw) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError(t("errInvalidEmail")); return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(t("errUnknown")); setLoading(false); return; }
      const res = await fetch(CHANGE_EMAIL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ current_password: pw, new_email: newEmail.trim().toLowerCase() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) {
        // Mark this device as the initiator so /email-changed can distinguish
        // same-device vs other-device when the confirmation link is opened.
        try {
          localStorage.setItem(PENDING_EMAIL_CHANGE_KEY, newEmail.trim().toLowerCase());
        } catch {
          // ignore
        }
        setSuccess(true);
      } else {
        const code = String(j?.error ?? "");
        if (code === "wrong_current_password") setError(t("errWrongPassword"));
        else if (code === "invalid_email") setError(t("errInvalidEmail"));
        else if (code === "same_email") setError(t("errSameEmail"));
        else if (code === "email_taken") setError(t("errEmailTaken"));
        else setError(t("errUnknown"));
      }
    } catch {
      setError(t("errUnknown"));
    }
    setLoading(false);
  }

  if (success) {
    return (
      <Modal open={open} onClose={onClose} title={t("changeEmailSuccessTitle")}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {t("changeEmailSuccessBody")}
        </p>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="haven-btn px-6 py-2.5 rounded-xl text-sm font-medium">
            {t("close")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={t("changeEmailTitle")}>
      <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--color-muted)" }}>
        {t("changeEmailIntro")}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("currentPasswordLabel")}</label>
          <input
            type="password"
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            className={fieldClass}
            style={{ borderColor: "var(--color-border)" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("newEmailLabel")}</label>
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
            className={fieldClass}
            style={{ borderColor: "var(--color-border)" }}
            dir="ltr"
          />
        </div>
        {error && (
          <p className="text-xs" style={{ color: "#c0392b" }}>{error}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ color: "var(--color-muted)" }}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={loading} className="haven-btn px-6 py-2.5 rounded-xl text-sm font-medium">
            {loading ? "…" : t("changeEmailSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Change-password modal ---------- */
function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrent(""); setNext(""); setConfirm(""); setError(""); setSuccess(false); setLoading(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!current) return;
    if (next.length < 8 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/[0-9]/.test(next)) { setError(t("errPasswordTooShort")); return; }
    if (next !== confirm) { setError(t("errPasswordsDontMatch")); return; }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(t("errUnknown")); setLoading(false); return; }
      const res = await fetch(CHANGE_PASSWORD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) {
        setSuccess(true);
      } else {
        const code = String(j?.error ?? "");
        if (code === "wrong_current_password") setError(t("errWrongPassword"));
        else if (code === "weak_password") setError(t("errPasswordTooShort"));
        else setError(t("errUnknown"));
      }
    } catch {
      setError(t("errUnknown"));
    }
    setLoading(false);
  }

  if (success) {
    return (
      <Modal open={open} onClose={onClose} title={t("changePasswordTitle")}>
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
          <Check size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm leading-relaxed">{t("changePasswordSuccess")}</p>
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="haven-btn px-6 py-2.5 rounded-xl text-sm font-medium">
            {t("close")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={t("changePasswordTitle")}>
      <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--color-muted)" }}>
        {t("changePasswordIntro")}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("currentPasswordLabel")}</label>
          <input
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={fieldClass}
            style={{ borderColor: "var(--color-border)" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("newPasswordLabel")}</label>
          <input
            type="password"
            required
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={fieldClass}
            style={{ borderColor: "var(--color-border)" }}
          />
          <span className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{t("passwordMinHint")}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("confirmPasswordLabel")}</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={fieldClass}
            style={{ borderColor: "var(--color-border)" }}
          />
        </div>
        {error && (
          <p className="text-xs" style={{ color: "#c0392b" }}>{error}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ color: "var(--color-muted)" }}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={loading} className="haven-btn px-6 py-2.5 rounded-xl text-sm font-medium">
            {loading ? "…" : t("changePasswordSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
