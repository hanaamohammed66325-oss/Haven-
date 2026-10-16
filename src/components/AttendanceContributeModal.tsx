"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, EyeOff, Undo2, CheckCircle2, ImagePlus } from "@/components/motion/icons";
import { Modal } from "./Modal";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { formatDuration } from "@/lib/format";
import { formatLongDate, toISODate } from "@/lib/dates";
import { absenceLog } from "@/lib/absenceLog";
import {
  clampRect,
  contributionContext,
  renderEvidence,
  submitContribution,
  type MatchAnswer,
  type Rect,
} from "@/lib/attendanceContribution";
import type { TranslationKey } from "@/i18n/translations/en";

type Tool = "crop" | "cover";

/** Two steps: (1) the course and a covered image of its portal absence record;
 *  (2) the image beside Haven's own log, the date the portal covers, whether
 *  both hold the same absences, and permission. Optional; nothing is
 *  calculated from it. Opened from the attendance page and a course's details. */
export function AttendanceContributeModal({ open, onClose, courseId }: { open: boolean; onClose: () => void; courseId?: string }) {
  const { t, lang } = useT();
  const { courses, semester, academic, accountId } = useStore();
  // Courses with a weekly schedule or an existing log (a log stays evidence
  // even after its schedule is removed).
  const withSessions = courses.filter((c) => c.sessions.length > 0 || c.missedSessions.length > 0);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cid, setCid] = useState(courseId ?? "");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgUrl, setImgUrl] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [tool, setTool] = useState<Tool>("cover");
  const [crop, setCrop] = useState<Rect | null>(null);
  const [covers, setCovers] = useState<Rect[]>([]);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [coversUntil, setCoversUntil] = useState("");
  const [unclearDate, setUnclearDate] = useState(false);
  const [matches, setMatches] = useState<MatchAnswer | null>(null);
  const [ruleUrl, setRuleUrl] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const [dropping, setDropping] = useState(false);
  const [loadingImg, setLoadingImg] = useState(false);
  // Bumped on every new pick and on every open/close, so a late image load or
  // render from an earlier pick or an earlier form can't commit.
  const gen = useRef(0);
  // Each Send gets its own number, so an older request finishing can't touch
  // a newer one's state.
  const sendSeq = useRef(0);
  // The course and the whole context (university, term) exactly as they were
  // when the student reviewed them (step 2); what is shown there is what is sent.
  const [reviewed, setReviewed] = useState<{ course: typeof courses[number]; context: ReturnType<typeof contributionContext> } | null>(null);

  // A fresh form every time it opens.
  useEffect(() => {
    gen.current++;
    if (!open) return;
    setStep(1);
    setLoadingImg(false);
    setPreparing(false);
    setSending(false);
    setReviewed(null);
    setCid(courseId ?? (withSessions.length === 1 ? withSessions[0].id : ""));
    setImg(null);
    setImgUrl("");
    setLoadError(false);
    setTool("cover");
    setCrop(null);
    setCovers([]);
    setPreview(null);
    setCoversUntil("");
    setUnclearDate(false);
    setMatches(null);
    setRuleUrl("");
    setNote("");
    setConsent(false);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, courseId]);

  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const course = courses.find((c) => c.id === cid) ?? null;
  const log = useMemo(() => (reviewed ? absenceLog(reviewed.course) : null), [reviewed]);
  const dur = (m: number) => formatDuration(m, t("hoursUnit"), t("minutesUnit"));

  // Answers given for one course/image don't carry over to another.
  const resetAnswers = () => {
    setPreview(null);
    setReviewed(null);
    setCoversUntil("");
    setUnclearDate(false);
    setMatches(null);
    setConsent(false);
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    // The old image goes at once, with its covers: masks never meet another image.
    const my = ++gen.current;
    // A preview still being prepared for the old image is dropped with it.
    setPreparing(false);
    setLoadError(false);
    setCrop(null);
    setCovers([]);
    setImg(null);
    setImgUrl("");
    resetAnswers();
    setLoadingImg(true);
    const url = URL.createObjectURL(f);
    const el = new Image();
    el.onload = () => {
      if (my !== gen.current) { URL.revokeObjectURL(url); return; }
      setImg(el);
      setImgUrl(url);
      setLoadingImg(false);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      if (my !== gen.current) return;
      setLoadingImg(false);
      setLoadError(true);
    };
    el.src = url;
  };

  // A copied screenshot can be pasted anywhere in step 1 (Ctrl+V).
  useEffect(() => {
    if (!open || step !== 1) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); pickFile(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Screen point → image pixel.
  const toImage = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !img) return { x: 0, y: 0 };
    return {
      x: ((clientX - box.left) / box.width) * img.naturalWidth,
      y: ((clientY - box.top) / box.height) * img.naturalHeight,
    };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e.clientX, e.clientY);
    setDrag({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toImage(e.clientX, e.clientY);
    setDrag({ ...drag, w: p.x - drag.x, h: p.y - drag.y });
  };
  const onUp = () => {
    if (!drag || !img) return setDrag(null);
    const r = clampRect(drag, img.naturalWidth, img.naturalHeight);
    setDrag(null);
    if (r.w < 8 || r.h < 8) return; // a tap, not a drag
    if (tool === "crop") setCrop(r);
    else setCovers((cs) => [...cs, r]);
  };
  // Image pixels → % of the shown image, for the overlay boxes.
  const pctStyle = (r: Rect, color: string, fill: string): React.CSSProperties => {
    const rr = img ? clampRect(r, img.naturalWidth, img.naturalHeight) : r;
    const W = img?.naturalWidth || 1;
    const H = img?.naturalHeight || 1;
    return {
      position: "absolute",
      left: `${(rr.x / W) * 100}%`,
      top: `${(rr.y / H) * 100}%`,
      width: `${(rr.w / W) * 100}%`,
      height: `${(rr.h / H) * 100}%`,
      border: `2px solid ${color}`,
      background: fill,
      pointerEvents: "none",
    };
  };

  const toStep2 = async () => {
    if (!img || !course || loadingImg || preparing) return;
    const my = gen.current;
    // Frozen together now: the course, its university and its term.
    const snapshot = { course, context: contributionContext(course, semester, academic) };
    setPreparing(true);
    setError("");
    try {
      const blob = await renderEvidence(img, crop, covers);
      if (my !== gen.current) return;
      setPreview({ blob, url: URL.createObjectURL(blob) });
      setReviewed(snapshot);
      setStep(2);
    } catch {
      if (my === gen.current) setError(t("attContrib_imageError"));
    } finally {
      if (my === gen.current) setPreparing(false);
    }
  };

  // Another course: a preview being prepared for the old one is dropped. An
  // image still loading is kept: it doesn't depend on the course.
  const pickCourse = (id: string) => {
    if (preparing) {
      gen.current++;
      setPreparing(false);
    }
    setCid(id);
    resetAnswers();
  };

  const send = async () => {
    if (!reviewed || !preview || !matches || !consent || sending) return;
    const g = gen.current;
    const my = ++sendSeq.current;
    const mine = () => g === gen.current && my === sendSeq.current;
    setSending(true);
    setError("");
    try {
      const res = await submitContribution(accountId, {
        image: preview.blob,
        coversUntil: unclearDate || !coversUntil ? null : coversUntil,
        matches,
        ruleUrl,
        note,
        context: reviewed.context,
      });
      if (!mine()) return;
      if (res.ok) setStep(3);
      else setError(t(res.reason === "too_many" ? "attContrib_tooMany" : "saveError"));
    } catch {
      if (mine()) setError(t("saveError"));
    } finally {
      if (mine()) setSending(false);
    }
  };

  const field = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const border = { borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" };
  const dateOk = unclearDate || !!coversUntil;
  const canSend = !!matches && dateOk && consent && !sending;

  const footer =
    step === 1 ? (
      <div className="flex items-center justify-end gap-2">
        {/* Say what's missing instead of a silently pale button. */}
        {!preparing && !loadingImg && (!course || !img) && (
          <span className="me-auto text-xs" style={{ color: "var(--color-muted)" }}>
            {t(!course ? "attContrib_needCourse" : "attContrib_needImage")}
          </span>
        )}
        <InteractionButton type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm" style={{ color: "var(--color-muted)" }}>{t("cancel")}</InteractionButton>
        <InteractionButton
          type="button"
          disabled={preparing || loadingImg}
          onClick={() => {
            // Take the student to what's missing instead of a dead button.
            const miss = !course ? selectRef.current : !img ? pickRef.current : null;
            if (miss) { miss.scrollIntoView({ block: "center", behavior: "smooth" }); miss.focus(); return; }
            void toStep2();
          }}
          className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--color-primary)", color: "#fff" }}>
          {t("attContrib_next")}
        </InteractionButton>
      </div>
    ) : step === 2 ? (
      <div className="flex justify-between gap-2">
        <InteractionButton type="button" disabled={sending} onClick={() => setStep(1)} className="rounded-lg px-4 py-2 text-sm disabled:opacity-50" style={{ color: "var(--color-muted)" }}>{t("attContrib_back")}</InteractionButton>
        <InteractionButton type="button" disabled={!canSend} onClick={send}
          className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--color-primary)", color: "#fff" }}>
          {sending ? t("attContrib_sending") : t("attContrib_send")}
        </InteractionButton>
      </div>
    ) : (
      <div className="flex justify-end">
        <InteractionButton type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: "var(--color-primary)", color: "#fff" }}>{t("attContrib_done")}</InteractionButton>
      </div>
    );

  return (
    <Modal open={open} onClose={onClose} title={t("attContrib_title")} footer={footer} variant="sheet">
      {step === 1 && (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>{t("attContrib_step1")}</p>
          <p style={{ color: "var(--color-muted)" }}>{t("attContrib_intro")}</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("attContrib_course")}</span>
            <select ref={selectRef} value={cid} disabled={preparing} onChange={(e) => pickCourse(e.target.value)} className={field} style={border}>
              <option value="">{t("attContrib_pickCourse")}</option>
              {withSessions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("attContrib_image")}</span>
            {/* A clear button instead of the browser's own file field; a
                screenshot can also be pasted or dropped here. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
            <button
              ref={pickRef}
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropping(false);
                pickFile([...e.dataTransfer.files].find((x) => x.type.startsWith("image/")));
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-sm transition-colors hover:opacity-90"
              style={{
                borderColor: dropping ? "var(--color-primary)" : "var(--color-border)",
                background: dropping ? "var(--color-primary-soft)" : "var(--color-surface)",
                color: "var(--color-ink)",
              }}
            >
              <ImagePlus size={20} style={{ color: "var(--color-primary)" }} />
              <span className="font-medium">{t(img ? "attContrib_imageChange" : "attContrib_imagePick")}</span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>{t("attContrib_imagePaste")}</span>
            </button>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>{t("attContrib_imageHint")}</span>
            {loadError && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{t("attContrib_imageError")}</span>}
          </div>
          {img && (
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink)" }}>{t("attContrib_coverHint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                {(["cover", "crop"] as const).map((k) => (
                  <InteractionButton key={k} type="button" onClick={() => setTool(k)} aria-pressed={tool === k}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={tool === k ? { background: "var(--color-primary)", color: "#fff" } : { background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                    {k === "cover" ? <EyeOff size={13} /> : <Crop size={13} />}
                    {t(k === "cover" ? "attContrib_toolCover" : "attContrib_toolCrop")}
                  </InteractionButton>
                ))}
                <InteractionButton type="button" disabled={!covers.length && !crop}
                  onClick={() => (covers.length ? setCovers((cs) => cs.slice(0, -1)) : setCrop(null))}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40" style={{ color: "var(--color-muted)" }}>
                  <Undo2 size={13} /> {t("attContrib_undo")}
                </InteractionButton>
              </div>
              <div ref={boxRef} className="relative select-none touch-none rounded-lg overflow-hidden border" style={{ borderColor: "var(--color-border)", cursor: "crosshair" }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl} alt="" draggable={false} className="block w-full h-auto" />
                {crop && <div style={pctStyle(crop, "var(--color-primary)", "transparent")} />}
                {covers.map((r, i) => <div key={i} style={pctStyle(r, "#111", "#111")} />)}
                {drag && <div style={pctStyle(drag, tool === "crop" ? "var(--color-primary)" : "#111", tool === "crop" ? "transparent" : "rgba(17,17,17,0.6)")} />}
              </div>
            </div>
          )}
          {error && <p className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>}
        </div>
      )}

      {step === 2 && reviewed && preview && log && (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>{t("attContrib_step2")}</p>
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>{t("attContrib_sentImage")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="" className="block w-full h-auto rounded-lg border" style={{ borderColor: "var(--color-border)" }} />
          </div>
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>{t("attContrib_yourLog", { course: reviewed.course.name })}</p>
            <p style={{ color: "var(--color-ink)" }}>{t("attLog_summary", { n: log.lectures, h: dur(log.minutes) })}</p>
            {log.lates > 0 && <p className="text-xs" style={{ color: "var(--color-muted)" }}>{t("attLog_latesLine", { n: log.lates, m: dur(log.lateMinutes) })}</p>}
            {reviewed.course.missedSessions.length > 0 && (
              <ul className="text-xs mt-1.5 flex flex-col gap-0.5" style={{ color: "var(--color-muted)" }}>
                {reviewed.course.missedSessions.map((m) => (
                  <li key={m.id}>
                    {t(`day${m.day}` as TranslationKey)} · {dur(m.minutes)}
                    {m.date ? ` · ${formatLongDate(`${m.date}T00:00:00`, lang, semester.calendarType)}` : ""}
                    {m.tardiness && m.tardiness > 0 ? ` · ${t("minutesLate", { n: m.tardiness })}` : ""}
                    {m.excused ? ` · ${t("excused")}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("attContrib_coversUntil")}</span>
            <input type="date" value={coversUntil} max={toISODate(new Date())} disabled={unclearDate}
              onInput={(e) => setCoversUntil(e.currentTarget.value)} className={field} style={border} />
            <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--color-ink)" }}>
              <input type="checkbox" checked={unclearDate} onChange={(e) => setUnclearDate(e.target.checked)} />
              {t("attContrib_dateUnclear")}
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("attContrib_matchQ")}</span>
            <div className="flex flex-wrap gap-2">
              {(["yes", "no", "unsure"] as const).map((k) => (
                <InteractionButton key={k} type="button" onClick={() => setMatches(k)} aria-pressed={matches === k}
                  className="rounded-lg px-3.5 py-1.5 text-sm font-medium"
                  style={matches === k ? { background: "var(--color-primary)", color: "#fff" } : { background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                  {t(k === "yes" ? "attContrib_matchYes" : k === "no" ? "attContrib_matchNo" : "attContrib_matchUnsure")}
                </InteractionButton>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("attContrib_ruleUrl")}</span>
            <input type="url" inputMode="url" maxLength={500} value={ruleUrl} onChange={(e) => setRuleUrl(e.target.value)} className={field} style={border} dir="ltr" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{t("attContrib_note")}</span>
            <textarea maxLength={1000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={field} style={border} />
          </label>
          <label className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: "var(--color-ink)" }}>
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            {t("attContrib_consent")}
          </label>
          {error && <p className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center text-center gap-3 py-6 text-sm">
          <CheckCircle2 size={36} style={{ color: "var(--color-success)" }} />
          <p className="font-semibold" style={{ color: "var(--color-ink)" }}>{t("attContrib_thanksTitle")}</p>
          <p style={{ color: "var(--color-muted)" }}>{t("attContrib_thanksBody")}</p>
        </div>
      )}
    </Modal>
  );
}
