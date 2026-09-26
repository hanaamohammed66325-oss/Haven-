"use client";

// Drill-down: click a count card anywhere in the admin to see the users behind
// the number. A request either names a card for the guarded
// admin_card_users(card, arg) RPC — whose branches mirror each card's own
// definition, so the list length matches the number — or hands over a user list
// the section already has (e.g. a university group).

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase, useC, useS, timeAgo, fmtNum, useDebounce } from "./_lib";

export interface DrillUser {
  user_id: string;
  email: string | null;
  last_active_at: string | null;
  detail?: string | null;
  badge?: string | null;
}

export type DrillRequest =
  | { title: string; card: string; arg?: string }
  | { title: string; users: DrillUser[] };

const DrillContext = createContext<(req: DrillRequest) => void>(() => {});

/** `const drill = useDrill(); drill({ title, card })` opens the users panel. */
export const useDrill = () => useContext(DrillContext);

export function DrillProvider({
  onOpenUser, children,
}: { onOpenUser: (id: string) => void; children: React.ReactNode }) {
  const [req, setReq] = useState<DrillRequest | null>(null);
  return (
    <DrillContext.Provider value={setReq}>
      {children}
      {req && (
        <DrillPanel
          req={req}
          onClose={() => setReq(null)}
          onOpenUser={(id) => { setReq(null); onOpenUser(id); }}
        />
      )}
    </DrillContext.Provider>
  );
}

function DrillPanel({
  req, onClose, onOpenUser,
}: { req: DrillRequest; onClose: () => void; onOpenUser: (id: string) => void }) {
  const C = useC();
  const S = useS();
  const [fetched, setFetched] = useState<DrillUser[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const query = useDebounce(q, 200);

  const card = "card" in req ? req.card : null;
  const arg = "card" in req ? req.arg ?? null : null;
  useEffect(() => {
    if (!card) return;
    let cancelled = false;
    setFetched(null); setError("");
    supabase.rpc("admin_card_users", { card, arg }).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) setError(e.message);
      else setFetched((data as DrillUser[]) ?? []);
    });
    return () => { cancelled = true; };
  }, [card, arg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const users = "users" in req ? req.users : fetched;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!users || !needle) return users;
    return users.filter((u) => (u.email ?? "").toLowerCase().includes(needle));
  }, [users, query]);

  const badgeTone = (b: string) =>
    b === "returned" || b === "app" ? { bg: C.successBg, fg: C.successText }
    : b === "not back" || b === "no device" ? { bg: C.dangerBg, fg: C.danger }
    : b === "iOS" ? { bg: C.indigoBg, fg: C.indigo }
    : { bg: C.border, fg: C.textMuted };

  // Portaled to <body> so no transformed ancestor can break fixed positioning.
  return createPortal(
    <div
      dir="ltr"
      className="fixed inset-0 z-[60] flex justify-end"
      // --admin-hover lives on the admin root, which a portal escapes — re-set it.
      style={{ background: "rgba(0,0,0,0.45)", "--admin-hover": C.mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={req.title}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[440px] flex flex-col border-s"
        style={{ background: C.panel, borderColor: C.border, fontFamily: "'Inter', 'Tajawal', sans-serif" }}
      >
        <div className="haven-safe-top flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: C.border }}>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: C.text }}>{req.title}</div>
            <div className="text-[12px] mt-0.5" style={{ color: C.textDim }}>
              {users ? `${fmtNum(users.length)} users` : error ? "" : "Loading…"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-2.5 py-1 text-[14px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email…" style={{ ...S.input, fontSize: 13, padding: "8px 12px" }} />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {error ? (
            <p className="px-2 text-[13px]" style={{ color: C.danger }}>{error}</p>
          ) : !shown ? null : shown.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px]" style={{ color: C.textFaint }}>No users.</p>
          ) : shown.map((u) => (
            <button
              key={u.user_id}
              onClick={() => onOpenUser(u.user_id)}
              className="admin-hover-row w-full text-start flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: C.text }}>{u.email ?? "—"}</div>
                {u.detail && <div className="text-[11px] truncate" style={{ color: C.textDim }}>{u.detail}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.badge && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: badgeTone(u.badge).bg, color: badgeTone(u.badge).fg }}>
                    {u.badge}
                  </span>
                )}
                <span className="text-[11px] tabular-nums" style={{ color: C.textFaint }}>{timeAgo(u.last_active_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
