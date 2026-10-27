// ---------------------------------------------------------------------------
// Group study: the calls to the server (the public study_* functions in
// supabase/migrations/20261015_study_groups.sql and 20261017_study_desks.sql)
// and the group channel.
//
// The feature is closed on the server to everyone but the trial accounts
// (study.allowlist); for anyone else myStudyGroups() says available: false and
// every other call is refused with "not_available". Nothing in the app calls
// these yet (Stage 3 and 4 of research/social-study/INTEGRATION_PLAN.md).
//
// The group channel opens only on the group page (openGroupSession). Elsewhere
// the «بدأ جلسة» card uses watchMyGroups(), a light call on app open, on tab
// return and every 2 minutes, so open apps don't hold Realtime connections.
// ---------------------------------------------------------------------------

import type { RealtimeChannel } from "@supabase/supabase-js";
import { UUID } from "@/lib/study/parse";
import { openPokeChannel, type PokeChannel } from "./pokeChannel";
import { supabase } from "../supabase";
import {
  parseErrorCode,
  parseHarvest,
  parseJoinPreview,
  parseMyGroups,
  parsePendingAwards,
} from "./parse";
import { STUDY_LIMITS } from "./rules";
import { createGroupSession, type ChannelHandlers, type GroupSession, type PresenceState, type StudyTransport } from "./session";
import {
  StudyError,
  type JoinPreview,
  type MyStudyGroups,
  type PendingStudyAward,
  type StudyAppearance,
  type StudyHarvest,
} from "./types";


/** Calls one study_* function; a refusal or failure throws a StudyError. */
async function call(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  let res: { data: unknown; error: unknown };
  try {
    res = await supabase.rpc(fn, args);
  } catch (e) {
    const code = parseErrorCode(e);
    throw new StudyError(code === "unknown" ? "network" : code, e instanceof Error ? e.message : undefined);
  }
  if (res.error) {
    const message = (res.error as { message?: unknown }).message;
    throw new StudyError(parseErrorCode(res.error), typeof message === "string" ? message : undefined);
  }
  return res.data;
}

/** A parsed answer, or "unknown" when the server's answer doesn't parse. */
function need<T>(value: T | null): T {
  if (value === null) throw new StudyError("unknown", "unexpected answer");
  return value;
}

