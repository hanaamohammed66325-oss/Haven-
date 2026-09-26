"use client";

// Haven Admin Dashboard — v2
// Standalone page (not wrapped in the app shell). Auth + section routing here;
// each section lives in its own file for maintainability.

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, callAdmin, AdminThemeProvider, useC, useS } from "./_lib";
import { AdminSidebar, AdminTopBar, AdminMobileDrawer, BILLING_SECTIONS, type AdminSection } from "./_sidebar";
import { DashboardSection } from "./dashboard";
import { UsersSection } from "./users";
import { UserDetailSection } from "./user-detail";
import { InsightsSection } from "./insights";
import { RetentionSection } from "./retention";
import { NotificationsSection } from "./notifications";
import { SubscriptionsSection } from "./subscriptions";
import { PaymentsSection } from "./payments";
import { SupportSection } from "./support";
import { CouponsSection } from "./coupons";
import { TopUsersSection } from "./top-users";
import { UniversitiesSection } from "./universities";
import { GradeTablesSection } from "./grade-tables";
import { GpaChecksSection } from "./gpa-checks";
import { loadCalendarsReady, loadFactsCoverage } from "./university-facts";
import { AttendanceAuditSection } from "./attendance-audit";
import { UniversityFactsTabs, loadCrowdReview } from "./attendance-policies";
import { DrillProvider } from "./_drill";

const BILLING_PREF_KEY = "haven_admin_show_billing";

export default function AdminPageWrapper() {
  return (
    <AdminThemeProvider>
      <AdminPage />
    </AdminThemeProvider>
  );
}

