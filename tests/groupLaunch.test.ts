import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLaunchChannel, groupLaunchCopy, GROUP_LAUNCH_STEPS, renderGroupLaunchEmail, type LaunchCandidate } from "../supabase/functions/_shared/groupLaunch.ts";
import { deliverNextLaunch, parseLaunchState, prepareLaunch, type LaunchState, type LaunchStore } from "../supabase/functions/group-launch/campaign.ts";
import { whatsNewPages } from "../src/lib/whatsNewJourney";
import { readWhatsNewSeen, saveWhatsNewSeen, WHATS_NEW_VERSION } from "../src/lib/whatsNew";

const DAY = 86_400_000;
const now = Date.parse("2026-10-27T10:00:00Z");
const at = (days: number) => new Date(now - days * DAY).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const person = (days: number, patch: Partial<LaunchCandidate> = {}): LaunchCandidate => ({ id: id(1), createdAt: at(60), lastActiveAt: at(days), lastSignInAt: at(days), confirmed: true, banned: false, email: "sample@example.invalid", hasPush: true, groupsEnabled: true, ...patch });

test("launch audience uses full inactivity boundaries: 3–6 days push; 14+ days email", () => {
  for (const [days, expected] of [[0, null], [2.999, null], [3, "push"], [6, "push"], [6.999, "push"], [7, null], [13.999, null], [14, "email"], [200, "email"]] as const) {
    assert.equal(groupLaunchChannel(person(days, { createdAt: at(300) }), now, now), expected, String(days));
  }
});
test("recent app activity OR a recent sign-in suppresses stale cohort records", () => {
  assert.equal(groupLaunchChannel(person(20, { lastActiveAt: at(1) }), now, now), null);
  assert.equal(groupLaunchChannel(person(20, { lastSignInAt: at(1) }), now, now), null);
  assert.equal(groupLaunchChannel(person(20, { lastActiveAt: null, lastSignInAt: null, createdAt: at(20) }), now, now), "email");
});
test("push opt-out and unavailable devices never fall back to the email cohort", () => {
  assert.equal(groupLaunchChannel(person(4, { groupsEnabled: false }), now, now), null);
  assert.equal(groupLaunchChannel(person(4, { hasPush: false }), now, now), null);
  assert.equal(groupLaunchChannel(person(20, { email: null }), now, now), null);
});
test("snapshot excludes later signups and inactive unconfirmed/deleted/banned accounts", () => {
  for (const patch of [{ confirmed: false }, { deleted: true }, { banned: true }, { createdAt: new Date(now + 1).toISOString() }, { lastActiveAt: "invalid" }, { lastSignInAt: new Date(now + 1).toISOString() }]) {
    assert.equal(groupLaunchChannel(person(20, patch), now, now), null);
  }
});
test("new launch reaches accounts that acknowledged previous versions and resumes saved steps", async () => {
  assert.ok(WHATS_NEW_VERSION < 7, "completing an unfinished onboarding tour must leave the group welcome unread");
  const prefs: Record<string, unknown> = { whatsNewSeen_v6: true };
  assert.deepEqual(whatsNewPages(readWhatsNewSeen(prefs), 7).map(p => p.id), GROUP_LAUNCH_STEPS);
  await saveWhatsNewSeen(7, "a", () => "a", async patch => { Object.assign(prefs, patch); }, "group-welcome");
  assert.deepEqual(whatsNewPages(readWhatsNewSeen(prefs), 7).map(p => p.id), GROUP_LAUNCH_STEPS.slice(1));
  assert.equal(whatsNewPages({}, 7).every(p => p.kind === "launch"), true);
  assert.equal(whatsNewPages({ whatsNewSeen_v7: true }, 7).length, 0);
});
test("bilingual copy includes the future message without inventing a promised feature", () => {
  assert.equal(groupLaunchCopy.ar.steps["group-future"].title, "والكثير قادم قريبًا.");
  assert.equal(groupLaunchCopy.en.steps["group-future"].title, "Much more is coming soon.");
  assert.doesNotMatch(JSON.stringify(groupLaunchCopy.ar), /تركيز|ركّز|كويز|فاينل|ه?افي/);
  assert.match(groupLaunchCopy.ar.referral.body, /الدعوات المحتسبة/);
  assert.match(groupLaunchCopy.en.referral.body, /counted referrals/);
});
test("email has bilingual HTML/text, correct destination and real scene asset with descriptive alt", () => {
  const email = renderGroupLaunchEmail();
  assert.match(email.html, /lang="ar" dir="rtl"/);
  assert.match(email.html, /lang="en" dir="ltr"/);
  assert.match(email.html, /https:\/\/havenstudent\.com\/announcements\/group-launch-lake\.png/);
  assert.match(email.html, /مشهد الجلسة الفعلي ببيانات تجريبية/);
  assert.match(email.text, /https:\/\/havenstudent\.com\/study\//);
  assert.match(email.html, /امنح Havi لمستك الخاصة/);
  assert.match(email.text, /Make Havi your own/);
  assert.match(email.html, /https:\/\/havenstudent\.com\/profile\/#profile-ambassador/);
  assert.doesNotMatch(email.html, /<script|<iframe|onclick|fonts\.google/);
  assert.match(renderGroupLaunchEmail('x" onerror="bad').html, /x&quot; onerror=&quot;bad/);
});

function harness(candidates = [person(20)]) {
  let raw = JSON.stringify(prepareLaunch(candidates, now));
  let revision = 0;
  let writes = 0, sends = 0;
  const store: LaunchStore = {
    async read() { return { revision: String(revision), state: parseLaunchState(raw) }; },
    async replace(expected, next) { if (String(revision) !== expected) return null; raw = JSON.stringify(next); writes++; return String(++revision); },
  };
  const activate = () => {
    const state = parseLaunchState(raw);
    Object.assign(state, { phase: "active", publicLaunchConfirmed: true, startsAt: at(0), expiresAt: new Date(now + 7 * DAY).toISOString(), emailBudget: { date: at(0).slice(0, 10), limit: 10, used: 0 } });
    raw = JSON.stringify(state); revision++;
  };
  const deps = { store, now, candidate: async (uid: string) => candidates.find(c => c.id === uid) ?? null, send: async () => { sends++; } };
  return { deps, activate, read: () => parseLaunchState(raw), counts: () => ({ writes, sends }), set: (state: LaunchState) => { raw = JSON.stringify(state); revision++; } };
}
test("a fresh preparation is draft and a delivery call makes zero writes or provider calls", async () => {
  const h = harness();
  assert.equal(h.read().phase, "draft");
  assert.equal((await deliverNextLaunch(h.deps)).status, "disabled");
  assert.deepEqual(h.counts(), { writes: 0, sends: 0 });
});
test("parallel workers cannot send the same recipient twice; completion cannot restart", async () => {
  const h = harness(); h.activate();
  await Promise.all([deliverNextLaunch(h.deps), deliverNextLaunch(h.deps)]);
  assert.equal(h.counts().sends, 1);
  assert.equal(h.read().phase, "complete");
  assert.equal(h.read().emailBudget?.used, 1);
  await deliverNextLaunch(h.deps);
  assert.equal(h.counts().sends, 1);
});
test("returning users are skipped at delivery, without using an email allowance", async () => {
  const h = harness(); h.activate();
  h.deps.candidate = async () => person(0);
  assert.equal((await deliverNextLaunch(h.deps)).status, "skipped");
  assert.equal(h.read().deliveries[0].status, "skipped");
  assert.equal(h.read().emailBudget?.used, 0);
  assert.equal(h.counts().sends, 0);
});
test("missing/stale/exhausted verified free budget prevents email sends", async () => {
  for (const budget of [null, { date: "2026-10-26", limit: 10, used: 0 }, { date: "2026-10-27", limit: 1, used: 1 }]) {
    const h = harness(); h.activate(); h.set({ ...h.read(), emailBudget: budget });
    assert.equal((await deliverNextLaunch(h.deps)).status, "needs_verified_free_email_budget");
    assert.equal(h.counts().sends, 0);
  }
});
test("ambiguous provider results pause the campaign and cannot automatically resend", async () => {
  const h = harness(); h.activate();
  let attempts = 0;
  h.deps.send = async () => { attempts++; throw Error("connection lost after acceptance"); };
  assert.equal((await deliverNextLaunch(h.deps)).status, "needs_review");
  assert.equal(h.read().phase, "paused");
  assert.equal(h.read().deliveries[0].status, "review");
  await deliverNextLaunch(h.deps);
  assert.equal(attempts, 1);
});
test("an interrupted worker remains claimed, instead of being automatically retried", async () => {
  const h = harness(); h.activate();
  const state = h.read(); state.deliveries[0].status = "sending"; h.set(state);
  assert.equal((await deliverNextLaunch(h.deps)).status, "needs_review");
  assert.equal(h.counts().sends, 0);
});
test("expired campaigns and an unconfirmed public launch never send", async () => {
  for (const patch of [{ publicLaunchConfirmed: false }, { expiresAt: at(1) }, { startsAt: new Date(now + 1).toISOString() }]) {
    const h = harness(); h.activate(); h.set({ ...h.read(), ...patch });
    await deliverNextLaunch(h.deps);
    assert.equal(h.counts().sends, 0);
  }
});
test("cohort preparation deduplicates IDs and validation rejects corrupt state and budgets", () => {
  const h = harness([person(20), person(20)]);
  assert.equal(h.read().deliveries.length, 1);
  assert.throws(() => parseLaunchState(JSON.stringify({ ...h.read(), emailBudget: { date: "2026-10-27", limit: 10000, used: 0 } })));
  assert.throws(() => parseLaunchState(JSON.stringify({ ...h.read(), deliveries: [...h.read().deliveries, ...h.read().deliveries] })));
});
