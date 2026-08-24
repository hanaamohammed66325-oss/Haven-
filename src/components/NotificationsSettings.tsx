"use client";

// ---------------------------------------------------------------------------
// Notifications — Web Push subscribe / unsubscribe (Phase 1: storage only).
//
// This phase ONLY manages the browser PushSubscription and mirrors it into
// public.push_subscriptions. It does NOT send anything and does NOT add a push
// handler to the service worker — that's Phase 2. Notifications are FREE: there
// is intentionally no premium/ENFORCE_PREMIUM check anywhere in here.
//
// The site is a static export, so everything is client-side. The service worker
// was already registered during the PWA work; we only read its registration.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useT } from "@/i18n";
import {
  PUSH_ENABLED_KEY,
  urlBase64ToUint8Array,
  mirrorSubscription,
  reconcilePushSubscription,
} from "@/lib/pushHealthCheck";

// Inlined at build time by Next for NEXT_PUBLIC_* vars. Missing → treated as
// "unsupported" (state A) with a clear console error, never a crash.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type NotifState =
  | "checking" // initial async detection in flight
  | "hidden" // defensive: logged out — render nothing (normally AuthGuard prevents this)
  | "unsupported" // A: no Notification / SW / PushManager / VAPID key
  | "ios-install" // B: iOS/iPadOS in a browser tab, not installed to Home Screen
  | "blocked" // C: permission denied
  | "enable" // D: default, or granted-but-not-subscribed-on-this-device
  | "on"; // E: granted AND this device's subscription is stored

// Sentinel returned by the health check when a transient error means we should
// NOT change what the user is seeing (never flip a working device down to D).
const KEEP = "keep" as const;

/** True on iPhone/iPad, including iPadOS desktop-mode (reports as a Mac). */
function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  );
}