function AdminPage() {
  const C = useC();
  const S = useS();
  // ---- Auth ----
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // ---- Login form ----
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // ---- Navigation ----
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  // Paid-subscription sections are hidden by default (pre-launch); toggle persists
  // per-device. Kept out of the DB so it's an instant, admin-only preference.
  const [showBilling, setShowBilling] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(BILLING_PREF_KEY) === "1") setShowBilling(true); } catch { /* ignore */ }
  }, []);
  const toggleBilling = useCallback(() => {
    setShowBilling((prev) => {
      const next = !prev;
      try { localStorage.setItem(BILLING_PREF_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);
  // If billing gets hidden while viewing a billing section, fall back to dashboard.
  useEffect(() => {
    if (!showBilling && BILLING_SECTIONS.has(section)) setSection("dashboard");
  }, [showBilling, section]);

  // Sidebar badges (open tickets, failed payments)
  const [badges, setBadges] = useState<Partial<Record<AdminSection, number>>>({});

  // ---- Auth lifecycle ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) { setLoading(false); setIsAdmin(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Verify admin when session changes
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    callAdmin(session, "verify")
      .then((res) => setIsAdmin(res?.ok === true))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, [session]);

  // Load quick badges from dashboard metrics (once we're admin)
  const refreshBadges = useCallback(async () => {
    if (!session || !isAdmin) return;
    const res = await callAdmin(session, "dashboard_metrics");
    if (res?.ok) {
      setBadges({
        support: Number(res.metrics?.open_tickets ?? 0),
        payments: Number(res.metrics?.failed_payments ?? 0),
      });
    }
  }, [session, isAdmin]);
  useEffect(() => { void refreshBadges(); }, [refreshBadges, section]);

  // Universities still missing their official calendar for this academic year —
  // a banner on every admin visit + a badge on "University facts" until done.
  const [factsGap, setFactsGap] = useState<{ missing: number; review: number } | null>(null);
  const [factsBannerHidden, setFactsBannerHidden] = useState(false);
  const refreshFactsGap = useCallback(async () => {
    if (!session || !isAdmin) return;
    const cov = await loadFactsCoverage();
    if (cov) setFactsGap({ missing: cov.missing.length, review: cov.review });
  }, [session, isAdmin]);
  useEffect(() => { void refreshFactsGap(); }, [refreshFactsGap, section]);
  // Universities where 3+ students say the rule or the calendar is different.
  const [crowdReview, setCrowdReview] = useState<string[]>([]);
  // Calendar terms 5+ students confirmed, waiting for approval.
  const [calendarsReady, setCalendarsReady] = useState(0);
  useEffect(() => {
    if (!session || !isAdmin) return;
    void loadCrowdReview().then(setCrowdReview);
    void loadCalendarsReady().then(setCalendarsReady);
  }, [session, isAdmin, section]);
  const factsBadge = (factsGap?.missing ?? 0) + crowdReview.length + calendarsReady;
  const allBadges = { ...badges, ...(factsBadge ? { facts: factsBadge } : {}) };

  // ---- Handlers ----
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(""); setLoginLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) setLoginError(error.message);
    setLoginLoading(false);
  };
  const handleSignOut = async () => { await supabase.auth.signOut(); };
  const openUser = (id: string) => setOpenUserId(id);
  const closeUser = () => setOpenUserId(null);
  const goSection = (s: AdminSection) => { setOpenUserId(null); setSection(s); };

  // ---- Render: loading ----
  if (loading) {
    return (
      <Screen>
        <span className="text-sm" style={{ color: C.textDim }}>Loading…</span>
      </Screen>
    );
  }

  // ---- Render: login ----
  if (!session) {
    return (
      <Screen>
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="text-2xl font-semibold mb-1" style={{ color: C.text }}>Haven Admin</div>
            <div className="text-sm" style={{ color: C.textDim }}>Sign in to access the dashboard</div>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input type="email" required placeholder="Admin email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={S.input} />
            <input type="password" required placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={S.input} />
            {loginError && <p className="text-sm" style={{ color: C.danger }}>{loginError}</p>}
            <button type="submit" disabled={loginLoading} style={{ ...S.btnPrimary, opacity: loginLoading ? 0.5 : 1 }}>{loginLoading ? "Signing in…" : "Sign in"}</button>
          </form>
        </div>
      </Screen>
    );
  }

  // ---- Render: access denied ----
  if (isAdmin === false) {
    return (
      <Screen>
        <div className="text-center">
          <div className="text-xl font-semibold mb-2" style={{ color: C.text }}>Access denied</div>
          <div className="text-sm mb-6" style={{ color: C.textDim }}>{session.user.email} is not an admin account.</div>
          <button onClick={handleSignOut} style={{ ...S.btnSec, padding: "8px 20px" }}>Sign out</button>
        </div>
      </Screen>
    );
  }

  // ---- Render: dashboard ----
  return (
    <div dir="ltr" className="min-h-dvh flex" style={{ background: C.bg, color: C.text, fontFamily: "'Inter', 'Tajawal', sans-serif", "--admin-hover": C.mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" } as React.CSSProperties}>
      <style>{`.admin-hover-row:hover{background:var(--admin-hover)!important}`}</style>
      <AdminSidebar current={section} onChange={goSection} session={session} onSignOut={handleSignOut} badges={allBadges} showBilling={showBilling} onToggleBilling={toggleBilling} />
      <AdminMobileDrawer open={drawerOpen} current={section} onChange={goSection} onClose={() => setDrawerOpen(false)} session={session} onSignOut={handleSignOut} badges={allBadges} showBilling={showBilling} onToggleBilling={toggleBilling} />

      <div className="flex-1 min-w-0 flex flex-col">
        <AdminTopBar current={section} onOpenMenu={() => setDrawerOpen(true)} session={session} />
        <main className="p-5 md:p-8 max-w-[1400px] w-full mx-auto">
          {crowdReview.length > 0 && section !== "facts" && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: C.tint(C.danger, "18"), border: `1px solid ${C.tint(C.danger, "55")}`, color: C.text }}>
              <span className="flex-1 min-w-0">
                <b>{crowdReview.length}</b> {crowdReview.length > 1 ? "universities" : "university"}: 3 or more students say the absence rule or the calendar is different. Review them.
              </span>
              <button onClick={() => goSection("facts")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: C.danger, color: "#fff", border: "none", cursor: "pointer" }}>Review</button>
            </div>
          )}
          {calendarsReady > 0 && section !== "facts" && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: C.tint(C.success, "18"), border: `1px solid ${C.tint(C.success, "55")}`, color: C.text }}>
              <span className="flex-1 min-w-0">
                <b>{calendarsReady}</b> {calendarsReady > 1 ? "calendars" : "calendar"}: 5 or more students confirmed the dates. Waiting for your approval.
              </span>
              <button onClick={() => goSection("facts")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: C.success, color: "#fff", border: "none", cursor: "pointer" }}>Open</button>
            </div>
          )}
          {factsGap && factsGap.missing > 0 && !factsBannerHidden && section !== "facts" && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: C.tint(C.warning, "22"), border: `1px solid ${C.tint(C.warning, "55")}`, color: C.text }}>
              <span className="flex-1 min-w-0">
                <b>{factsGap.missing}</b> universities have no approved official calendar for this academic year
                {factsGap.review > 0 && <> · <b>{factsGap.review}</b> prepared facts are waiting for your approval</>}.
              </span>
              <button onClick={() => goSection("facts")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: C.primary, color: "#fff", border: "none", cursor: "pointer" }}>Open University facts</button>
              <button onClick={() => setFactsBannerHidden(true)} aria-label="Dismiss" className="rounded-lg px-2 py-1 text-[12px]" style={{ background: "transparent", color: C.textMuted, border: "none", cursor: "pointer" }}>✕</button>
            </div>
          )}
          <DrillProvider onOpenUser={openUser}>
          {openUserId ? (
            <UserDetailSection session={session} userId={openUserId} onBack={closeUser} />
          ) : section === "dashboard" ? (
            <DashboardSection session={session} showBilling={showBilling} />
          ) : section === "users" ? (
            <UsersSection session={session} onOpenUser={openUser} />
          ) : section === "insights" ? (
            <InsightsSection />
          ) : section === "retention" ? (
            <RetentionSection />
          ) : section === "top-users" ? (
            <TopUsersSection onOpenUser={openUser} />
          ) : section === "universities" ? (
            <UniversitiesSection />
          ) : section === "grade-tables" ? (
            <GradeTablesSection />
          ) : section === "gpa-checks" ? (
            <GpaChecksSection onOpenUser={openUser} />
          ) : section === "facts" ? (
            <UniversityFactsTabs />
          ) : section === "attendance" ? (
            <AttendanceAuditSection onOpenUser={openUser} />
          ) : section === "notifications" ? (
            <NotificationsSection />
          ) : section === "subscriptions" ? (
            <SubscriptionsSection session={session} onOpenUser={openUser} />
          ) : section === "payments" ? (
            <PaymentsSection session={session} onOpenUser={openUser} />
          ) : section === "support" ? (
            <SupportSection session={session} />
          ) : section === "coupons" ? (
            <CouponsSection session={session} />
          ) : null}
          </DrillProvider>
        </main>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  const C = useC();
  return (
    <div dir="ltr" className="haven-safe-top min-h-dvh flex items-center justify-center p-4" style={{ background: C.bg, fontFamily: "'Inter', 'Tajawal', sans-serif" }}>
      {children}
    </div>
  );
}
