// Group study: the screen's rules (mirrors of the server's) and the parsing of
// the server's answers. Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";

test("a suspended visible-page lease expires; a visible split-view device keeps the account awake", () => {
  const stale = { awake: true, seen_at: 0 };
  assert.equal(awakeFromPresence({ member: [stale] }, ["member"], 30_000).get("member"), false);
  assert.equal(awakeFromPresence({ member: [stale, { awake: true, seen_at: 29_000 }] }, ["member"], 30_000).get("member"), true);
  assert.equal(awakeFromPresence({ member: [{ awake: false, seen_at: 29_000 }] }, ["member"], 30_000).get("member"), false);
});
import {
  addClockSample,
  initialStudyDurations,
  awakeFromPresence,
  canOpenSitting,
  canPause,
  canResume,
  canSetDesks,
  clockOffset,
  clockSample,
  deskOccupants,
  deskOffset,
  elapsedStudyMs,
  groupTopic,
  isHandheld,
  isNewerState,
  myRoundStatus,
  nextBoundary,
  phaseAt,
  planDesks,
  preparedDesks,
  roundClock,
  startCheck,
  validDesks,
  validDurations,
  type DeskInput,
  type DeskPlan,
} from "@/lib/study/rules";
import {
  parseErrorCode,
  parseHarvest,
  parseJoinPreview,
  parseMyGroups,
  parsePendingAwards,
  parseState,
  parseTime,
} from "@/lib/study/parse";
import type { StudyRound, StudyState } from "@/lib/study/types";

const G = "11111111-1111-4111-8111-111111111111";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const R1 = "22222222-2222-4222-8222-222222222222";
const R2 = "33333333-3333-4333-8333-333333333333";
const S1 = "44444444-4444-4444-8444-444444444444";

const MIN = 60_000;
const T0 = Date.parse("2026-10-06T18:00:00.000Z");

function round(over: Partial<StudyRound> = {}): StudyRound {
  return {
    id: R1,
    seq: 1,
    startsAt: T0,
    studyMs: 25 * MIN,
    breakMs: 5 * MIN,
    pausedAt: null,
    pausedTotalMs: 0,
    phase: "study",
    othersMayStartAt: T0 + 33 * MIN,
    participants: [
      { userId: ME, active: true, leftReason: null },
      { userId: B, active: true, leftReason: null },
    ],
    ...over,
  };
}

function member(userId: string, seat: number, over: Partial<StudyState["members"][number]> = {}) {
  return {
    userId,
    seat,
    displayName: `m${seat}`,
    haviName: "Havi",
    haviColor: "#477680",
    flowerColor: "#f2b8c6",
    isOwner: seat === 0,
    isMe: userId === ME,
    fresh: true,
    ...over,
  };
}

function state(over: Partial<StudyState> = {}): StudyState {
  return {
    serverTime: T0,
    group: { id: G, name: "مجموعة", version: 5, epoch: 1, isOwner: true, cap: 10 },
    members: [member(ME, 0), member(B, 1)],
    sitting: { id: S1, organizerId: ME, startedAt: T0 - MIN, deskCount: 4, desksForSeq: 1 },
    round: round(),
    ...over,
  };
}

describe("the server's clock", () => {
  test("a reading is taken at the request's midpoint", () => {
    const s = clockSample(T0 + 5_000, T0, T0 + 200);
    assert.deepEqual(s, { offsetMs: 4_900, rttMs: 200 });
    assert.equal(clockSample(T0, T0 + 10, T0), null); // back in time: ignored
  });

  test("the shortest round trip wins, among the latest readings", () => {
    let samples = addClockSample([], { offsetMs: 900, rttMs: 800 });
    samples = addClockSample(samples, { offsetMs: 1_000, rttMs: 60 });
    samples = addClockSample(samples, { offsetMs: 1_300, rttMs: 400 });
    assert.equal(clockOffset(samples), 1_000);
    for (let i = 0; i < 6; i++) samples = addClockSample(samples, { offsetMs: 2_000, rttMs: 300 });
    assert.equal(samples.length, 6);
    assert.equal(clockOffset(samples), 2_000); // the old precise reading has aged out
    assert.equal(clockOffset([]), 0);
  });
});

