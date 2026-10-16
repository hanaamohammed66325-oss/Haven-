// ---------------------------------------------------------------------------
// Group study: one open group page, kept in step with the server.
//
// - The snapshot (study.state_json) is the only truth on screen. A newer one
//   always replaces an older one, never the reverse (rules.isNewerState).
// - The group channel carries only hints: "changed" (a version number, then
//   the page asks for the snapshot), "poke" (a tap on a Havi) and Presence
//   (who is awake). Clients never broadcast; the database does.
// - A fresh snapshot is asked for when the channel (re)connects, when a
//   "changed" hint is newer than the screen, when the page comes back, when the
//   connection comes back, and when the round reaches its next boundary.
// - Check-ins every 2 minutes while the page is open. A phone's hidden page
//   stops at once (switching apps counts as away); a computer's keeps going.
// - When someone loses access the channel moves to a new topic (the epoch);
//   the page follows it, or ends when the group is gone for it.
//
// The network is reached only through a StudyTransport (client.ts has the real
// one), so all of this runs in tests without a server.
// ---------------------------------------------------------------------------

import { StudyError, type StudyErrorCode, type StudyState, type StudyFocus } from "./types";
import { UUID } from "@/lib/study/parse";
import { parseState } from "./parse";
import { sendPoke } from "./pokeTransport";
import {
  STUDY_LIMITS,
  addClockSample,
  roomPresence,
  snapshotPresence,
  clockOffset,
  clockSample,
  groupTopic,
  isHandheld,
  isNewerState,
  nextBoundary,
  validDesks,
  validDurations,
  validCycle,
  deskOccupants,
  type ClockSample,
} from "./rules";

export type ChannelStatus = "subscribed" | "error" | "closed";

export type PresenceState = Record<string, Array<Record<string, unknown>>>;

export interface ChannelHandlers {
  /** The group changed; null when the hint carried no version. */
  onChanged(version: number | null): void;
  onPoke(targetUserId: string, tapId: string): void;
  onPresence(presence: PresenceState): void;
  onStatus(status: ChannelStatus): void;
}

export interface StudyChannel {
  sendPoke?(target: string, tap: string, recipients: readonly string[]): Promise<boolean>;
  /** Announce whether my page is awake (shown as my Havi sleeping or not). */
  track(awake: boolean, seenAt?: number): Promise<void>;
  close(): Promise<void>;
}

/** The server calls a group page makes. Each throws a StudyError when refused. */
export interface StudyTransport {
  /** A per-page lease; optional only for the local demo/test transport. */
  pageState?(groupId: string, pageId: string, open: boolean, awake: boolean, seq: number): Promise<unknown>;
  state(groupId: string): Promise<unknown>;
  heartbeat(groupId: string): Promise<unknown>;
  openSitting(groupId: string, desks: number): Promise<unknown>;
  setDesks(groupId: string, desks: number): Promise<unknown>;
  setDurations?(groupId: string, studyMinutes: number, breakMinutes: number, longBreakMinutes?: number, sessionsBeforeLong?: number): Promise<unknown>;
  setReady?(groupId: string, ready: boolean): Promise<unknown>;
  setFocus?(groupId: string, focus: StudyFocus): Promise<unknown>;
  startRound(groupId: string, studyMinutes: number, breakMinutes: number, confirmMissing?: boolean, confirmedIds?: readonly string[]): Promise<unknown>;
  pauseRound(groupId: string): Promise<unknown>;
  resumeRound(groupId: string): Promise<unknown>;
  leaveRound(groupId: string): Promise<unknown>;
  endSitting?(groupId: string): Promise<unknown>;
  /** false when the tap came too soon after my last one. */
  poke(groupId: string, targetUserId: string, tapId: string): Promise<boolean>;
  openChannel(topic: string, myId: string, handlers: ChannelHandlers): Promise<StudyChannel>;
}

/** The browser around the page (replaced in tests). */
export interface SessionEnv {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  isHidden(): boolean;
  onVisibilityChange(fn: () => void): () => void;
  onOnline(fn: () => void): () => void;
  onPageHide?(fn: () => void): () => void;
  /** A phone or tablet (rules.isHandheld). */
  handheld: boolean;
  randomId(): string;
}

