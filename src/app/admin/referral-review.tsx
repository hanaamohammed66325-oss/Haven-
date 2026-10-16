"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, useC, useS, SectionHeader, Loading, ErrorBanner, Empty } from "./_lib";
import {
  REFERRAL_REVIEW_REASONS, parseReferralReviewPage, parseReferralReviewSave,
  type ReferralReviewCursor, type ReferralReviewPage, type ReferralReviewReason, type ReferralReviewRow,
} from "@/lib/referralReview";

/** Review annotations never change attribution, rewards or account access. */
export function ReferralReviewSection({ session, onOpenUser, language, ownerFilter, onClearOwner }: {
  session: Session; onOpenUser: (id: string) => void; language?: "ar" | "en"; ownerFilter?: string | null; onClearOwner?: () => void;
}) {
  const C = useC(), S = useS(), accountId = session.user.id;
  const [lang, setLang] = useState(language || "ar"), ar = lang === "ar";
  const [page, setPage] = useState<ReferralReviewPage | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [cursor, setCursor] = useState<ReferralReviewCursor | null>(null), [history, setHistory] = useState<(ReferralReviewCursor | null)[]>([]);
  const [reason, setReason] = useState<"all" | ReferralReviewReason>("all");
  const [editing, setEditing] = useState<ReferralReviewRow | null>(null), [note, setNote] = useState("");
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(""), [saved, setSaved] = useState(false);
  const binding = useRef({ accountId, read: 0, write: 0, writeBusy: false });
  if (binding.current.accountId !== accountId) binding.current = { accountId, read: binding.current.read + 1, write: binding.current.write + 1, writeBusy: false };
  const label = (a: string, e: string) => ar ? a : e;
  const number = (n: number) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US").format(n);
  const when = (v: string) => new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(v));
  const names: Record<ReferralReviewReason, string> = {
    same_mailbox: label("صندوق بريد مشترك", "Shared mailbox"),
    reciprocal: label("إحالة متبادلة", "Reciprocal referrals"),
    signup_burst: label("دفعة حسابات حديثة", "New-account burst"),
  };
  const generalError = label("تعذّر تحميل المراجعات. أعد المحاولة؛ قد تكون ميزة الخادم غير مفعّلة بعد.", "Could not load reviews. Try again; the server feature may not be installed yet.");
  useEffect(() => { setLang(language || (document.documentElement.lang === "en" ? "en" : "ar")); }, [language]);
  useEffect(() => {
    setPage(null); setCursor(null); setHistory([]); setEditing(null); setSaving(false); setSaved(false); setSaveError("");
  }, [accountId]);
  const load = useCallback(async (position: ReferralReviewCursor | null) => {
    const current = binding.current, request = ++current.read;
    setLoading(true); setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc(ownerFilter ? "growth_admin_review_page" : "referral_admin_review_list", {
        p_expected_account: accountId, p_before_at: position?.claimed_at || null, p_before_id: position?.id || null, p_limit: 25,
        ...(ownerFilter ? { p_owner: ownerFilter } : {}),
      });
      if (binding.current !== current || current.read !== request) return;
      const parsed = !rpcError && parseReferralReviewPage(data, accountId);
      if (!parsed || ownerFilter && parsed.rows.some(row => row.owner_id !== ownerFilter)) { setPage(null); setError(generalError); } else setPage(parsed);
    } catch {
      if (binding.current === current && current.read === request) { setPage(null); setError(generalError); }
    } finally { if (binding.current === current && current.read === request) setLoading(false); }
  }, [accountId, generalError, ownerFilter]);
  useEffect(() => { void load(cursor); return () => { binding.current.read++; }; }, [load, cursor]);
  useEffect(() => () => { binding.current.read++; binding.current.write++; }, []);

  const select = (row: ReferralReviewRow) => { setEditing(row); setNote(row.review_note); setSaveError(""); setSaved(false); };
  const save = async (state: "reviewed" | "follow_up") => {
    if (!editing || binding.current.writeBusy) return;
    const row = editing, current = binding.current, request = ++current.write;
    current.writeBusy = true;
    setSaving(true); setSaveError(""); setSaved(false);
    try {
      const { data, error: rpcError } = await supabase.rpc("referral_admin_review_save", {
        p_expected_account: accountId, p_claim: row.id, p_expected_evidence: row.evidence.fingerprint,
        p_state: state, p_note: note, p_expected_updated_at: row.review_updated_at,
      });
      if (binding.current !== current || current.write !== request) return;
      const result = !rpcError && parseReferralReviewSave(data, accountId, row.id);
      if (!result || "error" in result) {
        const conflict = result && "error" in result && ["evidence_changed", "review_changed", "claim_removed"].includes(result.error);
        setSaveError(conflict ? label("تغيّرت الحالة. حدّث القائمة وراجع الأدلة قبل الحفظ.", "This case changed. Refresh the list and inspect the evidence before saving.")
          : label("تعذّر حفظ المراجعة. بقيت ملاحظتك هنا لإعادة المحاولة.", "Could not save the review. Your note is kept here for retry."));
      } else {
        setPage(p => p?.account_id === accountId ? { ...p, rows: p.rows.map(r => r.id === row.id ? result.row : r) } : p);
        setEditing(result.row); setSaved(true);
      }
    } catch { if (binding.current === current && current.write === request) setSaveError(label("تعذّر الحفظ. أعد المحاولة.", "Could not save. Try again.")); }
    finally { if (binding.current === current && current.write === request) { current.writeBusy = false; setSaving(false); } }
  };
  const rows = page?.account_id === accountId ? page.rows.filter(r => reason === "all" || r.evidence.families.includes(reason))
    .sort((a, b) => b.evidence.families.length - a.evidence.families.length) : [];
  const status = (row: ReferralReviewRow) => row.status === "counted" ? label("احتُسبت", "Counted") : row.status === "expired" ? label("لم تكتمل", "Not completed") : label("قيد التفعيل", "Pending");
  const review = (row: ReferralReviewRow) => row.review_state === "reviewed" ? label("تمت المراجعة", "Reviewed") : row.review_state === "follow_up" ? label("تحتاج متابعة", "Needs follow-up") : label("لم تُراجع", "Unreviewed");
  const user = (id: string | null, name: string | null) => id ? <InteractionButton type="button" onClick={() => onOpenUser(id)} className="min-h-11 text-start underline underline-offset-4 break-all" style={{ color: C.primary }}>{name || id.slice(0, 8)}</InteractionButton> : label("حساب محذوف", "Deleted account");
  const visibleEditing = editing && page?.account_id === accountId ? page.rows.find(r => r.id === editing.id) : null;
  return <section dir={ar ? "rtl" : "ltr"}>
    <SectionHeader title={label("مراجعة الإحالات", "Referral review")} action={<InteractionButton type="button" disabled={loading || saving} style={S.btnSec} onClick={() => { setEditing(null); void load(cursor); }}>{label("تحديث", "Refresh")}</InteractionButton>} />
    {ownerFilter && <div className="flex flex-wrap gap-3 items-center mb-4" style={{ color: C.textDim }}><span>{label("إحالات صاحب الرمز المحدّد", "Referrals from the selected code owner")}</span>{onClearOwner && <InteractionButton type="button" className="min-h-11" style={S.btnGhost} onClick={() => { setCursor(null); setHistory([]); setEditing(null); onClearOwner(); }}>{label("عرض الجميع", "Show all")}</InteractionButton>}</div>}
    <p className="text-sm mb-4" style={{ color: C.textDim }}>{label("هذه إشارات للمراجعة، وليست إثباتًا للتلاعب. يستمر احتساب الإحالات والمكافآت وفق شروط البرنامج المعتادة.", "These are review signals, not proof of abuse. Referrals and rewards continue under the usual program rules.")}</p>
    {page?.account_id === accountId && !page.program_enabled && <p className="text-sm mb-4" style={{ color: C.textDim }}>{label("برنامج الإحالة غير مفعّل حاليًا على الخادم. تظل السجلات السابقة متاحة للمراجعة.", "The referral program is currently disabled on the server. Existing records remain available for review.")}</p>}
    <label className="flex flex-wrap items-center gap-3 mb-3 text-sm">{label("تصفية هذه الصفحة", "Filter this page")}
      <select aria-label={label("سبب المراجعة", "Review reason")} value={reason} onChange={e => setReason(e.target.value as typeof reason)} style={{ ...S.input, width: "auto", maxWidth: "100%" }}>
        <option value="all">{label("جميع الحالات", "All cases")}</option>{REFERRAL_REVIEW_REASONS.map(id => <option key={id} value={id}>{names[id]}</option>)}
      </select>
    </label>
    <p className="text-xs mb-4" style={{ color: C.textFaint }}>{label("تظهر الحالات ذات الأسباب المتعددة أولًا داخل الصفحة. الأوقات بتوقيت الرياض.", "Cases with multiple reasons appear first within each page. Times are in Riyadh time.")}</p>
    {error && <div role="alert"><ErrorBanner message={error} /></div>}
    {loading ? <Loading text={label("جارٍ تحميل الحالات…", "Loading cases…")} /> : page && !rows.length ? <Empty text={label("لا توجد حالات مطابقة في هذه الصفحة.", "No matching cases on this page.")} /> : null}
    {!loading && <div className="flex flex-col gap-3">{rows.map(row => <article key={row.id} data-claim={row.id} className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
      <div className="flex flex-wrap justify-between gap-3 mb-2"><div className="min-w-0 text-sm">
        <div>{label("صاحب الرمز: ", "Code owner: ")}{user(row.owner_id, row.owner_name)}</div>
        <div>{label("المدعو: ", "Invitee: ")}{user(row.receiver_id, row.receiver_name)}</div>
      </div><div className="text-xs" style={{ color: C.textDim }}><div>{status(row)}</div><div>{review(row)}</div><time>{when(row.claimed_at)}</time></div></div>
      <div className="flex flex-wrap gap-2 mb-3">{row.evidence.families.length ? row.evidence.families.map(id => <span key={id} className="rounded-full px-3 py-1 text-xs" style={{ background: C.purpleBg, color: C.purple }}>{names[id]}</span>) : <span className="text-xs" style={{ color: C.textDim }}>{label("لم تظهر إشارات في النطاق المفحوص.", "No signals in the inspected scope.")}</span>}</div>
      {(row.evidence.related_scope_limited || row.evidence.burst_scope_limited) && <p className="text-xs mb-3" style={{ color: C.textDim }}>{label("نطاق الفحص محدود؛ عدم ظهور إشارة لا يعني اكتمال فحص جميع السجلات.", "Inspection scope is limited; no signal does not mean every record was inspected.")}</p>}
      <InteractionButton type="button" aria-expanded={visibleEditing?.id === row.id} disabled={saving} className="min-h-11 rounded-lg px-3 text-sm" style={S.btnSec} onClick={() => visibleEditing?.id === row.id ? setEditing(null) : select(row)}>{label("عرض الأدلة والمراجعة", "View evidence and review")}</InteractionButton>
      {visibleEditing?.id === row.id && <div className="mt-4 pt-4 border-t text-sm" style={{ borderColor: C.border }}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-4">
          <dt>{label("أيام الاستخدام المسجّلة", "Recorded usage days")}</dt><dd>{number(row.active_days)}</dd>
          {row.evidence.same_mailbox && <><dt>{label("حسابات تشترك في الصندوق", "Related mailbox matches")}</dt><dd>{number(row.evidence.same_mailbox.matches.length)}<div className="flex flex-wrap gap-x-3">{row.evidence.same_mailbox.matches.map(m => <span key={m.claim_id || m.user_id}>{user(m.user_id, null)}</span>)}</div></dd></>}
          {row.evidence.reciprocal && <><dt>{label("الإحالة المقابلة", "Reverse claim")}</dt><dd className="break-all" dir="ltr">{row.evidence.reciprocal.claim_id}</dd></>}
          {row.evidence.signup_burst && <><dt>{label("حسابات في العينة الزمنية", "Accounts in timing sample")}</dt><dd>{number(row.evidence.signup_burst.claim_ids.length)}{row.evidence.signup_burst.sample_limited ? "+" : ""}<div className="text-xs" style={{ color: C.textDim }}>{when(row.evidence.signup_burst.from)} — {when(row.evidence.signup_burst.to)}</div></dd></>}
        </dl>
        {row.review_updated_at && <p className="text-xs mb-3" style={{ color: C.textDim }}>{row.review_current ? label("آخر مراجعة: ", "Last review: ") : label("ظهرت أدلة مختلفة عن المراجعة السابقة: ", "Evidence differs from the previous review: ")}{when(row.review_updated_at)}</p>}
        <label className="block mb-2">{label("ملاحظة المراجعة", "Review note")}<textarea aria-label={label("ملاحظة المراجعة", "Review note")} maxLength={2000} rows={3} disabled={saving} value={note} onChange={e => { setNote(e.target.value); setSaved(false); }} style={{ ...S.input, width: "100%", marginTop: 8, resize: "vertical" }} /></label>
        {saveError && <p role="alert" className="mb-3" style={{ color: C.danger }}>{saveError}</p>}{saved && <p role="status" className="mb-3" style={{ color: C.success }}>{label("حُفظت المراجعة. يستمر الاحتساب.", "Review saved. Counting continues.")}</p>}
        <div className="flex flex-wrap gap-2"><InteractionButton type="button" disabled={saving} onClick={() => void save("reviewed")} style={S.btnPrimary}>{label("تمت المراجعة", "Mark reviewed")}</InteractionButton><InteractionButton type="button" disabled={saving} onClick={() => void save("follow_up")} style={S.btnSec}>{label("تحتاج متابعة", "Needs follow-up")}</InteractionButton></div>
      </div>}
    </article>)}</div>}
    {page && <div className="flex flex-wrap gap-3 mt-5"><InteractionButton type="button" disabled={!history.length || loading || saving} style={S.btnSec} onClick={() => { setEditing(null); setCursor(history.at(-1) || null); setHistory(h => h.slice(0, -1)); }}>{label("السابق", "Previous")}</InteractionButton><InteractionButton type="button" disabled={!page.next_cursor || loading || saving} style={S.btnSec} onClick={() => { setEditing(null); setHistory(h => [...h, cursor]); setCursor(page.next_cursor); }}>{label("التالي", "Next")}</InteractionButton></div>}
  </section>;
}
