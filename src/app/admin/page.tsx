"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin-api`;

// ---- Types ----
type Tab = "stats" | "users" | "coupons";

interface Stats {
  total_users: number;
  new_users_7d: number;
  active_subs: number;
  subs_by_status: Record<string, number>;
  estimated_revenue_month: number;
  push_subscriptions: number;
  total_coupon_uses: number;
}

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in: string | null;
  subscription: {
    status: string;
    billing_cycle: string;
    trial_ends_at: string | null;
    amount_sar: number;
    coupon_code: string | null;
    discount_percent: number | null;
  } | null;
}

interface Coupon {
  id: string;
  code: string;
  percent_off: number;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

// ---- Helpers ----
async function callAdmin(
  session: Session,
  action: string,
  params: Record<string, unknown> = {}
) {
  const res = await fetch(ADMIN_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action, ...params }),
  });
  return res.json().catch(() => ({}));
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}

// ---- Main Page ----
export default function AdminPage() {
  // Auth
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Dashboard
  const [tab, setTab] = useState<Tab>("stats");

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Users
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [userTotal, setUserTotal] = useState(0);

  // Coupons
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newPercent, setNewPercent] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpires, setNewExpires] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // ---- Auth lifecycle ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (!s) { setLoading(false); setIsAdmin(null); }
      }
    );
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

  // ---- Data loaders ----
  const loadStats = useCallback(async () => {
    if (!session) return;
    setStatsLoading(true);
    const res = await callAdmin(session, "stats").catch(() => null);
    if (res?.ok) setStats(res as Stats);
    setStatsLoading(false);
  }, [session]);

  const loadUsers = useCallback(
    async (search = userSearch) => {
      if (!session) return;
      setUsersLoading(true);
      const res = await callAdmin(session, "users", { search, offset: 0 }).catch(() => null);
      if (res?.ok) { setUsers(res.users); setUserTotal(res.total ?? 0); }
      setUsersLoading(false);
    },
    [session, userSearch]
  );

  const loadCoupons = useCallback(async () => {
    if (!session) return;
    setCouponsLoading(true);
    const res = await callAdmin(session, "coupons_list").catch(() => null);
    if (res?.ok) setCoupons(res.coupons ?? []);
    setCouponsLoading(false);
  }, [session]);

  // Load data when tab or admin status changes
  useEffect(() => {
    if (!isAdmin) return;
    if (tab === "stats") void loadStats();
    if (tab === "users") void loadUsers("");
    if (tab === "coupons") void loadCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin]);

  // ---- Handlers ----
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) setLoginError(error.message);
    setLoginLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleCouponToggle = async (coupon: Coupon) => {
    if (!session) return;
    const res = await callAdmin(session, "coupon_toggle", {
      id: coupon.id,
      active: !coupon.active,
    });
    if (res?.ok) {
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, active: !c.active } : c))
      );
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setCreateError("");
    setCreateLoading(true);
    const res = await callAdmin(session, "coupon_create", {
      code: newCode.trim().toUpperCase(),
      percent_off: Number(newPercent),
      max_uses: newMaxUses ? Number(newMaxUses) : null,
      expires_at: newExpires || null,
    });
    if (res?.ok) {
      setCoupons((prev) => [res.coupon, ...prev]);
      setNewCode(""); setNewPercent(""); setNewMaxUses(""); setNewExpires("");
    } else {
      setCreateError(res?.error ?? "Failed to create coupon");
    }
    setCreateLoading(false);
  };

  // ---- Render: loading ----
  if (loading) {
    return (
      <Screen>
        <span className="text-sm" style={{ color: "#64748b" }}>Loading…</span>
      </Screen>
    );
  }

  // ---- Render: login ----
  if (!session) {
    return (
      <Screen>
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="text-2xl font-semibold mb-1" style={{ color: "#f1f5f9" }}>
              Haven Admin
            </div>
            <div className="text-sm" style={{ color: "#64748b" }}>
              Sign in to access the dashboard
            </div>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Admin email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              style={inputStyle}
            />
            {loginError && (
              <p className="text-sm" style={{ color: "#f87171" }}>{loginError}</p>
            )}
            <button type="submit" disabled={loginLoading} style={btnPrimaryStyle}>
              {loginLoading ? "Signing in…" : "Sign in"}
            </button>
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
          <div className="text-xl font-semibold mb-2" style={{ color: "#f1f5f9" }}>
            Access denied
          </div>
          <div className="text-sm mb-6" style={{ color: "#64748b" }}>
            {session.user.email} is not an admin account.
          </div>
          <button onClick={handleSignOut} style={{ ...btnSecStyle, padding: "8px 20px" }}>
            Sign out
          </button>
        </div>
      </Screen>
    );
  }

  // ---- Render: full dashboard ----
  return (
    <div
      dir="ltr"
      className="min-h-screen"
      style={{ background: "#0f172a", color: "#f1f5f9", fontFamily: "'Inter', 'Tajawal', sans-serif" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b flex items-center justify-between px-6 py-4"
        style={{ background: "#0a0f1e", borderColor: "#1e293b" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[17px] font-bold" style={{ color: "#f1f5f9" }}>
            🏠 Haven Admin
          </span>
          <span
            className="hidden sm:inline rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: "#1d4ed8", color: "#bfdbfe" }}
          >
            {session.user.email}
          </span>
        </div>
        <button onClick={handleSignOut} style={{ ...btnSecStyle, fontSize: 13 }}>
          Sign out
        </button>
      </header>

      {/* Tab nav */}
      <div className="border-b px-6" style={{ borderColor: "#1e293b" }}>
        <nav className="flex gap-0 -mb-px">
          {([
            { id: "stats", label: "📊 Stats" },
            { id: "users", label: "👥 Users" },
            { id: "coupons", label: "🏷️ Coupons" },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="px-5 py-3 text-[13px] font-medium border-b-2 transition-colors"
              style={{
                borderColor: tab === id ? "#3b82f6" : "transparent",
                color: tab === id ? "#60a5fa" : "#64748b",
                background: "transparent",
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <main className="p-6 max-w-7xl mx-auto">

        {/* ========== STATS ========== */}
        {tab === "stats" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-[18px] font-semibold">Overview</h1>
              <button
                onClick={() => void loadStats()}
                disabled={statsLoading}
                style={{ ...btnSecStyle, fontSize: 12 }}
              >
                {statsLoading ? "Loading…" : "↻ Refresh"}
              </button>
            </div>

            {statsLoading && !stats ? (
              <p style={{ color: "#64748b" }}>Loading stats…</p>
            ) : stats ? (
              <div className="flex flex-col gap-4">
                {/* Row 1 — users */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total users" value={stats.total_users} />
                  <StatCard label="New this week" value={stats.new_users_7d} accent="#3b82f6" />
                  <StatCard label="Push devices" value={stats.push_subscriptions} />
                  <StatCard label="Coupon uses" value={stats.total_coupon_uses} />
                </div>

                {/* Row 2 — subscriptions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Active subs" value={stats.active_subs} accent="#10b981" />
                  <StatCard label="Trial" value={stats.subs_by_status?.["trial"] ?? 0} />
                  <StatCard label="Paid active" value={stats.subs_by_status?.["active"] ?? 0} />
                  <StatCard label="Pending 3DS" value={stats.subs_by_status?.["pending_3ds"] ?? 0} />
                </div>

                {/* Row 3 — revenue */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Est. revenue this month"
                    value={`${stats.estimated_revenue_month} SAR`}
                    accent="#f59e0b"
                    wide
                  />
                </div>
              </div>
            ) : (
              <p style={{ color: "#64748b" }}>No data available.</p>
            )}
          </div>
        )}

        {/* ========== USERS ========== */}
        {tab === "users" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h1 className="text-[18px] font-semibold">
                Users
                {userTotal > 0 && (
                  <span className="ms-2 text-[14px] font-normal" style={{ color: "#64748b" }}>
                    ({userTotal.toLocaleString()})
                  </span>
                )}
              </h1>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search by email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void loadUsers(userSearch);
                  }}
                  style={{ ...inputStyle, width: 240, fontSize: 13 }}
                />
                <button
                  onClick={() => void loadUsers(userSearch)}
                  disabled={usersLoading}
                  style={{ ...btnPrimaryStyle, padding: "8px 16px", fontSize: 13 }}
                >
                  Search
                </button>
              </div>
            </div>

            {usersLoading ? (
              <p style={{ color: "#64748b" }}>Loading users…</p>
            ) : (
              <div
                className="overflow-x-auto rounded-xl border"
                style={{ borderColor: "#1e293b" }}
              >
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e293b" }}>
                      {["Email", "Joined", "Last seen", "Plan", "Status", "Amount (SAR)", "Coupon"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wide"
                          style={{ color: "#475569", background: "#0a0f1e" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center"
                          style={{ color: "#475569" }}
                        >
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr
                          key={u.id}
                          style={{ borderBottom: "1px solid #1e293b" }}
                          className="transition-colors hover:bg-[#111827]"
                        >
                          <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                            {u.email}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#64748b" }}>
                            {fmt(u.created_at)}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#64748b" }}>
                            {u.last_sign_in ? fmt(u.last_sign_in) : "—"}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#94a3b8" }}>
                            {u.subscription?.billing_cycle ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {u.subscription ? (
                              <SubBadge status={u.subscription.status} />
                            ) : (
                              <span style={{ color: "#334155" }}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#94a3b8" }}>
                            {u.subscription ? u.subscription.amount_sar : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {u.subscription?.coupon_code ? (
                              <span
                                className="rounded px-1.5 py-0.5 text-[11px] font-mono"
                                style={{ background: "#1e1b4b", color: "#a5b4fc" }}
                              >
                                {u.subscription.coupon_code} −{u.subscription.discount_percent}%
                              </span>
                            ) : (
                              <span style={{ color: "#334155" }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========== COUPONS ========== */}
        {tab === "coupons" && (
          <div>
            <h1 className="text-[18px] font-semibold mb-5">Coupons</h1>

            {/* Create form */}
            <div
              className="rounded-xl border p-5 mb-6"
              style={{ borderColor: "#1e293b", background: "#0a0f1e" }}
            >
              <h2 className="text-[14px] font-semibold mb-4" style={{ color: "#cbd5e1" }}>
                Create coupon
              </h2>
              <form onSubmit={handleCreateCoupon}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label style={labelStyle}>Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="SAVE20"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Discount % *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      placeholder="20"
                      value={newPercent}
                      onChange={(e) => setNewPercent(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Max uses</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Unlimited"
                      value={newMaxUses}
                      onChange={(e) => setNewMaxUses(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Expires</label>
                    <input
                      type="date"
                      value={newExpires}
                      onChange={(e) => setNewExpires(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
                {createError && (
                  <p className="text-[12px] mb-3" style={{ color: "#f87171" }}>{createError}</p>
                )}
                <button type="submit" disabled={createLoading} style={btnPrimaryStyle}>
                  {createLoading ? "Creating…" : "Create coupon"}
                </button>
              </form>
            </div>

            {/* Coupons table */}
            {couponsLoading ? (
              <p style={{ color: "#64748b" }}>Loading coupons…</p>
            ) : (
              <div
                className="overflow-x-auto rounded-xl border"
                style={{ borderColor: "#1e293b" }}
              >
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e293b" }}>
                      {["Code", "Discount", "Used / Max", "Expires", "Created", "Status", ""].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wide"
                          style={{ color: "#475569", background: "#0a0f1e" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center"
                          style={{ color: "#475569" }}
                        >
                          No coupons yet. Create one above.
                        </td>
                      </tr>
                    ) : (
                      coupons.map((c) => (
                        <tr
                          key={c.id}
                          style={{
                            borderBottom: "1px solid #1e293b",
                            opacity: c.active ? 1 : 0.45,
                          }}
                        >
                          <td className="px-4 py-3 font-mono font-bold" style={{ color: "#e2e8f0" }}>
                            {c.code}
                          </td>
                          <td className="px-4 py-3 font-semibold" style={{ color: "#6ee7b7" }}>
                            {c.percent_off}%
                          </td>
                          <td className="px-4 py-3" style={{ color: "#94a3b8" }}>
                            {c.uses_count} / {c.max_uses ?? "∞"}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#94a3b8" }}>
                            {c.expires_at ? fmt(c.expires_at) : "Never"}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#64748b" }}>
                            {fmt(c.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                              style={{
                                background: c.active ? "#14532d" : "#1e293b",
                                color: c.active ? "#86efac" : "#475569",
                              }}
                            >
                              {c.active ? "Active" : "Disabled"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => void handleCouponToggle(c)}
                              className="text-[12px] px-3 py-1.5 rounded-lg font-medium transition-colors"
                              style={{
                                background: "#1e293b",
                                color: c.active ? "#f87171" : "#4ade80",
                              }}
                            >
                              {c.active ? "Disable" : "Enable"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ---- Sub-components ----
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0f172a" }}
      dir="ltr"
    >
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  wide,
}: {
  label: string;
  value: number | string;
  accent?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${wide ? "md:col-span-2" : ""}`}
      style={{
        borderColor: accent ? `${accent}44` : "#1e293b",
        background: accent ? `${accent}11` : "#0a0f1e",
      }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-wide mb-3"
        style={{ color: "#64748b" }}
      >
        {label}
      </div>
      <div
        className="text-[30px] font-bold leading-none tabular-nums"
        style={{ color: accent ?? "#f1f5f9" }}
      >
        {typeof value === "number" ? value.toLocaleString("en") : value}
      </div>
    </div>
  );
}

function SubBadge({ status }: { status: string }) {
  const colours: Record<string, { bg: string; fg: string }> = {
    trial: { bg: "#172554", fg: "#93c5fd" },
    active: { bg: "#14532d", fg: "#86efac" },
    pending_3ds: { bg: "#2d1b69", fg: "#c4b5fd" },
  };
  const { bg, fg } = colours[status] ?? { bg: "#1e293b", fg: "#94a3b8" };
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {status}
    </span>
  );
}

// ---- Style tokens ----
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 10,
  color: "#f1f5f9",
  fontSize: 14,
  outline: "none",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "#1e293b",
  color: "#94a3b8",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#475569",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
