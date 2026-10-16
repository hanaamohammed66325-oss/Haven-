"use client";
import { InteractionButton } from "@/components/motion/Interaction";

import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/i18n";
import type { DiscoverySource, ReferralError } from "@/lib/referrals";
import type { useReferralProgram } from "./useReferralProgram";
import { pendingReferralInvite, clearReferralInvite } from "@/lib/referralInvite";

const messages: Record<ReferralError, [string, string]> = {
  source_required: ["اختر كيف عرفت Haven.", "Choose how you heard about Haven."],
  invalid_code: ["رمز الإحالة غير صالح. تحقق منه وأعد المحاولة.", "This referral code is invalid. Check it and try again."],
  own_code: ["لا يمكن استخدام رمز الإحالة الخاص بك.", "You cannot use your own referral code."],
  already_claimed: ["سبق اعتماد رمز إحالة لهذا الحساب، ولا يمكن تغييره.", "This account already has a referral code and cannot change it."],
  not_eligible: ["رمز الإحالة مخصص للحسابات الجديدة.", "Referral codes are available for new accounts."],
  rate_limited: ["بلغت الحد المسموح للمحاولات. حاول لاحقًا.", "Too many attempts. Try again later."],
  source_locked: ["سبق حفظ إجابتك عن مصدر التعرف على Haven.", "Your discovery source has already been saved."],
  unavailable: ["تفعيل رموز الإحالة غير متاح حاليًا.", "Referral activation is currently unavailable."],
  network: ["تعذّر حفظ الإجابة. تحقق من الاتصال وأعد المحاولة.", "Could not save your answer. Check your connection and try again."],
  account_changed: ["تغيّر الحساب المسجّل. أعد فتح الصفحة.", "The signed-in account changed. Reopen this page."],
};

