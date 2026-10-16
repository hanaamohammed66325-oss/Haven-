"use client";

// Group study: one group's page (/study/?g=<id>). Opens the group's session
// (its channel lives only while this page is open), loads the group lake, and
// holds the group's settings: the invite link, the name, the members, how I
// appear, leaving, and deleting.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, Settings2 } from "@/components/motion/icons";
import { AnimatePresence, motion } from "motion/react";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { MotionModal } from "@/components/motion/MotionModal";
import { Press } from "@/components/motion/Press";
import { Swap } from "@/components/motion/Swap";
import { EXIT, GLIDE, POP, stagger } from "@/components/motion/springs";
import { GLASS } from "@/components/pomodoro/glass";
import { getTimeOfDay } from "@/lib/pomodoro/timeOfDay";
import { isHandheld } from "@/lib/study/rules";
import type { GroupSession } from "@/lib/study/session";
import {
  deleteStudyGroup,
  hideFormerMemberPads,
  leaveStudyGroup,
  openGroupSession,
  removeStudyMember,
  renameStudyGroup,
  resetStudyInvite,
  restoreStudyGroup,
  studyHarvest,
  studyInviteToken,
  updateStudyAppearance,
} from "@/lib/study/client";
import type { StudyAppearance, StudyHarvest, StudyMember, StudyState } from "@/lib/study/types";
import { StudyRoom } from "./StudyRoom";
import { retainRoom, leaveRoomView, clearActiveRoom } from "@/lib/study/activeRoom";
import { clearStudyDestination } from "@/lib/study/destination";
import { AppearanceFields, NAME_MAX, appearanceValid, field, fieldStyle, nameOk } from "./AppearanceFields";
import { useStudyNotice } from "./useStudyNotice";

/** How long a deleted group can be restored (study.groups.purge_after). */
const RESTORE_DAYS = 30;

export function GroupPage({ groupId, onBack, onHudHidden }: { groupId: string; onBack?: () => void; onHudHidden?: (hidden: boolean) => void }) {
  const { accountId } = useStore();
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<{ session: GroupSession; account: string; generation: number } | null>(null);
  useEffect(() => {
    if (!accountId) return;
    clearStudyDestination();
    if (generation > 0) clearActiveRoom();
    const s = retainRoom(accountId, groupId, () => openGroupSession(groupId, accountId));
    setLoaded({ session: s, account: accountId, generation });
    return () => { leaveRoomView(s); };
  }, [groupId, accountId, generation]);
  if (!loaded || loaded.account !== accountId || loaded.generation !== generation || !accountId) return <div className="flex-1" style={{ background: "#10271f" }} />;
  return <GroupRoom key={`${groupId}:${accountId}:${generation}`} groupId={groupId} session={loaded.session} myId={accountId} onRestored={() => setGeneration((n) => n + 1)} onBack={onBack} onHudHidden={onHudHidden} />;
}