describe("a round's timing (study.phase on the server)", () => {
  const r = round();

  test("scheduled, study, break, over, at the exact boundaries", () => {
    assert.equal(phaseAt(r, T0 - 1), "scheduled");
    assert.equal(phaseAt(r, T0), "study");
    assert.equal(phaseAt(r, T0 + 25 * MIN - 1), "study");
    assert.equal(phaseAt(r, T0 + 25 * MIN), "break");
    assert.equal(phaseAt(r, T0 + 30 * MIN - 1), "break");
    assert.equal(phaseAt(r, T0 + 30 * MIN), "over");
  });

  test("a pause freezes the study time, and paused time moves the end", () => {
    const paused = round({ pausedAt: T0 + 10 * MIN, phase: "paused" });
    assert.equal(phaseAt(paused, T0 + 50 * MIN), "paused");
    assert.equal(elapsedStudyMs(paused, T0 + 50 * MIN), 10 * MIN);
    const resumed = round({ pausedTotalMs: 7 * MIN });
    assert.equal(phaseAt(resumed, T0 + 31 * MIN), "study");
    assert.equal(phaseAt(resumed, T0 + 32 * MIN), "break");
    assert.equal(roundClock(resumed, T0 + 17 * MIN).studyLeftMs, 15 * MIN);
  });

  test("a cancelled round stays cancelled", () => {
    assert.equal(phaseAt(round({ phase: "cancelled" }), T0 + MIN), "cancelled");
  });

  test("the timer shows study left, break left and progress", () => {
    assert.deepEqual(roundClock(r, T0 - 5_000), { phase: "scheduled", studyLeftMs: 25 * MIN, breakLeftMs: 0, progress: 0 });
    assert.deepEqual(roundClock(r, T0 + 5 * MIN), { phase: "study", studyLeftMs: 20 * MIN, breakLeftMs: 0, progress: 0.2 });
    assert.deepEqual(roundClock(r, T0 + 27 * MIN), { phase: "break", studyLeftMs: 0, breakLeftMs: 3 * MIN, progress: 1 });
  });

  test("the next boundary in each phase", () => {
    assert.equal(nextBoundary(r, T0 - 1), T0);
    assert.equal(nextBoundary(r, T0 + MIN), T0 + 25 * MIN);
    assert.equal(nextBoundary(r, T0 + 26 * MIN), T0 + 30 * MIN);
    assert.equal(nextBoundary(r, T0 + 31 * MIN), null);
    assert.equal(nextBoundary(round({ pausedAt: T0 + 2 * MIN }), T0 + 3 * MIN), T0 + 32 * MIN); // 30 minutes paused
  });

  test("durations within the server's limits", () => {
    assert.ok(validDurations(25, 5));
    assert.ok(validDurations(5, 1) && validDurations(90, 45));
    assert.ok(!validDurations(4, 5) && !validDurations(91, 5) && !validDurations(25, 0) && !validDurations(25, 46));
    assert.ok(!validDurations(25.5, 5));
    assert.ok(validDesks(2) && validDesks(10));
    assert.ok(!validDesks(1) && !validDesks(11) && !validDesks(2.5));
  });
});

