// ---------------------------------------------------------------------------
// Group study («جلسة جماعية»): the shapes the app works with.
//
// The server (supabase/migrations/20261015_study_groups.sql) answers in
// snake_case JSON; parse.ts translates it into these types, and nothing else
// reads the raw JSON. Times are epoch milliseconds on the server's clock.
// ---------------------------------------------------------------------------

/** A round's phase, derived from its timestamps (study.phase on the server). */
export type StudyPhase = "scheduled" | "study" | "paused" | "break" | "over" | "cancelled";

/** What the other members see of a member, chosen by that member. */
export interface StudyAppearance {
  displayName: string;
  haviName: string;
  /** "#rrggbb", lower case. */
  haviColor: string;
  flowerColor: string;
}

/** A public snapshot of only the selected work, never the member's task list. */
export interface StudyFocus {
  key: string;
  courseId: string | null;
  task: string | null;
  title: string | null;
  courseName: string | null;
}

export interface StudyMember extends StudyAppearance {
  /** The member's equipped app clothes; absent on older servers. */
  haviCosmetics?: readonly string[];
  focus?: StudyFocus | null;
  ready?: boolean;
  userId: string;
  /** Stable seat index in the group (0 to 9), kept while the member stays. */
  seat: number;
  isOwner: boolean;
  isMe: boolean;
  /** An awake open page lease within 45 seconds (server eligibility). */
  fresh: boolean;
  /** Optional server-presence capability; absent on older servers. */
  onPage?: boolean;
  /** Display-only awake lease within 30 seconds. */
  awake?: boolean;
}

export type StudyLeftReason = "left" | "away" | "removed" | "group_left";

export interface StudyParticipant {
  focus?: StudyFocus | null;
  ready?: boolean;
  userId: string;
  /** Still in the round. */
  active: boolean;
  leftReason: StudyLeftReason | null;
}

export interface StudyRound {
  id: string;
  seq: number;
  startsAt: number;
  studyMs: number;
  breakMs: number;
  pausedAt: number | null;
  pausedTotalMs: number;
  /** Server settlement proof; absent on snapshots predating the finish migration. */
  settledAt?: number | null;
  /** The phase at the snapshot's server time. */
  phase: StudyPhase;
  /** From then on, any present member may start the next round. */
  othersMayStartAt: number;
  participants: StudyParticipant[];
}

export interface StudySitting {
  readyEnabled?: boolean;
  missingReady?: string[];
  missingFocus?: string[];
  focusWarning?: boolean;
  focusEnabled?: boolean;
  studyMinutes?: number;
  breakMinutes?: number;
  longBreakMinutes?: number;
  sessionsBeforeLong?: number;
  cycleEnabled?: boolean;
  id: string;
  organizerId: string | null;
  startedAt: number;
  /** The desks the organizer set (2 to 10). */
  deskCount: number;
  /** The round they are prepared for (rules.preparedDesks). */
  desksForSeq: number;
}

export interface StudyGroupInfo {
  id: string;
  name: string;
  /** Bumped on every change; an older snapshot is dropped. */
  version: number;
  /** Part of the channel topic; changes when someone loses access. */
  epoch: number;
  isOwner: boolean;
  cap: number;
}

/** Everything one member's screen needs (study.state_json). */
export interface StudyState {
  /** Transition release keeps timestamped Presence for older open clients. */
  legacyPresence?: boolean;
  serverTime: number;
  group: StudyGroupInfo;
  /** Active members, by seat. */
  members: StudyMember[];
  /** The open sitting, if any. */
  sitting: StudySitting | null;
  /** The sitting's latest round, if any. */
  round: StudyRound | null;
}

export interface StudyGroupSummary {
  id: string;
  name: string;
  isOwner: boolean;
  members: number;
  /** A sitting still alive in this group (for the «بدأ جلسة» card). */
  sitting: {
    id: string;
    startedAt: number;
    startedBy: string | null;
    /** null when the starter has left the group since. */
    startedByName: string | null;
    /** null before its first round. */
    phase: StudyPhase | null;
    /** I'm in its running round. */
    inRound: boolean;
  } | null;
}

export interface DeletedStudyGroup {
  id: string;
  name: string;
  /** Restorable until then. */
  purgeAfter: number;
}

export interface MyStudyGroups {
  /** The feature is open to this account (the server gate). */
  available: boolean;
  groups: StudyGroupSummary[];
  /** Groups I deleted that can still be restored. */
  deleted: DeletedStudyGroup[];
}

export type JoinPreviewReason = "ok" | "invalid" | "already_member" | "removed" | "full" | "group_limit";

/** What an invite link leads to, shown before joining. */
export interface JoinPreview {
  ok: boolean;
  reason: JoinPreviewReason;
  groupId: string | null;
  name: string | null;
  members: number | null;
  cap: number | null;
}

export interface HarvestMember {
  userId: string;
  former: boolean;
  /** null for a former member (shown without a name). */
  displayName: string | null;
  flowerColor: string;
}

/** The group lake: every visible earned pad, oldest first, by owner. */
export interface StudyHarvest {
  /** Aligned with pads; old rewards have no work snapshot. */
  details?: Array<{ id: string; focus: StudyFocus | null }>;
  members: HarvestMember[];
  /** The owner's user id for each pad, in the order they were earned. */
  pads: string[];
}

/** An earned round not yet saved to the member's own lake. */
export interface PendingStudyAward {
  focus?: StudyFocus | null;
  id: string;
  minutes: number;
  awardedAt: number;
  groupId: string | null;
}

/** Why a group call was refused (the server's exception messages). */
export type StudyErrorCode =
  | "not_authenticated"
  | "not_available"
  | "group_not_found"
  | "group_deleted"
  | "not_member"
  | "not_owner"
  | "group_limit"
  | "group_full"
  | "invalid_invite"
  | "removed"
  | "cannot_remove_self"
  | "restore_expired"
  | "invalid_name"
  | "invalid_color"
  | "invalid_duration"
  | "invalid_desks"
  | "no_sitting"
  | "round_running"
  | "on_break"
  | "not_organizer"
  | "busy_elsewhere"
  | "need_two"
  | "nothing_to_pause"
  | "invalid_tap"
  | "target_not_member"
  | "invalid_ids"
  | "invalid_focus"
  /** No answer from the server (offline, timeout). */
  | "network"
  /** An answer this app doesn't understand. */
  | "unknown";

export class StudyError extends Error {
  readonly code: StudyErrorCode;
  constructor(code: StudyErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StudyError";
    this.code = code;
  }
}
