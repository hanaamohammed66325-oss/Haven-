"use client";

/**
 * InstallPrompt — "ثبّت Haven" button + platform-aware instructions.
 *
 * Copy rules: the brand is always written "Haven" in Latin script, never
 * transliterated, and all instructions use gender-neutral (masculine-default)
 * verb forms so they read naturally for any student.
 *
 * Why this exists: Chrome/Android fires a `beforeinstallprompt` event we can
 * trigger from a button. Safari on iPad/iPhone fires nothing at all — the user
 * must use Share → Add to Home Screen by hand, and almost nobody discovers
 * that on their own. Since iPad is the main device for our students, that path
 * gets explicit illustrated instructions rather than being an afterthought.
 *
 * Usage:
 *   <InstallPrompt />                     // floating pill, auto-hides once installed
 *   <InstallPrompt variant="inline" />    // plain button you can place anywhere
 */

import { useEffect, useState, useCallback } from "react";

const DISMISS_KEY = "haven_install_dismissed_at";
const DISMISS_DAYS = 14;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/** iPadOS reports itself as a Mac, so touch points are the reliable signal. */
function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIPad) return "ipad";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export default function InstallPrompt({ variant = "floating" }) {
  const [platform, setPlatform] = useState("other");
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(true); // assume yes until checked
  const [showSheet, setShowSheet] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      const days = (Date.now() - at) / 86400000;
      setDismissed(at > 0 && days < DISMISS_DAYS);
    } catch (e) {
      setDismissed(false);
    }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setShowSheet(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setShowSheet(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (e) {}
  }, []);

  const install = useCallback(async () => {
    // Android / desktop Chrome: we have a real prompt to fire
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    // Safari: no API — show the manual steps
    setShowSheet(true);
  }, [deferred]);

  // Already running as an app, or recently dismissed: show nothing
  if (installed) return null;
  if (variant === "floating" && dismissed) return null;

  const isApple = platform === "ipad" || platform === "iphone";

  return (
    <>
      {variant === "floating" ? (
        <div style={S.pill} dir="rtl">
          <button onClick={install} style={S.pillBtn}>
            ثبّت Haven على جهازك
          </button>
          <button onClick={dismiss} style={S.pillX} aria-label="إخفاء">
            ✕
          </button>
        </div>
      ) : (
        <button onClick={install} style={S.inlineBtn} dir="rtl">
          ثبّت Haven على جهازك
        </button>
      )}

      {showSheet && (
        <div style={S.backdrop} onClick={dismiss} dir="rtl">
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.title}>
              {platform === "ipad"
                ? "ثبّت Haven على الآيباد"
                : platform === "iphone"
                ? "ثبّت Haven على الآيفون"
                : "ثبّت Haven"}
            </h3>

            {isApple ? (
              <>
                <ol style={S.list}>
                  <li style={S.li}>
                    <b>افتح Haven في Safari</b>
                    <span style={S.hint}>
                      التثبيت ما يشتغل من Chrome أو أي متصفح ثاني على أجهزة Apple
                    </span>
                  </li>
                  <li style={S.li}>
                    اضغط زر المشاركة <ShareGlyph />
                    <span style={S.hint}>
                      {platform === "ipad"
                        ? "في الشريط العلوي من Safari"
                        : "في الشريط السفلي من Safari"}
                    </span>
                  </li>
                  <li style={S.li}>
                    اختر <b>«إضافة إلى الشاشة الرئيسية»</b>
                    <span style={S.hint}>انزل في القائمة لين تلقاها</span>
                  </li>
                  <li style={S.li}>
                    اضغط <b>«إضافة»</b> — بيصير Haven أيقونة على شاشتك
                  </li>
                </ol>
                <p style={S.note}>
                  بعد التثبيت تقدر تستقبل تنبيهات المواعيد، ويشتغل الموقع حتى
                  لو الشبكة ضعيفة.
                </p>
              </>
            ) : (
              <ol style={S.list}>
                <li style={S.li}>
                  افتح قائمة المتصفح <b>⋮</b>
                </li>
                <li style={S.li}>
                  اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>
                </li>
              </ol>
            )}

            <button onClick={dismiss} style={S.close}>
              تمام
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* Safari's share icon, drawn inline so it matches on every device */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      style={{ verticalAlign: "-3px", margin: "0 3px" }}
      aria-hidden="true"
    >
      <path
        d="M12 3l4 4h-3v9h-2V7H8l4-4z"
        fill="currentColor"
      />
      <path
        d="M5 11v9h14v-9h-2v7H7v-7H5z"
        fill="currentColor"
      />
    </svg>
  );
}

const S = {
  pill: {
    position: "fixed",
    insetInlineStart: 16,
    bottom: 16,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#2b3648",
    color: "#fff",
    borderRadius: 999,
    padding: "6px 8px 6px 16px",
    boxShadow: "0 6px 20px rgba(0,0,0,.18)",
    fontSize: 14,
  },
  pillBtn: {
    background: "none",
    border: "none",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
    padding: "4px 2px",
  },
  pillX: {
    background: "rgba(255,255,255,.14)",
    border: "none",
    color: "#fff",
    borderRadius: 999,
    width: 26,
    height: 26,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
  },
  inlineBtn: {
    background: "#2b3648",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 14,
    cursor: "pointer",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,20,28,.55)",
    zIndex: 70,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    background: "#fff",
    color: "#1e2733",
    borderRadius: 18,
    padding: "22px 22px 16px",
    maxWidth: 460,
    width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,.28)",
  },
  title: { margin: "0 0 14px", fontSize: 19 },
  list: { margin: 0, paddingInlineStart: 22, lineHeight: 1.9 },
  li: { marginBottom: 10, fontSize: 15 },
  hint: { display: "block", fontSize: 12.5, color: "#69747f", marginTop: 2 },
  note: {
    marginTop: 14,
    fontSize: 13,
    color: "#69747f",
    background: "#f4f6f9",
    borderRadius: 10,
    padding: "10px 12px",
  },
  close: {
    marginTop: 16,
    width: "100%",
    background: "#2b3648",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "11px 0",
    fontSize: 15,
    cursor: "pointer",
  },
};
