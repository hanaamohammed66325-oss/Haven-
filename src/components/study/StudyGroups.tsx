"use client";

// Group study: «مجموعاتي», the groups list. A group with a live session says
// so; a new group is created here (its link is shared from inside it); the
// owner's deleted groups can be restored for 30 days.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { MotionModal } from "@/components/motion/MotionModal";
import { EASE_COLOURS, LiveDot, MotionRoot, Press } from "@/components/motion/Press";
import { EXIT, GLIDE, POP } from "@/components/motion/springs";
import { STUDY_LIMITS } from "@/lib/study/rules";
import { createStudyGroup, myStudyGroups, restoreStudyGroup } from "@/lib/study/client";
import { StudyError, type MyStudyGroups, type StudyAppearance } from "@/lib/study/types";
import { AppearanceFields, NAME_MAX, appearanceValid, field, fieldStyle } from "./AppearanceFields";
import { useStudyNotice } from "./useStudyNotice";

const DAY = 86_400_000;

export const groupHref = (id: string) => `/study/?g=${id}`;

// The groups arrive one after another; a new or restored group glides into
// place and the others make room (Motion layout).
const LIST: Variants = { out: {}, in: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } } };
const ROW: Variants = {
  out: { opacity: 0, y: 14, scale: 0.98 },
  in: { opacity: 1, y: 0, scale: 1, transition: POP },
  gone: { opacity: 0, scale: 0.96, transition: EXIT },
};

export function StudyGroups({ onSelect }: { onSelect?: (id: string) => void } = {}) {
  const { accountId } = useStore();
  return <AccountGroups key={accountId ?? "signed-out"} onSelect={onSelect} />;
}

