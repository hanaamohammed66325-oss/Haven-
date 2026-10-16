"use client";
import { InteractionButton } from "@/components/motion/Interaction";
import { ContentChange } from "@/components/motion/ContentChange";

// Haven Admin Dashboard — v2
// Standalone page (not wrapped in the app shell). Auth + section routing here;
// each section lives in its own file for maintainability.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, callAdmin, AdminThemeProvider, useC, useS } from "./_lib";
import { AdminSidebar, AdminTopBar, AdminMobileDrawer, BILLING_SECTIONS, type AdminSection } from "./_sidebar";
import { DashboardSection, type DashboardBadgeMetrics } from "./dashboard";
import { UsersSection } from "./users";
import { UserDetailSection } from "./user-detail";
import { InsightsSection } from "./insights";
import { ReferralReviewSection } from "./referral-review";
import { GrowthSection } from "./growth";
import { RetentionSection } from "./retention";
import { NotificationsSection } from "./notifications";
import { SubscriptionsSection } from "./subscriptions";
import { PaymentsSection } from "./payments";
import { SupportSection } from "./support";
import { CouponsSection } from "./coupons";
import { TopUsersSection } from "./top-users";
import { UniversitiesSection } from "./universities";
import { GpaChecksSection } from "./gpa-checks";
import { loadCalendarsReady } from "./university-facts";
import { AttendanceAuditSection } from "./attendance-audit";
import { AttendanceContributionsSection } from "./attendance-contributions";
import { ATTENDANCE_CALC_SUSPENDED } from "@/lib/featureFlags";
import { UniversityFactsTabs } from "./attendance-policies";
import { FeedbackSection } from "./feedback";
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
  const sessionRef = useRef<Session | null>(null);
  const accountId = session?.user.id ?? null;
  const authEpoch = useRef(0);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const calendarRequest = useRef(0);

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
    let active = true;
    let receivedEvent = false;
    const acceptSession = (s: Session | null, userUpdated = false) => {
      if (!active) return;
      const previousId = sessionRef.current?.user.id ?? null;
      const nextId = s?.user.id ?? null;
      sessionRef.current = s;
      if (previousId !== nextId) {
        authEpoch.current++;
        setAccountEpoch(authEpoch.current);
        calendarRequest.current++;
        setIsAdmin(null);
        setBadges({});
        setCalendarsReady(0);
        setSection("dashboard");
        setOpenUserId(null);
        setLoading(!!s);
      }
      // Visibility can emit SIGNED_IN with an equivalent new object. Keep the
      // latest token, but do not restart the account's admin effects.
      setSession((previous) => !userUpdated && previous?.user.id === nextId
        && previous?.access_token === s?.access_token ? previous : s);
      if (!s) setLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      receivedEvent = true;
      acceptSession(s, event === "USER_UPDATED");
    });
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      // A late initial read must not undo a newer sign-in or sign-out event.
      if (!receivedEvent) acceptSession(s);
    }).catch(() => { if (active && !receivedEvent) setLoading(false); });
    return () => { active = false; authEpoch.current++; calendarRequest.current++; subscription.unsubscribe(); };
  }, []);

  // Verify once for this signed-in account, not for a visibility/token event.
  useEffect(() => {
    const current = sessionRef.current;
    if (!accountId || current?.user.id !== accountId) return;
    let active = true;
    setLoading(true);
    callAdmin(current, "verify")
      .then((res) => { if (active) setIsAdmin(res?.ok === true); })
      .catch(() => { if (active) setIsAdmin(false); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId, accountEpoch]);

  // Reuse the overview's metrics for badges; no second request or shared cache.
  const acceptMetrics = useCallback((metrics: DashboardBadgeMetrics) => {
    if (authEpoch.current !== accountEpoch || sessionRef.current?.user.id !== accountId) return;
    setBadges({
      support: Number(metrics.open_tickets ?? 0),
      payments: Number(metrics.failed_payments ?? 0),
    });
  }, [accountId, accountEpoch]);

  // Calendar terms 5+ students confirmed, waiting for approval.
  const [calendarsReady, setCalendarsReady] = useState(0);
  const refreshCalendars = useCallback(async () => {
    if (!accountId || !isAdmin || sessionRef.current?.user.id !== accountId) return;
    const request = ++calendarRequest.current;
    const ready = await loadCalendarsReady();
    if (request === calendarRequest.current && sessionRef.current?.user.id === accountId) setCalendarsReady(ready);
  }, [accountId, accountEpoch, isAdmin]);
  useEffect(() => {
    void refreshCalendars().catch(() => {});
    return () => { calendarRequest.current++; };
  }, [refreshCalendars]);
  const previousSection = useRef(section);
  useEffect(() => {
    const leftFacts = previousSection.current === "facts" && section !== "facts";
    previousSection.current = section;
    if (leftFacts) void refreshCalendars().catch(() => {});
  }, [section, refreshCalendars]);
  // Only calendars waiting for approval count (Hanaa: the other notices were noise).
  const factsBadge = calendarsReady;
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
  const goSection = (s: AdminSection) => { setOpenUserId(null); setReviewOwner(null); setSection(s); };
  const [reviewOwner, setReviewOwner] = useState<string | null>(null);
  const openGrowthReview = (id: string) => { setReviewOwner(id); setOpenUserId(null); setSection("referral-review"); };

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
            <InteractionButton type="submit" disabled={loginLoading} style={{ ...S.btnPrimary, opacity: loginLoading ? 0.5 : 1 }}>{loginLoading ? "Signing in…" : "Sign in"}</InteractionButton>
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
          <InteractionButton onClick={handleSignOut} style={{ ...S.btnSec, padding: "8px 20px" }}>Sign out</InteractionButton>
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
          {calendarsReady > 0 && section !== "facts" && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: C.tint(C.success, "18"), border: `1px solid ${C.tint(C.success, "55")}`, color: C.text }}>
              <span className="flex-1 min-w-0">
                <b>{calendarsReady}</b> {calendarsReady > 1 ? "calendars" : "calendar"}: 5 or more students confirmed the dates. Waiting for your approval.
              </span>
              <InteractionButton onClick={() => goSection("facts")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: C.success, color: "#fff", border: "none", cursor: "pointer" }}>Open</InteractionButton>
            </div>
          )}
          <DrillProvider onOpenUser={openUser}>
          <ContentChange changeKey={`${section}:${openUserId ?? "list"}`}>
          {openUserId ? (
            <UserDetailSection session={session} userId={openUserId} onBack={closeUser} />
          ) : section === "dashboard" ? (
            <DashboardSection key={accountEpoch} session={session} showBilling={showBilling} onMetrics={acceptMetrics} onRefresh={refreshCalendars} />
          ) : section === "users" ? (
            <UsersSection session={session} onOpenUser={openUser} />
          ) : section === "insights" ? (
            <InsightsSection accountId={session.user.id} />
          ) : section === "referral-review" ? (
            <ReferralReviewSection session={session} onOpenUser={openUser} ownerFilter={reviewOwner} onClearOwner={() => setReviewOwner(null)} />
          ) : section === "growth" ? (
            <GrowthSection session={session} onOpenUser={openUser} onOpenReview={openGrowthReview} />
          ) : section === "retention" ? (
            <RetentionSection />
          ) : section === "top-users" ? (
            <TopUsersSection onOpenUser={openUser} />
          ) : section === "universities" ? (
            <UniversitiesSection />
          ) : section === "gpa-checks" ? (
            <GpaChecksSection onOpenUser={openUser} />
          ) : section === "facts" ? (
            <UniversityFactsTabs />
          ) : section === "attendance" ? (
            // While the calculation is suspended the audit (percentages) is
            // hidden and the students' contributions take its place.
            ATTENDANCE_CALC_SUSPENDED ? <AttendanceContributionsSection onOpenUser={openUser} /> : <AttendanceAuditSection onOpenUser={openUser} />
          ) : section === "notifications" ? (
            <NotificationsSection />
          ) : section === "subscriptions" ? (
            <SubscriptionsSection session={session} onOpenUser={openUser} />
          ) : section === "payments" ? (
            <PaymentsSection session={session} onOpenUser={openUser} />
          ) : section === "feedback" ? (
            <FeedbackSection />
          ) : section === "support" ? (
            <SupportSection session={session} />
          ) : section === "coupons" ? (
            <CouponsSection session={session} />
          ) : null}
          </ContentChange>
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
