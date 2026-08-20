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

/** base64url VAPID key → Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back it with a concrete ArrayBuffer so it satisfies BufferSource
  // (applicationServerKey) under the newer ArrayBufferLike typings.
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** ArrayBuffer subscription key → base64url string for storage. */
function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

// ---------------------------------------------------------------------------
// TEMPORARY diagnostic block — an always-available "Advanced info" section
// (collapsed by default) that shows the LIVE browser push subscription + SW
// state alongside the row(s) currently STORED for this user in the DB, so the
// two can be compared without database access. Always visible (no ?debug gate)
// because an installed iOS PWA has no address bar to add query params. Strictly
// READ-ONLY: it only calls getSubscription()/getRegistration()/matchMedia and
// SELECTs push_subscriptions — it never subscribes, resubscribes, or writes.
// Delete this component (and its <AdvancedInfo /> use below) when the push
// investigation ends.
// ---------------------------------------------------------------------------
interface DebugData {
  standalone: boolean;
  iosStandalone: boolean;
  swSupported: boolean;
  scriptURL: string | null;
  installing: string | null;
  waiting: string | null;
  active: string | null;
  endpoint: string | null;
  note: string;
}

interface StoredSub {
  endpoint: string;
  created_at: string | null;
  last_seen_at: string | null;
}

