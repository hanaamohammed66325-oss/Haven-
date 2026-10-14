"use client";

// Messages from the public feedback form (table `feedback`, insert-only for
// visitors). Read through admin_feedback() (admin only); nothing else reads
// this table, so before this page the messages were never shown anywhere.

import { useCallback, useEffect, useState } from "react";
import { supabase, useC, SectionHeader, Loading, ErrorBanner } from "./_lib";

interface FeedbackRow {
  id: string;
  name: string | null;
  email: string | null;
  message: string;
  created_at: string;
}

export function FeedbackSection() {
  const C = useC();
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data, error: e } = await supabase.rpc("admin_feedback");
    if (e) {
      setError(e.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as FeedbackRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <SectionHeader title="Feedback" />
      <p className="text-[12px] mb-4" style={{ color: C.textDim }}>
        Messages sent from the feedback form on the public home page. Name and email are optional.
      </p>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-[13px] rounded-xl border" style={{ color: C.textFaint, borderColor: C.border, background: C.panel }}>
          No messages yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12px]" style={{ color: C.textDim }}>{rows.length} {rows.length === 1 ? "message" : "messages"}</p>
          {rows.map((r) => (
            <div key={r.id} className="min-w-0 rounded-xl border p-4 flex flex-col gap-2" style={{ borderColor: C.border, background: C.panel }}>
              <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: C.textDim }}>
                <span dir="auto" className="font-semibold" style={{ color: C.text }}>{r.name || "No name"}</span>
                {r.email && (
                  <a href={`mailto:${r.email}`} className="underline break-all" dir="ltr" style={{ color: C.textDim }}>{r.email}</a>
                )}
                <span className="ms-auto">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p dir="auto" className="text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: C.text }}>{r.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
