"use client";

// Havi's note about the data a student still has to record for an accurate
// GPA (lib/gpaReadiness). It shows only after the student has stayed a while
// on a page where Havi is, rises above him — as his dream when he is asleep —
// and lists only that student's missing items, each linking to where it is
// fixed. "Remind me later" hides it for a day; once nothing is missing it never
// shows. HaviMascot is left untouched: the note follows him through the
// window.havi API (bounds) and his "havi:activity" broadcast.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { logEvent } from "@/lib/db";
import { gpaGaps, type GpaGap } from "@/lib/gpaReadiness";
import styles from "./HaviGpaNote.module.css";

/** How long the student stays on one page (tab visible, Havi on screen). */
const DWELL_MS = 45_000;
/** "Remind me later". */
const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** After the note was shown and left, or an item was opened. */
const SEEN_SNOOZE_MS = 30 * 60 * 1000;
const EDGE = 12;

interface NoteState {
  /** not before this time (ms) */
  until: number;
  /** shown at least once while something was missing */
  alerted: boolean;
}

const storageKey = (accountId: string) => `haven-havi-gpa:${accountId}`;

function readState(accountId: string): NoteState {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(accountId)) || "null");
    if (raw && typeof raw.until === "number") return { until: raw.until, alerted: !!raw.alerted };
  } catch {}
  return { until: 0, alerted: false };
}

function writeState(accountId: string, state: NoteState) {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(state));
  } catch {}
}

type HaviApi = { bounds?: () => DOMRect | null };

/** Havi's rect when he is on screen, else null. */
function haviRect(): DOMRect | null {
  const r = (window as unknown as { havi?: HaviApi }).havi?.bounds?.() ?? null;
  if (!r || r.width === 0) return null;
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  return r;
}

const gapsKey = (gaps: GpaGap[]) => gaps.map((g) => g.kind).join(",");

