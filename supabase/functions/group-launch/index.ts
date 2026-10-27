// Authenticated launch preparation and bounded scheduled delivery.
// Uses the existing scheduler bearer and locked app_config persistence.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { GROUP_LAUNCH_ID, GROUP_LAUNCH_TEMPLATE, GROUP_LAUNCH_STARTS_AT, GROUP_LAUNCH_EXPIRES_AT, GROUP_LAUNCH_SCHEDULE_KEY, groupLaunchCopy, type LaunchCandidate } from "../_shared/groupLaunch.ts";
import { freeLaunchEmailBudget } from "../_shared/groupLaunchQuota.ts";
import { deliverNextLaunch, launchSummary, parseLaunchState, prepareLaunch, type LaunchStore } from "./campaign.ts";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const bearerMatches = (header: string, expected: string) => {
  const value = header.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (value.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < value.length; i++) mismatch |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
};

serve(async req => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("SCHEDULER_SECRET");
  if (!secret || !bearerMatches(req.headers.get("Authorization") ?? "", secret)) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await req.json();
    const mode = body?.mode ?? "preview";
    if (!["preview", "prepare", "activate", "send", "status", "preflight", "tick"].includes(mode)) return json({ error: "Invalid mode" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = Date.now();
    const readQuota = async () => {
      try {
        const response = await fetch(`${url}/functions/v1/send-email`, { method: "POST", signal: AbortSignal.timeout(12_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: JSON.stringify({ mode: "usage" }) });
        const result = await response.json().catch(() => null);
        return response.ok && result?.ok === true ? result.usage : null;
      } catch { return null; }
    };
    if (mode === "preflight") {
      const budget = freeLaunchEmailBudget(await readQuota(), now);
      return json({ ok: true, startsAt: GROUP_LAUNCH_STARTS_AT, expiresAt: GROUP_LAUNCH_EXPIRES_AT, freeEmailBudget: budget, emailReady: !!budget && budget.limit > 0,
        pushReady: !!Deno.env.get("VAPID_PUBLIC_KEY") && !!Deno.env.get("VAPID_PRIVATE_KEY") && !!Deno.env.get("VAPID_SUBJECT") });
    }
    const store: LaunchStore = {
      async read() {
        const { data, error } = await admin.from("app_config").select("value,updated_at").eq("key", GROUP_LAUNCH_ID).maybeSingle();
        if (error) throw Error("Campaign state unavailable");
        if (data && (typeof data.updated_at !== "string" || !Number.isFinite(Date.parse(data.updated_at)))) throw Error("Campaign revision unavailable");
        return data ? { revision: data.updated_at, state: parseLaunchState(data.value) } : null;
      },
      async replace(revision, next) {
        const previous = Date.parse(revision);
        if (!Number.isFinite(previous)) throw Error("Campaign revision unavailable");
        // Keep the optimistic-lock token short and strictly increasing. Filtering
        // by the whole audience JSON exceeds the REST gateway's URL limit.
        const updatedAt = new Date(Math.max(Date.now(), previous + 1)).toISOString();
        const { data, error } = await admin.from("app_config").update({ value: JSON.stringify(next), updated_at: updatedAt }).eq("key", GROUP_LAUNCH_ID).eq("updated_at", revision).select("updated_at");
        if (error) throw Error("Campaign state write failed");
        if (data?.length !== 1) return null;
        if (typeof data[0].updated_at !== "string" || !Number.isFinite(Date.parse(data[0].updated_at))) throw Error("Campaign revision unavailable");
        return data[0].updated_at;
      },
    };
    const makeCandidate = (profile: any, user: any, hasPush: boolean): LaunchCandidate => ({
      id: user.id, createdAt: user.created_at, lastActiveAt: profile?.last_active_at ?? null, lastSignInAt: user.last_sign_in_at ?? null,
      confirmed: !!user.email_confirmed_at, banned: !!user.banned_until && Date.parse(user.banned_until) > now, deleted: !!user.deleted_at,
      email: user.email ?? null, hasPush, groupsEnabled: profile?.preferences?.notifPrefs?.groups?.enabled !== false,
    });
    if (mode === "tick") {
      if (now < Date.parse(GROUP_LAUNCH_STARTS_AT) || now >= Date.parse(GROUP_LAUNCH_EXPIRES_AT)) return json({ status: "outside_launch_window" });
      const { data, error } = await admin.from("app_config").select("value").eq("key", GROUP_LAUNCH_SCHEDULE_KEY).maybeSingle();
      const schedule = data ? JSON.parse(data.value) : null;
      if (error || schedule?.enabled !== true || schedule.frontendReady !== true || schedule.serverOpened !== true || schedule.startsAt !== GROUP_LAUNCH_STARTS_AT || schedule.expiresAt !== GROUP_LAUNCH_EXPIRES_AT) return json({ status: "not_armed" });
    }
    if (mode === "preview" || mode === "prepare" || mode === "tick" && !await store.read()) {
      const candidates: LaunchCandidate[] = [];
      // Page through Auth; profiles/subscriptions are fetched only for each page.
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw Error("Audience lookup failed");
        const users = data.users;
        if (!users.length) break;
        const ids = users.map(u => u.id);
        const [profiles, subs] = await Promise.all([
          admin.from("profiles").select("id,last_active_at,preferences").in("id", ids),
          admin.from("push_subscriptions").select("user_id").in("user_id", ids),
        ]);
        if (profiles.error || subs.error) throw Error("Audience lookup failed");
        const byId = new Map(profiles.data.map(p => [p.id, p]));
        const hasPush = new Set(subs.data.map(p => p.user_id));
        for (const user of users) candidates.push(makeCandidate(byId.get(user.id), user, hasPush.has(user.id)));
        if (users.length < 200) break;
      }
      const state = prepareLaunch(candidates, now);
      if (mode === "prepare" || mode === "tick") {
        const { error } = await admin.from("app_config").insert({ key: GROUP_LAUNCH_ID, value: JSON.stringify(state) });
        if (error) return json({ error: error.code === "23505" ? "Campaign already prepared; snapshot was preserved" : "Preparation failed" }, 409);
      }
      if (mode !== "tick") return json({ ...launchSummary(state), dryRun: mode === "preview" });
    }
    const existing = await store.read();
    if (!existing) return json({ error: "Campaign not prepared" }, 409);
    if (mode === "status") return json(launchSummary(existing.state));
    if (mode === "tick") {
      if (!["draft", "active"].includes(existing.state.phase) || existing.state.deliveries.some(d => d.status === "sending" || d.status === "review")) return json({ status: "disabled", ...launchSummary(existing.state) });
      const today = new Date(now).toISOString().slice(0, 10);
      const reserved = existing.state.emailBudget?.date === today ? existing.state.emailBudget.used : 0;
      const budget = existing.state.deliveries.some(d => d.channel === "email" && d.status === "pending") ? freeLaunchEmailBudget(await readQuota(), now, reserved) : null;
      const next = { ...existing.state, phase: "active" as const, startsAt: GROUP_LAUNCH_STARTS_AT, expiresAt: GROUP_LAUNCH_EXPIRES_AT, publicLaunchConfirmed: true,
        emailBudget: budget ?? (reserved > 0 ? { date: today, limit: reserved, used: reserved } : null) };
      if (!await store.replace(existing.revision, next)) return json({ status: "busy" });
    }
    if (mode === "activate") {
      // Explicit operator confirmation after public access and provider FREE
      // remaining quota are verified. No default sending budget is inferred.
      const starts = Date.parse(body.startsAt), expires = Date.parse(body.expiresAt);
      const budget = body.freeEmailBudget;
      if (!["draft", "active", "paused"].includes(existing.state.phase) || existing.state.deliveries.some(d => d.status === "sending" || d.status === "review")
        || body.publicLaunchConfirmed !== true || body.freeQuotaVerified !== true
        || !Number.isFinite(starts) || !Number.isFinite(expires) || starts < Date.parse(GROUP_LAUNCH_STARTS_AT) || expires <= Math.max(starts, now) || expires - starts > 31 * 86_400_000
        || !Number.isInteger(budget) || budget < 1 || budget > 90) return json({ error: "Requires reviewed campaign, public launch confirmation, explicit launch window and verified free email budget (1–90)" }, 400);
      const state = { ...existing.state, phase: "active" as const, publicLaunchConfirmed: true, startsAt: new Date(starts).toISOString(), expiresAt: new Date(expires).toISOString(),
        emailBudget: { date: new Date(now).toISOString().slice(0, 10), limit: budget, used: existing.state.emailBudget?.date === new Date(now).toISOString().slice(0, 10) ? existing.state.emailBudget.used : 0 } };
      if (state.emailBudget.used > budget) return json({ error: "Budget is below already reserved emails" }, 400);
      if (!await store.replace(existing.revision, state)) return json({ error: "Campaign changed; reload status before activation" }, 409);
      return json({ ok: true, ...launchSummary(state) });
    }
    const delivery = { store, now,
      async candidate(userId: string) {
        const [auth, profile, subs] = await Promise.all([
          admin.auth.admin.getUserById(userId),
          admin.from("profiles").select("id,last_active_at,preferences").eq("id", userId).maybeSingle(),
          admin.from("push_subscriptions").select("id").eq("user_id", userId).limit(1),
        ]);
        if (auth.error?.status === 404) return null;
        if (auth.error || profile.error || subs.error) throw Error("Recipient recheck failed");
        if (!auth.data.user) return null;
        return makeCandidate(profile.data, auth.data.user, !!subs.data.length);
      },
      async send(delivery: Parameters<Parameters<typeof deliverNextLaunch>[0]["send"]>[0], candidate: LaunchCandidate) {
        if (delivery.channel === "email") {
          const response = await fetch(`${url}/functions/v1/send-email`, { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
            body: JSON.stringify({ to: candidate.email, template: GROUP_LAUNCH_TEMPLATE, dedup_key: GROUP_LAUNCH_ID, user_id: candidate.id }) });
          const result = await response.json().catch(() => null);
          if (!response.ok || result?.ok !== true) throw Error("Email requires review");
          return;
        }
        const [profile, subscriptions] = await Promise.all([
          admin.from("profiles").select("preferences").eq("id", candidate.id).single(),
          admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", candidate.id),
        ]);
        if (profile.error || subscriptions.error) throw Error("Push eligibility unavailable");
        if (!subscriptions.data?.length || profile.data.preferences?.notifPrefs?.groups?.enabled === false) return "skipped" as const;
        const publicKey = Deno.env.get("VAPID_PUBLIC_KEY"), privateKey = Deno.env.get("VAPID_PRIVATE_KEY"), subject = Deno.env.get("VAPID_SUBJECT");
        if (!publicKey || !privateKey || !subject) throw Error("Push unavailable");
        webpush.setVapidDetails(subject, publicKey, privateKey);
        const copy = groupLaunchCopy[profile.data.preferences?.language === "en" ? "en" : "ar"];
        const payload = JSON.stringify({ title: copy.pushTitle, body: copy.pushBody, url: "/study/", id: GROUP_LAUNCH_ID });
        let accepted = 0, expired = 0;
        for (const sub of subscriptions.data) {
          try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 86_400, timeout: 10_000 }); accepted++; }
          catch (error) {
            const status = (error as { statusCode?: number })?.statusCode;
            if (status === 404 || status === 410) expired++;
            // Never resend this campaign after partial or uncertain delivery.
          }
        }
        if (!accepted && expired === subscriptions.data.length) return "skipped" as const;
        if (!accepted) throw Error("Push requires review");
      },
    };
    if (mode === "tick") {
      const push = await deliverNextLaunch({ ...delivery, channel: "push" });
      const email = await deliverNextLaunch({ ...delivery, channel: "email" });
      return json({ push, email });
    }
    return json(await deliverNextLaunch(delivery));
  } catch { return json({ error: "Campaign operation failed; no automatic retry of ambiguous delivery" }, 503); }
});