function GroupRoom({ groupId, session, myId, onRestored, onBack, onHudHidden }: { groupId: string; session: GroupSession; myId: string; onRestored: () => void; onBack?: () => void; onHudHidden?: (hidden: boolean) => void }) {
  const { t, dir } = useT();
  const { pomodoroSettings } = useStore();
  const router = useRouter();
  const view = useSyncExternalStore(session.subscribe, session.view, session.view);
  const state = view.state;
  const [harvestFailed, setHarvestFailed] = useStudyNotice(false);
  const [harvest, setHarvest] = useState<StudyHarvest>({ members: [], pads: [] });
  const [sheet, setSheet] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sheetSnapshot, setSheetSnapshot] = useState<StudyState | null>(null);
  const [night] = useState(() => getTimeOfDay() === "night");
  const handheld = useMemo(() => isHandheld(navigator.userAgent, navigator.maxTouchPoints ?? 0), []);
  const pageElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = pageElement.current;
    if (!page) return;
    const fit = () => {
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      page.style.height = `${Math.max(1, bottom - page.getBoundingClientRect().top)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, []);

  // The group lake: on opening, and again when a round ends (its pads are added then).
  const round = state?.round ?? null;
  const roundDone = round ? `${round.id}:${round.settledAt ?? "pending"}` : "";
  useEffect(() => {
    if (round?.settledAt) window.dispatchEvent(new Event("study-round-settled"));
  }, [roundDone, round?.settledAt]);
  const harvestRequest = useRef(0);
  const loadHarvest = useCallback(() => {
    const request = ++harvestRequest.current;
    setHarvestFailed(false);
    studyHarvest(groupId).then((next) => {
      if (request === harvestRequest.current) { setHarvest(next); setHarvestFailed(false); }
    }, () => { if (request === harvestRequest.current) setHarvestFailed(true); });
  }, [groupId, setHarvestFailed]);
  useEffect(() => {
    loadHarvest();
    return () => { ++harvestRequest.current; };
  }, [loadHarvest, roundDone]);
  useEffect(() => {
    const recover = () => { if (!document.hidden) loadHarvest(); };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => { window.removeEventListener("online", recover); document.removeEventListener("visibilitychange", recover); };
  }, [loadHarvest]);

  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const sheetState = state ?? (sheet && deleting ? sheetSnapshot : null);
  const me = sheetState?.members.find((m) => m.isMe) ?? null;

  return (
    <div ref={pageElement} className="haven-fade-in flex min-h-0 flex-col">
      <div data-havi-avoid className="relative min-h-0 flex-1 overflow-hidden">
        <StudyRoom session={session} myId={myId} harvest={harvest} night={night} handheld={handheld}
          initialDurations={{ study: pomodoroSettings.focusMinutes, rest: pomodoroSettings.shortBreakMinutes }}
          onExit={() => router.push("/pomodoro/")} onHudHidden={onHudHidden} navigation={<>
          {state && (
            <Press onClick={() => { setSheetSnapshot(state); setSheet(true); }} style={GLASS} aria-label={t("study_groupSettings")}
              className="group pointer-events-auto inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium">
              <span className="truncate">{state.group.name}</span><Settings2 size={15} className="shrink-0 transition-[rotate] duration-500 group-hover:rotate-90" />
            </Press>
          )}
          <Press onClick={() => onBack ? onBack() : router.push("/study/")} style={GLASS}
            className="group pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium">
            <Back size={15} className="transition-[translate] duration-300 ltr:group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" />{t("study_groupsTitle")}
          </Press>
          </>} />
      </div>
      {harvestFailed && <p role="alert" className="px-4 py-2 text-sm">
        {t("study_errNetwork")} <Press lift="none" className="underline" onClick={loadHarvest}>{t("study_retry")}</Press>
      </p>}
      {sheetState && me && (
        <GroupSheet open={sheet} onClose={() => setSheet(false)} groupId={groupId} name={sheetState.group.name}
          isOwner={sheetState.group.isOwner} members={sheetState.members} me={me} harvest={harvest} onDeletePending={setDeleting} onRestored={onRestored}
          onChanged={() => { session.refresh(); loadHarvest(); }} onGone={() => onBack ? onBack() : router.push("/study/")} />
      )}
    </div>
  );
}

type Confirm =
  | { kind: "leave" }
  | { kind: "remove"; member: StudyMember }
  | { kind: "delete" };

function GroupSheet({ open, onClose, groupId, name, isOwner, members, me, harvest, onChanged, onGone, onDeletePending, onRestored }: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  name: string;
  isOwner: boolean;
  members: StudyMember[];
  me: StudyMember;
  harvest: StudyHarvest;
  onChanged: () => void;
  onGone: () => void;
  onDeletePending: (pending: boolean) => void;
  onRestored: () => void;
}) {
  const { t } = useT();
  const inviteRequest = useRef(0);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [look, setLook] = useState<StudyAppearance | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [deleted, setDeleted] = useState(false);
  const deletionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (deletionTimer.current) clearTimeout(deletionTimer.current); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const muted = { color: "var(--color-muted)" };
  const border = { borderColor: "var(--color-border)", color: "var(--color-ink)" };
  const plain = "rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-50";

  // The link is the owner's to share (study_invite_token).
  useEffect(() => {
    if (!open || !isOwner) return;
    const request = ++inviteRequest.current;
    setLink(null);
    studyInviteToken(groupId).then((tok) => { if (request === inviteRequest.current) setLink(inviteUrl(tok)); }, () => { if (request === inviteRequest.current) setLink(null); });
    return () => { ++inviteRequest.current; };
  }, [open, isOwner, groupId]);

  async function run(action: () => Promise<void>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await action();
      after?.();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const appearance = look ?? { displayName: me.displayName, haviName: me.haviName, haviColor: me.haviColor, flowerColor: me.flowerColor };
  const formerWithPads = harvest.members.filter((m) => m.former && harvest.pads.includes(m.userId));

  return (
    <MotionModal open={open} onClose={deleted ? onGone : onClose} title={t("study_groupSettings")} variant="sheet">
      <AnimatePresence mode="wait" initial={false}>
      {deleted ? <motion.div key="deleted" className="flex flex-col gap-3 text-sm" role="status" {...SWAP_CONTENT}>
        <p>{t("study_deletedNotice")}</p>
        {error && <p role="alert">{t("study_errNetwork")}</p>}
        <Press lift="soft" className={plain} style={border} disabled={busy} onClick={() => {
          if (deletionTimer.current) clearTimeout(deletionTimer.current);
          void run(() => restoreStudyGroup(groupId), onRestored);
        }}>{t("undo")}</Press>
      </motion.div> : <motion.div key="settings" className="flex flex-col gap-6 text-sm" {...SWAP_CONTENT}>
        {isOwner && (
          <motion.section className="flex flex-col gap-2" {...rise(0)}>
            <h3 className="font-semibold">{t("study_inviteLink")}</h3>
            <p className="text-xs" style={muted}>{t("study_inviteHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Press lift="none" className="haven-btn inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium disabled:opacity-60" disabled={!link}
                onClick={async () => {
                  if (!link) return;
                  try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* the link is shown below */ }
                }}>
                <Swap id={copied ? "copied" : "copy"} kind="rise" className="gap-1.5">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t("study_copied") : t("study_copyLink")}</Swap>
              </Press>
              <Press lift="soft" className={plain} style={border} disabled={busy}
                onClick={() => run(async () => { ++inviteRequest.current; setLink(null); setLink(inviteUrl(await resetStudyInvite(groupId))); })}>{t("study_resetLink")}</Press>
            </div>
            <p className="text-xs" style={muted}>{t("study_resetLinkHint")}</p>
            <AnimatePresence initial={false}>
              {link && <motion.p key={link} className="break-all text-xs" dir="ltr" style={muted} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: EXIT }}>{link}</motion.p>}
            </AnimatePresence>
          </motion.section>
        )}

        {isOwner && (
          <motion.section className="flex flex-col gap-2" {...rise(1)}>
            <h3 className="font-semibold">{t("study_groupName")}</h3>
            <div className="flex gap-2">
              <input className={field} style={fieldStyle} value={newName ?? name} maxLength={NAME_MAX} onChange={(e) => setNewName(e.target.value)} />
              <Press lift="soft" className={plain} style={border} disabled={busy || newName === null || newName.trim() === name || !nameOk(newName)}
                onClick={() => run(() => renameStudyGroup(groupId, newName!.trim()), () => { setNewName(null); onChanged(); })}>{t("save")}</Press>
            </div>
          </motion.section>
        )}

        <motion.section className="flex flex-col gap-2" {...rise(2)}>
          <h3 className="font-semibold">{t("study_membersTitle")}</h3>
          <ul className="flex flex-col gap-1.5">
            {/* A removed member slides out and the list closes up. */}
            <AnimatePresence initial={false}>
            {members.map((m) => (
              <motion.li key={m.userId} layout className="flex items-center gap-2.5"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, transition: EXIT }} transition={GLIDE}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.haviColor }} />
                <span className="min-w-0 flex-1 truncate">
                  {m.displayName}{m.isMe ? ` (${t("study_you")})` : ""}
                  <span className="text-xs" style={muted}>{` · ${m.haviName}`}{m.isOwner ? ` · ${t("study_owner")}` : ""}</span>
                </span>
                {isOwner && !m.isMe && (
                  <Press lift="none" className="text-xs underline" disabled={busy} onClick={() => setConfirm({ kind: "remove", member: m })}>{t("study_remove")}</Press>
                )}
              </motion.li>
            ))}
            </AnimatePresence>
          </ul>
          {isOwner && formerWithPads.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-xs" style={muted}>{t("study_formerPads")}</p>
              {formerWithPads.map((m) => (
                <div key={m.userId} className="flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.flowerColor }} />
                  <span className="flex-1">{t("study_formerMember")} · {t("study_pads", { n: harvest.pads.filter((p) => p === m.userId).length })}</span>
                  <Press lift="none" className="text-xs underline" disabled={busy}
                    onClick={() => run(() => hideFormerMemberPads(groupId, m.userId), onChanged)}>{t("study_removeTheirPads")}</Press>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        <motion.section className="flex flex-col gap-3" {...rise(3)}>
          <AppearanceFields value={appearance} onChange={setLook} />
          <div>
            <Press lift="none" className="haven-btn rounded-xl px-4 py-2 text-xs font-medium disabled:opacity-60" disabled={busy || !look || !appearanceValid(appearance)}
              onClick={() => run(() => updateStudyAppearance(groupId, appearance), () => { setLook(null); onChanged(); })}>{t("save")}</Press>
          </div>
        </motion.section>

        <AnimatePresence initial={false}>
          {error && <motion.p key="error" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }} exit={{ opacity: 0, transition: EXIT }} transition={POP}>{t("study_errGeneric")}</motion.p>}
        </AnimatePresence>

        <motion.section className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--color-border)" }} {...rise(4)}>
          <Press lift="soft" className={plain} style={border} disabled={busy} onClick={() => setConfirm({ kind: "leave" })}>{t("study_leaveGroup")}</Press>
          {isOwner && (
            <Press lift="soft" className={plain} style={{ ...border, color: "var(--color-danger)" }} disabled={busy}
              onClick={() => setConfirm({ kind: "delete" })}>{t("study_deleteGroup")}</Press>
          )}
        </motion.section>

        {/* The question opens in place, under the buttons that asked it. */}
        <AnimatePresence initial={false} mode="popLayout">
        {confirm && (
          <motion.div key={confirm.kind === "remove" ? `remove:${confirm.member.userId}` : confirm.kind} className="flex flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }} role="alertdialog"
            initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97, transition: EXIT }} transition={POP}>
            {confirm.kind === "delete" ? (
              <>
                <p>{t("study_deleteConfirm", { n: RESTORE_DAYS })}</p>
                <div className="flex flex-wrap gap-2">
                  <Press lift="soft" className={plain} style={border} onClick={() => setConfirm(null)}>{t("cancel")}</Press>
                  <Press lift="soft" className="rounded-xl px-3 py-2 text-xs font-medium text-white disabled:opacity-50" style={{ background: "var(--color-danger)" }} disabled={busy}
                    onClick={() => run(async () => {
                      onDeletePending(true);
                      try { await deleteStudyGroup(groupId); }
                      catch (e) { onDeletePending(false); throw e; }
                    }, () => {
                      setDeleted(true);
                      deletionTimer.current = setTimeout(onGone, 5000);
                    })}>{t("study_deleteGroup")}</Press>
                </div>
              </>
            ) : (
              <>
                <p>{confirm.kind === "leave" ? t("study_leaveAsk") : t("study_removeAsk", { name: confirm.member.displayName })}</p>
                <div className="flex flex-wrap gap-2">
                  <Press lift="soft" className={plain} style={border} onClick={() => setConfirm(null)}>{t("cancel")}</Press>
                  {[false, true].map((removePads) => (
                    <Press key={String(removePads)} lift="soft" className={plain} style={border} disabled={busy}
                      onClick={() => run(
                        () => confirm.kind === "leave" ? leaveStudyGroup(groupId, removePads) : removeStudyMember(groupId, confirm.member.userId, removePads),
                        () => { setConfirm(null); if (confirm.kind === "leave") onGone(); else onChanged(); },
                      )}>
                      {removePads
                        ? (confirm.kind === "leave" ? t("study_removeMyPads") : t("study_removeTheirPads"))
                        : (confirm.kind === "leave" ? t("study_keepMyPads") : t("study_keepTheirPads"))}
                    </Press>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>}
      </AnimatePresence>
    </MotionModal>
  );
}

// The settings sheet: its sections arrive in turn; the deleted notice and the
// settings replace each other with a short cross-slide.
const rise = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { ...POP, delay: 0.08 + stagger(i, 0.05) },
});
const SWAP_CONTENT = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -18, transition: EXIT },
  transition: POP,
} as const;

/** The link members open to join (the /join page, Stage 4). */
function inviteUrl(token: string): string {
  return `${window.location.origin}/join/?t=${encodeURIComponent(token)}`;
}
