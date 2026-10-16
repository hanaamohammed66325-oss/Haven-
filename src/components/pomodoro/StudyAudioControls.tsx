"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronDown, Music2, Pause, Play, Plus, Trash2, Volume2, X } from "@/components/motion/icons";
import { useT } from "@/i18n";
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, STUDY_TRACKS } from "@/lib/studyAudio/catalog";
import type { AudioState, StudyAudioPlayer } from "@/lib/studyAudio/player";
import type { TranslationKey } from "@/i18n/translations/en";
import { GLASS } from "./glass";
import styles from "./StudyAudioControls.module.css";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { Disclosure } from "@/components/motion/Disclosure";
import { MotionRoot, PlayingBars, Press } from "@/components/motion/Press";
import { Swap } from "@/components/motion/Swap";
import { EXIT, GLIDE, POP, PRESS, SURFACE } from "@/components/motion/springs";

// The native dialog keeps its top layer and focus; Motion only moves it: it
// rises in with a spring and is closed for real once it has faded out.
const DIALOG: Variants = {
  open: { opacity: 1, scale: 1, y: 0, transition: SURFACE },
  closed: { opacity: 0, scale: 0.95, y: 14, transition: { ...EXIT, duration: 0.18 } },
};

const PROBLEMS: Record<NonNullable<AudioState["problem"]>, TranslationKey> = {
  size: "audio_errSize", format: "audio_errFormat", play: "audio_errPlay",
  storage: "audio_errStorage", temporary: "audio_temporary", missing: "audio_missing",
};
export function StudyAudioControls({ player, state, className = "grid h-10 w-10 place-items-center rounded-full", style = GLASS, alertsEnabled, onAlertsChange }: {
  player: StudyAudioPlayer; state: AudioState; className?: string; style?: CSSProperties;
  alertsEnabled?: boolean; onAlertsChange?: (enabled: boolean) => void;
}) {
  const { t, dir } = useT();
  const [mounted, setMounted] = useState(false), [open, setOpen] = useState(false);
  // Open, or still fading out: the dialog stays shown until its exit is done.
  const [present, setPresent] = useState(false);
  if (open && !present) setPresent(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (present && !el.open) el.showModal();
    if (!present && el.open) el.close();
  }, [present, mounted]);
  const trackButton = (id: string, title: string, subtitle?: string) => (
    <motion.button type="button" className={styles.track} disabled={state.busy} aria-pressed={state.selected === id}
      whileTap={state.busy ? undefined : { scale: 0.97 }} transition={PRESS}
      onClick={() => state.selected === id && state.playing ? player.pause() : void player.play(id)}>
      <Swap id={state.selected === id && state.playing ? "pause" : "play"} className="shrink-0">{state.selected === id && state.playing ? <Pause size={16} /> : <Play size={16} />}</Swap>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm">{title}</span>
        {subtitle && <span className="block truncate text-[11px] opacity-60">{subtitle}</span>}</span>
    </motion.button>
  );
  return <MotionRoot>
    <Press className={`${className} pointer-events-auto relative`} style={style}
      aria-label={t("audio_title")} title={t("audio_title")} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Swap id={state.playing ? "playing" : "silent"} kind="fade" className="h-[18px] w-[18px]">
        {state.playing ? <PlayingBars className="scale-[1.8]" /> : <Volume2 size={18} />}
      </Swap>
    </Press>
    {mounted && createPortal(<MotionRoot><motion.dialog ref={dialog} dir={dir} className={styles.dialog} data-state={open ? "open" : "closing"} inert={!open} aria-label={t("audio_title")}
      variants={DIALOG} initial={false} animate={open ? "open" : "closed"} onAnimationComplete={(done) => { if (done === "closed") setPresent(false); }}
      onCancel={(e) => { e.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)} onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setOpen(false);
      }}>
      <div className={styles.header}><h2 className="flex items-center gap-2 font-semibold"><Music2 size={18} />{t("audio_title")}</h2>
        <motion.button type="button" autoFocus className={styles.icon} aria-label={t("close")} onClick={() => setOpen(false)}
          whileHover={{ rotate: 90 }} whileTap={{ scale: 0.86 }} transition={PRESS}><X size={18} /></motion.button></div>
      <div className={styles.body}>
        <p className="mb-2 text-xs opacity-65">{t("audio_personal")}</p>
        {STUDY_TRACKS.map((track) => <div className={styles.row} key={track.id}>{trackButton(track.id, t(track.title), track.artist)}</div>)}
        <h3 className="mb-2 mt-4 text-xs font-semibold">{t("audio_myFiles")}</h3>
        {/* A new file slides in; a deleted one slides out and the list closes up. */}
        <AnimatePresence initial={false}>
        {state.files.map((track) => <motion.div layout className={styles.row} key={track.id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20, transition: EXIT }} transition={GLIDE}>
          {trackButton(track.id, track.name, track.temporary ? t("audio_temporaryShort") : undefined)}
          <Press lift="none" className={styles.icon} disabled={state.busy} aria-label={t("audio_delete", { name: track.name })} onClick={() => void player.remove(track.id)}><Trash2 size={16} /></Press>
        </motion.div>)}
        </AnimatePresence>
        <input ref={input} type="file" accept={AUDIO_ACCEPT} className="hidden" onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (file) void player.add(file);
        }} />
        <Press lift="soft" className="group mt-1 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm" disabled={state.busy} onClick={() => input.current?.click()}><Plus size={16} className="transition-[rotate] duration-300 group-hover:rotate-90" />{t("audio_add")}</Press>
        <p className="mt-2 text-[11px] opacity-65">{t("audio_localHint")}</p>
        <div className="mt-2 text-[11px] opacity-65">
          <Press lift="none" className="flex items-center gap-1 text-start" aria-expanded={helpOpen} onClick={() => setHelpOpen(v => !v)}>{t("audio_fileHelp")}<motion.span className="grid" animate={{ rotate: helpOpen ? 180 : 0 }} transition={POP}><ChevronDown size={12} /></motion.span></Press>
          <Disclosure open={helpOpen}><p className="mt-1">{t("audio_fileDetails", { n: MAX_AUDIO_BYTES / (1024 * 1024) })}</p></Disclosure>
        </div>
        {state.problem && <p role="status" className="mt-3 text-xs">{t(PROBLEMS[state.problem])}</p>}
      </div>
      <div className={styles.footer}>
        <div className="flex items-center gap-3">
          <Press lift="none" className={styles.icon} disabled={!state.selected || state.importing} aria-label={t(state.busy ? "audio_cancelLoad" : state.playing ? "audio_pause" : "audio_play")}
            onClick={() => state.playing || state.busy ? player.pause() : void player.play()}>
            <Swap id={state.busy ? "busy" : state.playing ? "pause" : "play"}>{state.busy ? <X size={18} /> : state.playing ? <Pause size={18} /> : <Play size={18} />}</Swap>
          </Press>
          <label className="flex min-w-0 flex-1 items-center gap-2"><Volume2 size={16} className="shrink-0" />
            <input type="range" min="0" max="1" step="0.01" value={state.volume} aria-label={t("audio_volume")} className="min-w-0 flex-1 accent-[var(--color-primary)]" onChange={(e) => player.preferences({ volume: Number(e.target.value) })} /></label>
        </div>
        <div className={styles.options}>
          <label className="flex items-center gap-2"><input type="checkbox" checked={state.loop} onChange={(e) => player.preferences({ loop: e.target.checked })} />{t("audio_loop")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={alertsEnabled ?? state.alerts} onChange={(e) => {
            player.preferences({ alerts: e.target.checked }); onAlertsChange?.(e.target.checked);
          }} />{t("audio_alerts")}</label>
          <Press lift="none" className="flex items-center gap-1 underline underline-offset-2" onClick={() => { player.arm(); player.notify("study", true); }}><Bell size={13} />{t("audio_test")}</Press>
        </div>
        <p className="text-[10px] opacity-60">{t("audio_backgroundHint")}</p>
      </div>
    </motion.dialog></MotionRoot>, document.body)}
  </MotionRoot>;
}