describe("who may start, pause and resume (study_start_round)", () => {
  test("never during a round or its break", () => {
    assert.deepEqual(startCheck(state(), ME, T0 + MIN), { ok: false, reason: "round_running", until: null });
    assert.deepEqual(startCheck(state(), ME, T0 + 26 * MIN), { ok: false, reason: "on_break", until: T0 + 30 * MIN });
    // Others wait for the organizer's 3 minutes after the break.
    assert.deepEqual(startCheck(state(), B, T0 + 26 * MIN), { ok: false, reason: "on_break", until: T0 + 33 * MIN });
  });

  test("after the break: the organizer at once, anyone else 3 minutes later (taking over)", () => {
    assert.deepEqual(startCheck(state(), ME, T0 + 30 * MIN), { ok: true, takesOver: false });
    assert.deepEqual(startCheck(state(), B, T0 + 32 * MIN), { ok: false, reason: "not_organizer", until: T0 + 33 * MIN });
    assert.deepEqual(startCheck(state(), B, T0 + 33 * MIN), { ok: true, takesOver: true });
  });

  test("a sitting without a round: others wait 3 minutes from its start", () => {
    const s = state({ round: null });
    assert.deepEqual(startCheck(s, B, T0), { ok: false, reason: "not_organizer", until: T0 + 2 * MIN });
    assert.deepEqual(startCheck(s, B, T0 + 2 * MIN), { ok: true, takesOver: true });
  });

  test("no sitting: one is opened first (the waiting stage); two members present are needed", () => {
    const none = state({ sitting: null, round: null });
    assert.deepEqual(startCheck(none, ME, T0), { ok: false, reason: "no_sitting", until: null });
    assert.ok(canOpenSitting(none));
    assert.ok(!canOpenSitting(state()));
    const waiting = state({ round: null });
    assert.deepEqual(startCheck(waiting, ME, T0), { ok: true, takesOver: false });
    const alone = state({ round: null, members: [member(ME, 0), member(B, 1, { fresh: false })] });
    assert.deepEqual(startCheck(alone, ME, T0), { ok: false, reason: "need_two", until: null });
  });

  test("only the organizer sets the desks, and never while a round is in play", () => {
    assert.ok(canSetDesks(state({ round: null }), ME, T0));
    assert.ok(!canSetDesks(state({ round: null }), B, T0));
    assert.ok(!canSetDesks(state(), ME, T0 + MIN));
    assert.ok(!canSetDesks(state({ round: round({ pausedAt: T0 + MIN, phase: "paused" }) }), ME, T0 + 2 * MIN));
    assert.ok(canSetDesks(state(), ME, T0 + 26 * MIN)); // on the break
    assert.ok(canSetDesks(state(), ME, T0 + 31 * MIN)); // after it
    assert.ok(!canSetDesks(state({ sitting: null, round: null }), ME, T0));
  });

  test("only the organizer pauses and resumes", () => {
    assert.ok(canPause(state(), ME, T0 + MIN));
    assert.ok(!canPause(state(), B, T0 + MIN));
    assert.ok(!canPause(state(), ME, T0 + 26 * MIN)); // on break
    const paused = state({ round: round({ pausedAt: T0 + MIN, phase: "paused" }) });
    assert.ok(canResume(paused, ME, T0 + 2 * MIN));
    assert.ok(!canResume(paused, B, T0 + 2 * MIN));
    assert.ok(!canResume(state(), ME, T0 + MIN));
  });
});

describe("my part in the round", () => {
  test("in, late, out, earned, none", () => {
    assert.deepEqual(myRoundStatus(state(), ME, T0 + MIN), { kind: "in" });
    assert.deepEqual(myRoundStatus(state(), C, T0 + MIN), { kind: "late" });
    const away = state({ round: round({ participants: [{ userId: ME, active: false, leftReason: "away" }] }) });
    assert.deepEqual(myRoundStatus(away, ME, T0 + 12 * MIN), { kind: "out", reason: "away" });
    assert.deepEqual(myRoundStatus(state(), ME, T0 + 26 * MIN), { kind: "pending" });
    const confirmed = state({ serverTime: T0 + 26 * MIN, round: round({ phase: "break", settledAt: T0 + 25 * MIN }) });
    assert.deepEqual(myRoundStatus(confirmed, ME, T0 + 26 * MIN), { kind: "earned" });
    assert.deepEqual(myRoundStatus(state({ serverTime: T0 + 26 * MIN }), ME, T0 + 26 * MIN), { kind: "pending" });
    assert.deepEqual(myRoundStatus(away, ME, T0 + 26 * MIN), { kind: "out", reason: "away" });
    assert.deepEqual(myRoundStatus(state(), C, T0 + 26 * MIN), { kind: "none" });
    assert.deepEqual(myRoundStatus(state(), ME, T0 + 31 * MIN), { kind: "none" });
    assert.deepEqual(myRoundStatus(state({ round: null }), ME, T0), { kind: "none" });
  });
});