function AccountGroups({ onSelect }: { onSelect?: (id: string) => void }) {
  const { t } = useT();
  const router = useRouter();
  const { profileName, haviName } = useStore();
  const [groups, setGroups] = useState<MyStudyGroups | null>(null);
  const [failed, setFailed] = useStudyNotice<"network" | "generic" | "limit" | null>(null, value => value === "network");
  const [restoring, setRestoring] = useState<string | null>(null);
  const request = useRef(0);
  const restoreBusy = useRef(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const mine = ++request.current;
    setFailed(null);
    try {
      const next = await myStudyGroups();
      if (mine !== request.current) return;
      setGroups(next);
      setFailed(null);
    } catch {
      if (mine === request.current) setFailed("network");
    }
  }, [setFailed]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 120_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => { ++request.current; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
  }, [load]);
  const restore = async (id: string) => {
    if (restoreBusy.current) return;
    restoreBusy.current = true; setRestoring(id); setFailed(null);
    try { await restoreStudyGroup(id); await load(); }
    catch (e) { setFailed(e instanceof StudyError && e.code === "group_limit" ? "limit" : e instanceof StudyError && e.code !== "network" ? "generic" : "network"); }
    finally { restoreBusy.current = false; setRestoring(null); }
  };

  const muted = { color: "var(--color-muted)" };
  const full = !!groups && groups.groups.length >= STUDY_LIMITS.maxGroups;

  return (
    <MotionRoot>
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("study_groupsTitle")}</h1>
          <p className="mt-1 max-w-xl text-sm" style={muted}>{t("study_groupsIntro")}</p>
        </div>
        {groups?.available && (
          <Press lift="none" className="group haven-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            disabled={full} onClick={() => setCreating(true)}>
            <Plus size={16} className="transition-[rotate] duration-300 group-hover:rotate-90" />{t("study_newGroup")}
          </Press>
        )}
      </header>

      {failed && <p className="text-sm" role="alert">{failed === "limit" ? t("study_groupLimit", { n: STUDY_LIMITS.maxGroups }) : t(failed === "generic" ? "study_errGeneric" : "study_errNetwork")} <Press lift="none" className="underline" onClick={() => void load()}>{t("study_retry")}</Press></p>}
      {groups && !groups.available && <p className="haven-card rounded-2xl p-5 text-sm">{t("study_notAvailable")}</p>}
      {full && <p className="text-xs" style={muted}>{t("study_groupLimit", { n: STUDY_LIMITS.maxGroups })}</p>}

      {groups?.available && groups.groups.length === 0 && (
        <p className="haven-card rounded-2xl p-5 text-sm">{t("study_noGroups")}</p>
      )}

      {groups?.available && groups.groups.length > 0 && (
        <motion.ul className="flex flex-col gap-3" variants={LIST} initial="out" animate="in">
          <AnimatePresence initial={false}>
          {groups.groups.map((g) => (
            <motion.li key={g.id} layout variants={ROW} exit="gone" transition={GLIDE}>
              <Press lift="soft" onClick={() => onSelect ? onSelect(g.id) : router.push(groupHref(g.id))}
                className="haven-card flex w-full cursor-pointer items-center gap-4 rounded-2xl p-4 text-start">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                  <Users size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{g.name}</span>
                  <span className="text-xs" style={muted}>{t("study_members", { n: g.members })}</span>
                </span>
                {g.sitting && (
                  <motion.span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                    initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={POP}>
                    <LiveDot />{t("study_liveNow")}
                  </motion.span>
                )}
              </Press>
            </motion.li>
          ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {groups?.available && groups.deleted.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("study_deletedGroups")}</h2>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
            {groups.deleted.map((g) => (
              <motion.li key={g.id} layout className="haven-card flex items-center gap-3 rounded-2xl p-3 text-sm" style={{ transition: EASE_COLOURS }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16, scale: 0.97, transition: EXIT }} transition={GLIDE}>
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="text-xs" style={muted}>{t("study_daysLeft", { n: Math.max(1, Math.ceil((g.purgeAfter - Date.now()) / DAY)) })}</span>
                <Press lift="soft" className="rounded-xl border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--color-border)" }}
                  disabled={restoring !== null} onClick={() => void restore(g.id)}>
                  {t("study_restore")}
                </Press>
              </motion.li>
            ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      <CreateGroup open={creating} onClose={() => setCreating(false)}
        initial={{ displayName: profileName === "Student" ? "" : profileName, haviName: haviName || "Havi", haviColor: "#a8d98a", flowerColor: "#edb7c8" }}
        onLimit={() => { setFailed("limit"); void load(); }}
        onCreated={(id) => { setCreating(false); void load(); if (onSelect) onSelect(id); else router.push(groupHref(id)); }} />
    </div>
    </MotionRoot>
  );
}

function CreateGroup({ open, onClose, initial, onCreated, onLimit }: {
  open: boolean;
  onClose: () => void;
  initial: StudyAppearance;
  onCreated: (groupId: string) => void;
  onLimit: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [look, setLook] = useState<StudyAppearance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"generic" | "limit" | null>(null);
  const appearance = look ?? initial;
  const ok = appearanceValid(appearance) && name.trim().length <= NAME_MAX;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { groupId } = await createStudyGroup(name.trim(), appearance);
      onCreated(groupId);
    } catch (err) {
      if (err instanceof StudyError && err.code === "group_limit") {
        setError("limit");
        onLimit(); // Reload an out-of-date list; keep this reason visible in the form.
      } else setError("generic");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} title={t("study_newGroup")} variant="sheet"
      footer={
        <div className="flex justify-end gap-2">
          <Press lift="soft" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>{t("cancel")}</Press>
          <Press lift="none" type="submit" form="study-create" disabled={!ok || busy} className="haven-btn rounded-xl px-5 py-2 text-sm font-medium disabled:opacity-60">{t("study_create")}</Press>
        </div>
      }>
      <form id="study-create" onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("study_groupName")}</span>
          <input className={field} style={fieldStyle} value={name} maxLength={NAME_MAX} placeholder={t("study_groupNameHint")}
            onChange={(e) => setName(e.target.value)} />
        </label>
        <AppearanceFields value={appearance} onChange={setLook} />
        <AnimatePresence initial={false}>
          {error && <motion.p key={error} className="text-sm" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }} exit={{ opacity: 0, transition: EXIT }} transition={POP}>
            {error === "limit" ? t("study_groupLimit", { n: STUDY_LIMITS.maxGroups }) : t("study_errGeneric")}
          </motion.p>}
        </AnimatePresence>
      </form>
    </MotionModal>
  );
}
