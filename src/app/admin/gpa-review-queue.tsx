"use client";

import { useRef, useState } from "react";
import { InteractionButton } from "@/components/motion/Interaction";
import { recalculateReview, type ReviewCaseData, type ReviewCourse } from "@/lib/gpaReviewData";
import { reviewComparison, updateGpaReview, type AdminReview, type AdminReviewAction, type ReviewKind, type ReviewResults } from "@/lib/gpaReviewCases";
import { fmtDateTime, useC, useS } from "./_lib";

export type ReviewEmailIntent = "follow-up" | "information" | "resolved";
const kinds: ReviewKind[] = ["semester", "cumulative"];
const labels = { semester: "Semester", cumulative: "Cumulative" };
const statusText = { open: "New", pending: "Under review", waiting: "Waiting for information", resolved: "Resolved" };
const reasonText = { hours: "Hours or points", grade: "Grade or weighting", notCounted: "Excluded course", repeat: "Repeated course", unknown: "Unsure" };
const classifications = { unknown: "Unconfirmed", app: "Haven calculation", inputs: "Academic inputs", program: "Program rule" };
const eventText: Record<string, string> = { submitted: "Request submitted", recompared: "Student compared again", triage: "Review started", contact: "Email recorded", resolve: "Resolution verified", note: "Internal note", wait: "Information requested", reopen: "Review reopened" };

