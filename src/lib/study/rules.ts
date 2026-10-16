// ---------------------------------------------------------------------------
// Group study: the rules the screen follows, as pure functions.
//
// The server decides everything that counts (who earns, who may start, when a
// round ends); these mirror its rules so the screen can show the right state
// between snapshots without asking again. Each mirror names the database
// function it follows (supabase/migrations/20261015_study_groups.sql and
// 20261017_study_desks.sql).
// ---------------------------------------------------------------------------

import type { StudyLeftReason, StudyPhase, StudyRound, StudySitting, StudyState } from "./types";

const MINUTE = 60_000;

/** Prefill from the organizer's own settings, within the group server limits. */
export function initialStudyDurations(study = 25, rest = 5): { study: number; rest: number } {
  const bounded = (n: number, fallback: number, min: number, max: number) =>
    Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  return { study: bounded(study, 25, STUDY_LIMITS.studyMinutes.min, STUDY_LIMITS.studyMinutes.max), rest: bounded(rest, 5, STUDY_LIMITS.breakMinutes.min, STUDY_LIMITS.breakMinutes.max) };
}

export const STUDY_LIMITS = {
  maxMembers: 10,
  maxGroups: 5,
  studyMinutes: { min: 5, max: 90 },
  breakMinutes: { min: 1, max: 45 },
  /** Desks the organizer may set (study_open_sitting, study_set_desks). */
  desks: { min: 2, max: 10 },
  /** Away this long (running study time, no check-in): out of the round. */
  awayLimitMs: 10 * MINUTE,
  /** How often an open session page checks in. */
  heartbeatMs: 2 * MINUTE,
  /** Checked in this recently: counts as present for starting a round. */
  presentWindowMs: 3 * MINUTE,
  /** After the break, others may start the next round this much later. */
  othersStartDelayMs: 3 * MINUTE,
  /** Paused longer than this: the sitting ends. */
  pauseLimitMs: 30 * MINUTE,
  /** A page hidden this long shows its Havi asleep (looks only, no penalty). */
  sleepAfterHiddenMs: 30_000,
} as const;

/** Both whole minutes within the server's limits (study_start_round). */
export function validDurations(studyMinutes: number, breakMinutes: number): boolean {
  const { studyMinutes: s, breakMinutes: b } = STUDY_LIMITS;
  return Number.isInteger(studyMinutes) && Number.isInteger(breakMinutes)
    && studyMinutes >= s.min && studyMinutes <= s.max
    && breakMinutes >= b.min && breakMinutes <= b.max;
}

export function validCycle(longMinutes:number|undefined,count:number|undefined):boolean {
  return longMinutes===undefined && count===undefined || Number.isInteger(longMinutes) && Number.isInteger(count) && longMinutes!>=5 && longMinutes!<=45 && count!>=2 && count!<=8;
}

/** A number of desks the server accepts. */
export function validDesks(n: number, memberCount: number = STUDY_LIMITS.desks.max): boolean {
  return Number.isInteger(n) && n >= STUDY_LIMITS.desks.min && n <= Math.min(memberCount, STUDY_LIMITS.desks.max);
}

// ---------------------------------------------------------------------------
// The server's clock
// ---------------------------------------------------------------------------

/** One reading of the server's clock against this device's. */
export interface ClockSample {
  /** serverTime - local time at the request's midpoint. */
  offsetMs: number;
  /** Round trip; a shorter one is a more precise reading. */
  rttMs: number;
}

/** A reading from a snapshot's server time and when its request left and came back. */
export function clockSample(serverTime: number, sentAt: number, receivedAt: number): ClockSample | null {
  if (!Number.isFinite(serverTime) || !(receivedAt >= sentAt)) return null;
  return { offsetMs: serverTime - (sentAt + receivedAt) / 2, rttMs: receivedAt - sentAt };
}

/** Keeps the latest `keep` readings (the clocks may drift over a long sitting). */
export function addClockSample(samples: readonly ClockSample[], s: ClockSample | null, keep = 6): ClockSample[] {
  return s ? [...samples, s].slice(-keep) : [...samples];
}

/** Server time = local time + this. The reading with the shortest round trip wins. */
export function clockOffset(samples: readonly ClockSample[]): number {
  let best: ClockSample | null = null;
  for (const s of samples) if (!best || s.rttMs < best.rttMs) best = s;
  return best ? Math.round(best.offsetMs) : 0;
}

// ---------------------------------------------------------------------------
// A round's timing (study.elapsed_ms, study.study_end_at, study.phase)
// ---------------------------------------------------------------------------

type Timing = Pick<StudyRound, "startsAt" | "studyMs" | "breakMs" | "pausedAt" | "pausedTotalMs" | "phase">;