function AdvancedInfo() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DebugData | null>(null);
  const [stored, setStored] = useState<StoredSub[] | null>(null);
  const [storedErr, setStoredErr] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    // Load once, the first time the user actually expands the section — no
    // point querying the live subscription / DB for a collapsed block nobody
    // is looking at.
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    (async () => {
      const out: DebugData = {
        standalone: window.matchMedia?.("(display-mode: standalone)").matches === true,
        iosStandalone:
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
        swSupported: "serviceWorker" in navigator,
        scriptURL: null,
        installing: null,
        waiting: null,
        active: null,
        endpoint: null,
        note: "",
      };
      if (!out.swSupported) {
        out.note = "serviceWorker API not available";
        if (!cancelled) setData(out);
        return;
      }
      try {
        // navigator.serviceWorker.ready never resolves when no worker is active
        // (e.g. dev, where registration is skipped) — race it with a timeout and
        // fall back to getRegistration() so this block can't hang.
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((res) => window.setTimeout(() => res(null), 3000)),
        ]);
        const reg = readyReg ?? (await navigator.serviceWorker.getRegistration()) ?? null;
        if (!reg) {
          out.note = "no service worker registration (ready timed out)";
          if (!cancelled) setData(out);
          return;
        }
        const worker = reg.active ?? reg.waiting ?? reg.installing;
        out.scriptURL = worker?.scriptURL ?? null;
        out.installing = reg.installing?.state ?? null;
        out.waiting = reg.waiting?.state ?? null;
        out.active = reg.active?.state ?? null;
        // READ-ONLY: getSubscription() returns the existing subscription or null;
        // it NEVER creates one or writes anything.
        const sub = await reg.pushManager.getSubscription();
        out.endpoint = sub?.endpoint ?? null;
      } catch (e) {
        out.note = "error reading SW/subscription: " + (e instanceof Error ? e.message : String(e));
      }
      if (!cancelled) setData(out);

      // READ-ONLY: SELECT this user's own push_subscriptions rows (RLS-scoped —
      // the query naturally returns only rows owned by the signed-in user, same
      // as the health check above). Never inserts/updates/deletes anything.
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) {
          if (!cancelled) setStoredErr("not signed in");
          return;
        }
        const { data: rows, error: dbErr } = await supabase
          .from("push_subscriptions")
          .select("endpoint, created_at, last_seen_at")
          .eq("user_id", userId)
          .order("last_seen_at", { ascending: false, nullsFirst: false });
        if (dbErr) throw new Error(dbErr.message);
        if (!cancelled) setStored((rows ?? []) as StoredSub[]);
      } catch (e) {
        if (!cancelled) {
          setStoredErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const row = (label: string, value: string) => (
    <div>
      <span style={{ color: "var(--color-muted)" }}>{label}: </span>
      <span style={{ userSelect: "all", wordBreak: "break-all" }}>{value}</span>
    </div>
  );

  const endpointBox = (value: string) => (
    <textarea
      readOnly
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      rows={3}
      className="mt-1 w-full rounded-lg border p-2"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        fontFamily: "monospace",
        fontSize: "11px",
        resize: "vertical",
      }}
    />
  );

  return (
    <details
      className="mt-6 rounded-xl border p-3 text-xs"
      style={{ borderColor: "var(--color-border)" }}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium" style={{ color: "var(--color-muted)" }}>
        Advanced info
      </summary>
      <div className="mt-3 flex flex-col gap-5" style={{ color: "var(--color-ink)" }}>
        {/* ---- Live browser subscription ---- */}
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
            Live browser subscription
          </div>
          {row("standalone (matchMedia)", data ? String(data.standalone) : "…")}
          {row("navigator.standalone", data ? String(data.iosStandalone) : "…")}
          {row("SW scriptURL", data?.scriptURL ?? (data ? "—" : "…"))}
          {row(
            "SW states",
            data
              ? `installing=${data.installing ?? "—"} · waiting=${data.waiting ?? "—"} · active=${data.active ?? "—"}`
              : "…"
          )}
          <div>
            <span style={{ color: "var(--color-muted)" }}>push endpoint:</span>
            {data == null ? (
              <span> …</span>
            ) : data.endpoint ? (
              endpointBox(data.endpoint)
            ) : (
              <span> no subscription</span>
            )}
          </div>
          {data?.note && <div style={{ color: "var(--color-danger)" }}>{data.note}</div>}
        </div>

        {/* ---- Stored in database (push_subscriptions, this user's rows) ---- */}
        <div className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
            Stored in database
          </div>
          {stored == null && !storedErr && <span style={{ color: "var(--color-muted)" }}>…</span>}
          {storedErr && <div style={{ color: "var(--color-danger)" }}>error: {storedErr}</div>}
          {stored != null && stored.length === 0 && (
            <span style={{ color: "var(--color-muted)" }}>no rows for this user</span>
          )}
          {stored != null &&
            stored.length > 0 &&
            stored.map((r, i) => (
              <div
                key={r.endpoint + i}
                className="flex flex-col gap-1 rounded-lg border p-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span style={{ color: "var(--color-muted)" }}>
                  row {i + 1} of {stored.length} · created: {r.created_at ?? "—"} · last seen:{" "}
                  {r.last_seen_at ?? "—"}
                </span>
                {endpointBox(r.endpoint)}
              </div>
            ))}
        </div>
      </div>
    </details>
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
    // DB mirror to it, rather than trusting a possibly-dead stored row.
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    const userId = await uid();
    // Defensive: logged out (AuthGuard should prevent this) — don't render.
    if (!userId) return "hidden";

    // (5) Browser has NO active subscription. Every stored row is therefore
    // stale (nothing in this browser can match it) — purge them all and send
    // the user to Enable (D). D is the truthful state here regardless of
    // whether the purge succeeds, so a transient DB error doesn't change it.
    if (!sub) {
      try {
        const { data, error } = await supabase
          .from("push_subscriptions")
          .select("endpoint")
          .eq("user_id", userId);
        if (error) throw new Error(error.message);
        if ((data?.length ?? 0) > 0) {
          const { error: delErr } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", userId);
          if (delErr) throw new Error(delErr.message);
        }
      } catch (e) {
        console.warn("Haven: failed to purge stale push subscriptions", e);
      }
      return "enable";
    }

    // (6) Browser HAS a subscription. Reconcile it against the DB.
    try {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint")
        .eq("user_id", userId);
      if (error) throw new Error(error.message);

      // Full-string endpoint compare (endpoints can be >200 chars).
      const known = (data ?? []).some((r) => r.endpoint === sub.endpoint);
      if (known) return "on";

      // Orphaned browser subscription (endpoint rotated, or never stored):
      // adopt it with the same upsert as Enable, keeping ONLY this endpoint.
      const p256dh = arrayBufferToBase64Url(sub.getKey("p256dh"));
      const auth = arrayBufferToBase64Url(sub.getKey("auth"));
      const { error: pruneErr } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .neq("endpoint", sub.endpoint);
      if (pruneErr) throw new Error(pruneErr.message);
      const { error: upErr } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 500),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" }
      );
      if (upErr) throw new Error(upErr.message);
      return "on";
    } catch (e) {
      // Transient DB failure on a device that DOES have a live subscription:
      // keep the last-known state, never drop to Enable (D). Retries next mount.
      console.warn(
        "Haven: push subscription health check failed — keeping last state",
        e
      );
      return KEEP;
    }
  }, [uid]);

  // Initial detection + silent last_seen_at refresh when already subscribed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await detect().catch(() => "unsupported" as NotifState);
      if (cancelled) return;
      // KEEP = transient error during the health check: leave the current
      // state untouched (don't flash the user down to Enable). Every other
      // result is a real state to render.
      if (next !== KEEP) setState(next);

      // (7) On Settings mount, if this device is subscribed, bump last_seen_at
      // on the current row. Fire-and-forget; errors ignored.
      if (next === "on") {
        try {
          const userId = await uid();
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (userId && sub) {
            await supabase
              .from("push_subscriptions")
              .update({ last_seen_at: new Date().toISOString() })
              .eq("user_id", userId)
              .eq("endpoint", sub.endpoint);
          }
        } catch {
          /* silent — a stale last_seen_at is harmless */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detect, uid]);

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

      const p256dh = arrayBufferToBase64Url(sub.getKey("p256dh"));
      const auth = arrayBufferToBase64Url(sub.getKey("auth"));
      const userId = await uid();

      // Only ever keep the CURRENT browser's subscription per user. On Apple a
      // revoke+recreate changes the endpoint, so old rows accumulate and go
      // dead — prune every other endpoint before mirroring the new one.
      if (userId) {
        const { error: pruneErr } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .neq("endpoint", sub.endpoint);
        if (pruneErr) {
          console.warn("Haven: failed to prune stale push subscriptions", pruneErr);
        }
      }

      const { error: dbError } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 500),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" }
      );

      if (dbError) {
        // Roll back the browser subscription so the two sides never disagree.
        await sub.unsubscribe().catch(() => {});
        setError(t("notifError"));
        return;
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

      {/* TEMPORARY: push diagnostics, collapsed by default. Delete when the push
          investigation ends. */}
      <AdvancedInfo />
    </div>
  );
}
