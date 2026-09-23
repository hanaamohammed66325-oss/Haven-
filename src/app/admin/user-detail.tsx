"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge, useC, useS, callAdmin, fmtDateTime, fmtSar, fmtNum, timeAgo, Loading, StatCard } from "./_lib";

interface Detail {
  profile: {
    id: string; email: string; created_at: string;
    last_sign_in_at: string | null; email_confirmed_at: string | null;
    banned_until: string | null; full_name: string; is_vip: boolean; is_admin: boolean;
  } | null;
  /** Academic profile from profiles.preferences.academic. */
  academic?: { universitySlug?: string; universityName?: string; major?: string; level?: string } | null;
  /** Every calculation-critical input the student entered (admin_user_detail v2). */
  inputs?: {
    semester: {
      name: string;
      teaching_weeks: number | null;
      finals_weeks: number | null;
      start_date: string | null;
      end_date: string | null;
      withdrawal_limit: number | null;
      calendar_type: string | null;
      tardiness_rule: string | null;
      cumulative_gpa: number | null;
      completed_hours: number | null;
    } | null;
    courses: Array<{
      name: string;
      credits: number | null;
      attendance_limit: number | null;
      position: number;
      sessions: number;
      weekly_minutes: number;
      components: number;
      graded: number;
      weight_total: number;
      absences: number;
      absence_minutes: number;
    }>;
  } | null;
  /** Engagement / retention counters from user_events (admin_user_detail v2). */
  engagement?: {
    app_opens: number;
    app_opens_installed: number;
    app_opens_browser: number;
    page_views: number;
    events_total: number;
    first_event_at: string | null;
    last_event_at: string | null;
  } | null;
  top_pages?: Array<{ path: string; views: number }> | null;
  last_active_at?: string | null;
  subscription: {
    id: string; status: string; billing_cycle: string; amount_sar: number;
    trial_ends_at: string | null; expires_at: string | null; next_billing_at: string | null;
    cancelled_at: string | null; last_payment_at: string | null; last_payment_id: string | null;
    coupon_code: string | null; discount_percent: number | null;
  } | null;
  payment_summary: { total_paid_sar: number; payment_count: number; last_payment_at: string | null } | null;
  push_devices: number;
  tickets: Array<{ id: string; subject: string; status: string; priority: string; category: string; created_at: string; updated_at: string }> | null;
  activity: Array<{ kind: string; ts: string; detail: Record<string, unknown> }> | null;
}