export function GpaReviewQueue({ rows, unavailable, selectedId, onSelect, onEmail, onChanged }: {
  rows: AdminReview[];
  unavailable: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEmail: (row: AdminReview, intent?: ReviewEmailIntent) => void;
  onChanged: () => Promise<void>;
}) {
  const C = useC();
  const S = useS();
  const [status, setStatus] = useState<"active" | "all" | AdminReview["status"]>("active");
  const [search, setSearch] = useState("");
  const selected = rows.find((row) => row.id === selectedId);
  if (selected) return <ReviewDetail key={selected.id} row={selected} onClose={() => onSelect(null)}
    onEmail={onEmail} onChanged={onChanged} />;
  const visible = rows.filter((row) => (status === "all" || (status === "active" ? row.status !== "resolved" : row.status === status))
    && [row.label, row.email, row.id].some((value) => value.toLowerCase().includes(search.trim().toLowerCase())));
  return (
    <section className="mb-6 min-w-0 space-y-3 rounded-xl border p-4" aria-label="GPA review requests"
      style={{ borderColor: C.border, background: C.panel }}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: C.text }}>GPA review requests</h2>
        <span className="text-xs" style={{ color: C.textMuted }}>{rows.filter((row) => row.status !== "resolved").length} open</span>
      </header>
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search GPA requests"
          placeholder="Search by email, term or request ID" className="min-w-0 max-w-full flex-1"
          style={{ ...S.input, width: undefined }} />
        <select aria-label="Filter review requests" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}
          className="max-w-full" style={{ ...S.input, width: "auto" }}>
          <option value="active">Open requests</option><option value="all">All requests</option>
          {Object.entries(statusText).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>
      {!visible.length && <p className="text-sm" style={{ color: C.textMuted }}>
        {unavailable ? "Review requests are unavailable." : "No requests match this view."}
      </p>}
      <ul className="min-w-0 space-y-2">
        {visible.map((row) => (
          <li key={row.id}>
            <InteractionButton type="button" onClick={() => onSelect(row.id)}
              className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2 text-start text-sm"
              style={{ borderColor: C.border, background: C.panel2, color: C.text }}>
              <span dir="auto" className="min-w-0 flex-1 [overflow-wrap:anywhere]">{row.label || (row.source === "past" ? "Past term" : "Term GPA")}
                <span dir="ltr" className="block text-xs" style={{ color: C.textMuted }}>{row.email}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span style={{ color: C.warning }}>High priority</span>
                <span style={{ color: row.status === "resolved" ? C.success : C.textMuted }}>{statusText[row.status]}</span>
              </span>
            </InteractionButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

function asCourses(details: Record<string, unknown>): ReviewCourse[] {
  const entries = Array.isArray(details.courseTable) ? details.courseTable : Array.isArray(details.courses) ? details.courses : [];
  return entries.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const grade = row.grade ?? row.official ?? row.letter ?? row.mark;
    const estimate = row.estimate ?? row.estimated ?? row.pct;
    return [{
      id: typeof row.id === "string" ? row.id : String(index),
      name: typeof row.name === "string" ? row.name : "",
      hours: typeof row.hours === "number" ? row.hours : NaN,
      grade: typeof grade === "string" || typeof grade === "number" ? grade : null,
      estimate: typeof estimate === "string" || typeof estimate === "number" ? estimate : null,
      excluded: row.excluded === true || row.excludedFromGpa === true || grade === "W",
      repeated: row.repeated === true,
      points: typeof row.points === "number" ? row.points : null,
    }];
  });
}

function asPrior(details: Record<string, unknown>): ReviewCaseData["prior"] {
  const prior = details.prior ?? details.cumulative;
  const object = prior && typeof prior === "object" ? prior as Record<string, unknown> : details;
  const gpa = object.gpa ?? object.before;
  return typeof gpa === "number" && typeof object.hours === "number" ? { gpa, hours: object.hours } : undefined;
}

function ReviewDetail({ row, onClose, onEmail, onChanged }: {
  row: AdminReview;
  onClose: () => void;
  onEmail: (row: AdminReview, intent?: ReviewEmailIntent) => void;
  onChanged: () => Promise<void>;
}) {
  const C = useC();
  const S = useS();
  const checked = kinds.filter((kind) => row.results[kind]);
  const disputed = checked.filter((kind) => row.results[kind]?.ours !== row.results[kind]?.portal);
  const required = Array.isArray(row.affectedKinds) ? checked.filter((kind) => row.affectedKinds?.includes(kind)) : disputed;
  const courses = asCourses(row.details);
  const prior = asPrior(row.details);
  const grading = row.details.grading as ReviewCaseData["grading"] | null | undefined;
  const initial = row.details.initialResults as ReviewResults | undefined;
  const selected = courses.find((course) => course.id === row.details.selectedCourse);
  const canRecalculate = Boolean(grading && Array.isArray(grading.bands) && grading.bands.length &&
    grading.bands.every((band) => band && typeof band.letter === "string" && Number.isFinite(band.points)) && courses.length);
  const advanced = Array.isArray(row.timeline);
  const [mode, setMode] = useState<"draft" | "note" | "wait" | "resolve" | "reopen" | null>(null);
  const [draft, setDraft] = useState(courses);
  const [draftPrior, setDraftPrior] = useState(prior);
  const [proof, setProof] = useState<ReviewResults>({});
  const [message, setMessage] = useState("");
  const [classification, setClassification] = useState<NonNullable<AdminReview["classification"]>>(row.classification ?? "unknown");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const actionRef = useRef<HTMLElement>(null);

  const begin = (next: typeof mode) => {
    setMode(next); setNotice(""); setError(false); setMessage("");
    if (next) requestAnimationFrame(() => { actionRef.current?.scrollIntoView({ block: "nearest" }); actionRef.current?.focus({ preventScroll: true }); });
    if (next === "draft") { setDraft(courses); setDraftPrior(prior); }
    if (next === "resolve") setProof({ ...row.results });
    if (next === "note") setClassification(row.classification ?? "unknown");
  };

  const draftResults = mode === "draft" && canRecalculate && grading
    ? recalculateReview({ grading, courseTable: draft, prior: row.reason === "repeat" ? undefined : draftPrior }, row.results)
    : {};
  const counted = courses.filter((course) => !course.excluded);
  const hours = courses.every((course) => Number.isFinite(course.hours)) ? counted.reduce((sum, course) => sum + course.hours, 0) : null;
  const points = hours !== null && counted.every((course) => course.points !== null) ? counted.reduce((sum, course) => sum + course.points! * course.hours, 0) : null;

  const fail = (text: string) => { setError(true); setNotice(text); };
  const act = async (action: AdminReviewAction) => {
    if (busy) return;
    const input = message.trim();
    if (["note", "wait", "reopen", "resolve"].includes(action) && !input) {
      fail(action === "resolve" ? "Enter the explanation the student will see." : "Enter a note for this action.");
      return;
    }
    const results: ReviewResults = {};
    if (action === "resolve") {
      for (const kind of required) {
        const pair = proof[kind];
        const ours = Number(pair?.ours), portal = Number(pair?.portal);
        if (!pair?.ours.trim() || !pair.portal.trim() || !Number.isFinite(ours) || !Number.isFinite(portal)
          || Math.min(ours, portal) < 0 || Math.max(ours, portal) > row.max || ours.toFixed(2) !== portal.toFixed(2)) {
          fail("Enter matching Haven and portal values for every disputed result."); return;
        }
        results[kind] = reviewComparison(ours, portal);
      }
      for (const kind of checked) if (!results[kind]) results[kind] = row.results[kind];
      if (Object.values(results).some((result) => result.ours !== result.portal)) {
        fail("A result still differs. The request remains under review."); return;
      }
    }
    setBusy(true); setNotice(""); setError(false);
    try {
      const evidence = action === "resolve" ? { results, resolution: input } : action === "note" ? { note: input, classification } :
        action === "wait" || action === "reopen" ? { note: input } : undefined;
      await updateGpaReview(row.id, action, row.revision, evidence);
      await onChanged();
      begin(null);
      if (action === "resolve") onEmail({ ...row, status: "resolved", results, resolution: input }, "resolved");
      else if (action === "contact" || action === "wait") setNotice("Manual email recorded.");
      else if (action === "note") setNotice("Internal note saved.");
    } catch {
      await onChanged();
      fail("The change could not be confirmed. Check the request and try again.");
    } finally { setBusy(false); }
  };

  const panel = { background: C.panel, borderColor: C.border };
  return (
    <section aria-label="GPA review case" dir="ltr" className="min-w-0 space-y-5 text-sm [overflow-wrap:anywhere]" style={{ color: C.text }}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <InteractionButton type="button" onClick={onClose} style={S.btnSec}>Back to requests</InteractionButton>
          <h1 dir="auto" className="mt-3 text-xl font-semibold">{row.label || "GPA review case"}</h1>
          <p className="mt-1 text-xs" style={{ color: C.textMuted }}>{row.email} · {fmtDateTime(row.createdAt)} · {row.source === "past" ? "Past term" : "Current term"}</p>
          <p className="mt-1 text-xs" style={{ color: C.textMuted }}>Request {row.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium" style={{ color: C.warning }}>High priority</span>
          <span className="text-xs font-medium" style={{ color: row.status === "resolved" ? C.success : C.textMuted }}>{statusText[row.status]}</span>
          {(row.status === "open" || row.status === "waiting") &&
            <InteractionButton type="button" style={S.btnPrimary} disabled={busy} onClick={() => void act("triage")}>
              {row.status === "waiting" ? "Resume review" : "Start review"}
            </InteractionButton>}
        </div>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border p-4" style={panel}>
            <h2 className="font-semibold">Comparison</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {checked.map((kind) => {
                const result = row.results[kind]!;
                const old = initial?.[kind];
                return <div key={kind} className="rounded-lg p-3" style={{ background: C.panel2 }}>
                  <h3 className="text-xs font-medium">{labels[kind]}</h3>
                  <p className="mt-1 tabular-nums">Haven {result.ours} · Portal {result.portal} · Gap {Math.abs(Number(result.ours) - Number(result.portal)).toFixed(2)}</p>
                  {old && (old.ours !== result.ours || old.portal !== result.portal) &&
                    <p className="mt-1 text-xs tabular-nums" style={{ color: C.textMuted }}>First comparison · Haven {old.ours} · Portal {old.portal}</p>}
                </div>;
              })}
            </div>
            <p className="mt-3 text-xs" style={{ color: C.textMuted }}>
              {prior ? `Previous GPA ${prior.gpa} · ${prior.hours} counted credits` : "Previous GPA —"}
            </p>
            {row.resolution && <p className="mt-2 text-xs" style={{ color: C.success }}>{row.resolution === "matched" ? "Verified by a new matching comparison." : row.resolution}</p>}
          </section>

          <section className="rounded-xl border p-4" style={panel}>
            <h2 className="font-semibold">Submitted courses</h2>
            <p className="mt-1 text-xs tabular-nums" style={{ color: C.textMuted }}>Counted credits {hours ?? "—"} · Counted points {points === null ? "—" : Number(points.toFixed(3))}</p>
            {!courses.length && <p className="mt-3 text-xs" style={{ color: C.textMuted }}>No courses recorded in this submission.</p>}
            <div className="mt-2 divide-y" style={{ borderColor: C.border }}>
              {courses.map((course, i) => (
                <div key={course.id + i} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-2">
                  <span dir="auto" className="font-medium">{course.name || `Course ${i + 1}`}</span>
                  <span className="text-xs tabular-nums">{Number.isFinite(course.hours) ? course.hours : "—"} cr</span>
                  <span className="text-xs" style={{ color: C.textMuted }}>Official {course.grade ?? "—"} · Estimate {course.estimate ?? "—"}{course.repeated ? " · Repeat" : ""}</span>
                  <span className="text-xs" style={{ color: course.excluded ? C.warning : C.textMuted }}>{course.excluded ? "Excluded" : `${course.points ?? "—"} pts / cr`}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border p-4" style={panel}>
            <h2 className="font-semibold">Request details</h2>
            <dl className="mt-3 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
              <dt style={{ color: C.textMuted }}>University / program</dt><dd dir="auto">{typeof row.details.university === "string" && row.details.university || "—"}</dd>
              <dt style={{ color: C.textMuted }}>Scale</dt><dd>{row.scheme} · {row.max}</dd>
              <dt style={{ color: C.textMuted }}>Student reason</dt><dd>{reasonText[row.reason] ?? "—"}</dd>
              {(selected || row.details.selectedCourse) ? <><dt style={{ color: C.textMuted }}>Selected course</dt><dd dir="auto">{selected?.name || "—"}</dd></> : null}
              <dt style={{ color: C.textMuted }}>Classification</dt><dd>{classifications[row.classification ?? "unknown"]}</dd>
            </dl>
            {typeof row.details.note === "string" && row.details.note.trim() && <p dir="auto" className="mt-3 rounded-lg p-2 text-xs" style={{ background: C.panel2 }}>{row.details.note}</p>}
            {canRecalculate && grading && <details className="mt-3 text-xs">
              <summary className="cursor-pointer">Grading scale at submission</summary>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">{grading.bands.map((band, index) => <li key={band.letter + index}>{band.letter} {band.points}</li>)}</ul>
            </details>}
          </section>

          <section className="rounded-xl border p-4" style={panel}>
            <h2 className="font-semibold">Actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <InteractionButton type="button" style={S.btnSec} disabled={!canRecalculate || busy} onClick={() => begin("draft")}>Recalculate</InteractionButton>
              <InteractionButton type="button" style={S.btnSec} disabled={!advanced || busy} onClick={() => begin("note")}>Internal note</InteractionButton>
              <InteractionButton type="button" style={S.btnSec} disabled={busy || row.status === "resolved"} onClick={() => begin("wait")}>Request information</InteractionButton>
              {row.status === "resolved" ? <>
                <InteractionButton type="button" style={S.btnSec} disabled={busy} onClick={() => onEmail(row, "resolved")}>Resolution email</InteractionButton>
                <InteractionButton type="button" style={S.btnSec} disabled={!advanced || busy} onClick={() => begin("reopen")}>Reopen request</InteractionButton>
              </> : <InteractionButton type="button" style={S.btnPrimary} disabled={busy} onClick={() => begin("resolve")}>Verify resolution</InteractionButton>}
              <InteractionButton type="button" style={S.btnSec} disabled={busy} onClick={() => void act("contact")}>Record email sent</InteractionButton>
            </div>
            {!advanced && <p className="mt-2 text-xs" style={{ color: C.textMuted }}>Internal notes and waiting status require the review database update.</p>}
          </section>
        </div>
      </div>

      {mode && <section ref={actionRef} tabIndex={-1} className="rounded-xl border p-4" style={panel} aria-label="Review action">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{mode === "draft" ? "Recalculation draft" : mode === "resolve" ? "Verify resolution" : mode === "wait" ? "Request information" : mode === "reopen" ? "Reopen request" : "Internal note"}</h2>
          <InteractionButton type="button" style={S.btnSec} disabled={busy} onClick={() => begin(null)}>Cancel</InteractionButton>
        </header>
        {mode === "draft" ? <div className="mt-3 space-y-3">
          {draft.map((course, index) => (
            <div key={course.id + index} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span dir="auto" className="min-w-0 flex-1">{course.name || `Course ${index + 1}`} · {course.grade ?? "—"}</span>
              <label className="flex items-center gap-2">Credits <input type="number" min="0" step="any" value={Number.isFinite(course.hours) ? course.hours : ""}
                style={{ ...S.input, width: 76 }} onChange={(event) => setDraft((rows) => rows.map((value, i) => i === index ? { ...value, hours: event.target.valueAsNumber } : value))} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={course.excluded}
                onChange={(event) => setDraft((rows) => rows.map((value, i) => i === index ? { ...value, excluded: event.target.checked } : value))} />Exclude</label>
            </div>
          ))}
          {draftPrior && <div className="flex flex-wrap gap-3">
            <label className="text-xs">Previous GPA <input type="number" min="0" max={row.max} step="any" value={Number.isFinite(draftPrior.gpa) ? draftPrior.gpa : ""}
              style={{ ...S.input, width: 80 }} onChange={(event) => setDraftPrior({ ...draftPrior, gpa: event.target.valueAsNumber })} /></label>
            <label className="text-xs">Previous credits <input type="number" min="0" step="any" value={Number.isFinite(draftPrior.hours) ? draftPrior.hours : ""}
              style={{ ...S.input, width: 80 }} onChange={(event) => setDraftPrior({ ...draftPrior, hours: event.target.valueAsNumber })} /></label>
          </div>}
          {checked.map((kind) => <p key={kind} className="text-xs tabular-nums">
            {labels[kind]} · {draftResults[kind] ? `Draft ${draftResults[kind]?.ours} · Portal ${draftResults[kind]?.portal}` : "Awaiting calculation evidence"}
          </p>)}
          <InteractionButton type="button" style={S.btnSec} onClick={() => { begin("resolve"); setProof({ ...row.results, ...draftResults }); }}>Use draft in verification</InteractionButton>
        </div> : <div className="mt-3 space-y-3">
          {mode === "resolve" && required.map((kind) => <div key={kind} className="grid gap-2 sm:grid-cols-2">
            {(["ours", "portal"] as const).map((side) => <label key={side} className="min-w-0 text-xs">
              {labels[kind]} {side === "ours" ? "Haven" : "portal"}
              <input inputMode="decimal" className="mt-1 block" value={proof[kind]?.[side] ?? ""} style={{ ...S.input, width: "100%" }}
                onChange={(event) => setProof({ ...proof, [kind]: { ours: "", portal: "", ...proof[kind], [side]: event.target.value } })} />
            </label>)}
          </div>)}
          {mode === "note" && <label className="block text-xs">Classification
            <select className="mt-1 block" style={{ ...S.input, width: "100%" }} value={classification} onChange={(event) => setClassification(event.target.value as typeof classification)}>
              {Object.entries(classifications).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select>
          </label>}
          {mode === "wait" && <InteractionButton type="button" style={S.btnSec} onClick={() => onEmail(row, "information")}>Open email template</InteractionButton>}
          <label className="block text-xs">
            {mode === "resolve" ? "Explanation visible to the student" : mode === "wait" ? "Information requested in the email" : mode === "reopen" ? "Reason for reopening" : "Internal note"}
            <textarea dir="auto" className="mt-1 block" style={{ ...S.input, width: "100%" }} rows={3}
              maxLength={mode === "resolve" ? 400 : 1200} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <InteractionButton type="button" style={S.btnPrimary} disabled={busy || (mode === "wait" && !advanced)}
            onClick={() => void act(mode)}>{mode === "resolve" ? "Save verified resolution" : mode === "wait" ? "Record sent · Wait for information" : mode === "reopen" ? "Reopen" : "Save internal note"}</InteractionButton>
        </div>}
      </section>}
      {notice && <p role="status" className="text-xs" style={{ color: error ? C.danger : C.textMuted }}>{notice}</p>}

      <section className="rounded-xl border p-4" style={panel}>
        <h2 className="font-semibold">Case activity</h2>
        <ol className="mt-3 space-y-3 text-xs">
          {!row.timeline?.some((entry) => entry.action === "submitted") &&
            <li>Request received · {fmtDateTime(row.createdAt)}</li>}
          {row.timeline?.map((entry, index) => <li key={index}>
            <p>{eventText[entry.action] ?? entry.action} · {fmtDateTime(entry.at)}{entry.actor && ` · ${entry.actor}`}</p>
            {entry.note && <p dir="auto" className="mt-1" style={{ color: C.textMuted }}>{entry.note}</p>}
          </li>)}
          {row.contactedAt && !row.timeline?.some((entry) => entry.action === "wait" || entry.action === "contact") &&
            <li>Last manual email · {fmtDateTime(row.contactedAt)}</li>}
        </ol>
      </section>
    </section>
  );
}