describe("round eligibility confirmation", () => {
  test("break timing alone is not settlement proof", () => {
    const at = T0 + 26 * MIN;
    const view = (settledAt: number | null) => state({ serverTime: at, round: round({ phase: "break", settledAt }) });
    assert.deepEqual(myRoundStatus(view(null), ME, at), { kind: "pending" });
    assert.deepEqual(myRoundStatus(view(T0 + 24 * MIN), ME, at), { kind: "pending" });
    assert.deepEqual(myRoundStatus(view(at + MIN), ME, at), { kind: "pending" });
    assert.deepEqual(myRoundStatus(view(at), ME, at), { kind: "earned" });
  });

  test("an offline end waits; delayed settlement can exclude an away participant", () => {
    const stale = state();
    assert.deepEqual(myRoundStatus(stale, ME, T0 + 25 * MIN), { kind: "pending" });
    assert.deepEqual(myRoundStatus(stale, ME, T0 + 29 * MIN), { kind: "pending" });
    const settled = state({ serverTime: T0 + 26 * MIN, round: round({ phase: "break", settledAt: T0 + 25 * MIN, participants: [
      { userId: ME, active: false, leftReason: "away" },
      { userId: B, active: true, leftReason: null },
    ] }) });
    assert.deepEqual(myRoundStatus(settled, ME, T0 + 26 * MIN), { kind: "out", reason: "away" });
    assert.deepEqual(myRoundStatus(settled, B, T0 + 26 * MIN), { kind: "earned" });
    assert.deepEqual(myRoundStatus(settled, C, T0 + 26 * MIN), { kind: "none" });
  });
});

