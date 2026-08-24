"use client";

// Shared helpers, styles, and reusable UI for the admin dashboard.
// Theme-aware — call `useC()` inside components to react to the theme toggle.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin-api`;

// ---------- API helper ----------
export async function callAdmin(
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

export { supabase };

// ---------- Formatting ----------
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB") : "—";
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { hour12: false }) : "—";
export const fmtSar = (n?: number | null) =>
  n == null ? "—" : `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} SAR`;
export const fmtNum = (n?: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("en-US");
export const timeAgo = (iso?: string | null) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${Math.round(s)}s ago`;
  if (s < 3600)  return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

// ---------- Palette type ----------
export type ThemeMode = "dark" | "light";
export interface Palette {
  mode: ThemeMode;
  bg: string; panel: string; panel2: string;
  border: string; border2: string;
  text: string; textMuted: string; textDim: string; textFaint: string;
  primary: string; primarySoft: string; primaryText: string;
  success: string; successText: string; successBg: string;
  warning: string; warningText: string;
  danger: string; dangerBg: string;
  indigo: string; indigoBg: string;
  purple: string; purpleBg: string;
  /** Concatenate a hex color with an opacity byte (e.g. "22"). Works only for #hex inputs. */
  tint(color: string, opacityHex: string): string;
}

const hexTint = (color: string, opacityHex: string) =>
  color.startsWith("#") ? `${color}${opacityHex}` : color;

export const DARK: Palette = {
  mode: "dark",
  bg: "#0f172a", panel: "#0a0f1e", panel2: "#111827",
  border: "#1e293b", border2: "#334155",
  text: "#f1f5f9", textMuted: "#94a3b8", textDim: "#64748b", textFaint: "#475569",
  primary: "#3b82f6", primarySoft: "#1d4ed8", primaryText: "#bfdbfe",
  success: "#10b981", successText: "#86efac", successBg: "#14532d",
  warning: "#f59e0b", warningText: "#fcd34d",
  danger:  "#f87171", dangerBg:  "#7f1d1d",
  indigo:  "#a5b4fc", indigoBg:  "#1e1b4b",
  purple:  "#c4b5fd", purpleBg:  "#2d1b69",
  tint: hexTint,
};

export const LIGHT: Palette = {
  mode: "light",
  bg: "#f4f5f7", panel: "#ffffff", panel2: "#f9fafb",
  border: "#e5e7eb", border2: "#d1d5db",
  text: "#0f172a", textMuted: "#475569", textDim: "#64748b", textFaint: "#94a3b8",
  primary: "#2563eb", primarySoft: "#dbeafe", primaryText: "#1d4ed8",
  success: "#059669", successText: "#065f46", successBg: "#d1fae5",
  warning: "#d97706", warningText: "#92400e",
  danger:  "#dc2626", dangerBg:  "#fee2e2",
  indigo:  "#4338ca", indigoBg:  "#e0e7ff",
  purple:  "#6d28d9", purpleBg:  "#ede9fe",
  tint: hexTint,
};

// ---------- Theme context ----------
interface ThemeCtx { mode: ThemeMode; setMode: (m: ThemeMode) => void; palette: Palette; }
const ThemeContext = createContext<ThemeCtx>({ mode: "dark", setMode: () => {}, palette: DARK });

const STORAGE_KEY = "haven_admin_theme";

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setModeState(stored);
    } catch { /* ignore */ }
  }, []);
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
  }, []);
  const value = useMemo<ThemeCtx>(
    () => ({ mode, setMode, palette: mode === "light" ? LIGHT : DARK }),
    [mode, setMode]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the ACTIVE palette. Use as `const C = useC()` inside components. */
export function useC(): Palette { return useContext(ThemeContext).palette; }
export function useTheme(): ThemeCtx { return useContext(ThemeContext); }

// Legacy static export (dark). Anything at module top-level still gets DARK
// but interactive components should use `useC()` to react to the toggle.
export const C = DARK;

// ---------- Reactive styles ----------
export type Styles = {
  input: React.CSSProperties;
  btnPrimary: React.CSSProperties;
  btnSec: React.CSSProperties;
  btnGhost: React.CSSProperties;
  label: React.CSSProperties;
  card: React.CSSProperties;
  tableHead: React.CSSProperties;
  tableCell: React.CSSProperties;
};

export function useS(): Styles {
  const c = useC();
  return useMemo(() => buildStyles(c), [c]);
}

function buildStyles(c: Palette): Styles {
  return {
    input: {
      width: "100%", padding: "10px 14px",
      background: c.mode === "light" ? c.panel2 : c.border,
      border: `1px solid ${c.border2}`,
      borderRadius: 10, color: c.text, fontSize: 14, outline: "none",
    },
    btnPrimary: {
      padding: "10px 20px", background: c.primary, color: "#fff",
      border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer",
    },
    btnSec: {
      padding: "8px 14px", background: c.border, color: c.textMuted,
      border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13,
    },
    btnGhost: {
      padding: "6px 12px", background: "transparent", color: c.textMuted,
      border: `1px solid ${c.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12,
    },
    label: {
      display: "block", fontSize: 11, fontWeight: 600, color: c.textFaint,
      marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.04em",
    },
    card: {
      background: c.panel, border: `1px solid ${c.border}`, borderRadius: 12,
    },
    tableHead: {
      padding: "12px 16px", textAlign: "start" as const, fontSize: 11, fontWeight: 600,
      color: c.textFaint, background: c.panel, textTransform: "uppercase" as const, letterSpacing: "0.04em",
    },
    tableCell: {
      padding: "12px 16px", fontSize: 13, color: c.text,
      borderBottom: `1px solid ${c.border}`,
    },
  };
}

