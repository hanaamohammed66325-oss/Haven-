"use client";

// Notifications diagnostics — who enabled notifications and which kinds actually
// reached them (lectures / planner / exams / attendance). Reads the guarded
// admin_notification_stats() directly via supabase.rpc.

import { useCallback, useEffect, useState } from "react";
import { supabase, useC, useS, StatCard, SectionHeader, Loading, ErrorBanner } from "./_lib";

interface Group { sent: number; users: number }
interface NotifUser {
  email: string; devices: number; prefs_on: boolean;
  delivered: number; lectures: number; planner_tasks: number; exams: number; attendance: number;
}
interface NotifStats {
  funnel: { touched_settings: number; have_subscription: number; both: number; touched_no_sub: number; sub_no_prefs: number };
  subscriptions: { rows: number; devices: number; users: number; ios: number };
  delivered_total: number; delivered_users: number;
  by_group: Record<string, Group>;
  by_kind: { kind: string; sent: number; users: number }[];
  scheduled: { total: number; sent: number; pending: number };
  pomodoro: { completions: number; users: number; note: string };
  users: NotifUser[];
}

const GROUP_LABEL: Record<string, string> = {
  lectures: "Lectures", planner_tasks: "Planner / tasks", exams: "Exams", attendance: "Attendance", other: "Other",
};

export function NotificationsSection() {
  const C = useC();
  const S = useS();
  const [stats, setStats] = useState<NotifStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase.rpc("admin_notification_stats");
    if (error) setError(error.message);
    else setStats(data as NotifStats);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading && !stats) return <Loading text="Loading notifications…" />;

  const groups = ["lectures", "planner_tasks", "exams", "attendance", "other"];

  return (
    <div>
      <SectionHeader
        title="Notifications"
        action={
          <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {stats && (
        <div className="flex flex-col gap-6">
          {/* Funnel */}
          <div>
            <SubHead text="Enablement funnel" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Opened settings" value={stats.funnel.touched_settings} />
              <StatCard label="Have a device" value={stats.funnel.have_subscription} accent={C.success} />
              <StatCard label="Enabled + device" value={stats.funnel.both} accent={C.primary} />
              <StatCard label="Enabled, no device" value={stats.funnel.touched_no_sub} accent={stats.funnel.touched_no_sub > 0 ? C.danger : undefined} sub="tried but can't receive" />
              <StatCard label="Device, no settings" value={stats.funnel.sub_no_prefs} />
            </div>
            {stats.funnel.touched_no_sub > 0 && (
              <p className="text-[12px] mt-2" style={{ color: C.textFaint }}>
                “Enabled, no device” = users who turned notifications on but have no live push subscription — almost always iPhone users in Safari who didn’t add Haven to the Home Screen (iOS web push requires install).
              </p>
            )}
          </div>

          {/* Delivered by type */}
          <div>
            <SubHead text="Delivered notifications by type" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {groups.map((g) => (
                <StatCard key={g} label={GROUP_LABEL[g]} value={stats.by_group[g]?.sent ?? 0} sub={`${stats.by_group[g]?.users ?? 0} users`} />
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <StatCard label="Total delivered" value={stats.delivered_total} accent={C.success} sub={`${stats.delivered_users} users reached`} />
              <StatCard label="Scheduled (queued)" value={stats.scheduled.total} sub={`${stats.scheduled.sent} sent · ${stats.scheduled.pending} pending`} />
              <StatCard label="Live devices" value={stats.subscriptions.devices} sub={`${stats.subscriptions.users} users · ${stats.subscriptions.ios} iOS`} />
              <StatCard label="Pomodoro sessions" value={stats.pomodoro.completions} sub={`${stats.pomodoro.users} users · no push type`} />
            </div>
          </div>

          {/* Per-user breakdown */}
          <div>
            <SubHead text="Who enabled — and what reached them" />
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    {["User", "Devices", "Settings", "Delivered", "Lectures", "Planner", "Exams", "Attendance"].map((h) => (
                      <th key={h} style={S.tableHead}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.users.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: C.textFaint }}>No one has enabled notifications yet.</td></tr>
                  ) : stats.users.map((u) => {
                    const stuck = u.prefs_on && u.devices === 0; // enabled but can't receive
                    return (
                      <tr key={u.email} style={{ borderBottom: `1px solid ${C.border}`, background: stuck ? C.tint(C.danger, "0d") : undefined }}>
                        <td style={{ ...S.tableCell, fontWeight: 500 }}>
                          {u.email}
                          {stuck && <span className="ms-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: C.dangerBg, color: C.danger }}>can’t receive</span>}
                        </td>
                        <td style={{ ...S.tableCell, color: u.devices > 0 ? C.text : C.textFaint }}>{u.devices}</td>
                        <td style={S.tableCell}>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: u.prefs_on ? C.successBg : C.border, color: u.prefs_on ? C.successText : C.textFaint }}>
                            {u.prefs_on ? "on" : "default"}
                          </span>
                        </td>
                        <td style={{ ...S.tableCell, fontWeight: 600 }}>{u.delivered}</td>
                        <td style={{ ...S.tableCell, color: C.textDim }}>{u.lectures}</td>
                        <td style={{ ...S.tableCell, color: C.textDim }}>{u.planner_tasks}</td>
                        <td style={{ ...S.tableCell, color: C.textDim }}>{u.exams}</td>
                        <td style={{ ...S.tableCell, color: C.textDim }}>{u.attendance}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubHead({ text }: { text: string }) {
  const C = useC();
  return <h2 className="text-[15px] font-semibold mb-3" style={{ color: C.text }}>{text}</h2>;
}