/** True when running as an installed PWA (standalone display). */
function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function NotificationsSettings() {
  const { t, lang } = useT();
  const [state, setState] = useState<NotifState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Send-test-notification (state E only).
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testErr, setTestErr] = useState("");
  const uidRef = useRef<string | null>(null);

  const uid = useCallback(async (): Promise<string | null> => {
    if (uidRef.current) return uidRef.current;
    const { data } = await supabase.auth.getUser();
    uidRef.current = data.user?.id ?? null;
    return uidRef.current;
  }, []);

  /**
   * Work out which of A–E to show. Order note: the spec lists A (unsupported)
   * before B (iOS-not-installed), but iOS Safari hides Notification/PushManager
   * until the app is installed — so strict A-first would send every iOS tab to
   * the dead-end "unsupported" message and B would be unreachable. We therefore
   * check the iOS-not-installed case FIRST, so those users get the actionable
   * "add to Home Screen" message instead. On every other platform the order is
   * moot (A's conditions and B's are disjoint).
   */
  const detect = useCallback(async (): Promise<NotifState | typeof KEEP> => {
    if (!VAPID_PUBLIC_KEY) {
      console.error(
        "Haven: NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — notifications are unavailable."
      );
    }

    // B before A (see note above).
    if (isAppleMobile() && !isStandalone()) return "ios-install";

    const hasApis =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      !!VAPID_PUBLIC_KEY;
    if (!hasApis) return "unsupported";

    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission === "default") return "enable";

    // --- Granted: run the subscription HEALTH CHECK -------------------------
    // The stored row can silently outlive the real subscription (Apple accepts
    // sends with 2xx but delivers nothing after a silent revoke). So we trust
    // the BROWSER's live subscription as the source of truth and reconcile the
    // DB mirror to it, rather than trusting a possibly-dead stored row. This is
    // the same reconciliation the silent auto-heal runs on every app open (see
    // @/lib/pushHealthCheck) — allowResubscribe:false here because a Settings
    // visit should show the Enable button rather than silently act for the
    // user; last_seen_at is bumped as part of the "already known" branch.
    // `serviceWorker.ready` NEVER resolves when no worker ever activates — and
    // RegisterSW swallows registration failures, so a bad deploy (404 on
    // /sw.js) left this section stuck on its spinner forever: no message, no
    // Enable button, no error. Race it with a timeout, same as the auto-heal.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000)),
    ]);
    if (!reg) return "unsupported";
    const sub = await reg.pushManager.getSubscription();

    const userId = await uid();
    // Defensive: logged out (AuthGuard should prevent this) — don't render.
    if (!userId) return "hidden";

    const result = await reconcilePushSubscription(userId, reg, sub, { allowResubscribe: false });
    if (!result.ok) {
      // Transient failure: keep the last-known state, never drop to Enable
      // (D). Retries next mount.
      return KEEP;
    }
    return result.subscribed ? "on" : "enable";
  }, [uid]);

  // Initial detection on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await detect().catch(() => "unsupported" as NotifState);
      if (cancelled) return;
      // KEEP = transient error during the health check: leave the current
      // state untouched (don't flash the user down to Enable). Every other
      // result is a real state to render.
      if (next !== KEEP) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [detect]);

  const enable = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // Denied → C; dismissed ('default') → stay on D.
        setState(permission === "denied" ? "blocked" : "enable");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      });

      const userId = await uid();
      if (!userId) {
        await sub.unsubscribe().catch(() => {});
        setError(t("notifError"));
        return;
      }

      // Prune every other endpoint for this user and mirror this one — the
      // same helper the silent auto-heal uses (@/lib/pushHealthCheck), so the
      // DB write can never drift between the two call sites.
      const mirrored = await mirrorSubscription(userId, sub);
      if (!mirrored.ok) {
        // Roll back the browser subscription so the two sides never disagree.
        await sub.unsubscribe().catch(() => {});
        setError(t("notifError"));
        return;
      }
      // Record that THIS device opted in, so the silent auto-heal (run on
      // every app open) knows it's safe to self-heal a future silent revoke.
      try {
        localStorage.setItem(PUSH_ENABLED_KEY, "1");
      } catch {
        /* ignore */
      }
      setState("on");
    } catch (e) {
      console.error("Haven: failed to enable notifications", e);
      setError(t("notifError"));
    } finally {
      setBusy(false);
    }
  }, [t, uid]);

  const disable = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const userId = await uid();
        const { error: dbError } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId as string)
          .eq("endpoint", endpoint);
        if (dbError) throw new Error(dbError.message);
      }
      // Explicit opt-out: the silent auto-heal must never resubscribe this
      // device on its own after the user turned notifications off here.
      try {
        localStorage.setItem(PUSH_ENABLED_KEY, "0");
      } catch {
        /* ignore */
      }
      setState("enable");
    } catch (e) {
      console.error("Haven: failed to disable notifications", e);
      setError(t("notifError"));
      // Do NOT flip to "enable" — the state is unchanged so the user can retry.
    } finally {
      setBusy(false);
    }
  }, [t, uid]);

  // Send a real push to every device this user has enabled (via the test-push
  // Edge Function — the static site has no server to sign VAPID requests).
  const sendTest = useCallback(async () => {
    setTestMsg("");
    setTestErr("");
    setTesting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("test-push", {
        body: { locale: lang },
      });
      const sent = (data as { sent?: number } | null)?.sent ?? 0;
      const cleaned = (data as { cleaned?: number } | null)?.cleaned ?? 0;
      if (fnError || sent === 0) {
        setTestErr(t("notifError"));
        return;
      }
      let msg = t("notifSentToast", { n: sent });
      if (cleaned > 0) msg += t("notifCleanedSuffix", { n: cleaned });
      setTestMsg(msg);
    } catch (e) {
      console.error("Haven: failed to send test notification", e);
      setTestErr(t("notifError"));
    } finally {
      setTesting(false);
    }
  }, [lang, t]);

  // Health check in flight (on iOS PWA first mount, serviceWorker.ready can take
  // 1–2s). Show a subtle spinner rather than committing to A–E prematurely.
  if (state === "checking") {
    return (
      <div className="flex items-center h-6" aria-live="polite" aria-busy="true">
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-muted)" }} />
      </div>
    );
  }

  // Defensive: logged out — the whole section renders nothing.
  if (state === "hidden") return null;

  const infoText =
    state === "unsupported"
      ? t("notifUnsupported")
      : state === "ios-install"
        ? t("notifIosInstall")
        : state === "blocked"
          ? t("notifBlocked")
          : null;

  return (
    <div className="flex flex-col gap-3">
      {infoText && (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          {infoText}
        </p>
      )}

      {state === "enable" && (
        <button
          onClick={enable}
          disabled={busy}
          className="haven-btn inline-flex items-center gap-2 self-start px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
        >
          <Bell size={16} />
          {busy ? t("notifEnabling") : t("notifEnable")}
        </button>
      )}

      {state === "on" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            {t("notifOn")}
          </p>
          <button
            onClick={disable}
            disabled={busy || testing}
            className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
          >
            {busy ? t("notifDisabling") : t("notifDisable")}
          </button>

          {/* Secondary/muted action — deliberately less prominent than Disable. */}
          <button
            onClick={sendTest}
            disabled={testing || busy}
            className="self-start text-xs font-medium underline underline-offset-2 transition-colors disabled:opacity-60"
            style={{ color: "var(--color-muted)" }}
          >
            {testing ? t("notifSending") : t("notifSendTest")}
          </button>
          {testMsg && (
            <p className="text-xs" style={{ color: "var(--color-primary)" }}>
              {testMsg}
            </p>
          )}
          {testErr && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {testErr}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