export function browserEnv(): SessionEnv {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => window.clearTimeout(h as number),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (h) => window.clearInterval(h as number),
    isHidden: () => document.visibilityState === "hidden",
    onVisibilityChange: (fn) => {
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
    onOnline: (fn) => {
      window.addEventListener("online", fn);
      return () => window.removeEventListener("online", fn);
    },
    handheld: isHandheld(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    onPageHide: (fn) => {
      window.addEventListener("pagehide", fn);
      return () => window.removeEventListener("pagehide", fn);
    },
    randomId: () => crypto.randomUUID(),
  };
}

/** After these the page can't go on: the group is gone for this account. */
const TERMINAL: ReadonlySet<StudyErrorCode> = new Set<StudyErrorCode>([
  "not_authenticated",
  "not_available",
  "group_not_found",
  "group_deleted",
  "not_member",
]);

/** Waits before asking again after a failed request, and after a channel error. */
const RETRY_MS = [5_000, 15_000, 30_000, 60_000];
const CHANNEL_RETRY_MS = [3_000, 10_000, 30_000, 60_000];
/** Ask at the boundary; the background worker independently settles it too. */
const BOUNDARY_SLACK_MS = 1;
const MAX_TIMER_MS = 2_147_483_647;
/** My own recent taps, to skip their echo. */
const OWN_TAPS_KEPT = 200;

export interface GroupSessionView {
  state: StudyState | null;
  /** Server time = local time + this. */
  offsetMs: number;
  /** The group channel is connected. */
  connected: boolean;
  /** Members on the page, and whether each is awake. */
  awake: ReadonlyMap<string, boolean>;
  /** Why the page can't go on (the group is gone for me), or null. */
  ended: StudyErrorCode | null;
}

export interface GroupSession {
  /** The current view; the same object until something changes. */
  view(): GroupSessionView;
  /** Called on every change. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Called when another member's tap reaches this page (target's user id). */
  onPoke(listener: (targetUserId: string) => void): () => void;
  /** The server's clock now. */
  serverNow(): number;
  // The actions below each throw a StudyError when the server refuses.
  /** Opens a sitting with its desks (the waiting stage); shows the open one if someone was first. */
  openSitting(desks: number): Promise<void>;
  /** The organizer changes the desks, while no round is in play. */
  setDesks(desks: number): Promise<void>;
  setDurations(studyMinutes: number, breakMinutes: number, longBreakMinutes?: number, sessionsBeforeLong?: number): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  setFocus(focus: StudyFocus): Promise<void>;
  start(studyMinutes: number, breakMinutes: number, confirmMissing?: boolean, confirmedIds?: readonly string[]): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  leaveRound(): Promise<void>;
  endSitting(): Promise<void>;
  /** Tells the others' pages about a tap; my own page plays it at once. Returns the tap id. */
  poke(targetUserId: string): string;
  /** Ask for a fresh snapshot now. */
  refresh(): void;
  dispose(): void;
  setRoomVisible(visible: boolean): void;
}

export function createGroupSession(
  groupId: string,
  myId: string,
  transport: StudyTransport,
  env: SessionEnv = browserEnv(),
): GroupSession {
  let state: StudyState | null = null;
  let samples: ClockSample[] = [];
  let connected = false;
  let presence: PresenceState = {};
  let awake = new Map<string, boolean>();
  let ended: StudyErrorCode | null = null;
  let disposed = false;
  let roomVisible = true;
  let myAwake = !env.isHidden();
  const pageId = env.randomId();
  let pageSeq = 0;
  let pageTimer: unknown = null;
  const ownTaps: string[] = [];

  const listeners = new Set<() => void>();
  const pokeListeners = new Set<(target: string) => void>();
  const receivedTaps: string[] = [];
  const sentTapTimes: number[] = [];
  const receivedTapTimes = new Map<string, number[]>();
  let view: GroupSessionView = makeView();

  let channel: StudyChannel | null = null;
  let channelEpoch: number | null = null;
  let channelGen = 0;
  let channelErrors = 0;

  let fetching = false;
  let fetchAgain = false;
  let failures = 0;

  let beatTimer: unknown = null;
  let boundaryTimer: unknown = null;
  let retryTimer: unknown = null;
  let channelRetryTimer: unknown = null;
  let sleepTimer: unknown = null;
  let durationWrites: Promise<void> = Promise.resolve();

  const alive = () => !disposed && ended === null;

  function makeView(): GroupSessionView {
    return { state, offsetMs: clockOffset(samples), connected, awake, ended };
  }

  function emit() {
    view = makeView();
    for (const l of [...listeners]) l();
  }

  function updatePresence(): boolean {
    const next = state ? roomPresence(state, myId, myAwake, presence, serverNow(), connected) : new Map<string, boolean>();
    if (next.size === awake.size && [...next].every(([id, value]) => awake.get(id) === value)) return false;
    awake = next;
    return true;
  }

  function needsLegacyPresence(): boolean {
    return !state || !snapshotPresence(state) || state.legacyPresence !== false;
  }

  function clearTimer(handle: unknown) {
    if (handle !== null) env.clearTimeout(handle);
  }

  // ---- snapshots ---------------------------------------------------------

  function accept(raw: unknown, sentAt: number, receivedAt: number) {
    if (!alive()) return;
    const next = parseState(raw);
    if (!next || next.group.id !== groupId) return;
    failures = 0;
    samples = addClockSample(samples, clockSample(next.serverTime, sentAt, receivedAt));
    if (!isNewerState(next, state)) {
      ensureChannel(); // A closed channel may need reopening on the same snapshot.
      return;
    }
    // Renewal timestamps are not a visible change. Keep sampling the clock,
    // but do not rebuild React's scene tree for an otherwise identical lease.
    const visibleChanged = !state || JSON.stringify({ ...state, serverTime: 0 }) !== JSON.stringify({ ...next, serverTime: 0 });
    const previousOffset = view.offsetMs;
    state = next;
    const presenceChanged = updatePresence();
    ensureChannel();
    scheduleBoundary();
    if (visibleChanged || presenceChanged || Math.abs(clockOffset(samples) - previousOffset) > 100) emit();
  }

  /** Handles a refused or failed call; returns its reason. */
  function fail(e: unknown): StudyErrorCode {
    const code = e instanceof StudyError ? e.code : "unknown";
    if (TERMINAL.has(code)) end(code);
    else if (code === "network") retrySoon();
    return code;
  }

  function refetch() {
    if (!alive()) return;
    if (fetching) {
      fetchAgain = true;
      return;
    }
    fetching = true;
    void (async () => {
      try {
        do {
          fetchAgain = false;
          const sentAt = env.now();
          try {
            accept(await transport.state(groupId), sentAt, env.now());
          } catch (e) {
            fail(e);
            break;
          }
        } while (fetchAgain && alive());
      } finally {
        fetching = false;
      }
    })();
  }

  function retrySoon() {
    if (!alive() || retryTimer !== null) return;
    const delay = RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)];
    retryTimer = env.setTimeout(() => {
      retryTimer = null;
      refetch();
    }, delay);
  }

  function scheduleBoundary() {
    clearTimer(boundaryTimer);
    boundaryTimer = null;
    if (!alive() || !state?.round) return;
    const now = serverNow();
    const at = nextBoundary(state.round, now);
    if (at === null) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, at - now) + BOUNDARY_SLACK_MS);
    boundaryTimer = env.setTimeout(() => {
      boundaryTimer = null;
      refetch();
    }, delay);
  }

  // ---- check-ins ---------------------------------------------------------

  function beat() {
    if (!alive()) return;
    if (env.handheld && env.isHidden()) return;
    const sentAt = env.now();
    transport.heartbeat(groupId).then((raw) => accept(raw, sentAt, env.now()), fail);
  }

  function pageBeat(open = true) {
    if (!transport.pageState || (open && !alive())) return;
    const sentAt = env.now();
    void transport.pageState(groupId, pageId, open, myAwake, ++pageSeq).then(
      (raw) => { if (open) accept(raw, sentAt, env.now()); },
      (e) => { if (open) fail(e); },
    );
  }

  // ---- the channel -------------------------------------------------------

  function ensureChannel() {
    if (!alive() || !state || channelRetryTimer !== null) return;
    if (channelEpoch === state.group.epoch) return;
    // A new epoch: the old topic no longer reaches this group.
    const old = channel;
    channel = null;
    connected = false;
    if (old) void old.close().catch(() => {});
    channelEpoch = state.group.epoch;
    const gen = ++channelGen;
    const live = () => gen === channelGen && alive();
    transport
      .openChannel(groupTopic(groupId, channelEpoch), myId, {
        onChanged: (version) => {
          if (!live()) return;
          if (version === null || !state || version > state.group.version) refetch();
        },
        onPoke: (target, tap) => {
          if (!live() || !state || !UUID.test(target) || !UUID.test(tap) || ownTaps.includes(tap) || receivedTaps.includes(tap)) return;
          if (!deskOccupants(state, new Set(awake.keys()), myId, serverNow()).has(target)) return;
          const time = env.now();
          // At most ten seated targets. Drop buckets left over from former members.
          for (const id of receivedTapTimes.keys()) if (!state.members.some(m => m.userId === id)) receivedTapTimes.delete(id);
          const times = (receivedTapTimes.get(target) ?? []).filter(t => time - t < 1000);
          if (times.length >= 20) return;
          times.push(time);
          receivedTapTimes.set(target, times);
          receivedTaps.push(tap);
          if (receivedTaps.length > 200) receivedTaps.shift();
          for (const l of [...pokeListeners]) l(target);
        },
        onPresence: (p) => {
          if (!live()) return;
          presence = p;
          if (state && snapshotPresence(state)) return;
          if (updatePresence()) emit();
        },
        onStatus: (status) => {
          if (!live()) return;
          if (status === "subscribed") {
            channelErrors = 0;
            connected = true;
            updatePresence();
            emit();
            refetch(); // catch up on anything missed while away
            track();
            return;
          }
          connected = false;
          emit();
          // ERROR can rejoin; CLOSED is terminal for this channel instance.
          if (status === "closed") {
            channelGen++;
            channelEpoch = null;
            const old = channel;
            channel = null;
            presence = {};
            updatePresence();
            if (old) void old.close().catch(() => {});
            emit();
          }
          // Refetch access before reopening, with bounded retries.
          if (channelRetryTimer === null) {
            const delay = CHANNEL_RETRY_MS[Math.min(channelErrors++, CHANNEL_RETRY_MS.length - 1)];
            channelRetryTimer = env.setTimeout(() => {
              channelRetryTimer = null;
              refetch();
            }, delay);
          }
        },
      })
      .then(
        (ch) => {
          if (!live()) {
            void ch.close().catch(() => {});
            return;
          }
          channel = ch;
          track();
        },
        () => {
          if (!live()) return;
          channelEpoch = null; // try again with the next snapshot
          retrySoon();
        },
      );
  }

  function track() {
    if (channel && connected && needsLegacyPresence()) void channel.track(myAwake, serverNow()).catch(() => {});
  }

  function setAwake(v: boolean) {
    if (myAwake === v) return;
    myAwake = v;
    if (updatePresence()) emit();
    track();
    pageBeat();
  }

  // ---- the page ----------------------------------------------------------

  function onVisibility() {
    if (!alive()) return;
    clearTimer(sleepTimer);
    sleepTimer = null;
    if (env.isHidden()) {
      // Mobile browsers can suspend timers as soon as another app opens.
      if (env.handheld) { setAwake(false); return; }
      sleepTimer = env.setTimeout(() => {
        sleepTimer = null;
        setAwake(false);
      }, STUDY_LIMITS.sleepAfterHiddenMs);
    } else {
      const wasAwake = myAwake;
      setAwake(roomVisible);
      if (wasAwake) track(); // A brief desktop hide still needs an immediate renewal.
      beat(); // back: check in at once, and catch up
    }
  }

  function end(code: StudyErrorCode) {
    if (ended !== null || disposed) return;
    ended = code;
    stopTimers();
    channelGen++;
    const ch = channel;
    channel = null;
    connected = false;
    if (ch) void ch.close().catch(() => {});
    emit();
  }

  function stopTimers() {
    if (pageTimer !== null) env.clearInterval(pageTimer);
    pageTimer = null;
    if (beatTimer !== null) env.clearInterval(beatTimer);
    for (const t of [boundaryTimer, retryTimer, channelRetryTimer, sleepTimer]) clearTimer(t);
    beatTimer = boundaryTimer = retryTimer = channelRetryTimer = sleepTimer = null;
  }

  function serverNow() {
    return env.now() + clockOffset(samples);
  }

  async function act(call: () => Promise<unknown>): Promise<void> {
    if (disposed) throw new StudyError("unknown", "session disposed");
    if (ended !== null) throw new StudyError(ended);
    const sentAt = env.now();
    let raw: unknown;
    try {
      raw = await call();
    } catch (e) {
      const code = fail(e);
      // Refused because the screen was behind (e.g. someone else just started):
      // show where things stand.
      if (code !== "network" && !TERMINAL.has(code)) refetch();
      throw e instanceof StudyError ? e : new StudyError(code);
    }
    accept(raw, sentAt, env.now());
  }

  const stopVisibility = env.onVisibilityChange(onVisibility);
  const stopOnline = env.onOnline(() => refetch());
  const stopPageHide = env.onPageHide?.(() => pageBeat(false));
  if (transport.pageState) {
    pageBeat();
  }
  pageTimer = env.setInterval(() => {
    pageBeat();
    // A suspended phone may never deliver its last Presence update. Peers
    // expire its visible-page lease independently; visible split view renews it.
    if (!env.isHidden()) track();
    if (updatePresence()) emit();
  }, 10_000);
  beatTimer = env.setInterval(beat, STUDY_LIMITS.heartbeatMs);
  if (env.handheld && env.isHidden()) refetch();
  else beat();
  if (env.isHidden()) onVisibility();

  return {
    view: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onPoke(listener) {
      pokeListeners.add(listener);
      return () => pokeListeners.delete(listener);
    },
    serverNow,
    openSitting(desks) {
      if (!validDesks(desks, state?.members.length)) return Promise.reject(new StudyError("invalid_desks"));
      return act(() => transport.openSitting(groupId, desks));
    },
    setDesks(desks) {
      if (!validDesks(desks, state?.members.length)) return Promise.reject(new StudyError("invalid_desks"));
      return act(() => transport.setDesks(groupId, desks));
    },
    setDurations(studyMinutes, breakMinutes, longBreakMinutes, sessionsBeforeLong) {
      if (!validCycle(longBreakMinutes,sessionsBeforeLong) || !validDurations(studyMinutes, breakMinutes)) return Promise.reject(new StudyError("invalid_duration"));
      const write = durationWrites.catch(() => {}).then(() => act(() => {
        if (!transport.setDurations) throw new StudyError("unknown", "duration synchronization unavailable");
        return transport.setDurations(groupId, studyMinutes, breakMinutes, longBreakMinutes, sessionsBeforeLong);
      }));
      durationWrites = write;
      return write;
    },
    setReady(ready) {
      return act(() => transport.setReady ? transport.setReady(groupId, ready) : Promise.reject(new StudyError("unknown")));
    },
    setFocus(focus) {
      return act(() => transport.setFocus ? transport.setFocus(groupId, focus) : Promise.reject(new StudyError("invalid_focus")));
    },
    start(studyMinutes, breakMinutes, confirmMissing = false, confirmedIds = []) {
      if (!validDurations(studyMinutes, breakMinutes)) return Promise.reject(new StudyError("invalid_duration"));
      return act(() => transport.startRound(groupId, studyMinutes, breakMinutes, state?.sitting?.focusEnabled ? confirmMissing : undefined, confirmedIds));
    },
    pause: () => act(() => transport.pauseRound(groupId)),
    resume: () => act(() => transport.resumeRound(groupId)),
    leaveRound: () => act(() => transport.leaveRound(groupId)),
    endSitting: () => act(() => transport.endSitting ? transport.endSitting(groupId) : Promise.reject(new StudyError("unknown"))),
    poke(targetUserId) {
      const tap = env.randomId();
      const time = env.now();
      while (sentTapTimes.length && time - sentTapTimes[0] >= 1000) sentTapTimes.shift();
      if (!alive() || !state?.members.some(m => m.userId === targetUserId) || sentTapTimes.length >= 20) return tap;
      sentTapTimes.push(time);
      ownTaps.push(tap);
      if (ownTaps.length > OWN_TAPS_KEPT) ownTaps.shift();
      if (alive()) {
        const gen = channelGen;
        const sender = connected && channel?.sendPoke ? {send: channel.sendPoke} : null;
        // Presence keys include sleeping connections; offline round desks are not recipients.
        const recipients = [...awake.keys()].filter(id => id !== myId);
        void sendPoke(sender, targetUserId, tap, recipients,
          () => transport.poke(groupId, targetUserId, tap), () => alive() && gen === channelGen).catch((e) => {
          if (e instanceof StudyError && TERMINAL.has(e.code)) end(e.code);
        });
      }
      return tap;
    },
    refresh: refetch,
    setRoomVisible(visible) {
      roomVisible = visible;
      setAwake(visible && !env.isHidden());
      pageBeat();
      if (visible) beat();
    },
    dispose() {
      if (disposed) return;
      pageBeat(false);
      disposed = true;
      stopTimers();
      stopVisibility();
      stopOnline();
      stopPageHide?.();
      channelGen++;
      const ch = channel;
      channel = null;
      if (ch) void ch.close().catch(() => {});
      listeners.clear();
      pokeListeners.clear();
    },
  };
}
