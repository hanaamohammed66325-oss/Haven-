"use client";
import { acquireBodyScrollLock } from "@/components/motion/bodyScroll";

// ---------------------------------------------------------------------------
// Group study: one group's page once it is open: the session lake (desks and
// Havis), the shared timer and the controls. Everything shown comes from the
// session controller (lib/study/session.ts); the actions go through it, and
// the server decides (lib/study/rules.ts mirrors its rules to show the state).
// ---------------------------------------------------------------------------

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type TargetAndTransition, type Variants } from "motion/react";
import {GroupCycleSettings} from "./GroupCycleSettings";
import styles from "./StudyRoom.module.css";
import { ActionLight, MotionRoot, Press } from "@/components/motion/Press";
import { Rolling, Swap } from "@/components/motion/Swap";
import { Disclosure, DisclosureItem } from "@/components/motion/Disclosure";
import { MotionModal } from "@/components/motion/MotionModal";
import { EXIT, GLIDE, POP, stagger } from "@/components/motion/springs";
import { StudyAudioControls } from "@/components/pomodoro/StudyAudioControls";
import { useStudyAudio } from "@/components/pomodoro/useStudyAudio";
import { RoundAudioAlerts } from "@/lib/studyAudio/roundAlerts";
import { studyCanvasSize } from "@/lib/study/canvasSize";
import { StudyTaskPicker } from "./StudyTaskPicker";
import { studyFocusLocked } from "@/lib/study/focus";
import { readinessCue } from "@/lib/study/readyGlow";
import { Check, ChevronDown, Eye, EyeOff, LocateFixed, Maximize2, Minimize2, Minus, Pause, Play, Plus, SlidersHorizontal, X } from "@/components/motion/icons";
import { ACTION, GLASS, ON_SCENE } from "@/components/pomodoro/glass";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { useStudyNotice } from "./useStudyNotice";
import { normalizeHaviOutfit } from "@/lib/haviOutfit";
import { soloStudyActive } from "@/lib/study/solo";
import type { TranslationKey } from "@/i18n/translations/en";
import type { GroupSession } from "@/lib/study/session";
import { StudyScene, type CameraUi, type SceneMember, type SceneModel, type ScenePhase, type SceneView } from "@/lib/study/scene";
import {
  STUDY_LIMITS,
  canPause,
  canResume,
  canSetDesks,
  deskOccupants,
  isRunning,
  initialStudyDurations,
  myRoundStatus,
  phaseAt,
  planDesks,
  preparedDesks,
  roundClock,
  startCheck,
  snapshotPresence,
  type DeskPlan,
} from "@/lib/study/rules";
import { StudyError, type StudyHarvest, type HarvestMember, type StudyErrorCode, type StudyState } from "@/lib/study/types";

export interface StudyRoomProps {
  session: GroupSession;
  myId: string;
  /** The group lake: every earned pad by owner, and the owners' names and colours. */
  harvest: { members: readonly HarvestMember[]; pads: readonly string[]; details?: StudyHarvest["details"] };
  night: boolean;
  /** A phone or tablet: shows the away notice (switching apps counts as away). */
  handheld: boolean;
  initialDurations?: { study: number; rest: number };
  navigation?: React.ReactNode;
  onHudHidden?: (hidden: boolean) => void;
  onExit?: () => void;
}

const STUDY_CHOICES = [15, 20, 25, 30, 40, 45, 50, 60, 90];
const BREAK_CHOICES = [5, 10, 15, 20];
const AWAY_MINUTES = STUDY_LIMITS.awayLimitMs / 60_000;
const PAUSE_MINUTES = STUDY_LIMITS.pauseLimitMs / 60_000;

/** The scene's phase from the snapshot. */
function scenePhase(state: StudyState | null, now: number): ScenePhase {
  if (!state?.sitting) return "closed";
  const r = state.round;
  if (!r) return "waiting";
  const p = phaseAt(r, now);
  return p === "study" ? "study" : p === "paused" ? "paused" : p === "break" ? "break" : "waiting";
}

/** mm:ss, rounded up to the second (the last second shows 00:01). */
function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Motion (motion.dev): the HUD's parts retreat to their own edge when hidden
// (transforms only: fading a parent would switch off the glass blur), notes
// rise in, an error gives one small shake, buttons come and go in the panel.
const NOTE = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: EXIT },
  transition: POP,
} as const;
const SHAKE: TargetAndTransition = { opacity: 1, y: 0, scale: 1, x: [0, -7, 7, -4, 4, 0], transition: { x: { duration: 0.42 }, default: POP } };
const COME_GO = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85, transition: EXIT },
} as const;
const CHIPS: Variants = { out: {}, in: { transition: { staggerChildren: 0.035, delayChildren: 0.08 } } };
const CHIP: Variants = { out: { opacity: 0, y: 10, scale: 0.9 }, in: { opacity: 1, y: 0, scale: 1, transition: POP } };
/** Where a HUD part goes when the controls are hidden, and back. */
const hudPart = (hidden: boolean, away: { x?: string; y?: string }) => ({
  initial: false as const,
  animate: hidden ? { ...away, transitionEnd: { visibility: "hidden" as const } } : { x: "0%", y: "0%", visibility: "visible" as const },
  transition: GLIDE,
});

const ERRORS: Partial<Record<StudyErrorCode, TranslationKey>> = {
  network: "study_errNetwork",
  round_running: "study_errRunning",
  busy_elsewhere: "study_errBusy",
  need_two: "study_needTwo",
  on_break: "study_afterBreak",
};