describe("desks and Presence", () => {
  test("a desk for me, everyone on the page, and everyone still in the round", () => {
    const s = state({
      members: [member(ME, 0), member(B, 1), member(C, 2), member(D, 3)],
      round: round({
        participants: [
          { userId: ME, active: true, leftReason: null },
          { userId: B, active: true, leftReason: null }, // phone hidden: off Presence, still in
          { userId: D, active: false, leftReason: "left" },
        ],
      }),
    });
    assert.deepEqual([...deskOccupants(s, new Set([C]), ME, T0 + MIN)].sort(), [ME, B, C].sort());
    // The round keeps its desks through the break, not after.
    assert.deepEqual([...deskOccupants(s, new Set([C]), ME, T0 + 26 * MIN)].sort(), [ME, B, C].sort());
    assert.deepEqual([...deskOccupants(s, new Set([C]), ME, T0 + 31 * MIN)].sort(), [ME, C].sort());
  });

  test("awake: any tab awake counts; unknown keys and other fields are ignored", () => {
    const awake = awakeFromPresence(
      {
        [ME]: [{ awake: false }, { awake: true }],
        [B]: [{ awake: false }],
        [E]: [{ awake: true }], // not a member
        [C]: [{ awake: "yes" }],
      },
      [ME, B, C, D],
    );
    assert.deepEqual([...awake.entries()].sort(), [[B, false], [C, false], [ME, true]].sort());
  });

  const members = [
    { userId: ME, seat: 0 },
    { userId: B, seat: 1 },
    { userId: C, seat: 2 },
    { userId: D, seat: 3 },
    { userId: E, seat: 4 },
  ];
  // One entry per place: the member's initial, "_" for an empty desk, "a-" when
  // its owner is away, "." for open water.
  const look = (p: DeskPlan) =>
    p.places.map((d) => (!d ? "." : d.userId === null ? "_" : `${d.userId.slice(0, 1)}${d.away ? "-" : ""}`));
  const step = (prev: DeskPlan | null, over: Partial<DeskInput> & { here: string[] }) =>
    planDesks(prev, { sittingId: S1, running: false, prepared: 0, members, occupants: new Set(over.here), ...over });

  test("desk places grow from the middle, right and left in turn", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(deskOffset), [0, 1, -1, 2, -2, 3, -3]);
  });

  test("the prepared desks: for the round they were set for, then they sink at its break", () => {
    assert.equal(preparedDesks(state({ round: null }), T0), 4);
    assert.equal(preparedDesks(state(), T0 + MIN), 4); // round 1, set for round 1
    assert.equal(preparedDesks(state(), T0 + 26 * MIN), 0); // its break
    const reset = state({ sitting: { ...state().sitting!, deskCount: 6, desksForSeq: 2 } });
    assert.equal(preparedDesks(reset, T0 + 26 * MIN), 6); // set again on the break, for round 2
    assert.equal(preparedDesks(state({ sitting: null, round: null }), T0), 0);
  });

  test("no sitting, no desks", () => {
    const p = planDesks(null, { sittingId: null, running: false, prepared: 0, members, occupants: new Set([ME]) });
    assert.deepEqual(p, { sittingId: null, places: [] });
  });

  test("the organizer opens with 4 desks; arrivals sit nearest the middle; a fifth one rises at the end", () => {
    let p = step(null, { prepared: 4, here: [ME] });
    assert.deepEqual(look(p), ["a", "_", "_", "_"]);
    p = step(p, { prepared: 4, here: [ME, C] });
    assert.deepEqual(look(p), ["a", "c", "_", "_"]);
    p = step(p, { prepared: 4, here: [ME, B, C, D] });
    assert.deepEqual(look(p), ["a", "c", "b", "d"]);
    p = step(p, { prepared: 4, here: [ME, B, C, D, E] });
    assert.deepEqual(look(p), ["a", "c", "b", "d", "e"]);
  });

  test("during a round nothing sinks and nobody moves; a leaver gets their desk back", () => {
    let p = step(null, { prepared: 4, here: [ME, B] });
    assert.deepEqual(look(p), ["a", "b", "_", "_"]);
    p = step(p, { running: true, prepared: 4, here: [B] }); // I left
    assert.deepEqual(look(p), ["a-", "b", "_", "_"]);
    p = step(p, { running: true, prepared: 4, here: [B, C, D] });
    assert.deepEqual(look(p), ["a-", "b", "c", "d"]);
    p = step(p, { running: true, prepared: 4, here: [B, C, D, E] }); // no empty desk: one rises
    assert.deepEqual(look(p), ["a-", "b", "c", "d", "e"]);
    p = step(p, { running: true, prepared: 4, here: [ME, B, C, D, E] });
    assert.deepEqual(look(p), ["a", "b", "c", "d", "e"]);
  });

  test("the break: empty desks sink (the farthest first); the organizer may raise more", () => {
    let p = step(null, { prepared: 5, here: [ME, B] });
    assert.deepEqual(look(p), ["a", "b", "_", "_", "_"]);
    p = step(p, { running: true, prepared: 5, here: [ME, B, C] });
    assert.deepEqual(look(p), ["a", "b", "c", "_", "_"]);
    p = step(p, { running: true, prepared: 5, here: [ME, C] }); // B leaves mid-round
    assert.deepEqual(look(p), ["a", "b-", "c", "_", "_"]);
    p = step(p, { prepared: 0, here: [ME, C] }); // the break
    assert.deepEqual(look(p), ["a", ".", "c"]);
    p = step(p, { prepared: 4, here: [ME, C] }); // the organizer sets 4 for round 2
    assert.deepEqual(look(p), ["a", "_", "c", "_"]);
    p = step(p, { prepared: 2, here: [ME, C] }); // then 2
    assert.deepEqual(look(p), ["a", ".", "c"]);
  });

  test("fewer prepared desks: the farthest empty ones sink, the rest stay put", () => {
    let p = step(null, { prepared: 5, here: [ME] });
    assert.deepEqual(look(p), ["a", "_", "_", "_", "_"]);
    p = step(p, { prepared: 3, here: [ME] });
    assert.deepEqual(look(p), ["a", "_", "_"]);
  });

  test("during a round a lower number sinks nothing", () => {
    let p = step(null, { prepared: 4, here: [ME, B] });
    p = step(p, { running: true, prepared: 0, here: [ME, B] });
    assert.deepEqual(look(p), ["a", "b", "_", "_"]);
  });

  test("a new sitting starts from open water", () => {
    const old = step(null, { prepared: 3, here: [ME, B] });
    assert.deepEqual(look(old), ["a", "b", "_"]);
    const p = planDesks(old, { sittingId: R2, running: false, prepared: 2, members, occupants: new Set([B]) });
    assert.deepEqual(look(p), ["b", "_"]);
  });
});

