"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge, useC, useS, callAdmin, fmtDateTime, Loading, SectionHeader, timeAgo, useDebounce, ErrorBanner } from "./_lib";

interface Ticket {
  id: string; user_id: string | null; user_email: string;
  subject: string; category: string; priority: string; status: string;
  assigned_to: string | null; created_at: string; updated_at: string;
  resolved_at: string | null; closed_at: string | null;
}
interface Message {
  id: string; ticket_id: string; author_type: "user" | "admin";
  author_email: string; body: string; created_at: string;
}

export function SupportSection({ session }: { session: Session }) {
  const C = useC();
  const S = useS();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const res = await callAdmin(session, "tickets_list", { status, priority, search: debouncedSearch, limit: pageSize, offset });
    if (res?.ok) { setRows(res.tickets ?? []); setTotal(res.total ?? 0); }
    else setError(res?.error ?? "Failed to load tickets");
    setLoading(false);
  }, [session, status, priority, debouncedSearch, offset]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <SectionHeader
        title={`Support tickets${total > 0 ? ` (${total.toLocaleString()})` : ""}`}
        action={
          <div className="flex gap-2">
            <input
              type="text" placeholder="Search…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              style={{ ...S.input, width: 200, fontSize: 13 }}
            />
            <button onClick={() => setShowCreate(true)} style={S.btnPrimary}>+ New ticket</button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-[11px] uppercase tracking-wide me-2 self-center" style={{ color: C.textFaint }}>Status:</span>
        {[["all","All"],["open","Open"],["pending","Pending"],["resolved","Resolved"],["closed","Closed"]].map(([id, l]) => (
          <button key={id} onClick={() => { setStatus(id); setOffset(0); }} className="rounded-full px-3 py-1 text-[12px] font-medium" style={{ background: status === id ? C.primarySoft : C.border, color: status === id ? "#fff" : C.textMuted, border: "none", cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-[11px] uppercase tracking-wide me-2 self-center" style={{ color: C.textFaint }}>Priority:</span>
        {[["all","All"],["low","Low"],["normal","Normal"],["high","High"],["urgent","Urgent"]].map(([id, l]) => (
          <button key={id} onClick={() => { setPriority(id); setOffset(0); }} className="rounded-full px-3 py-1 text-[12px] font-medium" style={{ background: priority === id ? C.primarySoft : C.border, color: priority === id ? "#fff" : C.textMuted, border: "none", cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <Loading text="Loading tickets…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Subject", "Customer", "Category", "Priority", "Status", "Created", "Updated"].map((h) => (
                  <th key={h} style={S.tableHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center" style={{ color: C.textFaint }}>No tickets. Click "+ New ticket" to create one.</td></tr>
              ) : (
                rows.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="transition-colors admin-hover-row cursor-pointer"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <td style={{ ...S.tableCell, fontWeight: 500 }}>{t.subject}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{t.user_email}</td>
                    <td style={{ ...S.tableCell, color: C.textMuted }}>{t.category}</td>
                    <td style={S.tableCell}><Badge status={t.priority} kind="priority" /></td>
                    <td style={S.tableCell}><Badge status={t.status} kind="ticket" /></td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{timeAgo(t.created_at)}</td>
                    <td style={{ ...S.tableCell, color: C.textDim }}>{timeAgo(t.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px]" style={{ color: C.textDim }}>
            Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))} style={{ ...S.btnSec, opacity: offset === 0 ? 0.5 : 1 }}>← Prev</button>
            <button disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)} style={{ ...S.btnSec, opacity: offset + pageSize >= total ? 0.5 : 1 }}>Next →</button>
          </div>
        </div>
      )}

      {selected && <TicketModal session={session} ticket={selected} onClose={() => setSelected(null)} onChanged={() => { void load(); }} />}
      {showCreate && <CreateTicketModal session={session} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
    </div>
  );
}

// ---------- Ticket detail modal ----------
function TicketModal({
  session, ticket, onClose, onChanged,
}: {
  session: Session; ticket: Ticket; onClose: () => void; onChanged: () => void;
}) {
  const C = useC();
  const S = useS();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [current, setCurrent] = useState<Ticket>(ticket);

  const load = useCallback(async () => {
    const res = await callAdmin(session, "ticket_detail", { ticket_id: ticket.id });
    if (res?.ok) { setMessages(res.messages ?? []); setCurrent(res.ticket); }
  }, [session, ticket.id]);
  useEffect(() => { void load(); }, [load]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSaving(true);
    const res = await callAdmin(session, "ticket_reply", { ticket_id: current.id, body: reply.trim() });
    if (res?.ok) { setReply(""); void load(); onChanged(); }
    setSaving(false);
  };
  const changeField = async (patch: Record<string, string>) => {
    setFieldSaving(true);
    const res = await callAdmin(session, "ticket_update", { ticket_id: current.id, ...patch });
    if (res?.ok) { setCurrent(res.ticket); onChanged(); }
    setFieldSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.border}`, maxHeight: "90dvh" }}>
        <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: C.border }}>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold truncate" style={{ color: C.text }}>{current.subject}</h2>
            <div className="text-[11px] mt-1" style={{ color: C.textDim }}>{current.user_email} · {fmtDateTime(current.created_at)}</div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5" style={{ background: C.border, color: C.text, border: "none", fontSize: 14 }}>✕</button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 p-4 border-b" style={{ borderColor: C.border, background: C.panel, opacity: fieldSaving ? 0.6 : 1 }}>
          <div>
            <label style={S.label}>Status</label>
            <select value={current.status} onChange={(e) => changeField({ status: e.target.value })} disabled={fieldSaving} style={{ ...S.input, width: "auto" }}>
              <option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Priority</label>
            <select value={current.priority} onChange={(e) => changeField({ priority: e.target.value })} disabled={fieldSaving} style={{ ...S.input, width: "auto" }}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Category</label>
            <select value={current.category} onChange={(e) => changeField({ category: e.target.value })} disabled={fieldSaving} style={{ ...S.input, width: "auto" }}>
              <option value="general">General</option><option value="account">Account</option><option value="login">Login</option>
              <option value="subscription">Subscription</option><option value="payment">Payment</option><option value="technical">Technical</option><option value="other">Other</option>
            </select>
          </div>
          {fieldSaving && <span className="text-[11px] pb-2" style={{ color: C.textDim }}>Saving…</span>}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.length === 0 ? (
            <p className="text-center text-[13px]" style={{ color: C.textFaint }}>No messages yet.</p>
          ) : messages.map((m) => (
            <div key={m.id} className={`flex ${m.author_type === "admin" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[75%] rounded-xl px-4 py-3 text-[13px]" style={{ background: m.author_type === "admin" ? C.primarySoft : C.panel2, color: m.author_type === "admin" ? "#fff" : C.text }}>
                <div className="text-[10px] mb-1 opacity-70">{m.author_email} · {fmtDateTime(m.created_at)}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Reply */}
        <div className="p-4 border-t" style={{ borderColor: C.border, background: C.panel }}>
          <textarea
            value={reply} onChange={(e) => setReply(e.target.value)}
            placeholder="Reply as admin…"
            rows={2}
            style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }}
          />
          <div className="flex justify-end mt-2">
            <button onClick={sendReply} disabled={saving || !reply.trim()} style={{ ...S.btnPrimary, opacity: (!reply.trim() || saving) ? 0.5 : 1 }}>
              {saving ? "…" : "Send reply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Create ticket modal ----------
function CreateTicketModal({
  session, onClose, onCreated,
}: { session: Session; onClose: () => void; onCreated: () => void; }) {
  const C = useC();
  const S = useS();
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    const res = await callAdmin(session, "ticket_create", {
      user_email: email, subject, category, priority, first_message: message,
    });
    if (res?.ok) onCreated();
    else setError(res?.error ?? "Failed to create ticket");
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: C.border }}>
          <h2 className="text-[15px] font-semibold" style={{ color: C.text }}>New support ticket</h2>
          <button onClick={onClose} style={{ background: C.border, color: C.text, border: "none", borderRadius: 999, padding: 6, fontSize: 14 }}>✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div><label style={S.label}>Customer email *</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={S.input} /></div>
          <div><label style={S.label}>Subject *</label><input type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} style={S.input} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={S.label}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={S.input}>
                <option value="general">General</option><option value="account">Account</option><option value="login">Login</option>
                <option value="subscription">Subscription</option><option value="payment">Payment</option><option value="technical">Technical</option><option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={S.input}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div><label style={S.label}>First message (as user)</label><textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }} /></div>
          {error && <p className="text-[12px]" style={{ color: C.danger }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} style={S.btnSec}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.5 : 1 }}>{saving ? "…" : "Create ticket"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
