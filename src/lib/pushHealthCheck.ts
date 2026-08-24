// ---------------------------------------------------------------------------
// Shared push-subscription reconciliation, used by BOTH:
//  - NotificationsSettings.tsx's own health check (visible UI states A–E), and
//  - the silent auto-heal run once per app session (see runPushAutoHeal below).
//
// Single source of truth so the two call sites can never drift: the DB mirror
// of a device's live PushSubscription is always built/repaired the same way,
// whether the user is looking at Settings or just opened the app.
//
// Why auto-heal exists: iOS periodically invalidates a push subscription
// silently (no event fires, and Apple's gateway keeps accepting 2xx for a
// while after the fact). Previously the DB mirror was only repaired when the
// user happened to visit Settings, so a subscription could sit dead for days.
// runPushAutoHeal() re-runs the same reconciliation on every app open instead.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";

// Inlined at build time by Next for NEXT_PUBLIC_* vars.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Per-device flag recording whether the user has opted into push on THIS
// browser. Written "1" by enable() and "0" by disable() (see
// NotificationsSettings.tsx). Deliberately three-state via absence: a value
// of "0" is the ONLY thing that skips auto-heal — an absent key means either
// "never used this feature" (Notification.permission won't be 'granted' in
// that case, so auto-heal already bails earlier) or "enabled on this device
// before this flag existed," and both are safe to check and self-heal.
export const PUSH_ENABLED_KEY = "haven-push-enabled";

/** base64url VAPID key → Uint8Array for applicationServerKey. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
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
export function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const setPushEnabledFlag = () => {
  try {
    localStorage.setItem(PUSH_ENABLED_KEY, "1");
  } catch {
    /* ignore */
  }
};

/**
 * Mirror a live PushSubscription into push_subscriptions. Multi-device: we
 * only prune stale endpoints for THIS device (same user_agent, different
 * endpoint — happens when Apple revoke+recreate rotates it), NOT for other
 * devices. Dead endpoints on other devices get cleaned up by send-user-push
 * when the gateway returns 404/410. Used by enable(), the orphan-adopt
 * branch below, and the silent resubscribe branch below.
 */
export async function mirrorSubscription(
  userId: string,
  sub: PushSubscription
): Promise<{ ok: boolean }> {
  try {
    const p256dh = arrayBufferToBase64Url(sub.getKey("p256dh"));
    const auth = arrayBufferToBase64Url(sub.getKey("auth"));
    const ua = navigator.userAgent.slice(0, 500);
    // Prune only rows from THIS SAME device (same user_agent) whose endpoint
    // has rotated. Leaves OTHER devices' rows untouched.
    const { error: pruneErr } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("user_agent", ua)
      .neq("endpoint", sub.endpoint);
    if (pruneErr) throw new Error(pruneErr.message);
    const { error: upErr } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        user_agent: ua,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  } catch (e) {
    console.warn("Haven: failed to mirror push subscription", e);
    return { ok: false };
  }
}

/** Delete every stored row for this user — nothing in this browser can match
 *  them once the live subscription is gone and can't be silently replaced. */
async function purgeAllSubscriptions(userId: string): Promise<{ ok: boolean }> {
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
    return { ok: true };
  } catch (e) {
    console.warn("Haven: failed to purge stale push subscriptions", e);
    return { ok: false };
  }
}

export interface ReconcileResult {
  /** false = a transient failure occurred; caller should not change UI state */
  ok: boolean;
  /** true = this device now has a live, DB-mirrored subscription */
  subscribed: boolean;
}

/**
 * Core reconciliation: trusts the BROWSER's live subscription as the source of
 * truth and repairs the DB mirror to match it (Apple accepts sends with 2xx
 * but silently stops delivering after a revoke, so a stored row can outlive
 * the real subscription).
 *
 * Caller must have already confirmed Notification.permission === 'granted'.
 *
 *  - No live subscription:
 *      - `allowResubscribe: false` (Settings' own health check) — purge every
 *        stored row and report `subscribed: false`, so the UI shows Enable.
 *      - `allowResubscribe: true` (silent auto-heal) — also try to silently
 *        re-subscribe. Permission is already granted, so `subscribe()` never
 *        prompts. On success, mirror the fresh subscription; on failure, fall
 *        back to the same purge as above.
 *  - Live subscription present: adopt it if the DB doesn't know it yet
 *    (endpoint rotated, or never stored), otherwise just bump `last_seen_at`.
 */