// Legacy static styles (dark) — kept for anything importing S at module scope.
export const S: Styles = buildStyles(DARK);

// ---------- StatCard (theme-aware) ----------
export function StatCard({
  label, value, accent, sub, wide,
}: {
  label: string;
  value: number | string;
  accent?: string;
  sub?: string;
  wide?: boolean;
}) {
  const c = useC();
  return (
    <div
      className={`rounded-xl border p-5 ${wide ? "md:col-span-2" : ""}`}
      style={{
        borderColor: accent ? c.tint(accent, "44") : c.border,
        background: accent ? c.tint(accent, "11") : c.panel,
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: c.textDim }}>
        {label}
      </div>
      <div className="text-[28px] font-bold leading-none tabular-nums" style={{ color: accent ?? c.text }}>
        {typeof value === "number" ? value.toLocaleString("en") : value}
      </div>
      {sub && <div className="text-[12px] mt-2" style={{ color: c.textDim }}>{sub}</div>}
    </div>
  );
}

// ---------- Status badge (theme-aware) ----------
export function Badge({
  status, kind = "sub",
}: {
  status: string;
  kind?: "sub" | "payment" | "priority" | "ticket";
}) {
  const c = useC();
  const isLight = c.mode === "light";
  const map: Record<string, { bg: string; fg: string }> = {
    trial:          { bg: isLight ? "#dbeafe" : "#172554", fg: isLight ? "#1e40af" : "#93c5fd" },
    active:         { bg: c.successBg, fg: c.successText },
    // Retained so any historical row still renders with a sensible badge;
    // no new subscription can reach this status (no gateway, no 3DS step).
    pending_3ds:    { bg: c.purpleBg, fg: c.purple },
    expired:        { bg: isLight ? "#fef3c7" : "#3f2712", fg: isLight ? "#92400e" : "#fbbf24" },
    cancelled:      { bg: c.border, fg: c.textMuted },
    payment_failed: { bg: c.dangerBg, fg: c.danger },
    paid:           { bg: c.successBg, fg: c.successText },
    pending:        { bg: c.purpleBg, fg: c.purple },
    failed:         { bg: c.dangerBg, fg: c.danger },
    refunded:       { bg: c.border, fg: c.textMuted },
    open:           { bg: isLight ? "#dbeafe" : "#1e3a8a", fg: isLight ? "#1e40af" : "#93c5fd" },
    resolved:       { bg: c.successBg, fg: c.successText },
    closed:         { bg: c.border, fg: c.textMuted },
    low:            { bg: c.border, fg: c.textMuted },
    normal:         { bg: isLight ? "#dbeafe" : "#172554", fg: isLight ? "#1e40af" : "#93c5fd" },
    high:           { bg: isLight ? "#fef3c7" : "#3f2712", fg: isLight ? "#92400e" : "#fbbf24" },
    urgent:         { bg: c.dangerBg, fg: c.danger },
  };
  const { bg, fg } = map[status] ?? { bg: c.border, fg: c.textMuted };
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: bg, color: fg }}>
      {status}
    </span>
  );
}

// ---------- Section header ----------
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const c = useC();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 className="text-[20px] font-semibold" style={{ color: c.text }}>{title}</h1>
      {action}
    </div>
  );
}

// ---------- Loading / Empty ----------
export function Loading({ text = "Loading…" }: { text?: string }) {
  const c = useC();
  return <p style={{ color: c.textDim }}>{text}</p>;
}
export function Empty({ text }: { text: string }) {
  const c = useC();
  return (
    <div className="rounded-xl border p-10 text-center" style={{ borderColor: c.border, color: c.textFaint }}>
      {text}
    </div>
  );
}