export function UserDetailSection({
  session, userId, onBack,
}: {
  session: Session;
  userId: string;
  onBack: () => void;
}) {
  const C = useC();
  const S = useS();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await callAdmin(session, "user_detail", { user_id: userId });
    if (res?.ok) setDetail(res.detail);
    setLoading(false);
  }, [session, userId]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !detail) return <Loading text="Loading user…" />;
  const p = detail.profile;
  const s = detail.subscription;
  const ps = detail.payment_summary;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} style={S.btnSec}>← Users</button>
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: C.text }}>{p?.email ?? "—"}</h1>
          <div className="text-[11px]" style={{ color: C.textDim }}>{userId}</div>
        </div>
        <div className="ms-auto flex gap-2">
          {p?.is_admin && <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: C.warning + "22", color: C.warning }}>ADMIN</span>}
          {p?.is_vip &&   <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: C.indigoBg, color: C.indigo }}>VIP</span>}
        </div>
      </div>

      {/* Profile */}
      <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Profile</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
          <KV label="Name" value={p?.full_name || "—"} />
          <KV label="Joined" value={fmtDateTime(p?.created_at)} />
          <KV label="Last seen" value={p?.last_sign_in_at ? fmtDateTime(p.last_sign_in_at) : "—"} />
          <KV label="Email confirmed" value={p?.email_confirmed_at ? fmtDateTime(p.email_confirmed_at) : "No"} />
          <KV label="Account status" value={p?.banned_until ? "Banned" : "Active"} />
          <KV label="Push devices" value={String(detail.push_devices)} />
        </div>
        {detail.academic && (detail.academic.universityName || detail.academic.major || detail.academic.level) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px] mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
            <KV label="University" value={detail.academic.universityName || "—"} />
            <KV label="Major" value={detail.academic.major || "—"} />
            <KV
              label="Level"
              value={
                detail.academic.level
                  ? /^\d{1,2}$/.test(detail.academic.level)
                    ? `Level ${detail.academic.level}`
                    : detail.academic.level
                  : "—"
              }
            />
          </div>
        )}
      </div>

      {/* Engagement & retention — are we keeping this user? */}
      <RetentionCard engagement={detail.engagement} topPages={detail.top_pages} lastActiveAt={detail.last_active_at} joinedAt={p?.created_at} />

      {/* Calculation inputs — exactly what the student entered that the app's
          grade/attendance maths depend on, with integrity flags. */}
      <InputsCard inputs={detail.inputs} />

      {/* Subscription + payment summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2 rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Subscription</h2>
          {!s ? (
            <p className="text-[13px]" style={{ color: C.textFaint }}>No subscription — free tier.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-[13px]">
              <KV label="Status" value={<Badge status={s.status} />} />
              <KV label="Plan" value={s.billing_cycle} />
              <KV label="Amount" value={fmtSar(s.amount_sar)} />
              <KV label="Trial ends" value={s.trial_ends_at ? fmtDateTime(s.trial_ends_at) : "—"} />
              <KV label="Next billing" value={s.next_billing_at ? fmtDateTime(s.next_billing_at) : "—"} />
              <KV label="Expires" value={s.expires_at ? fmtDateTime(s.expires_at) : "—"} />
              <KV label="Last payment" value={s.last_payment_at ? fmtDateTime(s.last_payment_at) : "—"} />
              <KV label="Coupon" value={s.coupon_code ? `${s.coupon_code} (−${s.discount_percent}%)` : "—"} />
              <KV label="Cancelled" value={s.cancelled_at ? fmtDateTime(s.cancelled_at) : "—"} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <StatCard label="Total paid" value={fmtSar(ps?.total_paid_sar ?? 0)} accent={C.success} />
          <StatCard label="# Payments" value={ps?.payment_count ?? 0} />
        </div>
      </div>

      {/* Tickets */}
      <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Support tickets</h2>
        {!detail.tickets?.length ? (
          <p className="text-[13px]" style={{ color: C.textFaint }}>No tickets from this user.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detail.tickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: C.text }}>{t.subject}</div>
                  <div className="text-[11px]" style={{ color: C.textDim }}>{t.category} · {fmtDateTime(t.created_at)}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Badge status={t.priority} kind="priority" />
                  <Badge status={t.status} kind="ticket" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity */}
      <div className="rounded-xl border p-5" style={{ borderColor: C.border, background: C.panel }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: C.textDim }}>Activity</h2>
        {!detail.activity?.length ? (
          <p className="text-[13px]" style={{ color: C.textFaint }}>No activity recorded.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detail.activity.map((a, i) => (
              <div key={`${a.kind}-${a.ts}-${i}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
                <span className="text-[13px]" style={{ color: C.text }}>{a.kind.replace(/_/g, " ")}</span>
                <span className="text-[11px]" style={{ color: C.textDim }}>{fmtDateTime(a.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  const C = useC();
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.textFaint }}>{label}</div>
      <div style={{ color: C.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

type Inputs = NonNullable<Detail["inputs"]>;
type InputCourse = Inputs["courses"][number];

/* ---------- Engagement & retention (Part 3) ---------- */
function RetentionCard({
  engagement, topPages, lastActiveAt, joinedAt,
}: {
  engagement?: Detail["engagement"];
  topPages?: Detail["top_pages"];
  lastActiveAt?: string | null;
  joinedAt?: string;
}) {
  const C = useC();
  const eng = engagement;
  const lastSeen = eng?.last_event_at ?? lastActiveAt ?? null;
  const msSince = lastSeen ? Date.now() - new Date(lastSeen).getTime() : null;
  const daysSince = msSince != null ? Math.floor(msSince / 86400000) : null;
  const online = msSince != null && msSince < 5 * 60 * 1000;
  const ageDays = joinedAt ? Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000) : null;

  // Retention bucket — recency of the last recorded activity.
  let r: { label: string; color: string; bg: string };
  if (daysSince == null) r = { label: "No activity", color: C.textMuted, bg: C.border };
  else if (online || daysSince <= 3) r = { label: "Retained", color: C.successText, bg: C.successBg };
  else if (daysSince <= 14) r = { label: "At risk", color: C.warningText, bg: C.tint(C.warning, "22") };
  else r = { label: "Likely lost", color: C.danger, bg: C.dangerBg };

  const totalOpens = eng?.app_opens ?? 0;
  const installed = eng?.app_opens_installed ?? 0;
  const browser = eng?.app_opens_browser ?? 0;
  // Opens carry a standalone flag only AFTER install tracking was added — the
  // rest predate it and genuinely can't be classified (never counted as browser).
  const identified = installed + browser;
  const unknown = Math.max(0, totalOpens - identified);
  const instPct = identified ? Math.round((installed / identified) * 100) : 0;
  const browserPct = identified ? 100 - instPct : 0;
  const top = topPages?.[0];

  return (
    <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: C.textDim }}>Engagement &amp; retention</h2>
        <div className="flex items-center gap-2">
          {online && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: C.successBg, color: C.successText }}>
              <span className="w-2 h-2 rounded-full" style={{ background: C.success }} /> Online now
            </span>
          )}
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: r.bg, color: r.color }}>{r.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
        <KV label="App opens (total)" value={fmtNum(totalOpens)} />
        <KV label="Page views" value={fmtNum(eng?.page_views ?? 0)} />
        <KV label="Last active" value={lastSeen ? timeAgo(lastSeen) : "—"} />
        <KV label="Days since active" value={daysSince == null ? "—" : String(daysSince)} />
        <KV label="Member for" value={ageDays == null ? "—" : `${ageDays}d`} />
        <KV label="Most-visited page" value={top ? `${top.path} (${top.views})` : "—"} />
      </div>

      {/* Installed-app vs browser — ONLY among opens we can actually identify.
          Opens from before install tracking was added carry no flag and are shown
          separately, never lumped in as "browser". */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
        <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>
          Installed app vs browser
        </div>
        {identified === 0 ? (
          <p className="text-[12px]" style={{ color: C.textFaint }}>
            Not recorded yet — none of this user&apos;s {fmtNum(totalOpens)} opens carry an install flag
            (they predate install tracking). New opens will be classified from now on.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg px-2.5 py-1 text-[12px] font-semibold" style={{ background: C.indigoBg, color: C.indigo }}>
                Installed {fmtNum(installed)} · {instPct}%
              </span>
              <span className="rounded-lg px-2.5 py-1 text-[12px] font-semibold" style={{ background: C.panel2, color: C.textMuted }}>
                Browser {fmtNum(browser)} · {browserPct}%
              </span>
            </div>
            <p className="text-[11px] mt-2" style={{ color: C.textFaint }}>
              Of {fmtNum(identified)} identifiable opens{unknown > 0 ? ` · ${fmtNum(unknown)} earlier opens predate install tracking and can't be classified` : ""}.
            </p>
          </>
        )}
      </div>
      {topPages && topPages.length > 1 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
          <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Top pages</div>
          <div className="flex flex-wrap gap-2">
            {topPages.map((tp) => (
              <span key={tp.path} className="rounded-lg px-2 py-1 text-[12px]" style={{ background: C.panel2, color: C.text }}>
                {tp.path} <span style={{ color: C.textDim }}>· {tp.views}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Calculation inputs (Part 2) ---------- */
// Weights are entered but don't add up to ~100% (a 1% slack each way absorbs
// rounding), so the grade maths run on a skewed total.
function weightsOff(c: InputCourse): boolean {
  return c.components > 0 && c.weight_total > 0 && (c.weight_total < 99 || c.weight_total > 101);
}

function courseFlags(c: InputCourse): string[] {
  const f: string[] = [];
  if (c.sessions === 0 && c.absences > 0) f.push("Absences logged but no class sessions");
  else if (c.sessions === 0) f.push("No sessions — attendance can't compute");
  if (!c.credits || c.credits <= 0) f.push("Credit hours = 0");
  if (weightsOff(c)) f.push(`Weights sum ${Math.round(c.weight_total)}% (≠100)`);
  return f;
}

function InputsCard({ inputs }: { inputs?: Detail["inputs"] }) {
  const C = useC();
  if (!inputs) return null;
  const sem = inputs.semester;
  const courses = inputs.courses ?? [];

  const semFlags: string[] = [];
  if (sem) {
    if (!sem.teaching_weeks || sem.teaching_weeks <= 0) semFlags.push("Teaching weeks not set");
    if (sem.start_date && sem.end_date && sem.start_date >= sem.end_date) semFlags.push("Start date on/after end date");
    if (sem.withdrawal_limit == null) semFlags.push("Withdrawal limit not set (defaults to 25%)");
  }

  const th = "px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";
  const td = "px-3 py-2 text-[13px] whitespace-nowrap";

  return (
    <div className="rounded-xl border p-5 mb-4" style={{ borderColor: C.border, background: C.panel }}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-1" style={{ color: C.textDim }}>Calculation inputs</h2>
      <p className="text-[12px] mb-4" style={{ color: C.textFaint }}>
        The exact data this student entered that the grade &amp; attendance maths run on. Flags mark inputs that skew results.
      </p>

      {/* Semester */}
      {!sem ? (
        <p className="text-[13px]" style={{ color: C.textFaint }}>No active semester.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
          <KV label="Semester" value={sem.name || "—"} />
          <KV label="Teaching weeks" value={sem.teaching_weeks ?? "—"} />
          <KV label="Finals weeks" value={sem.finals_weeks ?? "—"} />
          <KV label="Withdrawal (حرمان)" value={sem.withdrawal_limit == null ? "25% (default)" : `${sem.withdrawal_limit}%`} />
          <KV label="Start date" value={sem.start_date ?? "—"} />
          <KV label="End date" value={sem.end_date ?? "—"} />
          <KV label="Calendar" value={sem.calendar_type ?? "gregorian"} />
          <KV label="Tardiness rule" value={sem.tardiness_rule ?? "standard"} />
          <KV label="Cumulative GPA" value={sem.cumulative_gpa == null ? "—" : String(sem.cumulative_gpa)} />
          <KV label="Completed hours" value={sem.completed_hours == null ? "—" : String(sem.completed_hours)} />
        </div>
      )}

      {semFlags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {semFlags.map((fl) => (
            <span key={fl} className="rounded-lg px-2 py-1 text-[11px] font-medium" style={{ background: C.tint(C.warning, "22"), color: C.warningText }}>
              ⚠ {fl}
            </span>
          ))}
        </div>
      )}

      {/* Courses */}
      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>
          Courses ({courses.length})
        </div>
        {courses.length === 0 ? (
          <p className="text-[13px]" style={{ color: C.textFaint }}>No courses entered.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: C.border }}>
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: C.panel2 }}>
                  {["Course", "Credits", "Limit", "Sessions", "Min/wk", "Marks", "Weights", "Absences", "Flags"].map((h) => (
                    <th key={h} className={th} style={{ color: C.textFaint }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courses.map((c, i) => {
                  const flags = courseFlags(c);
                  const weightOff = weightsOff(c);
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className={td} style={{ color: C.text, fontWeight: 500 }}>{c.name || "—"}</td>
                      <td className={td} style={{ color: C.text }}>{c.credits ?? "—"}</td>
                      <td className={td} style={{ color: C.text }}>{c.attendance_limit ? `${c.attendance_limit}%` : "—"}</td>
                      <td className={td} style={{ color: c.sessions === 0 ? C.danger : C.text }}>{c.sessions}</td>
                      <td className={td} style={{ color: C.text }}>{c.weekly_minutes}</td>
                      <td className={td} style={{ color: C.text }}>{c.graded}/{c.components}</td>
                      <td className={td} style={{ color: weightOff ? C.warning : C.text }}>{Math.round(c.weight_total)}%</td>
                      <td className={td} style={{ color: C.text }}>{c.absences}{c.absence_minutes ? ` (${c.absence_minutes}m)` : ""}</td>
                      <td className={td}>
                        {flags.length === 0 ? (
                          <span style={{ color: C.textFaint }}>—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {flags.map((fl) => (
                              <span key={fl} className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: C.dangerBg, color: C.danger }}>{fl}</span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
