"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, User, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]";

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
  const {
    hydrated,
    profileName,
    email,
    profilePhoto,
    setProfileName,
    setEmail,
    setProfilePhoto,
  } = useStore();

  const [name, setName] = useState("");
  const [mail, setMail] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the form from the store once data has hydrated.
  useEffect(() => {
    if (hydrated && !ready) {
      setName(profileName);
      setMail(email);
      setPhoto(profilePhoto);
      setReady(true);
    }
  }, [hydrated, ready, profileName, email, profilePhoto]);

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
    setEmail(mail.trim());
    setProfilePhoto(photo);
    setPassword("");
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

      <Card padding="p-8" className="haven-stagger" data-havi-role="profile">
        {/* Photo */}
        <div className="flex items-center gap-6 pb-8 border-b" style={border}>
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
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{t("profilePhoto")}</span>
            <div className="flex items-center gap-2">
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

        {/* Fields */}
        <div className="flex flex-col gap-6 pt-8">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("profileLabel")}</label>
            <input className={fieldClass} style={border} value={name} placeholder={t("profilePlaceholder")} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("emailLabel")}</label>
            <input className={fieldClass} style={border} type="email" value={mail} placeholder={t("emailPlaceholder")} onChange={(e) => setMail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("newPasswordLabel")}</label>
            <input className={fieldClass} style={border} type="password" value={password} placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <span className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{t("passwordNote")}</span>
          </div>
        </div>

        {/* Save */}
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
    </div>
  );
}
