"use client";
import { useEffect, useState } from "react";
import { ArchiveRestore, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Modal } from "./Modal";
import { InteractionButton } from "./motion/Interaction";
import { accountDataChanging, changeAccountData, readDataRecovery, type DataRecoveryState } from "@/lib/accountReset";

export interface DataRecoveryAdapter {
  accountId: string;
  read(): Promise<DataRecoveryState>;
  change(source: string | null): Promise<DataRecoveryState>;
  complete?(): void;
}
const copy = {
  ar: {
    title: "إعادة تعيين كل البيانات", description: "ابدأ من جديد، مع نسخة قابلة للاستعادة لمدة شهر.",
    coverage: "تشمل جميع الفصول والمقررات والدرجات والمهام والجداول والغياب والمخطط والتقدم والإنجازات والتخصيصات والإعدادات، إضافة إلى ملاحظات هذا الحساب وملفاته والصوتيات المحفوظة على هذا الجهاز.",
    preserved: "يبقى حساب الدخول والاشتراك وسجلات الاستحقاق والدعوات وبيانات الأعضاء الآخرين محفوظة.",
    local: "تُحفظ نسخة الملاحظات والملفات المحلية على جهازها الأصلي، وتُستعاد عليه. لا تنتقل هذه الملفات إلى جهاز آخر.",
    reset: "مسح البيانات مع حفظ نسخة", cancel: "إلغاء", working: "جارٍ حفظ النسخة وتحديث البيانات…",
    confirm: "سيُحفظ وضعك الحالي أولًا، ثم تُمسح بياناتك الشخصية من مساحة العمل. يمكنك التراجع حتى تاريخ انتهاء النسخة.",
    recovery: "نسخ الاستعادة", empty: "ستظهر هنا النسخ القابلة للاستعادة بعد إعادة التعيين.",
    restore: "استعادة", restoreTitle: "استعادة الحالة السابقة", restoreConfirm: "ستعود بياناتك إلى حالة هذه النسخة كاملة. سيُحفظ وضعك الحالي كنسخة أخرى قبل الاستعادة، ولن تُدمج الحالتان.",
    expires: "متاحة حتى", resetKind: "قبل المسح", restoreKind: "قبل الاستعادة", ready: "تم حفظ النسخة وتحديث البيانات.",
    reload: "فتح مساحة العمل المحدّثة", refresh: "إعادة المحاولة", unavailable: "خدمة إدارة البيانات غير متاحة حاليًا. أعد المحاولة لاحقًا.",
    failed: "لم تكتمل العملية. أعد فتح مساحة العمل للتحقق من الحالة قبل المحاولة مجددًا. تبقى نسخة الجهاز محفوظة عند تعذّر تأكيد النتيجة.",
    reloadError: "إعادة فتح مساحة العمل", notice: "لن تُنفّذ العملية إلا بعد تأكيدك.",
  },
  en: {
    title: "Reset all data", description: "Start fresh, with a recovery copy kept for one month.",
    coverage: "Includes every semester, course, grade, task, timetable, absence, planner entry, progress, achievement, customization and setting, plus this account’s notes/files and personal audio saved on this device.",
    preserved: "Your sign-in, subscription, entitlement and referral records, and other members’ data stay intact.",
    local: "Local notes and files are backed up and restored on their original device. They do not transfer to another device.",
    reset: "Clear data and keep a copy", cancel: "Cancel", working: "Saving a copy and updating your data…",
    confirm: "We will save your current state first, then clear your personal workspace data. You can undo this until the copy’s expiry date.",
    recovery: "Recovery copies", empty: "Available recovery copies will appear here after a reset.",
    restore: "Restore", restoreTitle: "Restore the previous state", restoreConfirm: "Your data will return to this copy’s complete state. Your current state will be saved as another copy first. The two states will not be merged.",
    expires: "Available until", resetKind: "Before reset", restoreKind: "Before restore", ready: "Your copy is saved and your data is updated.",
    reload: "Open the updated workspace", refresh: "Try again", unavailable: "Data management is unavailable right now. Please try again later.",
    failed: "The operation could not be completed. Reopen the workspace to verify its state before trying again. The device copy is retained if the result cannot be confirmed.",
    reloadError: "Reopen workspace", notice: "Nothing changes until you confirm.",
  },
};
const control = "inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50";
export function AccountDataRecovery({ adapter }: { adapter?: DataRecoveryAdapter }) {
  const { accountId } = useStore();
  const { lang } = useT(), t = copy[lang];
  const id = adapter?.accountId ?? accountId;
  const [state, setState] = useState<DataRecoveryState | null>(null);
  const [error, setError] = useState(false), [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState<null | { source: string | null }>(null);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false);
    if (!id) { setState(null); setLoading(false); return; }
    void (adapter ? adapter.read() : readDataRecovery()).then(value => { if (alive) setState(value); }, () => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, adapter, refresh]);
  const complete = () => {
    if (adapter?.complete) { adapter.complete(); setDone(false); setIntent(null); return; }
    window.location.assign("/settings/#data-recovery"); window.location.reload();
  };
  const execute = async () => {
    if (busy || !intent || !id) return;
    setBusy(true); setError(false);
    try {
      const next = adapter ? await adapter.change(intent.source) : await changeAccountData(id, intent.source);
      setState(next); setDone(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  const date = (v: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
  const available = !!id && state?.available && !loading && !busy;
  return <div id="data-recovery" className="py-3">
    <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h3 className="text-sm font-medium">{t.title}</h3><p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>{t.description}</p></div>
      <InteractionButton className={`${control} shrink-0`} style={{ color: "var(--color-danger)", background: "#FDEAEA" }} disabled={!available} onClick={() => { setIntent({ source: null }); setDone(false); setError(false); }}>
        <Trash2 size={16} className="shrink-0" /><span>{t.reset}</span>
      </InteractionButton>
    </div>
    {loading && <p className="mt-3 text-xs" role="status"><Loader2 className="inline animate-spin" size={15} /></p>}
    {!loading && (!state?.available || error && !intent) && <div className="mt-3 text-xs leading-relaxed" role="status"><p>{t.unavailable}</p><button type="button" className="mt-2 underline" onClick={() => setRefresh(n => n + 1)}>{t.refresh}</button></div>}
    {!!state?.available && <div className="mt-5 rounded-xl border p-3" style={{ borderColor: "var(--color-border)" }}>
      <h4 className="flex items-center gap-2 text-sm font-medium"><ArchiveRestore size={16} className="shrink-0" />{t.recovery}</h4>
      {!state.snapshots.length && <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>{t.empty}</p>}
      <ul className="mt-2 space-y-2">{state.snapshots.map(row => <li key={row.id} className="flex min-w-0 flex-col items-start gap-2 rounded-lg p-2 sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--color-primary-soft)" }}>
        <div className="min-w-0 text-xs leading-relaxed"><strong className="block">{row.kind === "reset" ? t.resetKind : t.restoreKind}</strong><time dateTime={row.createdAt}>{date(row.createdAt)}</time><div>{t.expires}: <time dateTime={row.expiresAt}>{date(row.expiresAt)}</time></div></div>
        <InteractionButton className={`${control} shrink-0`} disabled={!available || Date.parse(row.expiresAt) <= Date.now()} onClick={() => { setIntent({ source: row.id }); setDone(false); setError(false); }}><RotateCcw size={15} className="shrink-0" /><span>{t.restore}</span></InteractionButton>
      </li>)}</ul>
    </div>}
    <Modal open={!!intent} onClose={() => { if (!busy) { if (done || accountDataChanging()) complete(); else setIntent(null); } }} title={intent?.source ? t.restoreTitle : t.title}>
      {done ? <div className="space-y-4"><p role="status">{t.ready}</p><InteractionButton onClick={complete} className={control} style={{ background: "var(--color-primary)", color: "white" }}>{t.reload}</InteractionButton></div> : <>
        <div className="space-y-3 text-sm leading-relaxed"><p>{intent?.source ? t.restoreConfirm : t.confirm}</p><p>{t.coverage}</p><p>{t.preserved}</p><p className="text-xs" style={{ color: "var(--color-muted)" }}>{t.local}</p></div>
        {error && <div role="alert" className="mt-4 text-sm leading-relaxed" style={{ color: "var(--color-danger)" }}><p>{t.failed}</p><button type="button" className="mt-2 underline" onClick={complete}>{t.reloadError}</button></div>}
        {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="shrink-0 animate-spin" size={17} />{t.working}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <InteractionButton disabled={busy} className={`${control} border`} onClick={() => { if (accountDataChanging()) complete(); else setIntent(null); }}>{t.cancel}</InteractionButton>
          <InteractionButton disabled={busy || error} className={control} onClick={execute} style={{ background: "var(--color-danger)", color: "white" }}>{intent?.source ? t.restore : t.reset}</InteractionButton>
        </div>
      </>}
    </Modal>
  </div>;
}
