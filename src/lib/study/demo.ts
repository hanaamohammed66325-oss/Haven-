// ---------------------------------------------------------------------------
// Group study: a pretend server inside the page, for the local demo route only
// (src/app/study-demo/). It answers like the real study_* functions, through
// the same StudyTransport the real page uses, so the demo runs the real
// session controller and screen. It follows the server's rules where the demo
// can show them (the sitting and its desks, the 3-minute rule, need-two, the
// organizer's pause), and lets the demo page play the other members.
//
// Local only, never pushed; deleted with the demo route.
// ---------------------------------------------------------------------------

import type { ChannelHandlers, PresenceState, StudyChannel, StudyTransport } from "./session";
import { StudyError, type StudyFocus } from "./types";
import { STUDY_LIMITS, breakEndAt, isRunning, phaseAt, validDesks, validDurations } from "./rules";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const iso = (t: number) => new Date(t).toISOString();

export const DEMO_GROUP = uuid(0xa11);
export const DEMO_ME = uuid(1);

export interface DemoMember {
  userId: string;
  seat: number;
  displayName: string;
  haviName: string;
  haviColor: string;
  flowerColor: string;
  /** On the group page. */
  online: boolean;
  /** The page is showing (the Havi is awake). */
  awake: boolean;
}

interface DemoParticipant { active: boolean; leftReason: string | null; focus: StudyFocus }
interface DemoRound {
  id: string; seq: number; startsAt: number; studyMs: number; breakMs: number;
  pausedAt: number | null; pausedTotalMs: number;
  participants: Map<string, DemoParticipant>;
}
interface DemoSitting { id: string; organizerId: string; startedAt: number; deskCount: number; desksForSeq: number; studyMinutes?: number; breakMinutes?: number; longBreakMinutes?: number; sessionsBeforeLong?: number; focusWarning?: boolean }

const FRIENDS: Array<[string, string, string, string]> = [
  ["نورة", "نونو", "#83c9ba", "#eebc6d"],
  ["سارة", "سوسو", "#e3a2b3", "#a4c9ed"],
  ["ريم", "ريمو", "#b8acd9", "#cfabea"],
  ["لينا", "لولو", "#d8c38a", "#e5a88a"],
  ["محمد", "حمودي", "#88b5d1", "#b9d09b"],
  ["عمر", "عمور", "#bbd09c", "#eb9cba"],
  ["عبدالله", "عبود", "#dda899", "#ebcf86"],
  ["فاطمة", "فطوم", "#b5acd2", "#cdb4ec"],
  ["شهد", "شهودة", "#98c4bb", "#edb7c8"],
];

export class DemoStudyServer {
  readonly members: DemoMember[];
  private version = 1;
  private sitting: DemoSitting | null = null;
  private round: DemoRound | null = null;
  private ids = 100;
  private channels = new Set<ChannelHandlers>();
  private lastPoke = new Map<string, number>();
  /** Pads earned on the group lake, by owner, oldest first. */
  harvest: string[] = [];
  harvestDetails: Array<{ id: string; focus: StudyFocus | null }> = [];
  private choices = new Map<string, StudyFocus>();
  private ready = new Set<string>();
  private harvestListeners = new Set<() => void>();
  private settled = new Set<string>();

  constructor(myName: string, myColor: string, myFlower: string, history = 22) {
    this.members = [
      { userId: DEMO_ME, seat: 0, displayName: myName, haviName: "Havi", haviColor: myColor, flowerColor: myFlower, online: true, awake: true },
      ...FRIENDS.map(([displayName, haviName, haviColor, flowerColor], i) => ({
        userId: uuid(2 + i), seat: i + 1, displayName, haviName, haviColor, flowerColor, online: false, awake: true,
      })),
    ];
    // Earlier sittings' pads, shared round-robin.
    for (let i = 0; i < history; i++) { this.harvest.push(this.members[i % 6].userId); this.harvestDetails.push({ id: uuid(this.ids++), focus: null }); }
  }

  // ---- what the demo page does as the other members ----------------------

  member(userId: string) { return this.members.find((m) => m.userId === userId); }
  setFocusAs(userId: string, focus: StudyFocus) {
    if (!this.sitting) throw new StudyError("no_sitting");
    if (this.round && isRunning(this.phase(Date.now()))) throw new StudyError("round_running");
    if (!this.member(userId)) throw new StudyError("not_member");
    this.ready.delete(userId);
    this.choices.set(userId, { ...focus }); this.changed();
  }

