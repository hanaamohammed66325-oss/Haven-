"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "@/components/motion/icons";
import { motion, useReducedMotion } from "motion/react";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { GLASS } from "@/components/pomodoro/glass";
import { StudyHaviIcon } from "./StudyHaviIcon";
import styles from "./StudyReturnBar.module.css";
import { MotionRoot, Press, PressLink } from "@/components/motion/Press";
import { EXIT, GLIDE } from "@/components/motion/springs";
import { activeRoomSnapshot, activeRoomServerSnapshot, subscribeActiveRoom, clearActiveRoom } from "@/lib/study/activeRoom";

/** One lifetime owner in AppShell. Hiding/unmounting a navigation copy must not end the session. */
export function StudyReturnLifecycle() {
  const room = useSyncExternalStore(subscribeActiveRoom, activeRoomSnapshot, activeRoomServerSnapshot);
  const { accountId } = useStore();
  useEffect(() => () => clearActiveRoom(), []);
  useEffect(() => { if (room && room.account !== accountId) clearActiveRoom(); }, [accountId, room]);
  return null;
}

export function StudyReturnBar({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const room = useSyncExternalStore(subscribeActiveRoom, activeRoomSnapshot, activeRoomServerSnapshot);
  const { accountId } = useStore();
  const path = usePathname();
  if (!room || room.account !== accountId) return null;
  return <ReturnContent key={room.groupId} room={room} collapsed={collapsed} onNavigate={onNavigate} hidden={path === "/study" || path?.startsWith("/study/") === true} />;
}

export function ReturnContent({ room, hidden, collapsed = false, onReturn, onNavigate }: {
  room: NonNullable<ReturnType<typeof activeRoomSnapshot>>;
  hidden: boolean;
  collapsed?: boolean;
  onReturn?: () => void;
  onNavigate?: () => void;
}) {
  const { t, dir } = useT();
  const router = useRouter();
  const view = useSyncExternalStore(room.session.subscribe, room.session.view, room.session.view);
  const [folded, setFolded] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const compact = collapsed || folded;
  useEffect(() => {
    // Keep keyboard focus with the control when its visible form changes.
    if (surface.current?.contains(document.activeElement)) {
      surface.current.querySelector<HTMLElement>(compact ? "[data-study-return-compact]" : "[data-study-return-action]")?.focus({ preventScroll: true });
    }
  }, [compact]);
  if (hidden || !view.state?.sitting || view.ended) return null;
  const color = view.state.members.find(m => m.isMe)?.haviColor ?? "#a8d98a";
  const group = view.state.group.name;
  const label = t("study_returnLabel", { group });
  const returnToRoom = () => {
    onNavigate?.();
    if (onReturn) onReturn();
    else router.push(`/study/?g=${room.groupId}`);
  };
  const actionClass = `${styles.action} rounded-full bg-white/15`;
  const action = onReturn
    ? <Press lift="none" data-study-return-action onClick={returnToRoom} className={actionClass}>{t("study_returnAction")}</Press>
    : <PressLink lift="none" data-study-return-action href={`/study/?g=${room.groupId}`} onClick={onNavigate} className={actionClass}>{t("study_returnAction")}</PressLink>;
  return <MotionRoot><div data-study-return data-havi-avoid dir={dir} className={styles.dock}>
    <motion.div ref={surface} initial={false} animate={{ width: compact ? 44 : "100%", height: compact ? 44 : "auto" }}
      transition={reduceMotion ? { duration: 0 } : { ...GLIDE, bounce: 0 }} className={styles.surface} style={GLASS} aria-label={label}>
      <motion.div initial={false} animate={{ opacity: compact ? 0 : 1 }} transition={EXIT}
        className={styles.full} inert={compact} aria-hidden={compact}>
        <StudyHaviIcon color={color} />
        <span className={styles.label} title={label}>
          <span className={styles.prefix}>{t("study_returnLabel", { group: "" }).trim()}</span>
          <span className={styles.group}>{group}</span>
        </span>
        <Press lift="none" className={styles.fold} aria-label={t("study_foldReturn")} onClick={() => setFolded(true)}><ChevronDown size={18} /></Press>
        {action}
      </motion.div>
      <motion.div initial={false} animate={{ opacity: compact ? 1 : 0 }} transition={EXIT}
        className={styles.compact} inert={!compact} aria-hidden={!compact}>
        <Press lift="none" data-study-return-compact className={styles.compactButton} aria-label={label} title={label}
          onClick={() => { if (folded && !collapsed) setFolded(false); else returnToRoom(); }}><StudyHaviIcon color={color} /></Press>
      </motion.div>
    </motion.div>
  </div></MotionRoot>;
}