export function ReferralSourceForm({ program, onSaved, onSkip, autoFocus = false }: {
  program: ReturnType<typeof useReferralProgram>;
  onSaved?: () => void;
  onSkip?: () => void;
  autoFocus?: boolean;
}) {
  const { lang } = useT(), ar = lang === "ar", id = useId();
  const [source, setSource] = useState<DiscoverySource | "">(""), [code, setCode] = useState("");
  const [error, setError] = useState<ReferralError | null>(null), [saved, setSaved] = useState(false);
  const accountRef = useRef(program.accountId);
  accountRef.current = program.accountId;
  const profile = program.profile;
  useEffect(() => { setSource(""); setCode(pendingReferralInvite() || ""); setError(null); setSaved(false); }, [program.accountId]);
  useEffect(() => { if (profile?.source) setSource(profile.source); if (profile?.claimedCode) { setCode(""); clearReferralInvite(); } }, [program.accountId, profile?.source, profile?.claimedCode]);
  const busy = program.busy || program.phase === "loading";
  const bound = !!profile?.claimedCode;
  const field = "w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-[var(--color-primary)]";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaved(false);
    if (!source) { setError("source_required"); return; }
    const account = program.accountId;
    const result = await program.controller?.submit({ source, code: bound ? "" : code });
    if (accountRef.current !== account) return;
    if (!result) { setError("unavailable"); return; }
    if (!result.ok) { setError(result.error); return; }
    if (result.profile.claimedCode) clearReferralInvite();
    setSaved(true); onSaved?.();
  };
  const skip = async () => {
    setError(null); const account = program.accountId;
    const result = await program.controller?.submit({ skip: true });
    if (accountRef.current !== account) return;
    if (!result) { setError("unavailable"); return; }
    if (!result.ok) { setError(result.error); return; }
    onSkip?.();
  };
  return (
    <form onSubmit={submit} className="space-y-4" aria-label={ar ? "كيف عرفت Haven؟" : "How did you hear about Haven?"}>
      <div>
        <label htmlFor={id + "-source"} className="block text-sm font-semibold mb-2" style={{ color: "var(--color-ink)" }}>{ar ? "كيف عرفت Haven؟" : "How did you hear about Haven?"}</label>
        <select id={id + "-source"} className={field} style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }} value={source}
          autoFocus={autoFocus} disabled={busy || !!profile?.source} onChange={e => { setSource(e.target.value as DiscoverySource | ""); setError(null); setSaved(false); }}>
          <option value="">{ar ? "اختر المصدر" : "Choose a source"}</option>
          <option value="friend">{ar ? "عن طريق صديق" : "A friend"}</option>
          <option value="social">{ar ? "عبر وسائل التواصل" : "Social media"}</option>
        </select>
      </div>
      {bound ? <div className="rounded-xl px-3.5 py-3 text-sm" style={{ background: "var(--color-primary-soft)", color: "var(--color-ink)" }} role="status">
        <span className="block mb-1">{ar ? "رمز الإحالة المرتبط بحسابك" : "Your linked referral code"}</span>
        <bdi dir="ltr" className="font-semibold">{profile.claimedCode}</bdi>
        <p className="text-xs mt-2 leading-relaxed">{profile.status === "active"
          ? ar ? "احتُسبت الدعوة لصاحب الرمز." : "The referral has been counted for its owner."
          : profile.status === "expired" ? ar ? "لم تكتمل الدعوة." : "The referral was not completed."
          : profile.status === "owner_removed" ? ar ? "سبق ربط الحساب بهذا الرمز." : "This account was previously linked to this code."
            : ar ? "اعتُمد رمز الإحالة، وتُحتسب الدعوة لصاحبه عند تفاعلك مع Haven." : "Referral code applied. It counts for its owner once you engage with Haven."}</p>
      </div> : <div>
        <label htmlFor={id + "-code"} className="block text-sm font-medium mb-2" style={{ color: "var(--color-ink)" }}>{ar ? "رمز الإحالة — اختياري" : "Referral code — optional"}</label>
        <input id={id + "-code"} className={field} style={{ borderColor: error === "invalid_code" || error === "own_code" ? "var(--color-danger)" : "var(--color-border)", color: "var(--color-ink)" }} dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          placeholder="HVN-0123456789" value={code} maxLength={24} disabled={busy || (profile?.available && !profile.eligible)} onChange={e => { setCode(e.target.value); setError(null); setSaved(false); }} aria-describedby={id + "-hint"} />
        <p id={id + "-hint"} className="text-xs leading-relaxed mt-2" style={{ color: "var(--color-muted)" }}>{profile?.available && !profile.eligible
          ? ar ? "رمز الإحالة مخصص للحسابات الجديدة." : "Referral codes are available for new accounts."
          : ar ? "إذا كان لديك رمز إحالة، أضفه هنا. لا يمكن تغيير الرمز بعد اعتماده." : "Enter a referral code here. An accepted code cannot be changed."}</p>
      </div>}
      {error && <p role="alert" className="text-sm leading-relaxed" style={{ color: "var(--color-danger)" }}>{messages[error][ar ? 0 : 1]}</p>}
      {saved && <p role="status" className="text-sm" style={{ color: "var(--color-success)" }}>{ar ? "تم حفظ إجابتك." : "Your answer has been saved."}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <InteractionButton type="submit" disabled={busy} className="haven-btn min-h-11 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">{busy ? ar ? "جارٍ الحفظ…" : "Saving…" : code && !bound ? ar ? "اعتماد الرمز" : "Apply code" : ar ? "حفظ" : "Save"}</InteractionButton>
        {onSkip && <InteractionButton type="button" disabled={busy} onClick={() => void skip()} className="min-h-11 px-3 py-2 text-sm" style={{ color: "var(--color-muted)" }}>{ar ? "تخطي" : "Skip"}</InteractionButton>}
        {program.phase === "error" && <InteractionButton type="button" disabled={busy} onClick={() => void program.controller?.load()} className="min-h-11 px-3 py-2 text-sm" style={{ color: "var(--color-primary)" }}>{ar ? "إعادة المحاولة" : "Try again"}</InteractionButton>}
      </div>
    </form>
  );
}