describe("snapshots and devices", () => {
  test("an older snapshot never replaces a newer one", () => {
    const cur = state();
    assert.ok(isNewerState(state({ group: { ...cur.group, version: 6 } }), cur));
    assert.ok(!isNewerState(state({ group: { ...cur.group, version: 4 }, serverTime: T0 + MIN }), cur));
    assert.ok(isNewerState(state({ serverTime: T0 + 1 }), cur)); // same version, later
    assert.ok(!isNewerState(state({ serverTime: T0 - 1 }), cur));
    assert.ok(!isNewerState(state({ group: { ...cur.group, id: R1, version: 9 } }), cur));
    assert.ok(isNewerState(cur, null));
  });

  test("phones and tablets, including an iPad that reports a Mac", () => {
    assert.ok(isHandheld("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148", 5));
    assert.ok(isHandheld("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36", 5));
    assert.ok(isHandheld("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15", 5));
    assert.ok(!isHandheld("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15", 0));
    assert.ok(!isHandheld("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36", 0));
  });

  test("the group's channel topic (study.can_listen)", () => {
    assert.equal(groupTopic(G, 3), `study:${G}:3`);
  });
});

// ---------------------------------------------------------------------------
// Parsing the server's answers
// ---------------------------------------------------------------------------

function rawMember(user_id: string, seat: number, over: Record<string, unknown> = {}) {
  return {
    user_id, seat, display_name: `m${seat}`, havi_name: "Havi", havi_color: "#477680",
    flower_color: "#F2B8C6", is_owner: seat === 0, is_me: user_id === ME, fresh: true, ...over,
  };
}

function rawState(over: Record<string, unknown> = {}) {
  return {
    server_time: "2026-10-06T18:00:00.123456+00:00",
    group: { id: G, name: "مجموعة", version: 5, epoch: 2, is_owner: true, cap: 10 },
    members: [rawMember(B, 1), rawMember(ME, 0)],
    sitting: { id: S1, organizer_id: ME, started_at: "2026-10-06T17:59:00+00:00", desk_count: 6, desks_for_seq: 1 },
    round: {
      id: R1, seq: 1, starts_at: "2026-10-06T18:00:03.5+00:00", study_ms: 1_500_000, break_ms: 300_000,
      paused_at: null, paused_total_ms: 0, phase: "scheduled",
      others_may_start_at: "2026-10-06T18:33:03.5+00:00",
      participants: [
        { user_id: ME, active: true, left_reason: null },
        { user_id: B, active: false, left_reason: "away" },
        { user_id: "nope", active: true, left_reason: null },
      ],
    },
    ...over,
  };
}