export function HaviGpaNote() {
  const pathname = usePathname();
  const router = useRouter();
  const { hydrated, accountId, semester, historicalSemesterId, academic, courses, cumulativeGpa, cumulativeHours, setGpaMode } =
    useStore();

  const ready = hydrated && !!accountId && !!semester && !historicalSemesterId;
  const gaps = useMemo(
    () => (ready ? gpaGaps({ academic, courses, cumulativeGpa, cumulativeHours, semesterEnd: semester?.endDate }) : []),
    [ready, academic, courses, cumulativeGpa, cumulativeHours, semester?.endDate]
  );
  const hasGaps = gaps.length > 0;

  const [open, setOpen] = useState(false);
  const [dream, setDream] = useState(false);
  const activityRef = useRef<string>("sleep");
  const noteRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const gapsRef = useRef(gaps);
  gapsRef.current = gaps;

  // Havi broadcasts every change of activity; the note reads it when it opens.
  useEffect(() => {
    const onActivity = (e: Event) => {
      const a = (e as CustomEvent<{ activity?: string }>).detail?.activity;
      if (a) activityRef.current = a;
    };
    window.addEventListener("havi:activity", onActivity);
    return () => window.removeEventListener("havi:activity", onActivity);
  }, []);

  // Everything recorded: close, and tell the admin once that it was fixed.
  useEffect(() => {
    if (!ready || hasGaps || !accountId) return;
    setOpen(false);
    const s = readState(accountId);
    if (s.alerted) {
      writeState(accountId, { until: 0, alerted: false });
      void logEvent("havi_gpa_note_resolved");
    }
  }, [ready, hasGaps, accountId]);

  // A new page starts the wait again and closes an open note.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Count the time spent on this page while the tab is visible and Havi is
  // on screen; open once it is long enough and nothing is snoozed.
  useEffect(() => {
    if (!ready || !hasGaps || open || !accountId) return;
    let stayed = 0;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !haviRect()) return;
      stayed += 1000;
      if (stayed < DWELL_MS) return;
      const now = Date.now();
      if (readState(accountId).until > now) return;
      window.clearInterval(id);
      writeState(accountId, { until: now + SEEN_SNOOZE_MS, alerted: true });
      const shown = gapsRef.current;
      void logEvent("havi_gpa_note_shown", {
        missing: shown.map((g) => g.kind),
        courses: shown.reduce((n, g) => n + (g.courses?.length ?? 0), 0),
        dream: activityRef.current === "sleep",
        path: pathname,
      });
      setDream(activityRef.current === "sleep");
      setOpen(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [ready, hasGaps, open, accountId, pathname, gapsKey(gaps)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow Havi every frame while open; close if he leaves the screen.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let missing = 0;
    const place = () => {
      const note = noteRef.current;
      const r = haviRect();
      if (!r) {
        if (++missing > 30) setOpen(false);
      } else if (note) {
        missing = 0;
        const w = note.offsetWidth;
        const h = note.offsetHeight;
        const gap = dream ? 30 : 14;
        const cx = r.left + r.width / 2;
        const left = Math.min(Math.max(cx - w / 2, EDGE), window.innerWidth - w - EDGE);
        const below = r.top - gap - h < EDGE;
        const top = below ? r.bottom + gap : r.top - gap - h;
        note.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        note.dataset.below = below ? "1" : "";
        if (tailRef.current) tailRef.current.style.left = `${Math.round(Math.min(Math.max(cx - left, 18), w - 18))}px`;
        note.style.visibility = "visible";
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, dream]);

  const later = useCallback(() => {
    if (!accountId) return;
    writeState(accountId, { until: Date.now() + SNOOZE_MS, alerted: true });
    void logEvent("havi_gpa_note_later", { missing: gapsRef.current.map((g) => g.kind) });
    setOpen(false);
  }, [accountId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") later();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, later]);

  const fix = (gap: GpaGap, courseId?: string) => {
    if (accountId) writeState(accountId, { until: Date.now() + SEEN_SNOOZE_MS, alerted: true });
    void logEvent("havi_gpa_note_fix", { item: gap.kind });
    setOpen(false);
    if (gap.kind === "university" || gap.kind === "table") router.push("/profile#academic-profile");
    else if (gap.kind === "cumulative") {
      setGpaMode("cumulative");
      router.push("/dashboard");
    } else router.push(`/courses${courseId ? `#${encodeURIComponent(courseId)}` : ""}`);
  };

  if (!open || !hasGaps) return null;

  return createPortal(
    <HaviGpaNoteCard
      ref={noteRef}
      tailRef={tailRef}
      gaps={gaps}
      dream={dream}
      onFix={fix}
      onLater={later}
      style={{ visibility: "hidden" }}
    />,
    document.body
  );
}

interface CardProps {
  gaps: GpaGap[];
  dream: boolean;
  onFix: (gap: GpaGap, courseId?: string) => void;
  onLater: () => void;
  /** in the page flow (the preview) instead of floating over Havi */
  inline?: boolean;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  tailRef?: Ref<HTMLSpanElement>;
}

/** The note itself: shared by the live note and its preview page. */
export function HaviGpaNoteCard({ gaps, dream, onFix, onLater, inline, style, ref, tailRef }: CardProps) {
  const { t } = useT();
  return (
    <div
      ref={ref}
      role="dialog"
      aria-live="polite"
      aria-label={t(dream ? "haviGpa_dream" : "haviGpa_title")}
      className={`${inline ? styles.inline : styles.note} ${dream ? styles.dream : styles.speech}`}
      style={style}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          <p className={styles.title}>{t(dream ? "haviGpa_dream" : "haviGpa_title")}</p>
          <button type="button" className={styles.close} onClick={onLater} aria-label={t("haviGpa_close")}>
            <X size={14} />
          </button>
        </div>
        <p className={styles.body}>{t("haviGpa_body")}</p>
        <ul className={styles.list}>
          {gaps.map((g) => (
            <li key={g.kind}>
              {g.courses ? (
                <>
                  <span className={styles.item}>{t(`haviGpa_${g.kind}`)}</span>
                  <span className={styles.chips}>
                    {g.courses.map((c) => (
                      <button key={c.id} type="button" dir="auto" className={styles.chip} onClick={() => onFix(g, c.id)}>
                        {c.name}
                      </button>
                    ))}
                  </span>
                </>
              ) : (
                <button type="button" className={styles.link} onClick={() => onFix(g)}>
                  {t(`haviGpa_${g.kind}`)}
                </button>
              )}
            </li>
          ))}
        </ul>
        {gaps.some((g) => g.kind === "grades") && <p className={styles.hint}>{t("haviGpa_gradesHint")}</p>}
        <button type="button" className={styles.later} onClick={onLater}>
          {t("haviGpa_later")}
        </button>
      </div>
      {dream ? (
        <span ref={tailRef} className={styles.thought} aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : (
        <span ref={tailRef} className={styles.tail} aria-hidden />
      )}
    </div>
  );
}