const appearanceJson = (a: StudyAppearance) => ({
  display_name: a.displayName,
  havi_name: a.haviName,
  havi_color: a.haviColor,
  flower_color: a.flowerColor,
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/** My groups (with any live sitting) and the ones I deleted that can still be restored. */
export async function myStudyGroups(): Promise<MyStudyGroups> {
  return need(parseMyGroups(await call("study_my_groups")));
}

/** Creates a group I own. An empty name becomes «مجموعة <my name>» on the server. */
export async function createStudyGroup(name: string, appearance: StudyAppearance): Promise<{ groupId: string; token: string }> {
  const data = await call("study_create_group", { p_name: name, p_appearance: appearanceJson(appearance) });
  const d = data as { group_id?: unknown; token?: unknown } | null;
  if (!d || typeof d.group_id !== "string" || !UUID.test(d.group_id) || typeof d.token !== "string") {
    throw new StudyError("unknown", "unexpected answer");
  }
  return { groupId: d.group_id, token: d.token };
}

/** What an invite link leads to, shown before joining. */
export async function previewStudyInvite(token: string): Promise<JoinPreview> {
  return need(parseJoinPreview(await call("study_join_preview", { p_token: token })));
}

/** Joins by invite link; returns the group id. */
export async function joinStudyGroup(token: string, appearance: StudyAppearance): Promise<string> {
  const id = await call("study_join_group", { p_token: token, p_appearance: appearanceJson(appearance) });
  if (typeof id !== "string" || !UUID.test(id)) throw new StudyError("unknown", "unexpected answer");
  return id;
}

/** Leaves the group; my earned pads stay on its lake unless removePads. */
export async function leaveStudyGroup(groupId: string, removePads: boolean): Promise<void> {
  await call("study_leave_group", { p_group: groupId, p_remove_pads: removePads });
}

/** Owner only. A removed member can't come back through the current link. */
export async function removeStudyMember(groupId: string, userId: string, removePads: boolean): Promise<void> {
  await call("study_remove_member", { p_group: groupId, p_user: userId, p_remove_pads: removePads });
}

/** Owner only: takes a former member's kept pads off the group lake. */
export async function hideFormerMemberPads(groupId: string, userId: string): Promise<void> {
  await call("study_hide_former_pads", { p_group: groupId, p_user: userId });
}

/** Owner only: the current invite token (the same link, copied again). */
export async function studyInviteToken(groupId: string): Promise<string> {
  const t = await call("study_invite_token", { p_group: groupId });
  if (typeof t !== "string") throw new StudyError("unknown", "unexpected answer");
  return t;
}

/** Owner only: a new link; the old one stops working. */
export async function resetStudyInvite(groupId: string): Promise<string> {
  const t = await call("study_reset_invite", { p_group: groupId });
  if (typeof t !== "string") throw new StudyError("unknown", "unexpected answer");
  return t;
}

export async function renameStudyGroup(groupId: string, name: string): Promise<void> {
  await call("study_rename_group", { p_group: groupId, p_name: name });
}

export async function updateStudyAppearance(groupId: string, appearance: StudyAppearance): Promise<void> {
  await call("study_update_appearance", { p_group: groupId, p_appearance: appearanceJson(appearance) });
}

/** Owner only: hidden for everyone at once, restorable for 30 days. */
export async function deleteStudyGroup(groupId: string): Promise<void> {
  await call("study_delete_group", { p_group: groupId });
}

export async function restoreStudyGroup(groupId: string): Promise<void> {
  await call("study_restore_group", { p_group: groupId });
}

/** The group lake. */
export async function studyHarvest(groupId: string): Promise<StudyHarvest> {
  return need(parseHarvest(await call("study_harvest", { p_group: groupId })));
}

// ---------------------------------------------------------------------------
// Awards (applied to the student's own lake by the store, Stage 4)
// ---------------------------------------------------------------------------

/** Earned rounds not yet in my own lake (settles any finished round of mine first). */
export async function pendingStudyAwards(): Promise<PendingStudyAward[]> {
  return need(parsePendingAwards(await call("study_pending_awards")));
}

/** Compare-and-swap the personal projection and acknowledge its ledger in one transaction. */
export async function applyStudyAwardProjection(account: string, ids: string[], expected: Record<string, unknown>, projection: Record<string, unknown>): Promise<{ ok: boolean; preferences: Record<string, unknown> }> {
  const raw = await call("study_apply_awards", { p_account: account, p_ids: ids, p_expected: expected, p_projection: projection }) as { ok?: unknown; preferences?: unknown } | null;
  if (!raw || typeof raw.ok !== "boolean" || !raw.preferences || typeof raw.preferences !== "object" || Array.isArray(raw.preferences)) throw new StudyError("unknown");
  return { ok: raw.ok, preferences: raw.preferences as Record<string, unknown> };
}

/** Commit a group award and its projection to one owned semester. */
export async function applySemesterStudyAwardProjection(account: string, semester: string, ids: string[], expected: Record<string, unknown>, projection: Record<string, unknown>): Promise<{ ok: boolean; preferences: Record<string, unknown> }> {
  const raw = await call("study_apply_semester_awards", {
    p_account: account, p_semester: semester, p_ids: ids,
    p_expected: expected, p_projection: projection,
  }) as { ok?: unknown; preferences?: unknown } | null;
  if (!raw || typeof raw.ok !== "boolean" || !raw.preferences || typeof raw.preferences !== "object" || Array.isArray(raw.preferences)) throw new StudyError("unknown");
  return { ok: raw.ok, preferences: raw.preferences as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Off the group page: the «بدأ جلسة» card's light check
// ---------------------------------------------------------------------------

/**
 * Calls onGroups with myStudyGroups() now, when the tab comes back, when the
 * connection comes back, and every 2 minutes while the tab is visible. Failed
 * checks are skipped (the next one tries again). Returns the stop function.
 */
export function watchMyStudyGroups(onGroups: (groups: MyStudyGroups) => void, everyMs = STUDY_LIMITS.heartbeatMs): () => void {
  let stopped = false;
  let running = false;
  const check = async () => {
    if (stopped || running || document.visibilityState === "hidden") return;
    running = true;
    try {
      const groups = await myStudyGroups();
      if (!stopped) onGroups(groups);
    } catch {
      // offline or refused: the next check tries again
    } finally {
      running = false;
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void check();
  };
  const onOnline = () => void check();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const timer = window.setInterval(() => void check(), everyMs);
  void check();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
  };
}

// ---------------------------------------------------------------------------
// The group page
// ---------------------------------------------------------------------------

interface SharedChannel {
  channel: RealtimeChannel;
  pokes: PokeChannel | null;
  handlers: Set<ChannelHandlers>;
  status: "subscribed" | "error" | "closed" | null;
}

// One channel per topic in this tab, shared by every session on it (a page
// mounted twice in development, for example): the Realtime client hands out
// the same channel object for the same topic anyway.
const shared = new Map<string, SharedChannel>();
const closing = new Map<string, Promise<unknown>>();

function readVersion(payload: unknown): number | null {
  const p = payload as { version?: unknown; payload?: { version?: unknown } } | null;
  const v = p?.version ?? p?.payload?.version;
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function readPoke(payload: unknown): { target: string; tap: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const p = raw.target === undefined && raw.user_id === undefined && raw.payload && typeof raw.payload === "object" ? raw.payload as Record<string, unknown> : raw;
  const target = p.target ?? p.user_id;
  if (typeof target !== "string" || typeof p.tap !== "string" || !UUID.test(target) || !UUID.test(p.tap)) return null;
  return { target, tap: p.tap };
}

async function openChannel(topic: string, myId: string, handlers: ChannelHandlers) {
  await closing.get(topic);
  let s = shared.get(topic);
  if (!s) {
    // Private channel: the database checks membership (study.can_listen)
    // with this account's token.
    await supabase.realtime.setAuth();
    s = shared.get(topic); // another session may have opened it meanwhile
  }
  if (!s) {
    const channel = supabase.channel(topic, { config: { private: true, presence: { key: myId } } });
    const entry: SharedChannel = { channel, pokes: null, handlers: new Set(), status: null };
    const each = (f: (h: ChannelHandlers) => void) => {
      for (const h of [...entry.handlers]) f(h);
    };
    entry.pokes = openPokeChannel(supabase, topic, myId, payload => {
      const p = readPoke(payload);
      if (p) each(h => h.onPoke(p.target, p.tap));
    });
    channel
      .on("broadcast", { event: "changed" }, (msg) => {
        const v = readVersion(msg.payload);
        each((h) => h.onChanged(v));
      })
      .on("broadcast", { event: "poke" }, (msg) => {
        const p = readPoke(msg.payload);
        if (p) each((h) => h.onPoke(p.target, p.tap));
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as PresenceState;
        each((h) => h.onPresence(state));
      })
      .subscribe((status) => {
        entry.status = status === "SUBSCRIBED" ? "subscribed" : status === "CLOSED" ? "closed" : "error";
        // A closed SDK channel cannot rejoin. Never hand it to a new session.
        if (entry.status === "closed" && shared.get(topic) === entry) shared.delete(topic);
        each((h) => h.onStatus(entry.status!));
      });
    if (entry.status !== "closed") shared.set(topic, entry);
    s = entry;
  }
  const entry = s;
  entry.handlers.add(handlers);
  if (entry.status !== null) {
    // Replay status even if the SDK closed before this handler was attached.
    queueMicrotask(() => {
      if (!entry.handlers.has(handlers) || entry.status === null) return;
      handlers.onStatus(entry.status);
      if (entry.status === "subscribed") handlers.onPresence(entry.channel.presenceState() as PresenceState);
    });
  }
  return {
    sendPoke: (target: string, tap: string, recipients: readonly string[]) => entry.pokes?.send(target, tap, recipients) ?? Promise.resolve(false),
    async track(awake: boolean, seenAt?: number) {
      await entry.channel.track(seenAt === undefined ? { awake } : { awake, seen_at: seenAt });
    },
    async close() {
      if (!entry.handlers.delete(handlers) || entry.handlers.size > 0) return;
      if (shared.get(topic) === entry) shared.delete(topic);
      const done = Promise.all([supabase.removeChannel(entry.channel).catch(() => {}), entry.pokes?.close()]);
      closing.set(topic, done);
      await done;
      if (closing.get(topic) === done) closing.delete(topic);
    },
  };
}

/** The real server, for createGroupSession (the session parses the snapshots). */
export const studyTransport: StudyTransport = {
  state: (g) => call("study_state", { p_group: g }),
  heartbeat: (g) => call("study_heartbeat", { p_group: g }),
  endSitting: (g) => call("study_end_sitting", { p_group: g }),
  pageState: (g, page, open, awake, seq) => call("study_page_state", { p_group: g, p_page: page, p_open: open, p_awake: awake, p_seq: seq }),
  openSitting: (g, desks) => call("study_open_sitting", { p_group: g, p_desks: desks }),
  setDesks: (g, desks) => call("study_set_desks", { p_group: g, p_desks: desks }),
  setDurations: (g, s, b, l, n) => l === undefined || n === undefined ? call("study_set_durations", { p_group: g, p_study_minutes: s, p_break_minutes: b }) : call("study_set_cycle", {p_group:g,p_study_minutes:s,p_break_minutes:b,p_long_break_minutes:l,p_sessions_before_long:n}),
  setFocus: (g, focus) => call("study_set_focus", { p_group: g, p_key: focus.key }),
  setReady: (g, ready) => call("study_set_ready", { p_group: g, p_ready: ready }),
  startRound: (g, s, b, confirmMissing, confirmedIds) => confirmMissing === undefined
    ? call("study_start_round", { p_group: g, p_study_minutes: s, p_break_minutes: b })
    : call("study_start_round_with_focus", { p_group: g, p_study_minutes: s, p_break_minutes: b, p_confirm_missing: confirmMissing, p_missing_ids: confirmedIds ?? [] }),
  pauseRound: (g) => call("study_pause_round", { p_group: g }),
  resumeRound: (g) => call("study_resume_round", { p_group: g }),
  leaveRound: (g) => call("study_leave_round", { p_group: g }),
  poke: async (g, target, tap) => (await call("study_poke", { p_group: g, p_target: target, p_tap: tap })) === true,
  openChannel,
};

/** Opens a group page's live session (call dispose() when the page closes). */
export function openGroupSession(groupId: string, myId: string): GroupSession {
  return createGroupSession(groupId, myId, studyTransport);
}