/** Study time that has run: frozen while paused, capped at the length. */
export function elapsedStudyMs(r: Timing, now: number): number {
  const ran = (r.pausedAt ?? now) - r.startsAt - r.pausedTotalMs;
  return Math.max(0, Math.min(r.studyMs, ran));
}

/** When the study time ends (final once the round is no longer paused). */
export function studyEndAt(r: Timing): number {
  return r.startsAt + r.studyMs + r.pausedTotalMs;
}

export function breakEndAt(r: Timing): number {
  return studyEndAt(r) + r.breakMs;
}

/** The phase at `now` (server time). A cancelled round stays cancelled. */
export function phaseAt(r: Timing, now: number): StudyPhase {
  if (r.phase === "cancelled") return "cancelled";
  if (now < r.startsAt) return "scheduled";
  if (r.pausedAt !== null) return "paused";
  if (elapsedStudyMs(r, now) < r.studyMs) return "study";
  if (now < breakEndAt(r)) return "break";
  return "over";
}

/** In play: the round still counts and blocks a new one. */
export const isRunning = (phase: StudyPhase | null): boolean =>
  phase === "scheduled" || phase === "study" || phase === "paused";

/** When a pause ends the sitting (server: study.sweep), or null when not paused. */
function pauseEndsAt(r: Timing): number | null {
  return r.pausedAt === null ? null : r.pausedAt + STUDY_LIMITS.pauseLimitMs;
}

/** What the timer shows at `now`. */
interface RoundClock {
  phase: StudyPhase;
  /** Study time left (frozen while paused). */
  studyLeftMs: number;
  /** Break time left; 0 outside the break. */
  breakLeftMs: number;
  /** 0 to 1 through the study time (the centre leaf's growth). */
  progress: number;
}

export function roundClock(r: Timing, now: number): RoundClock {
  const phase = phaseAt(r, now);
  const elapsed = elapsedStudyMs(r, now);
  return {
    phase,
    studyLeftMs: phase === "scheduled" ? r.studyMs : r.studyMs - elapsed,
    breakLeftMs: phase === "break" ? Math.max(0, breakEndAt(r) - now) : 0,
    progress: phase === "scheduled" ? 0 : elapsed / r.studyMs,
  };
}

/**
 * The next moment the round changes by itself (server time), so the screen
 * can ask for a fresh snapshot then: the start, the end of the study time, the
 * end of the break, or the end of a too-long pause. null when nothing is due.
 */
