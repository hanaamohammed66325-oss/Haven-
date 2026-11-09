"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, useC, fmtDate } from "./_lib";
import { gpaContactFollowups, gpaNoticeFollowups, type GpaFollowupData } from "@/lib/gpaFollowups";

/** Read-only operational follow-up. Contact rows are created only after separately approved sends. */
export function GpaFollowupsSection({ onOpenUser, reloadKey = 0, previewData }: {
  onOpenUser: (id: string) => void; reloadKey?: number; previewData?: GpaFollowupData;
}) {
  const C = useC();
  const [data, setData] = useState<GpaFollowupData | null>(previewData ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!previewData);
  const load = useCallback(async () => {
    if (previewData) { setData(previewData); setLoading(false); return; }
    setLoading(true);
    const result = await supabase.rpc("admin_gpa_followups");
    if (result.error) {
      setError(["PGRST202", "42883"].includes(result.error.code)
        ? "Follow-up data will be available after the approved GPA migration is applied."
        : result.error.message);
    } else { setData(result.data as GpaFollowupData); setError(""); }
    setLoading(false);
  }, [previewData]);
  useEffect(() => {
    void load();
    if (previewData) return;
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load, reloadKey, previewData]);
  const student = (id: string, email: string | null) => <button type="button" onClick={() => onOpenUser(id)} className="underline underline-offset-2 text-start" style={{ color: C.primary }}>{email ?? id}</button>;
  const cell = "px-3 py-2 text-start align-top border-b";
  return <section className="mt-8 pt-6 border-t" style={{ borderColor: C.border }}>
    <h2 className="font-semibold text-base">GPA follow-up</h2>
    <p className="text-xs mt-1 mb-4" style={{ color: C.textDim }}>Contacted students and in-app review confirmations. This section does not send messages.</p>
    {loading && <p className="text-sm">Loading follow-up…</p>}
    {error && <p role="status" className="text-sm" style={{ color: C.warning }}>{error}</p>}
    {data && <>
      <h3 className="font-semibold text-sm mb-2">Contacted students</h3>
      {!data.contacts.length ? <p className="text-sm" style={{ color: C.textDim }}>No approved contacts recorded yet.</p> : <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 1050 }}><thead><tr>{["Student", "Group", "What happened", "Contact date / channel", "Latest check after contact", "Comparison correctness", "Status"].map(h => <th key={h} className={cell}>{h}</th>)}</tr></thead>
          <tbody>{gpaContactFollowups(data).map(({ contact, check, review, comparison, status }) => <tr key={contact.user_id}>
            <td className={cell}>{student(contact.user_id, contact.email)}</td><td className={cell}>{contact.grp}</td>
            <td className={cell}>{contact.reason}{contact.note && <p style={{ color: C.textDim }}>{contact.note}</p>}</td>
            <td className={cell}>{fmtDate(contact.contacted_at)}<p>{contact.channel}</p></td>
            <td className={cell}>{check ? <>{check.event}<p>{fmtDate(check.at)}</p>{typeof check.meta?.ours === "number" && typeof check.meta?.portal === "number" && <p>Ours {check.meta.ours.toFixed(2)} · portal {check.meta.portal.toFixed(2)}</p>}</> : "No new check"}{contact.grp === "G3" && review && <p>{review.event === "gpa_prior_edited" ? "Previous GPA edited" : "Previous GPA confirmed"} · {fmtDate(review.at)}</p>}</td>
            <td className={cell}>{comparison ? <>{comparison.oldResultWrong && <b style={{ color: C.warning }}>Old result was wrong</b>}<p>{comparison.verifiable ? `Current: ${comparison.main ?? "—"}${comparison.cumulative ? `; cumulative: ${comparison.cumulative}` : ""}` : "Not fully verifiable: comparison numbers not shared"}</p></> : "No new saved comparison"}</td>
            <td className={cell}><b style={{ color: status === "resolved" ? C.success : status === "waiting" ? C.textDim : C.warning }}>{status}</b>{comparison && !comparison.verifiable && status === "resolved" && <p>Reported only</p>}</td>
          </tr>)}</tbody></table>
      </div>}
      <p className="text-xs mt-2 mb-5" style={{ color: C.textDim }}>The latest check may concern another term. “Resolved” does not prove every historical difference was resolved. G3 follows an explicit prior-GPA confirmation or edit after contact.</p>
      <h3 className="font-semibold text-sm mb-2">In-app prior-GPA review</h3>
      {!data.reviews.some(e => e.event === "gpa_prior_review_shown") ? <p className="text-sm" style={{ color: C.textDim }}>No review notices recorded yet.</p> : <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 650 }}><thead><tr>{["Student", "First shown", "Latest change shown", "Status", "Action date"].map(h => <th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{gpaNoticeFollowups(data.reviews).map(row => <tr key={row.user_id}>
          <td className={cell}>{student(row.user_id, row.email)}</td><td className={cell}>{fmtDate(row.firstShown)}</td><td className={cell}>{fmtDate(row.latestShown)}</td><td className={cell} style={{ color: row.status === "not yet" ? C.warning : C.success }}>{row.status}</td><td className={cell}>{row.at ? fmtDate(row.at) : "—"}</td>
        </tr>)}</tbody></table>
      </div>}
    </>}
  </section>;
}