export async function reconcilePushSubscription(
  userId: string,
  reg: ServiceWorkerRegistration,
  sub: PushSubscription | null,
  opts: { allowResubscribe: boolean }
): Promise<ReconcileResult> {
  if (!sub) {
    if (opts.allowResubscribe && VAPID_PUBLIC_KEY) {
      try {
        const fresh = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const mirrored = await mirrorSubscription(userId, fresh);
        if (mirrored.ok) {
          setPushEnabledFlag();
          return { ok: true, subscribed: true };
        }
        // DB write failed after a fresh subscribe — roll back so the browser
        // and the DB never disagree, matching enable()'s own rollback.
        await fresh.unsubscribe().catch(() => {});
      } catch (e) {
        console.warn("Haven: silent push resubscribe failed", e);
      }
    }
    const purged = await purgeAllSubscriptions(userId);
    return { ok: purged.ok, subscribed: false };
  }

  // Live subscription present — reconcile it against the DB.
  try {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    // Full-string endpoint compare (endpoints can be >200 chars).
    const known = (data ?? []).some((r) => r.endpoint === sub.endpoint);
    if (known) {
      // Cheap freshness signal, fire-and-forget-safe (errors don't matter).
      await supabase
        .from("push_subscriptions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("endpoint", sub.endpoint);
      setPushEnabledFlag();
      return { ok: true, subscribed: true };
    }

    // Orphaned browser subscription: adopt it, keeping ONLY this endpoint.
    const mirrored = await mirrorSubscription(userId, sub);
    if (!mirrored.ok) return { ok: false, subscribed: true };
    setPushEnabledFlag();
    return { ok: true, subscribed: true };
  } catch (e) {
    // Transient DB failure on a device that DOES have a live subscription:
    // report failure so the caller keeps its last-known state.
    console.warn("Haven: push subscription health check failed", e);
    return { ok: false, subscribed: true };
  }
}

// ---------------------------------------------------------------------------
// Silent auto-heal — call once per app session from a top-level authenticated
// component (AppShell). Never throws, never prompts, never touches the UI.
// ---------------------------------------------------------------------------

const THROTTLE_KEY = "haven-push-healthcheck-at";
// A handful of times a day at most — comfortably closes a days-long gap
// without adding meaningful traffic, and far below "every route change."
const THROTTLE_MS = 6 * 60 * 60 * 1000;

/**
 * Silently re-runs the same reconciliation as the Settings health check, but
 * also allows a silent resubscribe when the live subscription is gone. Safe
 * to call on every app load: bails immediately (no network, no side effects)
 * for anyone who never enabled notifications, anyone who explicitly disabled
 * them, and anyone whose device was checked within the last few hours.
 */
export async function runPushAutoHeal(): Promise<void> {
  try {
    if (!VAPID_PUBLIC_KEY) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }
    // Never prompts: only proceeds when permission was already decided.
    if (Notification.permission !== "granted") return;
    // Explicit opt-out only (see PUSH_ENABLED_KEY doc comment above).
    if (localStorage.getItem(PUSH_ENABLED_KEY) === "0") return;

    const last = Number(localStorage.getItem(THROTTLE_KEY) || 0);
    if (Date.now() - last < THROTTLE_MS) return;
    // Mark BEFORE awaiting anything, so an overlapping call (e.g. React
    // StrictMode's double-invoke in dev) can't run the check twice.
    localStorage.setItem(THROTTLE_KEY, String(Date.now()));

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    // serviceWorker.ready never resolves when no worker is active (e.g. dev,
    // where registration is skipped) — race it with a timeout so this can
    // never hang the session.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000)),
    ]);
    if (!reg) return;

    const sub = await reg.pushManager.getSubscription();
    await reconcilePushSubscription(userId, reg, sub, { allowResubscribe: true });
  } catch (e) {
    console.warn("Haven: push auto-heal failed", e);
  }
}
