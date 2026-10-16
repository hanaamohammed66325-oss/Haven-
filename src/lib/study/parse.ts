// ---------------------------------------------------------------------------
// Group study: the server's JSON -> the app's types (see types.ts).
//
// Translation happens here and only here. Every parser checks what it reads:
// a malformed answer becomes null (or is left out of a list) instead of
// reaching the screen half-filled.
// ---------------------------------------------------------------------------

import { normalizeHaviOutfit } from "@/lib/haviOutfit";
import type {
  DeletedStudyGroup,
  HarvestMember,
  JoinPreview,
  JoinPreviewReason,
  MyStudyGroups,
  PendingStudyAward,
  StudyErrorCode,
  StudyGroupSummary,
  StudyHarvest,
  StudyLeftReason,
  StudyMember,
  StudyParticipant,
  StudyPhase,
  StudyRound,
  StudySitting,
  StudyState,
  StudyFocus,
} from "./types";

type Json = Record<string, unknown>;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const PHASES: readonly StudyPhase[] = ["scheduled", "study", "paused", "break", "over", "cancelled"];
const LEFT_REASONS: readonly StudyLeftReason[] = ["left", "away", "removed", "group_left"];
const JOIN_REASONS: readonly JoinPreviewReason[] = ["ok", "invalid", "already_member", "removed", "full", "group_limit"];

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const color = (v: unknown): string | null => (typeof v === "string" && COLOR.test(v) ? v.toLowerCase() : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;

/** A Postgres timestamptz ("2026-10-06T18:16:21.123456+00:00") in epoch ms. */
export function parseTime(v: unknown): number | null {
  if (typeof v !== "string") return null;
  // Keep milliseconds only: not every engine reads six fraction digits.
  const t = Date.parse(v.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(t) ? t : null;
}

export function parseFocus(v: unknown): StudyFocus | null {
  if (!isObj(v) || typeof v.key !== "string" || v.key.length > 100) return null;
  const courseId = v.course_id == null ? null : isId(v.course_id) ? v.course_id : null;
  const task = str(v.task);
  const title = str(v.title);
  if (v.key !== "" && (!title || title.length > 500 || (!isId(v.key) && !/^(component|planner):[0-9a-f-]{36}$/i.test(v.key)))) return null;
  if (v.key === "") return { key: "", courseId: null, task: null, title: null, courseName: null };
  return { key: v.key, courseId, task, title, courseName: str(v.course_name) };
}

function parseMember(v: unknown): StudyMember | null {
  if (!isObj(v) || !isId(v.user_id) || !isInt(v.seat)) return null;
  const displayName = str(v.display_name);
  const haviName = str(v.havi_name);
  const haviColor = color(v.havi_color);
  const flowerColor = color(v.flower_color);
  if (!displayName || !haviName || !haviColor || !flowerColor) return null;
  return {
    userId: v.user_id,
    seat: v.seat,
    displayName,
    haviName,
    haviColor,
    flowerColor,
    ...(Object.hasOwn(v, "havi_cosmetics") ? { haviCosmetics: normalizeHaviOutfit(v.havi_cosmetics) } : {}),
    isOwner: v.is_owner === true,
    isMe: v.is_me === true,
    fresh: v.fresh === true,
    ...(typeof v.on_page === "boolean" && typeof v.awake === "boolean"
      ? { onPage: v.on_page, awake: v.awake } : {}),
    ...(Object.hasOwn(v, "ready") ? { ready: v.ready === true } : {}),
    ...(Object.hasOwn(v, "focus") ? { focus: parseFocus(v.focus) } : {}),
  };
}

function parseParticipant(v: unknown): StudyParticipant | null {
  if (!isObj(v) || !isId(v.user_id)) return null;
  return { userId: v.user_id, active: v.active === true, leftReason: oneOf(v.left_reason, LEFT_REASONS), ...(Object.hasOwn(v, "focus") ? { focus: parseFocus(v.focus) } : {}) };
}

function parseSitting(v: unknown): StudySitting | null {
  if (!isObj(v) || !isId(v.id)) return null;
  const startedAt = parseTime(v.started_at);
  if (startedAt === null) return null;
  // A server without the desks (before 20261017_study_desks.sql) reads as two desks for round 1.
  const deskCount = isInt(v.desk_count) && v.desk_count >= 2 && v.desk_count <= 10 ? v.desk_count : 2;
  const desksForSeq = isInt(v.desks_for_seq) && v.desks_for_seq >= 1 ? v.desks_for_seq : 1;
  return { id: v.id, organizerId: isId(v.organizer_id) ? v.organizer_id : null, startedAt, deskCount, desksForSeq,
    ...(Object.hasOwn(v, "ready_enabled") ? { readyEnabled: v.ready_enabled === true, missingReady: Array.isArray(v.missing_ready) ? v.missing_ready.filter(isId) : [] } : {}),
    ...(Object.hasOwn(v, "focus_enabled") ? { focusWarning: v.focus_warning === true, focusEnabled: v.focus_enabled === true,
      missingFocus: Array.isArray(v.missing_focus) ? v.missing_focus.filter(isId) : [] } : {}),
    ...(v.cycle_enabled === true ? {cycleEnabled:true} : {}),
    ...(isInt(v.long_break_minutes) && v.long_break_minutes >= 5 && v.long_break_minutes <= 45 ? {longBreakMinutes:v.long_break_minutes} : {}),
    ...(isInt(v.sessions_before_long) && v.sessions_before_long >= 2 && v.sessions_before_long <= 8 ? {sessionsBeforeLong:v.sessions_before_long} : {}),
    ...(isInt(v.study_minutes) && v.study_minutes >= 5 && v.study_minutes <= 90 ? { studyMinutes: v.study_minutes } : {}),
    ...(isInt(v.break_minutes) && v.break_minutes >= 1 && v.break_minutes <= 45 ? { breakMinutes: v.break_minutes } : {}),
  };
}

function parseRound(v: unknown): StudyRound | null {
  if (!isObj(v) || !isId(v.id) || !isInt(v.seq)) return null;
  const startsAt = parseTime(v.starts_at);
  const othersMayStartAt = parseTime(v.others_may_start_at);
  const phase = oneOf(v.phase, PHASES);
  if (startsAt === null || othersMayStartAt === null || phase === null) return null;
  if (!isInt(v.study_ms) || !isInt(v.break_ms) || v.study_ms <= 0 || v.break_ms <= 0) return null;
  const pausedTotalMs = isInt(v.paused_total_ms) && v.paused_total_ms >= 0 ? v.paused_total_ms : null;
  if (pausedTotalMs === null) return null;
  const pausedAt = v.paused_at == null ? null : parseTime(v.paused_at);
  if (v.paused_at != null && pausedAt === null) return null;
  const participants = Array.isArray(v.participants)
    ? v.participants.map(parseParticipant).filter((p): p is StudyParticipant => p !== null)
    : [];
  return {
    id: v.id,
    seq: v.seq,
    startsAt,
    studyMs: v.study_ms,
    breakMs: v.break_ms,
    pausedAt,
    pausedTotalMs,
    phase,
    settledAt: parseTime(v.settled_at),
    othersMayStartAt,
    participants,
  };
}

/** A study_state / study_heartbeat / round-action answer. */
export function parseState(v: unknown): StudyState | null {
  if (!isObj(v) || !isObj(v.group)) return null;
  const serverTime = parseTime(v.server_time);
  const g = v.group;
  const name = str(g.name);
  if (serverTime === null || !isId(g.id) || !name || !isInt(g.version) || !isInt(g.epoch)) return null;
  if (!Array.isArray(v.members)) return null;
  const members = v.members.map(parseMember).filter((m): m is StudyMember => m !== null);
  members.sort((a, b) => a.seat - b.seat);
  const sitting = v.sitting == null ? null : parseSitting(v.sitting);
  if (v.sitting != null && sitting === null) return null;
  const round = v.round == null ? null : parseRound(v.round);
  if (v.round != null && round === null) return null;
  return {
    serverTime,
    ...(typeof v.legacy_presence === "boolean" ? { legacyPresence: v.legacy_presence } : {}),
    group: {
      id: g.id,
      name,
      version: g.version,
      epoch: g.epoch,
      isOwner: g.is_owner === true,
      cap: isInt(g.cap) ? g.cap : 10,
    },
    members,
    sitting,
    round,
  };
}

function parseSummary(v: unknown): StudyGroupSummary | null {
  if (!isObj(v) || !isId(v.id)) return null;
  const name = str(v.name);
  if (!name) return null;
  let sitting: StudyGroupSummary["sitting"] = null;
  if (isObj(v.sitting) && isId(v.sitting.id)) {
    const s = v.sitting;
    const startedAt = parseTime(s.started_at);
    if (startedAt !== null) {
      sitting = {
        id: s.id as string,
        startedAt,
        startedBy: isId(s.started_by) ? s.started_by : null,
        startedByName: str(s.started_by_name),
        phase: oneOf(s.phase, PHASES),
        inRound: s.in_round === true,
      };
    }
  }
  return { id: v.id, name, isOwner: v.is_owner === true, members: isInt(v.members) ? v.members : 0, sitting };
}

function parseDeleted(v: unknown): DeletedStudyGroup | null {
  if (!isObj(v) || !isId(v.id)) return null;
  const name = str(v.name);
  const purgeAfter = parseTime(v.purge_after);
  if (!name || purgeAfter === null) return null;
  return { id: v.id, name, purgeAfter };
}

/** A study_my_groups answer. */
export function parseMyGroups(v: unknown): MyStudyGroups | null {
  if (!isObj(v) || typeof v.available !== "boolean") return null;
  const list = <T>(x: unknown, f: (y: unknown) => T | null): T[] =>
    Array.isArray(x) ? x.map(f).filter((y): y is T => y !== null) : [];
  return {
    available: v.available,
    groups: v.available ? list(v.groups, parseSummary) : [],
    deleted: v.available ? list(v.deleted, parseDeleted) : [],
  };
}

/** A study_join_preview answer. */
export function parseJoinPreview(v: unknown): JoinPreview | null {
  if (!isObj(v)) return null;
  const reason = oneOf(v.reason, JOIN_REASONS);
  if (!reason) return null;
  return {
    ok: v.ok === true && reason === "ok",
    reason,
    groupId: isId(v.group_id) ? v.group_id : null,
    name: str(v.name),
    members: isInt(v.members) ? v.members : null,
    cap: isInt(v.cap) ? v.cap : null,
  };
}

/** A study_harvest answer. Pads whose owner isn't listed are left out. */
export function parseHarvest(v: unknown): StudyHarvest | null {
  if (!isObj(v) || !Array.isArray(v.members) || !Array.isArray(v.pads)) return null;
  const members: HarvestMember[] = [];
  for (const m of v.members) {
    if (!isObj(m) || !isId(m.user_id)) continue;
    const flowerColor = color(m.flower_color);
    if (!flowerColor) continue;
    const former = m.former === true;
    members.push({ userId: m.user_id, former, displayName: former ? null : str(m.display_name), flowerColor });
  }
  const known = new Set(members.map((m) => m.userId));
  const rawPads = v.pads;
  const pads = rawPads.filter((p): p is string => isId(p) && known.has(p));
  const details = Array.isArray(v.details) && v.details.length === rawPads.length
    ? v.details.filter((_d, i) => isId(rawPads[i]) && known.has(rawPads[i])).map((d) => ({ id: isObj(d) && isId(d.id) ? d.id : "", focus: isObj(d) ? parseFocus(d.focus) : null }))
    : undefined;
  return { members, pads, ...(details ? { details } : {}) };
}

/** A study_pending_awards answer. */
export function parsePendingAwards(v: unknown): PendingStudyAward[] | null {
  if (!Array.isArray(v)) return null;
  const out: PendingStudyAward[] = [];
  for (const a of v) {
    if (!isObj(a) || !isId(a.id) || !isInt(a.minutes) || a.minutes < 1) continue;
    const awardedAt = parseTime(a.awarded_at);
    if (awardedAt === null) continue;
    out.push({ id: a.id, minutes: a.minutes, awardedAt, groupId: isId(a.group_id) ? a.group_id : null, ...(Object.hasOwn(a, "focus") ? { focus: parseFocus(a.focus) } : {}) });
  }
  return out;
}

const ERROR_CODES: readonly StudyErrorCode[] = [
  "not_authenticated", "not_available", "group_not_found", "group_deleted", "not_member", "not_owner",
  "group_limit", "group_full", "invalid_invite", "removed", "cannot_remove_self", "restore_expired",
  "invalid_name", "invalid_color", "invalid_duration", "invalid_desks", "no_sitting", "round_running", "on_break", "not_organizer",
  "busy_elsewhere", "need_two", "nothing_to_pause", "invalid_tap", "target_not_member", "invalid_ids", "invalid_focus",
];

/**
 * The reason behind a failed call. The server raises its reason as the
 * exception message (e.g. "group_full"); a fetch that never reached it is
 * "network".
 */
export function parseErrorCode(error: unknown): StudyErrorCode {
  if (!isObj(error) && !(error instanceof Error)) return "unknown";
  const e = error as { message?: unknown; code?: unknown; name?: unknown; details?: unknown };
  const message = typeof e.message === "string" ? e.message.trim() : "";
  const known = oneOf(message, ERROR_CODES);
  if (known) return known;
  if (e.name === "AbortError" || e.name === "TypeError" || /fetch|network|load failed|timed? ?out|abort/i.test(message)) {
    return "network";
  }
  return "unknown";
}