  setReadyAs(userId: string, ready: boolean) {
    if (!this.sitting) throw new StudyError("no_sitting");
    if (this.round && isRunning(this.phase(Date.now()))) throw new StudyError("round_running");
    if (!this.member(userId)?.online) throw new StudyError("not_member");
    if (ready) this.ready.add(userId); else this.ready.delete(userId);
    this.changed();
  }

  /** A member opens the group page (or closes it). Outside a round their desk follows. */
  setOnline(userId: string, online: boolean) {
    const m = this.member(userId);
    if (!m || m.userId === DEMO_ME || m.online === online) return;
    m.online = online;
    if (!online) this.ready.delete(userId);
    m.awake = true;
    this.changed();
    this.presence();
  }

  /** A member's page hides (their Havi falls asleep) or shows again. */
  setAwake(userId: string, awake: boolean) {
    const m = this.member(userId);
    if (!m || !m.online || m.awake === awake) return;
    m.awake = awake;
    if (!awake) this.ready.delete(userId);
    this.changed();
    this.presence();
  }

  /** A member leaves the running round (their desk stays theirs, empty, until the break). */
  leaveRoundAs(userId: string) {
    const p = this.round?.participants.get(userId);
    if (!p || !p.active) return;
    p.active = false;
    p.leftReason = "left";
    this.changed();
  }

  /** A member taps another member's Havi. */
  pokeAs(fromId: string, targetId: string) {
    const now = Date.now();
    if (now - (this.lastPoke.get(fromId) ?? 0) < 2000) return;
    this.lastPoke.set(fromId, now);
    const tap = `demo-${this.ids++}`;
    for (const h of this.channels) h.onPoke(targetId, tap);
  }

  /** A member opens the sitting (the demo's way to see it as a member, not the organizer). */
  openSittingAs(userId: string, desks: number) {
    if (this.sitting) return;
    this.sitting = { id: uuid(this.ids++), organizerId: userId, startedAt: Date.now(), deskCount: desks, desksForSeq: 1 };
    this.changed();
  }

  /** Moves the clock on: the round (and the sitting) happened this much earlier. */
  skip(ms: number) {
    const r = this.round;
    if (r && r.pausedAt === null) r.startsAt -= ms;
    if (this.sitting) this.sitting.startedAt -= ms;
    this.changed();
  }

  /** To the end of the study time (or of the break). */
  skipToBoundary() {
    const r = this.round;
    if (!r || r.pausedAt !== null) return;
    const now = Date.now();
    const phase = this.phase(now);
    if (phase === "scheduled") this.skip(r.startsAt - now + 1);
    else if (phase === "study") this.skip(r.startsAt + r.studyMs + r.pausedTotalMs - now + 1);
    else if (phase === "break") this.skip(breakEndAt(this.timing(r)) - now + 1);
  }

  /** Ends the sitting, as the server does after a long pause or when everyone has gone. */
  endSitting() {
    this.settle();
    this.choices.clear();
    this.ready.clear();
    this.sitting = null;
    this.round = null;
    this.changed();
  }

  onHarvest(fn: () => void) {
    this.harvestListeners.add(fn);
    return () => this.harvestListeners.delete(fn);
  }

  // ---- the transport the session controller uses -------------------------

