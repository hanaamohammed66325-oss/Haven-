"use client";

// Haven Admin Dashboard — v2
// Standalone page (not wrapped in the app shell). Auth + section routing here;
// each section lives in its own file for maintainability.

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, callAdmin, AdminThemeProvider, useC, useS } from "./_lib";
import { AdminSidebar, AdminTopBar, AdminMobileDrawer, type AdminSection } from "./_sidebar";
import { DashboardSection } from "./dashboard";
import { UsersSection } from "./users";
import { UserDetailSection } from "./user-detail";
import { SubscriptionsSection } from "./subscriptions";
import { PaymentsSection } from "./payments";
import { SupportSection } from "./support";
import { CouponsSection } from "./coupons";

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
      <AdminSidebar current={section} onChange={goSection} session={session} onSignOut={handleSignOut} badges={badges} />
      <AdminMobileDrawer open={drawerOpen} current={section} onChange={goSection} onClose={() => setDrawerOpen(false)} session={session} onSignOut={handleSignOut} />

      <div className="flex-1 min-w-0 flex flex-col">
        <AdminTopBar current={section} onOpenMenu={() => setDrawerOpen(true)} session={session} />
        <main className="p-5 md:p-8 max-w-[1400px] w-full mx-auto">
          {openUserId ? (
            <UserDetailSection session={session} userId={openUserId} onBack={closeUser} />
          ) : section === "dashboard" ? (
            <DashboardSection session={session} />
          ) : section === "users" ? (
            <UsersSection session={session} onOpenUser={openUser} />
          ) : section === "subscriptions" ? (
            <SubscriptionsSection session={session} onOpenUser={openUser} />
          ) : section === "payments" ? (
            <PaymentsSection session={session} onOpenUser={openUser} />
          ) : section === "support" ? (
            <SupportSection session={session} />
          ) : section === "coupons" ? (
            <CouponsSection session={session} />
          ) : null}
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
