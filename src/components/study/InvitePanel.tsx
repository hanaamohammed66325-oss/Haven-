"use client";

// Group study: the owner's invite link, shared with the phone's share sheet
// (WhatsApp, Telegram, ...) or copied. Used in the invite window (after
// creating a group, and from the room) and in the group's settings, where the
// link can also be renewed.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Share2 } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { MotionModal } from "@/components/motion/MotionModal";
import { Press } from "@/components/motion/Press";
import { Swap } from "@/components/motion/Swap";
import { EXIT } from "@/components/motion/springs";
import { resetStudyInvite, studyInviteToken } from "@/lib/study/client";
import { joinPath } from "@/lib/study/inviteLink";

/** The link members open to join (the /join page). */
export function inviteUrl(token: string): string {
  return `${window.location.origin}${joinPath(token)}`;
}

export function InvitePanel({ groupId, groupName, renewable = false }: { groupId: string; groupName: string; renewable?: boolean }) {
  const { t } = useT();
  const request = useRef(0);
  const [link, setLink] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  const muted = { color: "var(--color-muted)" };

  const load = () => {
    const mine = ++request.current;
    setLink(null); setFailed(false);
    studyInviteToken(groupId).then(
      (tok) => { if (mine === request.current) setLink(inviteUrl(tok)); },
      () => { if (mine === request.current) setFailed(true); });
  };
  useEffect(() => {
    load();
    return () => { ++request.current; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* the link is shown below */ }
  };
  const share = async () => {
    if (!link) return;
    try { await navigator.share({ title: groupName, text: t("study_shareText", { name: groupName }), url: link }); }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) void copy(); }
  };
  const renew = async () => {
    if (busy) return;
    const mine = ++request.current;
    setBusy(true); setFailed(false); setLink(null);
    try { const tok = await resetStudyInvite(groupId); if (mine === request.current) setLink(inviteUrl(tok)); }
    catch { if (mine === request.current) setFailed(true); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <Press lift="none" className="haven-btn inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={!link} onClick={() => void share()}>
            <Share2 size={15} />{t("study_shareLink")}
          </Press>
        )}
        <Press lift={canShare ? "soft" : "none"} disabled={!link} onClick={() => void copy()}
          className={canShare ? "inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-60" : "haven-btn inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"}
          style={canShare ? { borderColor: "var(--color-border)", color: "var(--color-ink)" } : undefined}>
          <Swap id={copied ? "copied" : "copy"} kind="rise" className="gap-1.5">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t("study_copied") : t("study_copyLink")}</Swap>
        </Press>
        {renewable && (
          <Press lift="soft" className="rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-50" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}
            disabled={busy} onClick={() => void renew()}>{t("study_resetLink")}</Press>
        )}
      </div>
      {renewable && <p className="text-xs" style={muted}>{t("study_resetLinkHint")}</p>}
      {failed && <p role="alert" className="text-xs">{t("study_errNetwork")} <Press lift="none" className="underline" onClick={load}>{t("study_retry")}</Press></p>}
      <AnimatePresence initial={false}>
        {link && <motion.p key={link} className="break-all text-xs" dir="ltr" style={muted} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: EXIT }}>{link}</motion.p>}
      </AnimatePresence>
    </div>
  );
}

/** The invite window: right after creating a group, and from the room's invite button. */
export function InviteModal({ open, onClose, groupId, groupName, fresh = false }: { open: boolean; onClose: () => void; groupId: string; groupName: string; fresh?: boolean }) {
  const { t } = useT();
  return (
    <MotionModal open={open} onClose={onClose} title={t(fresh ? "study_inviteNewTitle" : "study_inviteFriends")} variant="sheet"
      footer={<div className="flex justify-end"><Press lift="soft" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-ink)" }}>{t(fresh ? "study_inviteLater" : "close")}</Press></div>}>
      <div className="flex flex-col gap-4 text-sm">
        <p>{t("study_inviteHint")}</p>
        {open && <InvitePanel groupId={groupId} groupName={groupName} />}
      </div>
    </MotionModal>
  );
}

// Set when a group is created, read once by its room, so the invite window
// opens there without changing the room's address.
const NEW_KEY = "study-invite-new-group";
export function markNewGroup(groupId: string): void {
  try { sessionStorage.setItem(NEW_KEY, groupId); } catch { /* storage unavailable */ }
}
export function takeNewGroup(groupId: string): boolean {
  try {
    if (sessionStorage.getItem(NEW_KEY) !== groupId) return false;
    sessionStorage.removeItem(NEW_KEY);
    return true;
  } catch { return false; }
}