export function StudyRoom({ session, myId, harvest, night, handheld, initialDurations, navigation, onHudHidden, onExit }: StudyRoomProps) {
  const { hydrated, haviCosmetics, referralProgram } = useStore();
  const rewardsReady = !!referralProgram.profile;
  const ownCosmetics = useMemo(() => hydrated ? normalizeHaviOutfit(haviCosmetics) : [], [hydrated, haviCosmetics]);
  const { t, dir } = useT();
  const audio = useStudyAudio();
  const audioAlerts = useRef(new RoundAudioAlerts());
  const view = useSyncExternalStore(session.subscribe, session.view, session.view);
  const state = view.state;
  const [focusPending, setFocusPending] = useState(false);
  const [readyPending, setReadyPending] = useState(false);
  const readyGlow = useRef(readinessCue(session));
  const [confirmFocus, setConfirmFocus] = useState(false);
  const [acknowledgedMissing, setAcknowledgedMissing] = useState<string[]>([]);

  // The clock on screen, a few times a second (the scene draws on its own).
  const [now, setNow] = useState(() => session.serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(session.serverNow()), 250);
    return () => window.clearInterval(id);
  }, [session]);

  const [lake, setLake] = useState<SceneView>("session");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [deskDraft, setDeskDraft] = useState<number | null>(null);
  const initial = initialStudyDurations(initialDurations?.study, initialDurations?.rest);
  const [studyMinutes, setStudyMinutes] = useState(initial.study);
  const [breakMinutes, setBreakMinutes] = useState(initial.rest);
  const durationEdited = useRef({ study: false, rest: false });
  const [durationPending, setDurationPending] = useState(0);
  const durationRevision = useRef(0);
  const durationDraft = useRef({ study: initial.study, rest: initial.rest });
  useEffect(() => {
    // Settings may load after the room. Never overwrite a student's own choice.
    if (!durationEdited.current.study && view.state?.sitting?.studyMinutes === undefined) setStudyMinutes(initial.study);
    if (!durationEdited.current.rest && view.state?.sitting?.breakMinutes === undefined) setBreakMinutes(initial.rest);
  }, [initial.study, initial.rest, view.state?.sitting?.studyMinutes, view.state?.sitting?.breakMinutes]);
  const [busy, setBusy] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { onHudHidden?.(controlsHidden); return () => onHudHidden?.(false); }, [controlsHidden, onHudHidden]);
  const [fullScreen, setFullScreen] = useState(false);
  const roomElement = useRef<HTMLDivElement>(null);
  const [confirmAction, setConfirmAction] = useState<"leave" | "end" | null>(null);
  useEffect(() => {
    if (!fullScreen) return;
    const releaseScroll = acquireBodyScrollLock();
    const onFullScreen = () => { if (!document.fullscreenElement) setFullScreen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullScreen(false); };
    document.addEventListener("fullscreenchange", onFullScreen);
    document.addEventListener("keydown", onKey);
    return () => {
      releaseScroll();
      document.removeEventListener("fullscreenchange", onFullScreen);
      document.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [fullScreen]);
  useEffect(() => { if (view.ended) setFullScreen(false); }, [view.ended]);
  const toggleFullScreen = () => {
    if (fullScreen) { setFullScreen(false); return; }
    setFullScreen(true);
    if (document.fullscreenEnabled) void roomElement.current?.requestFullscreen().catch(() => {});
  };
  const [error, setError] = useStudyNotice<TranslationKey | null>(null, value => value === "study_errNetwork");
  const errorRef = useRef(error);
  errorRef.current = error;
  // A successfully refreshed snapshot/rejoined channel clears stale network feedback.
  useEffect(() => { if (errorRef.current === "study_errNetwork") setError(null); }, [view.state, view.connected, setError]);
  const [tip, setTip] = useState<{ id: string; pad: number | null; x: number; y: number } | null>(null);
  const [camUi, setCamUi] = useState<CameraUi>({ landed: false, level: 0, count: 1, away: false });
  const [reduced, setReduced] = useState(false);
  const uid = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  const phase = scenePhase(state, now);
  const round = state?.round ?? null;
  const sitting = state?.sitting ?? null;
  const focusLocked = studyFocusLocked(state, now);
  const myFocus = focusLocked ? round?.participants.find((p) => p.userId === myId)?.focus ?? null : state?.members.find((m) => m.userId === myId)?.focus ?? null;
  const missingFocus = state?.members.filter((m) => sitting?.missingFocus?.includes(m.userId)) ?? [];
  const missingNames = missingFocus.map((m) => m.displayName).join(dir === "rtl" ? "، " : ", ");
  const notReady = state?.members.filter((m) => sitting?.missingReady?.includes(m.userId)) ?? [];
  const notReadyNames = notReady.map((m) => m.displayName).join(dir === "rtl" ? "، " : ", ");
  const missingIds = [...new Set([...missingFocus, ...notReady].map((m) => m.userId))];
  const myReady = state?.members.find((m) => m.userId === myId)?.ready === true;
  useEffect(() => { if (focusLocked || !sitting) setConfirmFocus(false); }, [focusLocked, sitting?.id]);
  const clock = round ? roundClock(round, now) : null;
  useEffect(() => {
    const alert = audioAlerts.current.observe(round, now);
    if (alert) audio.player.notify(alert);
  }, [round, now, audio.player]);
  const harvestOpen = phase !== "study" && clock?.phase !== "scheduled";
  const lakeShown: SceneView = lake === "achievement" && harvestOpen ? "achievement" : "session";
  const organizer = state?.members.find((m) => m.userId === sitting?.organizerId) ?? null;
  const isOrganizer = sitting?.organizerId === myId;
  useEffect(() => {
    if (durationPending > 0) return;
    if (sitting?.studyMinutes !== undefined) setStudyMinutes(sitting.studyMinutes);
    if (sitting?.breakMinutes !== undefined) setBreakMinutes(sitting.breakMinutes);
  }, [sitting?.id, sitting?.studyMinutes, sitting?.breakMinutes, durationPending]);
  durationDraft.current = { study: studyMinutes, rest: breakMinutes };
  const pickDuration = (kind: "study" | "rest", minutes: number) => {
    const draft = { ...durationDraft.current, [kind]: minutes };
    durationDraft.current = draft;
    durationEdited.current[kind] = true;
    setStudyMinutes(draft.study); setBreakMinutes(draft.rest);
    const revision = ++durationRevision.current;
    setDurationPending(revision); setError(null);
    void session.setDurations(draft.study, draft.rest).catch((e) => {
      if (revision === durationRevision.current) setError(ERRORS[e instanceof StudyError ? e.code : "unknown"] ?? "study_errGeneric");
    }).finally(() => {
      if (revision === durationRevision.current) setDurationPending(0);
    });
  };
  const present = state ? state.members.filter((m) => snapshotPresence(state) ? m.fresh : view.awake.get(m.userId) === true).length : 0;
  const status = state ? myRoundStatus(state, myId, now) : { kind: "none" as const };
  const baseCheck = state ? startCheck(state, myId, now) : null;
  const check = baseCheck?.ok && state && !snapshotPresence(state) && present < 2
    ? { ok: false as const, reason: "need_two" as const, until: null }
    : baseCheck;
  // The desks standing: the ones the organizer set while they still stand for
  // this round or the next, and one more for each extra member (after a round
  // only the taken ones are left: the empty ones sank). The counter can't go
  // below the desks taken.
  const prepared = state ? preparedDesks(state, now) : 0;
  const taken = state ? deskOccupants(state, new Set(view.awake.keys()), myId, now).size : 0;
  const desksMax = Math.min(STUDY_LIMITS.desks.max, state?.members.length ?? 0);
  const desksNow = !sitting ? Math.min(4, desksMax) : Math.min(desksMax, Math.max(STUDY_LIMITS.desks.min, taken, prepared > 0 ? sitting.deskCount : 0));
  const desksMin = sitting ? Math.max(STUDY_LIMITS.desks.min, taken) : STUDY_LIMITS.desks.min;
  const deskCount = Math.min(desksMax, deskDraft ?? desksNow);
  const mayPause = !!state && canPause(state, myId, now);
  const mayResume = !!state && canResume(state, myId, now);
  const maySetDesks = !!state && canSetDesks(state, myId, now);
  const inRound = !!round && isRunning(phaseAt(round, now)) && round.participants.some((p) => p.userId === myId && p.active);

  // Names and colours, for the scene and the names on hover.
  const harvestNames = useMemo(() => new Map(harvest.members.map((m) => [m.userId, m])), [harvest.members]);
  const flowers = useMemo(() => new Map(harvest.members.map((m) => [m.userId, m.flowerColor])), [harvest.members]);
  const padCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const id of harvest.pads) out.set(id, (out.get(id) ?? 0) + 1);
    return out;
  }, [harvest.pads]);

  // What the scene reads every frame.
  const live = useRef({ night, reduced, lake: lakeShown, selected, harvest, flowers, ownCosmetics, rewardsReady });
  live.current = { night, reduced, lake: lakeShown, selected, harvest, flowers, ownCosmetics, rewardsReady };
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const plan = useRef<DeskPlan | null>(null);
  const sceneRef = useRef<StudyScene | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // The lake paints the entire frame; an opaque backing avoids extra blending.
    const ctx = el.getContext("2d", { alpha: false });
    if (!ctx) return;
    // Drawn at the canvas's real size (CSS px), as the lake map is.
    const size = { w: 0, h: 0, dpr: 1 };
    const measure = () => {
      const { w, h, dpr, pixelWidth, pixelHeight } = studyCanvasSize(el.clientWidth, el.clientHeight, window.devicePixelRatio);
      if (w === size.w && h === size.h && dpr === size.dpr) return false;
      Object.assign(size, { w, h, dpr });
      el.width = pixelWidth; el.height = pixelHeight;
      return true;
    };
    measure();
    const scene = new StudyScene(size.w, size.h, size.dpr);
    sceneRef.current = scene;
    let touchGesture = false, touchPoint: { x: number; y: number } | null = null, touchTipTimer = 0;
    const hideTouchTip = () => {
      window.clearTimeout(touchTipTimer);
      pointer.current = null;
      setTip(null);
    };
    scene.onTap = (id) => {
      session.poke(id);
      if (touchGesture && touchPoint) {
        pointer.current = touchPoint;
        window.clearTimeout(touchTipTimer);
        touchTipTimer = window.setTimeout(hideTouchTip, 15_000);
      }
    };
    const stopPokes = session.onPoke((id) => { scene.poke(id); });

    // Members as the scene wants them, rebuilt only when the snapshot changes.
    let membersFor: StudyState | null = null;
    let ownFor: readonly string[] | null = null;
    let rewardsFor = false;
    let members = new Map<string, SceneMember>();
    const model = (): SceneModel => {
      const v = session.view(), st = v.state, sNow = session.serverNow(), l = live.current;
      if (st !== membersFor || l.ownCosmetics !== ownFor || l.rewardsReady !== rewardsFor) {
        membersFor = st;
        ownFor = l.ownCosmetics;
        rewardsFor = l.rewardsReady;
        members = new Map((st?.members ?? []).map((m) => [m.userId, { color: m.haviColor, flower: m.flowerColor,
          cosmetics: !l.rewardsReady ? [] : m.userId === myId ? l.ownCosmetics : m.haviCosmetics }]));
      }
      const online = new Set(v.awake.keys());
      const running = !!st?.round && isRunning(phaseAt(st.round, sNow));
      plan.current = planDesks(plan.current, {
        sittingId: st?.sitting?.id ?? null,
        running,
        prepared: st ? Math.min(st.members.length, preparedDesks(st, sNow)) : 0,
        members: st?.members ?? [],
        occupants: st ? deskOccupants(st, online, myId, sNow) : new Set<string>(),
      });
      const awake = new Map(v.awake);
      const readyKey = `${st?.sitting?.id ?? ""}:${st?.round?.seq ?? 0}`;
      const presentMembers = st?.members.filter(m => m.fresh) ?? [];
      const all = !!st?.sitting?.readyEnabled && !running && presentMembers.length >= 2 && presentMembers.every(m => m.ready);
      if (readyGlow.current.key !== readyKey) Object.assign(readyGlow.current, { key: readyKey, all: false, at: -Infinity });
      if (all && !readyGlow.current.all) readyGlow.current.at = performance.now();
      readyGlow.current.all = all;
      return {
        serverTime: sNow, readyGlowAt: readyGlow.current.at,
        night: l.night, reduced: l.reduced, view: l.lake,
        phase: scenePhase(st, sNow),
        progress: st?.round ? roundClock(st.round, sNow).progress : 0,
        places: plan.current.places, members, awake,
        harvest: l.harvest.pads, harvestFlowers: l.flowers, selected: l.selected,
        pointer: pointer.current,
      };
    };

    let frame = 0, last = 0, ui = scene.ui, tipId: string | null = null, tipPad: number | null = null, tipAt: { x: number; y: number } | null = null;
    let resizeTimer = 0;
    const scheduleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { if (measure()) scene.resize(size.w, size.h, size.dpr); }, 150);
    };
    const ro = new ResizeObserver(scheduleResize);
    ro.observe(el);
    window.addEventListener("resize", scheduleResize);
    // Every frame while something moves, ~30 fps otherwise (as the lake map).
    const render = (t: number) => {
      // The next frame is asked for first, so one failed frame can't stop the scene.
      frame = requestAnimationFrame(render);
      if (t - last > (scene.moving ? 0 : 32) && !document.hidden) {
        last = t;
        scene.draw(ctx, t, model());
        const id = scene.hoveredMember;
        const p = pointer.current;
        const pad = scene.hoveredPad;
        if (id !== tipId || pad !== tipPad || (id && p !== tipAt)) {
          tipId = id; tipAt = p; tipPad = pad;
          const r = el.getBoundingClientRect();
          setTip(id && p ? { id, pad, x: r.left + p.x * r.width / size.w, y: r.top + p.y * r.height / size.h } : null);
        }
        if (scene.ui !== ui) { ui = scene.ui; setCamUi(ui); }
      }
    };
    frame = requestAnimationFrame(render);

    // The lake map's gestures: drag with a glide, pinch, double tap, wheel, keys.
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: (e.clientX - r.left) * size.w / r.width, y: (e.clientY - r.top) * size.h / r.height };
    };
    const onDown = (e: PointerEvent) => {
      touchGesture = e.pointerType !== "mouse";
      el.setPointerCapture?.(e.pointerId);
      const q = local(e);
      touchPoint = q;
      pointer.current = touchGesture ? null : q;
      scene.pointerDown(e.pointerId, q, performance.now());
    };
    const onMove = (e: PointerEvent) => {
      const q = local(e);
      const panning = scene.pointerMove(e.pointerId, q, performance.now(), e.pointerType === "mouse");
      el.style.cursor = panning ? "grabbing" : "grab";
      touchPoint = q;
      pointer.current = panning || e.pointerType !== "mouse" ? null : q;
    };
    const onUp = (e: PointerEvent) => { touchPoint = local(e); scene.pointerUp(e.pointerId, touchPoint, performance.now()); el.style.cursor = "grab"; };
    const onCancel = (e: PointerEvent) => { scene.pointerCancel(e.pointerId); el.style.cursor = "grab"; pointer.current = null; };
    const onLeave = (e: PointerEvent) => { scene.pointerLeave(); if (e.pointerType !== "touch") pointer.current = null; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); scene.wheel(e.deltaY * (e.deltaMode === 1 ? 16 : 1), local(e), performance.now()); };
    const onKey = (e: KeyboardEvent) => { if (scene.key(e.key)) e.preventDefault(); };
    const onOutsideTouch = (e: PointerEvent) => { if (e.pointerType !== "mouse") hideTouchTip(); };
    document.addEventListener("pointerdown", onOutsideTouch, { capture: true, passive: true });
    el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove); el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel); el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(resizeTimer); window.clearTimeout(touchTipTimer); ro.disconnect(); stopPokes();
      document.removeEventListener("pointerdown", onOutsideTouch, true);
      window.removeEventListener("resize", scheduleResize);
      el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel); el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel); el.removeEventListener("keydown", onKey);
      sceneRef.current = null; scene.dispose();
    };
  }, [session, myId]);

  async function run(action: () => Promise<void>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (e) {
      const code = e instanceof StudyError ? e.code : "unknown";
      setError(ERRORS[code] ?? "study_errGeneric");
    } finally {
      setBusy(false);
    }
  }

  // The desks counter. Before a sitting it picks the number to open with; for
  // the organizer after that, each tap applies (her decision, 2026-10-06): a
  // moment after the last tap one call goes, and a tap during it goes next.
  const pickDesks = (n: number) => { if (n >= desksMin && n <= desksMax) setDeskDraft(n === desksNow ? null : n); };
  useEffect(() => {
    if (deskDraft === null || !maySetDesks || busy) return;
    const n = Math.min(deskDraft, desksMax);
    if (n < desksMin) return;
    const id = window.setTimeout(() => {
      void run(() => session.setDesks(n)).then(() => setDeskDraft((d) => (d === n ? null : d)));
    }, 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run reads this render's state
  }, [deskDraft, desksMax, desksMin, maySetDesks, busy, session]);

  const toSession = () => { sceneRef.current?.home(); setLake("session"); };
  const start = (confirmMissing = false) => {
    if (soloStudyActive()) { setError("study_soloActive"); return; }
    return run(() => session.start(studyMinutes, breakMinutes, confirmMissing, confirmMissing ? acknowledgedMissing : missingIds), () => {
      const latest = session.view().state?.sitting;
      if (latest?.focusWarning) {
        setAcknowledgedMissing([...new Set([...(latest.missingFocus ?? []), ...(latest.missingReady ?? [])])]);
        setConfirmFocus(true);
      }
      else { setConfirmFocus(false); toSession(); }
    });
  };

  if (view.ended) {
    return (
      <div className="grid h-full place-items-center p-6" style={{ background: "#10271f", containerType: "inline-size" }}>
        <p className="max-w-sm text-center text-sm" style={ON_SCENE}>{t("study_ended")}</p>
      </div>
    );
  }

  // The timer card's lines.
  const phaseLabel: TranslationKey =
    phase === "closed" ? "study_phaseClosed"
    : clock?.phase === "scheduled" ? "study_phaseStarting"
    : phase === "study" ? "study_phaseStudy"
    : phase === "paused" ? "study_phasePaused"
    : phase === "break" ? "study_phaseBreak"
    : "study_phaseWaiting";
  const timer =
    !clock || phase === "waiting" || phase === "closed" ? clockText(studyMinutes * 60000)
    : phase === "break" ? clockText(clock.breakLeftMs)
    : clockText(clock.studyLeftMs);

  // Why the start button waits, when it does.
  let startNote: string | null = null;
  if (check && !check.ok) {
    if (check.reason === "need_two") startNote = t("study_needTwo");
    else if (check.reason === "not_organizer" && check.until !== null) startNote = t("study_organizerStarts", { time: clockText(check.until - now) });
    else if (check.reason === "on_break") startNote = t("study_afterBreak");
  }
  const startVisible = !!sitting && !isRunning(round ? phaseAt(round, now) : null)
    && (isOrganizer || (check?.ok === true && check.takesOver));

  const statusNote =
    status.kind === "late" ? t("study_late")
    : status.kind === "out" && status.reason === "away" ? t("study_outAway", { n: AWAY_MINUTES })
    : status.kind === "out" ? t("study_outLeft")
    : status.kind === "earned" ? t("study_earned")
    : null;

  const tipName = (id: string) => {
    const m = state?.members.find((x) => x.userId === id);
    if (m) return m.isMe ? `${m.displayName} (${t("study_you")})` : m.displayName;
    return harvestNames.get(id)?.displayName ?? t("study_formerMember");
  };

  // A note re-enters only when its kind changes, not when its countdown ticks.
  const noteKey = error ? `error:${error}` : statusNote ? `status:${status.kind}` : `start:${check && !check.ok ? check.reason : ""}`;
  const openDisabled = busy || desksMax < STUDY_LIMITS.desks.min;
  const startDisabled = busy || readyPending || focusPending || durationPending > 0 || !check?.ok;
  const startLabel: TranslationKey = check?.ok && check.takesOver ? "study_takeOver" : round ? "study_startNext" : "study_start";
  const settingsToggle = maySetDesks || (!!state && !sitting) || (startVisible && isOrganizer);
  const hasControls = lakeShown === "session" && ((!!state && !sitting) || maySetDesks || startVisible || mayPause || mayResume || inRound);
  const pill = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45";
  // Which way "away" is for the side column, and for a label leaving sideways.
  const side = dir === "rtl" ? -1 : 1;
  const roundButton = "grid h-9 w-9 place-items-center rounded-full disabled:opacity-35";

  const room = (
    <div ref={roomElement} dir={dir} data-havi-avoid className={`${styles.room} ${fullScreen ? "fixed inset-0 z-40" : "relative h-full w-full"} overflow-hidden`} style={{ background: "#10271f" }}
      onPointerDownCapture={(e) => { if (e.target !== canvas.current) pointer.current = null; }}>
      <canvas ref={canvas} tabIndex={0} role="img"
        aria-label={lakeShown === "session" ? t("study_sceneLabel") : t("study_harvestLabel")}
        className="absolute inset-0 block h-full w-full outline-none"
        style={{ touchAction: "none", cursor: "grab" }} />

      <div className={styles.hud} inert={controlsHidden} aria-hidden={controlsHidden || undefined}>
      {/* The shared timer, and the river between the session lake and the
          group's achievement lake: one row, so they never overlap on a phone
          (where the river button takes its short name). */}
      <motion.div className={styles.top} {...hudPart(controlsHidden, { y: "-140%" })}>
      {onExit && <div className={styles.exit}>
        <Press className="grid h-11 w-11 place-items-center rounded-full" style={GLASS} aria-label={t("study_exitView")} onClick={onExit}><X size={20} /></Press>
      </div>}
        {lakeShown === "session" && <div className={styles.timer} style={{ color: night ? "#f4f1e6" : "#38232b" }} aria-live="polite">
          <p role="timer" dir="ltr" className={`${styles.digits} leading-none font-normal`} style={{ fontFamily: 'Fraunces, Georgia, "Times New Roman", serif', fontVariantNumeric: "tabular-nums" }}>{timer}</p>
          <div className="my-2 h-[3px] overflow-hidden rounded-full bg-current/20" aria-hidden>
            <motion.div className="h-full bg-current" initial={false} transition={{ duration: 0.3, ease: "linear" }}
              animate={{ width: `${round && clock ? Math.max(0, Math.min(100, 100 * (1 - clock.studyLeftMs / round.studyMs))) : 0}%` }} />
          </div>
          <p className="text-xs opacity-85"><Swap id={`${phaseLabel}:${round?.seq ?? 0}`} kind="rise">{t(phaseLabel)}{round && phase !== "closed" && <> · {t("study_roundN", { n: round.seq })}</>}</Swap></p>
          {sitting && <p className="mt-1 text-xs opacity-80">{t("study_present", { n: present })}{organizer ? ` · ${t("study_organizer", { name: organizer.isMe ? t("study_you") : organizer.displayName })}` : ""}</p>}
          {!state && <p className="text-xs">{t("study_connecting")}</p>}
          {sitting?.focusEnabled && <div className={styles.task}>
            <StudyTaskPicker focus={myFocus} locked={focusLocked} pending={focusPending} onChange={(focus) => {
              setFocusPending(true); setError(null);
              void session.setFocus(focus).catch((e) => setError(ERRORS[e instanceof StudyError ? e.code : "unknown"] ?? "study_errGeneric"))
                .finally(() => setFocusPending(false));
            }} />
            {sitting.readyEnabled && !focusLocked && <Press className={`${pill} relative isolate overflow-hidden`} style={GLASS}
              aria-pressed={myReady} disabled={focusPending || readyPending || busy} onClick={() => {
                setReadyPending(true); setError(null);
                void session.setReady(!myReady).catch(() => setError("study_errGeneric")).finally(() => setReadyPending(false));
              }}>
              {/* Ready: the theme colour washes in under the label, a check pops in. */}
              <motion.span aria-hidden className="absolute inset-0 -z-10 rounded-[inherit]" style={{ background: "var(--grad-primary)" }}
                initial={false} animate={{ opacity: myReady ? 1 : 0 }} transition={{ duration: 0.25 }} />
              <Swap id={myReady ? "ready" : "not"} kind="rise" className="gap-1.5">{myReady && <Check size={15} strokeWidth={2.6} />}{t(myReady ? "study_isReady" : "study_ready")}</Swap>
            </Press>}
          </div>}
          {sitting?.readyEnabled && !focusLocked && sitting.organizerId === myId && state?.members.filter(m => m.fresh).length! >= 2 && state?.members.filter(m => m.fresh).every(m => m.ready) && <p className="mt-1 text-xs" role="status">{t("study_allReady")}</p>}
          {sitting?.readyEnabled && !focusLocked && <p className="mt-1 text-xs opacity-80" role="status">{t("study_readyMembers", { names: state?.members.filter((m) => m.ready && m.fresh).map((m) => m.displayName).join(dir === "rtl" ? "، " : ", ") || t("study_readyNone") })}</p>}
        </div>}
        <div className={styles.navigation}>
        {/* The river: the label slides in from the side of the lake it leads to. */}
        <AnimatePresence mode="popLayout" initial={false}>
        {lakeShown === "achievement" ? (
          <Press key="to-session" className={`${pill} pointer-events-auto max-w-full text-xs sm:text-sm`} style={GLASS} onClick={() => { setLake("session"); setTip(null); }}
            initial={{ opacity: 0, x: -16 * side }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 * side, transition: EXIT }}>
            <span className={styles.shortLabel}>{t("study_toSessionShort")}</span><span className={styles.longLabel}>{t("study_toSession")}</span>
          </Press>
        ) : harvestOpen ? (
          <Press key="to-harvest" className={`${pill} pointer-events-auto max-w-full text-xs sm:text-sm`} style={GLASS} onClick={() => { setLake("achievement"); setTip(null); }}
            initial={{ opacity: 0, x: 16 * side }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 * side, transition: EXIT }}>
            <span className={styles.shortLabel}>{t("study_toHarvestShort")}</span><span className={styles.longLabel}>{t("study_toHarvest")}</span>
          </Press>
        ) : null}
        </AnimatePresence>
        {navigation}
        </div>
      </motion.div>

      {/* The lake map's zoom column, and back to the middle once far away. */}
      <motion.div className={styles.middle} {...hudPart(controlsHidden, { x: `${160 * side}%` })}><div className={styles.tools}
        style={{ opacity: camUi.landed ? 1 : 0, pointerEvents: camUi.landed ? "auto" : "none", transition: "opacity .35s ease" }}>
        {camUi.count > 1 && (
          <div className={`${styles.zoom} rounded-full p-1`} style={GLASS}>
            <Press lift="none" className={roundButton} onClick={() => sceneRef.current?.zoomStep(1)} disabled={camUi.level === 0}
              aria-label={t("pom_zoomIn")} title={t("pom_zoomIn")}><Plus size={17} /></Press>
            {/* The current level's dot glides to the new level. */}
            <div aria-hidden className={`${styles.dots} p-0.5`}>
              {Array.from({ length: camUi.count }, (_, i) => (
                <span key={i} className="relative grid h-[7px] w-[7px] place-items-center">
                  <span className="block h-[5px] w-[5px] rounded-full" style={{ background: "rgba(244,241,230,0.35)" }} />
                  {i === camUi.level && <motion.span layoutId={`${uid}-zoom`} className="absolute inset-0 rounded-full" style={{ background: "#f4f1e6" }} transition={GLIDE} />}
                </span>
              ))}
            </div>
            <Press lift="none" className={roundButton} onClick={() => sceneRef.current?.zoomStep(-1)} disabled={camUi.level === camUi.count - 1}
              aria-label={t("pom_zoomOut")} title={t("pom_zoomOut")}><Minus size={17} /></Press>
          </div>
        )}
        <AnimatePresence initial={false}>
          {camUi.away && (
            <Press key="home" className="grid h-11 w-11 place-items-center rounded-full" style={GLASS} onClick={() => sceneRef.current?.home()}
              initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4, transition: EXIT }}
              aria-label={t("study_backToMiddle")} title={t("study_backToMiddle")}><LocateFixed size={18} /></Press>
          )}
        </AnimatePresence>
        <Press className="grid h-10 w-10 place-items-center rounded-full" style={GLASS}
          onClick={toggleFullScreen} aria-label={t(fullScreen ? "pom_fullscreenExit" : "pom_fullscreen")}>
          <Swap id={fullScreen ? "exit" : "enter"}>{fullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</Swap>
        </Press>
        <StudyAudioControls player={audio.player} state={audio.state} />
        <Press className="grid h-10 w-10 place-items-center rounded-full" style={GLASS}
          aria-label={t(controlsHidden ? "pom_showHud" : "pom_hideHud")} aria-expanded={!controlsHidden}
          onClick={() => setControlsHidden((v) => !v)}><Swap id={controlsHidden ? "show" : "hide"}>{controlsHidden ? <Eye size={18} /> : <EyeOff size={18} />}</Swap></Press>
      </div></motion.div>

      {/* The controls. */}
      <motion.div className={styles.bottom} {...hudPart(controlsHidden, { y: "140%" })}>
        <AnimatePresence initial={false}>
        {lakeShown === "session" && !focusLocked && sitting?.focusWarning && (missingNames || notReadyNames) && <motion.div key="focus-warning" {...NOTE} className={styles.note} style={GLASS} role="status">{missingNames && <p>{t("study_missingFocus", { names: missingNames })}</p>}{notReadyNames && <p>{t("study_missingReady", { names: notReadyNames })}</p>}</motion.div>}
        {lakeShown === "session" && (statusNote || error || startNote) && (
          <motion.div key={noteKey} {...NOTE} animate={error ? SHAKE : NOTE.animate} className={styles.note} style={GLASS} role={error ? "alert" : undefined}>
            {error ? t(error) : statusNote ?? startNote}
          </motion.div>
        )}
        </AnimatePresence>
        {/* The panel glides to its new size when its buttons change; each
            button comes and goes on its own. */}
        <AnimatePresence initial={false}>
        {hasControls && (
          <motion.div key="panel" layout className={styles.panel} style={{ ...GLASS, borderRadius: 24 }} transition={GLIDE}
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97, transition: EXIT }}>
            <AnimatePresence mode="popLayout" initial={false}>
              {settingsToggle && <Press key="settings" layout {...COME_GO} className={pill}
                onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen} aria-label={t("pom_settings")} title={t("pom_settings")}>
                <motion.span className="grid" animate={{ rotate: settingsOpen ? 90 : 0 }} transition={POP}><SlidersHorizontal size={16} /></motion.span>
              </Press>}
              {/* Waiting for a sitting: the desks, then open it. */}
              {state && !sitting && (
                <Press key="open" layout {...COME_GO} className={`${pill} relative isolate`} style={ACTION} disabled={openDisabled}
                  onClick={() => run(async () => {
                    await session.openSitting(deskCount);
                    if (session.view().state?.sitting?.organizerId === myId) await session.setDurations(studyMinutes, breakMinutes);
                  }, () => setDeskDraft(null))}><ActionLight ready={!openDisabled} />{t("study_openSitting")}</Press>
              )}

              {/* The organizer may change the desks outside a round: each tap applies (above). */}
              {startVisible && (
                <Press key="start" layout {...COME_GO} className={`${pill} relative isolate`} style={check?.ok ? ACTION : undefined} disabled={startDisabled} onClick={() => start()}>
                  <ActionLight ready={!startDisabled} />
                  <Swap id={startLabel} kind="rise">{t(startLabel)}</Swap>
                </Press>
              )}

              {mayPause && (
                <Press key="pause" layout {...COME_GO} className={pill} disabled={busy} onClick={() => run(() => session.pause())}>
                  <Pause size={15} />{t("study_pause")}
                </Press>
              )}
              {mayResume && (
                <Press key="resume" layout {...COME_GO} className={`${pill} relative isolate`} style={ACTION} disabled={busy} onClick={() => run(() => session.resume(), toSession)}>
                  <ActionLight ready={!busy} /><Play size={15} />{t("study_resume")}
                </Press>
              )}
              {inRound && (
                <Press key="leave" layout {...COME_GO} className={pill} disabled={busy} onClick={() => setConfirmAction("leave")}>{t("study_leaveRound")}</Press>
              )}
              {sitting?.organizerId === myId && (
                <Press key="end" layout {...COME_GO} className={pill} disabled={busy} onClick={() => setConfirmAction("end")}>{t("study_endSitting")}</Press>
              )}
            </AnimatePresence>
            <div className={styles.settingsRow}>
              <Disclosure open={settingsOpen && settingsToggle} className={styles.settingsFields}>
                {(maySetDesks || (!!state && !sitting)) && <DisclosureItem index={0}><DeskStepper value={deskCount} min={desksMin} max={desksMax} onChange={pickDesks} t={t} disabled={busy} /></DisclosureItem>}
                {startVisible && isOrganizer && <DisclosureItem index={1}><GroupCycleSettings value={{study:studyMinutes,rest:breakMinutes,long:sitting?.longBreakMinutes??15,count:sitting?.sessionsBeforeLong??4}} advanced={sitting?.cycleEnabled===true} pending={busy||durationPending>0||phase==="break"} onSave={async v=>{
                  const revision=++durationRevision.current;setDurationPending(revision);setError(null);
                  try {await session.setDurations(v.study,v.rest,sitting?.cycleEnabled?v.long:undefined,sitting?.cycleEnabled?v.count:undefined);setStudyMinutes(v.study);setBreakMinutes(v.rest);}
                  catch(e){setError(ERRORS[e instanceof StudyError?e.code:"unknown"]??"study_errGeneric");throw e;}
                  finally{setDurationPending(0);}
                }}/></DisclosureItem>}
              </Disclosure>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
        {lakeShown === "session" && phase === "paused" && (
          <p className="text-xs" style={ON_SCENE}>{t("study_pauseLimit", { n: PAUSE_MINUTES })}</p>
        )}
        {settingsOpen && lakeShown === "session" && handheld && sitting && phase !== "study" && phase !== "paused" && (
          <details className={styles.notice} style={ON_SCENE}><summary>{t("study_phoneNoticeTitle")}</summary><p>{t("study_phoneNotice", { n: AWAY_MINUTES })}</p></details>
        )}
      </motion.div>

      {/* The achievement filters share the bottom edge, leaving the lake clear. */}
      <AnimatePresence initial={false}>
      {lakeShown === "achievement" && harvest.members.length > 0 && (
        <motion.div key="legend" className={styles.bottom} {...hudPart(controlsHidden, { y: "140%" })} exit={{ y: "140%", transition: EXIT }}>
          <motion.div className={styles.legend} style={GLASS} aria-label={t("study_leavesByName")} variants={CHIPS} initial="out" animate="in">
            <Press lift="none" variants={CHIP} className={`${styles.chip} relative isolate`} onClick={() => setSelected(new Set())} aria-pressed={selected.size === 0}>
              <Highlight on={selected.size === 0} />{t("study_showAll")}
            </Press>
            <div className={styles.chips}>
              {harvest.members.filter((m) => padCounts.has(m.userId)).map((m) => {
                const on = selected.has(m.userId);
                return <Press key={m.userId} lift="none" variants={CHIP} className={`${styles.chip} relative isolate`} aria-pressed={on}
                  style={{ background: "rgba(0,0,0,.15)" }} onClick={() => {
                    const next = new Set(selected);
                    if (on) next.delete(m.userId); else next.add(m.userId);
                    setSelected(next);
                  }}>
                  <Highlight on={on} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.flowerColor }} />
                  <span className="max-w-24 truncate">{m.displayName ?? t("study_formerMember")}</span>
                  <span className="opacity-80" aria-label={t("study_pads", { n: padCounts.get(m.userId) ?? 0 })}>{padCounts.get(m.userId) ?? 0}</span>
                </Press>;
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      </div>
      <AnimatePresence>
        {controlsHidden && <Press key="reveal" className={`${styles.reveal} grid h-10 w-10 place-items-center rounded-full`} style={GLASS}
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1, transition: { ...POP, delay: 0.15 } }} exit={{ opacity: 0, scale: 0.5, transition: EXIT }}
          aria-label={t("pom_showHud")} onClick={() => setControlsHidden(false)}><Eye size={18} /></Press>}
      </AnimatePresence>
      {mounted && createPortal(
        <MotionRoot><AnimatePresence>
          {!controlsHidden && tip && (
            <motion.div key={tip.id} role="tooltip" dir={dir} className="pointer-events-none fixed z-[100] rounded-xl px-3 py-2 text-[13px]"
              initial={{ opacity: 0, scale: 0.85, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }} transition={POP}
              style={{ ...GLASS, maxWidth: Math.min(224, window.innerWidth - 16), transformOrigin: "0 0", left: Math.max(8, Math.min(window.innerWidth - 240, tip.x + 12)), top: Math.max(8, Math.min(window.innerHeight - 120, tip.y + 12)) }}>
              <strong>{tipName(tip.id)}</strong>
              {lakeShown === "session" && (() => {
                const member = state?.members.find(m => m.userId === tip.id);
                const work = focusLocked ? round?.participants.find(p => p.userId === tip.id)?.focus : member?.focus;
                return <>
                  {work && <p className="line-clamp-2 break-words opacity-85">{work.title ?? t("pom_generalFocus")}</p>}
                  {!focusLocked && member?.ready && <p className="flex items-center gap-1.5"><Check size={12} />{t("study_isReady")}</p>}
                </>;
              })()}
              {lakeShown === "achievement" && <p className="opacity-85">{t("study_pads", { n: padCounts.get(tip.id) ?? 0 })}</p>}
              {lakeShown === "achievement" && tip.pad !== null && harvest.details?.[tip.pad]?.focus && <p className="max-w-56 break-words">{harvest.details[tip.pad].focus?.title ?? t("pom_generalFocus")}</p>}
            </motion.div>
          )}
        </AnimatePresence></MotionRoot>,
        document.body,
      )}
      <MotionModal open={confirmFocus} onClose={() => { if (!busy) setConfirmFocus(false); }} title={t(sitting?.readyEnabled ? "study_startWarningTitle" : "study_focusWarningTitle")}>
        <p className="text-sm leading-relaxed">{missingNames ? t("study_missingFocus", { names: missingNames }) : !notReadyNames ? t("study_focusReady") : null}</p>
        {notReadyNames && <p className="mt-2 text-sm leading-relaxed">{t("study_missingReady", { names: notReadyNames })}</p>}
        {missingNames && <p className="mt-2 text-sm opacity-80">{t("study_freeFallback")}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Press lift="soft" className={pill} disabled={busy} onClick={() => setConfirmFocus(false)}>{t("study_waitFocus")}</Press>
          <Press lift="soft" className={`${pill} relative isolate`} style={ACTION} disabled={busy || readyPending || focusPending || !check?.ok} onClick={() => start(true)}>
            <ActionLight ready={!(busy || readyPending || focusPending || !check?.ok)} />{t("study_confirmFocusStart")}
          </Press>
        </div>
      </MotionModal>
      <MotionModal open={confirmAction !== null} onClose={() => { if (!busy) setConfirmAction(null); }}
        title={t(confirmAction === "end" ? "study_endSitting" : "study_leaveRound")}>
        <p className="text-sm leading-relaxed">{t(confirmAction === "end" ? "study_endSittingConfirm" : "study_leaveRoundConfirm")}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Press lift="soft" className={pill} disabled={busy} onClick={() => setConfirmAction(null)}>{t("cancel")}</Press>
          <Press lift="soft" className={pill} style={ACTION} disabled={busy} onClick={() => run(
            () => confirmAction === "end" ? session.endSitting() : session.leaveRound(),
            () => setConfirmAction(null),
          )}>{t(confirmAction === "end" ? "study_endSitting" : "study_leaveRound")}</Press>
        </div>
      </MotionModal>
    </div>
  );
  // Keep the canvas and scene mounted while fullscreen changes its dimensions.
  // ResizeObserver updates the camera without replaying members' arrivals.
  return <MotionRoot>{room}</MotionRoot>;
}

/** A chip's "chosen" light: pops in under the label, shrinks away when unchosen. */
function Highlight({ on }: { on: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {on && <motion.span key="on" aria-hidden className="absolute inset-0 -z-10 rounded-[inherit]"
        style={{ background: "rgba(255,255,255,.2)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" }}
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8, transition: EXIT }} transition={POP} />}
    </AnimatePresence>
  );
}

function DeskStepper({ value, min, max, onChange, t, disabled }: {
  value: number;
  /** The fewest it may show (the desks taken). */
  min: number;
  max: number;
  onChange: (n: number) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/25 p-1 text-sm" role="group" aria-label={t("study_desks")}>
      <span className="px-2 text-xs opacity-85">{t("study_desks")}</span>
      <Press lift="none" className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-35" disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)} aria-label={t("study_desksFewer")}><Minus size={15} /></Press>
      <span className="grid w-6 place-items-center font-semibold" style={{ fontVariantNumeric: "tabular-nums" }} aria-live="polite"><Rolling value={value} /></span>
      <Press lift="none" className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-35" disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)} aria-label={t("study_desksMore")}><Plus size={15} /></Press>
    </div>
  );
}