export function nextBoundary(r: Timing, now: number): number | null {
  switch (phaseAt(r, now)) {
    case "scheduled": return r.startsAt;
    case "study": return studyEndAt(r);
    case "paused": return pauseEndsAt(r);
    case "break": return breakEndAt(r);
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Who does what (study_open_sitting, study_set_desks, study_start_round,
// study_pause_round, study_resume_round)
// ---------------------------------------------------------------------------

export function isOrganizer(state: StudyState, myId: string): boolean {
  return state.sitting?.organizerId === myId;
}

/** Any member may open a sitting (and set its desks) when none is open. */
export function canOpenSitting(state: StudyState): boolean {
  return state.sitting === null;
}

/** The organizer changes the desks while no round is in play (waiting, or a break). */
export function canSetDesks(state: StudyState, myId: string, now: number): boolean {
  if (!state.sitting || !isOrganizer(state, myId)) return false;
  return !state.round || !isRunning(phaseAt(state.round, now));
}

/** When members other than the organizer may start the next round (study.others_may_start_at). */
export function othersMayStartAt(sitting: StudySitting, round: StudyRound | null): number {
  // The server computes it with the round's cancel time, which the snapshot
  // carries only inside this value.
  return round ? round.othersMayStartAt : sitting.startedAt + STUDY_LIMITS.othersStartDelayMs;
}

export type StartCheck =
  | { ok: true; /** I'm not the organizer and become it by starting. */ takesOver: boolean }
  | {
      ok: false;
      reason: "no_sitting" | "round_running" | "on_break" | "not_organizer" | "need_two";
      /** When it may change. */
      until: number | null;
    };

/**
 * Whether I may start the next round now, as the server will judge it. A
 * sitting must be open first (the waiting stage). A round in play blocks it;
 * so does its break. The organizer may start at once (after the break), anyone
 * else 3 minutes later (and becomes the organizer). Two members present are
 * needed (the server also leaves out anyone studying in another group, which
 * the snapshot doesn't show).
 */
export function startCheck(state: StudyState, myId: string, now: number): StartCheck {
  const r = state.round;
  const s = state.sitting;
  if (!s) return { ok: false, reason: "no_sitting", until: null };
  const phase = r ? phaseAt(r, now) : null;
  const organizer = s.organizerId === myId;
  if (isRunning(phase)) return { ok: false, reason: "round_running", until: null };
  if (r && phase === "break") {
    return { ok: false, reason: "on_break", until: organizer ? breakEndAt(r) : othersMayStartAt(s, r) };
  }
  if (!organizer) {
    const at = othersMayStartAt(s, r);
    if (now < at) return { ok: false, reason: "not_organizer", until: at };
  }
  const present = state.members.filter((m) => m.isMe || m.fresh).length;
  if (present < 2) return { ok: false, reason: "need_two", until: null };
  return { ok: true, takesOver: !organizer };
}

export function canPause(state: StudyState, myId: string, now: number): boolean {
  return !!state.round && isOrganizer(state, myId) && phaseAt(state.round, now) === "study";
}

export function canResume(state: StudyState, myId: string, now: number): boolean {
  return !!state.round && isOrganizer(state, myId) && phaseAt(state.round, now) === "paused";
}

// ---------------------------------------------------------------------------
// My part in the round (study.settle)
// ---------------------------------------------------------------------------

export type MyRoundStatus =
  /** No round in play. */
  | { kind: "none" }
  /** In the round: earns it by staying (and not being away 10 minutes). */
  | { kind: "in" }
  /** Arrived after the start: studies along, earns from the next round. */
  | { kind: "late" }
  /** Out of this round. */
  | { kind: "out"; reason: StudyLeftReason }
  /** Local time passed the end; wait for the server to settle eligibility. */
  | { kind: "pending" }
  /** A post-end server snapshot confirms eligibility, not local persistence. */
  | { kind: "earned" };

export function myRoundStatus(state: StudyState, myId: string, now: number): MyRoundStatus {
  const r = state.round;
  if (!r) return { kind: "none" };
  const phase = phaseAt(r, now);
  const me = r.participants.find((p) => p.userId === myId);
  if (isRunning(phase)) {
    if (!me) return { kind: "late" };
    return me.active ? { kind: "in" } : { kind: "out", reason: me.leftReason ?? "left" };
  }
  if (phase === "break" && me) {
    if (!me.active) return { kind: "out", reason: me.leftReason ?? "left" };
    return r.settledAt != null && r.settledAt >= studyEndAt(r)
      && r.settledAt <= state.serverTime && r.phase === "break"
      ? { kind: "earned" } : { kind: "pending" };
  }
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Who is at a desk, and awake
// ---------------------------------------------------------------------------

/**
 * Members with a desk: me, everyone on the page (Presence), and everyone still
 * in the round, through its break (a phone whose page is hidden drops off
 * Presence, but its Havi sleeps at the desk rather than leaving it).
 */
export function deskOccupants(state: StudyState, online: ReadonlySet<string>, myId: string, now: number): Set<string> {
  const out = new Set<string>();
  const r = state.round;
  const phase = r ? phaseAt(r, now) : null;
  const inRound = new Set(
    r && (isRunning(phase) || phase === "break") ? r.participants.filter((p) => p.active).map((p) => p.userId) : [],
  );
  for (const m of state.members) {
    if (m.userId === myId || online.has(m.userId) || inRound.has(m.userId)) out.add(m.userId);
  }
  return out;
}

/**
 * Who is awake, from the channel's Presence (keyed by user id; a member with
 * two tabs has two entries, and is awake if either is). Only active members
 * count: an unknown key is ignored, and nothing else is read from Presence.
 * Members not on the page are left out.
 */
export function awakeFromPresence(
  presence: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>,
  memberIds: Iterable<string>,
  now?: number,
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const id of memberIds) {
    const metas = presence[id];
    if (!metas || metas.length === 0) continue;
    out.set(id, metas.some((m) => m.awake === true &&
      (now === undefined || typeof m.seen_at !== "number" ||
        (Number.isFinite(m.seen_at) && now - m.seen_at < STUDY_LIMITS.sleepAfterHiddenMs))));
  }
  return out;
}

/** One presence source for rendering and desk planning; old servers retain Presence. */
export function snapshotPresence(state: StudyState): boolean {
  return state.members.length > 0 && state.members.every((m) =>
    typeof m.onPage === "boolean" && typeof m.awake === "boolean");
}

export function roomPresence(
  state: StudyState, myId: string, myAwake: boolean,
  presence: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>> = {},
  now?: number, connected = false,
): Map<string, boolean> {
  if (!snapshotPresence(state)) {
    const result = awakeFromPresence(presence, state.members.map((m) => m.userId), now);
    if (connected) result.set(myId, myAwake);
    return result;
  }
  const result = new Map<string, boolean>();
  for (const member of state.members) {
    const local = member.userId === myId && myAwake;
    if (member.onPage || local) result.set(member.userId, member.awake === true || local);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Desks (her decision, 2026-10-06): the organizer sets the number
// ---------------------------------------------------------------------------

/**
 * Desks prepared now: the number the organizer set, for the round it was set
 * for (the next one at the time). Shown while waiting for that round and
 * during it; at its break the empty ones sink, unless the organizer sets a
 * number for the next round. 0 without a sitting.
 */
export function preparedDesks(state: StudyState, now: number): number {
  const s = state.sitting;
  if (!s) return 0;
  const r = state.round;
  const seq = !r ? 1 : isRunning(phaseAt(r, now)) ? r.seq : r.seq + 1;
  return s.desksForSeq === seq ? s.deskCount : 0;
}

/**
 * Where place `i` sits in the row, counted from the middle: 0, then 1 to the
 * right, 1 to the left, 2 to the right, and so on. The scene spreads the
 * desks standing evenly round the lake in this order, so a new desk at the
 * end of the row comes in at the front, on alternate sides, and the others
 * glide aside for it (her decision, 2026-10-06).
 */
export function deskOffset(place: number): number {
  if (place === 0) return 0;
  return place % 2 === 1 ? (place + 1) / 2 : -place / 2;
}

export interface DeskSlot {
  /** Who sits here; null for an empty desk. */
  userId: string | null;
  /** The owner left during the round: the desk stays theirs, empty, until the break. */
  away: boolean;
}

export interface DeskPlan {
  /** The sitting the plan belongs to; a new sitting starts from open water. */
  sittingId: string | null;
  /** By place (deskOffset); null is open water. */
  places: (DeskSlot | null)[];
}

export interface DeskInput {
  sittingId: string | null;
  /** A round is in play: nothing sinks. */
  running: boolean;
  /** preparedDesks(). */
  prepared: number;
  /** Active members, with their stable seats (who is seated first). */
  members: ReadonlyArray<{ userId: string; seat: number }>;
  /** Who has a desk now (deskOccupants). */
  occupants: ReadonlySet<string>;
}

/**
 * Who has which desk. The scene shows the difference from the previous plan
 * (a desk rising from the water, or sinking), and nobody changes desk:
 * - an arrival takes the empty desk nearest the middle, else a new desk rises
 *   at the nearest open place (the end of the row);
 * - during a round nothing sinks: a member who leaves keeps their desk, empty,
 *   and gets it back on return;
 * - outside a round (waiting, break) the empty desks beyond the prepared
 *   number sink, the farthest first, and missing prepared desks rise.
 */
export function planDesks(prev: DeskPlan | null, input: DeskInput): DeskPlan {
  if (!input.sittingId) return { sittingId: null, places: [] };
  const places: (DeskSlot | null)[] =
    prev && prev.sittingId === input.sittingId ? prev.places.map((p) => (p ? { ...p } : null)) : [];
  const here = (id: string) => input.occupants.has(id);
  const firstOpen = () => {
    const i = places.indexOf(null);
    return i < 0 ? places.length : i;
  };

  // Owners who left: away during a round; outside one, their desk is just empty.
  places.forEach((p, i) => {
    if (!p || p.userId === null) return;
    if (here(p.userId)) p.away = false;
    else if (input.running) p.away = true;
    else places[i] = { userId: null, away: false };
  });

  // Arrivals, by seat.
  const seated = new Set(places.flatMap((p) => (p && p.userId !== null ? [p.userId] : [])));
  for (const { userId } of [...input.members].sort((a, b) => a.seat - b.seat)) {
    if (!here(userId) || seated.has(userId)) continue;
    let at = places.findIndex((p) => p !== null && p.userId === null);
    if (at < 0) at = firstOpen();
    places[at] = { userId, away: false };
    seated.add(userId);
  }

  if (!input.running) {
    const taken = places.filter((p) => p !== null && p.userId !== null).length;
    const want = Math.max(0, input.prepared - taken);
    let empty = places.filter((p) => p !== null && p.userId === null).length;
    for (let i = places.length - 1; i >= 0 && empty > want; i--) {
      const p = places[i];
      if (p && p.userId === null) {
        places[i] = null;
        empty--;
      }
    }
    for (; empty < want; empty++) places[firstOpen()] = { userId: null, away: false };
  }

  while (places.length > 0 && places[places.length - 1] === null) places.pop();
  return { sittingId: input.sittingId, places };
}

// ---------------------------------------------------------------------------
// Snapshots and devices
// ---------------------------------------------------------------------------

/** Whether a snapshot may replace the one shown (an older one never does). */
export function isNewerState(next: StudyState, current: StudyState | null): boolean {
  if (!current) return true;
  if (next.group.id !== current.group.id) return false;
  if (next.group.version !== current.group.version) return next.group.version > current.group.version;
  return next.serverTime >= current.serverTime;
}

/**
 * A phone or tablet: its hidden page stops checking in at once (switching apps
 * counts as away, her rule). iPadOS reports a Mac, but with touch points.
 */
export function isHandheld(userAgent: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** The private Realtime topic of a group (study.can_listen). */
export function groupTopic(groupId: string, epoch: number): string {
  return `study:${groupId}:${epoch}`;
}