describe("parsing", () => {
  test("Postgres times, with microseconds", () => {
    assert.equal(parseTime("2026-10-06T18:00:00.123456+00:00"), T0 + 123);
    assert.equal(parseTime("2026-10-06T21:00:00+03:00"), T0);
    assert.equal(parseTime("soon"), null);
    assert.equal(parseTime(null), null);
  });

  test("a snapshot: members by seat, colours in lower case, bad entries left out", () => {
    const s = parseState(rawState())!;
    assert.equal(s.serverTime, T0 + 123);
    assert.deepEqual(s.group, { id: G, name: "مجموعة", version: 5, epoch: 2, isOwner: true, cap: 10 });
    assert.deepEqual(s.members.map((m) => m.userId), [ME, B]);
    assert.equal(s.members[1].flowerColor, "#f2b8c6");
    assert.equal(s.members[0].isMe, true);
    assert.deepEqual(s.sitting, { id: S1, organizerId: ME, startedAt: T0 - MIN, deskCount: 6, desksForSeq: 1 });
    // A server without the desks reads as two desks for round 1.
    const before = parseState(rawState({ sitting: { id: S1, organizer_id: ME, started_at: "2026-10-06T17:59:00+00:00" } }))!;
    assert.deepEqual(before.sitting, { id: S1, organizerId: ME, startedAt: T0 - MIN, deskCount: 2, desksForSeq: 1 });
    assert.equal(s.round?.startsAt, T0 + 3_500);
    assert.deepEqual(s.round?.participants, [
      { userId: ME, active: true, leftReason: null },
      { userId: B, active: false, leftReason: "away" },
    ]);
  });

  test("a snapshot without a sitting, and broken snapshots", () => {
    const empty = parseState(rawState({ sitting: null, round: null }))!;
    assert.equal(empty.sitting, null);
    assert.equal(empty.round, null);
    assert.equal(parseState(rawState({ group: { id: G, name: "x", version: "5", epoch: 1 } })), null);
    assert.equal(parseState(rawState({ round: { id: R1, seq: 1 } })), null);
    assert.equal(parseState(rawState({ server_time: undefined })), null);
    assert.equal(parseState(null), null);
    const badMember = parseState(rawState({ members: [rawMember(ME, 0), rawMember(B, 1, { havi_color: "red" })] }))!;
    assert.deepEqual(badMember.members.map((m) => m.userId), [ME]);
  });

  test("my groups; a closed feature lists nothing", () => {
    const g = parseMyGroups({
      available: true,
      groups: [
        { id: G, name: "أ", is_owner: false, members: 3, sitting: {
          id: S1, started_at: "2026-10-06T18:00:00+00:00", started_by: B, started_by_name: "m1", phase: null, in_round: false } },
        { id: "bad", name: "ب" },
      ],
      deleted: [{ id: R1, name: "قديمة", purge_after: "2026-11-05T18:00:00+00:00" }],
    })!;
    assert.equal(g.groups.length, 1);
    assert.deepEqual(g.groups[0].sitting, { id: S1, startedAt: T0, startedBy: B, startedByName: "m1", phase: null, inRound: false });
    assert.equal(g.deleted[0].purgeAfter, Date.parse("2026-11-05T18:00:00Z"));
    assert.deepEqual(parseMyGroups({ available: false, groups: [{ id: G, name: "x" }], deleted: [] }), {
      available: false, groups: [], deleted: [],
    });
    assert.equal(parseMyGroups({ groups: [] }), null);
  });

  test("an invite preview", () => {
    assert.deepEqual(parseJoinPreview({ ok: true, reason: "ok", group_id: G, name: "أ", members: 3, cap: 10 }), {
      ok: true, reason: "ok", groupId: G, name: "أ", members: 3, cap: 10,
    });
    assert.deepEqual(parseJoinPreview({ ok: false, reason: "invalid" }), {
      ok: false, reason: "invalid", groupId: null, name: null, members: null, cap: null,
    });
    assert.equal(parseJoinPreview({ ok: true, reason: "maybe" }), null);
  });

  test("the group lake: former members unnamed, unknown owners left out", () => {
    const h = parseHarvest({
      members: [
        { user_id: ME, former: false, display_name: "m0", flower_color: "#ffffff" },
        { user_id: B, former: true, display_name: "should not show", flower_color: "#000000" },
      ],
      pads: [ME, B, C, ME],
    })!;
    assert.equal(h.members[1].displayName, null);
    assert.deepEqual(h.pads, [ME, B, ME]);
  });

  test("pending awards", () => {
    const a = parsePendingAwards([
      { id: R1, minutes: 25, awarded_at: "2026-10-06T18:25:00+00:00", group_id: G },
      { id: R2, minutes: 25, awarded_at: "2026-10-06T18:55:00+00:00", group_id: null },
      { id: "x", minutes: 25, awarded_at: "2026-10-06T18:55:00+00:00" },
    ])!;
    assert.deepEqual(a, [
      { id: R1, minutes: 25, awardedAt: T0 + 25 * MIN, groupId: G },
      { id: R2, minutes: 25, awardedAt: T0 + 55 * MIN, groupId: null },
    ]);
    assert.equal(parsePendingAwards({}), null);
  });

  test("why a call failed", () => {
    assert.equal(parseErrorCode({ message: "group_full", code: "P0001" }), "group_full");
    assert.equal(parseErrorCode({ message: "not_available" }), "not_available");
    assert.equal(parseErrorCode({ message: "no_sitting" }), "no_sitting");
    assert.equal(parseErrorCode({ message: "TypeError: Failed to fetch", code: "" }), "network");
    assert.equal(parseErrorCode(new DOMException("The operation was aborted.", "AbortError")), "network");
    assert.equal(parseErrorCode({ message: "permission denied for function x" }), "unknown");
    assert.equal(parseErrorCode("boom"), "unknown");
  });
});


test("organizer durations preserve personal settings and stay within group limits", () => {
  assert.deepEqual(initialStudyDurations(35, 7), {study:35,rest:7});
  assert.deepEqual(initialStudyDurations(), {study:25,rest:5});
  assert.deepEqual(initialStudyDurations(120, 60), {study:90,rest:45});
  assert.deepEqual(initialStudyDurations(0, -1), {study:5,rest:1});
  assert.deepEqual(initialStudyDurations(NaN, Infinity), {study:25,rest:5});
  assert.deepEqual(initialStudyDurations(35.6, 7.2), {study:36,rest:7});
});