  readonly transport: StudyTransport = {
    pageState: async (_group, _page, open, awake) => {
      const me = this.member(DEMO_ME);
      if (me && (me.online !== open || me.awake !== awake)) {
        me.online = open;
        me.awake = awake;
        if (!open || !awake) this.ready.delete(DEMO_ME);
        this.changed();
      }
      return this.answer();
    },
    state: async () => this.answer(),
    heartbeat: async () => this.answer(),
    openSitting: async (_g, desks) => {
      if (!validDesks(desks, this.members.length)) throw new StudyError("invalid_desks");
      if (!this.sitting) {
        this.sitting = { id: uuid(this.ids++), organizerId: DEMO_ME, startedAt: Date.now(), deskCount: desks, desksForSeq: 1 };
        this.round = null;
        this.changed();
      }
      return this.answer();
    },
    setDesks: async (_g, desks) => {
      if (!validDesks(desks, this.members.length)) throw new StudyError("invalid_desks");
      const s = this.sitting;
      if (!s) throw new StudyError("no_sitting");
      if (s.organizerId !== DEMO_ME) throw new StudyError("not_organizer");
      if (this.round && isRunning(this.phase(Date.now()))) throw new StudyError("round_running");
      s.deskCount = desks;
      s.desksForSeq = (this.round?.seq ?? 0) + 1;
      this.changed();
      return this.answer();
    },
    setDurations: async (_g, studyMinutes, breakMinutes, longBreakMinutes=15, sessionsBeforeLong=4) => {
      if (!validDurations(studyMinutes, breakMinutes)) throw new StudyError("invalid_duration");
      if (!this.sitting) throw new StudyError("no_sitting");
      if (this.sitting.organizerId !== DEMO_ME) throw new StudyError("not_organizer");
      if (this.round && isRunning(this.phase(Date.now()))) throw new StudyError("round_running");
      if (!Number.isInteger(longBreakMinutes) || longBreakMinutes<5 || longBreakMinutes>45 || !Number.isInteger(sessionsBeforeLong) || sessionsBeforeLong<2 || sessionsBeforeLong>8) throw new StudyError("invalid_duration");
      if(this.phase(Date.now()) === "break") throw new StudyError("round_running");
      Object.assign(this.sitting, { studyMinutes, breakMinutes, longBreakMinutes, sessionsBeforeLong });
      this.changed();
      return this.answer();
    },
    setReady: async (_g, ready) => { this.setReadyAs(DEMO_ME, ready); return this.answer(); },
    setFocus: async (_g, focus) => { this.setFocusAs(DEMO_ME, focus); return this.answer(); },
    startRound: async (_g, studyMinutes, breakMinutes, confirmMissing = false, confirmedIds = []) => {
      if (!validDurations(studyMinutes, breakMinutes)) throw new StudyError("invalid_duration");
      const s = this.sitting;
      if (!s) throw new StudyError("no_sitting");
      const now = Date.now();
      const phase = this.round ? this.phase(now) : null;
      if (isRunning(phase)) throw new StudyError("round_running");
      if (phase === "break") throw new StudyError("on_break");
      if (s.organizerId !== DEMO_ME) {
        if (now < this.othersMayStartAt()) throw new StudyError("not_organizer");
        s.organizerId = DEMO_ME;
      }
      const present = this.members.filter((m) => m.online && m.awake);
      if (present.length < 2) throw new StudyError("need_two");
      const missing = present.filter((m) => !this.choices.has(m.userId) || !this.ready.has(m.userId));
      if (missing.length && (!confirmMissing || missing.some((m) => !confirmedIds.includes(m.userId)))) {
        s.focusWarning = true; this.changed(); return this.answer();
      }
      s.focusWarning = false;
      this.ready.clear();
      this.settle();
      this.round = {
        id: uuid(this.ids++), seq: (this.round?.seq ?? 0) + 1, startsAt: now + 3000,
        studyMs: (s.studyMinutes??studyMinutes) * 60_000, breakMs: ((this.round?.seq ?? 0)+1) % (s.sessionsBeforeLong??4) === 0 ? (s.longBreakMinutes??15)*60_000 : (s.breakMinutes??breakMinutes)*60_000, pausedAt: null, pausedTotalMs: 0,
        participants: new Map(present.map((m) => [m.userId, { active: true, leftReason: null,
          focus: { ...(this.choices.get(m.userId) ?? { key: "", courseId: null, task: null, title: null, courseName: null }) } }])),
      };
      this.changed();
      return this.answer();
    },
    pauseRound: async () => {
      const r = this.round;
      if (!r || this.phase(Date.now()) !== "study") throw new StudyError("nothing_to_pause");
      if (this.sitting?.organizerId !== DEMO_ME) throw new StudyError("not_organizer");
      r.pausedAt = Date.now();
      this.changed();
      return this.answer();
    },
    resumeRound: async () => {
      const r = this.round;
      if (!r || r.pausedAt === null) return this.answer();
      if (this.sitting?.organizerId !== DEMO_ME) throw new StudyError("not_organizer");
      r.pausedTotalMs += Date.now() - r.pausedAt;
      r.pausedAt = null;
      this.changed();
      return this.answer();
    },
    leaveRound: async () => {
      this.leaveRoundAs(DEMO_ME);
      return this.answer();
    },
    endSitting: async () => {
      if (this.sitting?.organizerId !== DEMO_ME) throw new StudyError("not_organizer");
      this.endSitting();
      return this.answer();
    },
    poke: async () => {
      const now = Date.now();
      if (now - (this.lastPoke.get(DEMO_ME) ?? 0) < 2000) return false;
      this.lastPoke.set(DEMO_ME, now);
      return true;
    },
    openChannel: async (_topic, _myId, handlers): Promise<StudyChannel> => {
      this.channels.add(handlers);
      setTimeout(() => {
        if (!this.channels.has(handlers)) return;
        handlers.onStatus("subscribed");
        handlers.onPresence(this.presenceState());
      }, 120);
      return {
        track: async (awake) => {
          const me = this.member(DEMO_ME);
          if (me && me.awake !== awake) { me.awake = awake; this.presence(); }
        },
        close: async () => { this.channels.delete(handlers); },
      };
    },
  };

  // ---- inside ------------------------------------------------------------

  private timing(r: DemoRound) {
    return { startsAt: r.startsAt, studyMs: r.studyMs, breakMs: r.breakMs, pausedAt: r.pausedAt, pausedTotalMs: r.pausedTotalMs, phase: "study" as const };
  }

  private phase(now: number) {
    return this.round ? phaseAt(this.timing(this.round), now) : null;
  }

  private othersMayStartAt() {
    const r = this.round;
    return r ? breakEndAt(this.timing(r)) + STUDY_LIMITS.othersStartDelayMs : (this.sitting?.startedAt ?? 0) + STUDY_LIMITS.othersStartDelayMs;
  }

  /** A finished round's members each earn a pad on the group lake (once). */
  private settle() {
    const r = this.round;
    if (!r || this.settled.has(r.id)) return;
    const phase = this.phase(Date.now());
    if (phase !== "break" && phase !== "over") return;
    this.settled.add(r.id);
    for (const [userId, p] of r.participants) if (p.active) {
      this.harvest = [...this.harvest, userId];
      this.harvestDetails = [...this.harvestDetails, { id: uuid(this.ids++), focus: { ...p.focus } }];
    }
    for (const fn of this.harvestListeners) fn();
  }

  private answer() {
    this.settle();
    const now = Date.now();
    const s = this.sitting, r = this.round;
    return {
      server_time: iso(now),
      legacy_presence: false,
      group: { id: DEMO_GROUP, name: "مجموعة المذاكرة", version: this.version, epoch: 1, is_owner: true, cap: 10 },
      members: this.members.map((m) => ({
        user_id: m.userId, seat: m.seat, display_name: m.displayName, havi_name: m.haviName,
        havi_color: m.haviColor, flower_color: m.flowerColor,
        is_owner: m.userId === DEMO_ME, is_me: m.userId === DEMO_ME,
        fresh: m.online && m.awake, on_page: m.online, awake: m.online && m.awake,
        focus: this.focusJson(this.choices.get(m.userId)), ready: this.ready.has(m.userId),
      })),
      sitting: s && {
        id: s.id, organizer_id: s.organizerId, started_at: iso(s.startedAt),
        desk_count: s.deskCount, desks_for_seq: s.desksForSeq,
        study_minutes: s.studyMinutes, break_minutes: s.breakMinutes, cycle_enabled:true,long_break_minutes:s.longBreakMinutes??15,sessions_before_long:s.sessionsBeforeLong??4,
        ready_enabled: true, missing_ready: this.members.filter((m) => m.online && m.awake && !this.ready.has(m.userId)).map((m) => m.userId),
        focus_enabled: true, focus_warning: s.focusWarning === true,
        missing_focus: this.members.filter((m) => m.online && m.awake && !this.choices.has(m.userId)).map((m) => m.userId),
      },
      round: r && {
        id: r.id, seq: r.seq, starts_at: iso(r.startsAt), study_ms: r.studyMs, break_ms: r.breakMs,
        paused_at: r.pausedAt === null ? null : iso(r.pausedAt), paused_total_ms: r.pausedTotalMs,
        settled_at: this.settled.has(r.id) ? iso(r.startsAt + r.studyMs + r.pausedTotalMs) : null,
        phase: this.phase(now), others_may_start_at: iso(this.othersMayStartAt()),
        participants: [...r.participants].map(([userId, p]) => ({ user_id: userId, active: p.active, left_reason: p.leftReason, focus: this.focusJson(p.focus) })),
      },
    };
  }

  private focusJson(focus: StudyFocus | undefined) {
    return focus ? { key: focus.key, course_id: focus.courseId, task: focus.task, title: focus.title, course_name: focus.courseName } : null;
  }

  private changed() {
    this.version++;
    const v = this.version;
    setTimeout(() => { for (const h of this.channels) h.onChanged(v); }, 60);
  }

  private presenceState(): PresenceState {
    const out: PresenceState = {};
    for (const m of this.members) if (m.online) out[m.userId] = [{ awake: m.awake }];
    return out;
  }

  private presence() {
    const p = this.presenceState();
    setTimeout(() => { for (const h of this.channels) h.onPresence(p); }, 60);
  }
}
