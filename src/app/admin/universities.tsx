"use client";
import { InteractionButton } from "@/components/motion/Interaction";

// Universities — how many users come from each university, grouped by
// country. Only universities that at least one user picked in their academic
// profile appear. Free-typed names are folded into the known university with
// the SAME matcher the app uses to detect a grading scheme, so "KSU" and
// "جامعة الملك سعود" land in one row. The country comes from the app's own
// resolver (lib/universityCountry); a typed name it can't place is listed as
// unidentified, and the admin can drag it onto an Arab country. That choice
// is stored for this page only (admin_university_countries): the student app
// never reads it, so holidays and calendars stay as they are.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, useC, StatCard, SectionHeader, Loading, ErrorBanner, fmtNum } from "./_lib";
import { useDrill, type DrillUser } from "./_drill";
import { universityBySlug } from "@/lib/tools/universities";
import { matchUniversityByName } from "@/lib/gradeSchemes";
import { normalizeName, universityCountry } from "@/lib/universityCountry";
import { COUNTRY_NAMES } from "@/lib/countryHolidays";

interface UniUser {
  user_id: string;
  email: string | null;
  last_active_at: string | null;
  slug: string | null;
  name: string | null;
  major: string | null;
  level: string | null;
}

/** The 22 Arab League countries, the only ones a university can be moved to. */
const ARAB_COUNTRIES: { code: string; ar: string; en: string }[] = [
  { code: "SA", ar: "السعودية", en: "Saudi Arabia" },
  { code: "AE", ar: "الإمارات", en: "UAE" },
  { code: "QA", ar: "قطر", en: "Qatar" },
  { code: "BH", ar: "البحرين", en: "Bahrain" },
  { code: "KW", ar: "الكويت", en: "Kuwait" },
  { code: "OM", ar: "عُمان", en: "Oman" },
  { code: "YE", ar: "اليمن", en: "Yemen" },
  { code: "JO", ar: "الأردن", en: "Jordan" },
  { code: "LB", ar: "لبنان", en: "Lebanon" },
  { code: "SY", ar: "سوريا", en: "Syria" },
  { code: "PS", ar: "فلسطين", en: "Palestine" },
  { code: "IQ", ar: "العراق", en: "Iraq" },
  { code: "EG", ar: "مصر", en: "Egypt" },
  { code: "SD", ar: "السودان", en: "Sudan" },
  { code: "LY", ar: "ليبيا", en: "Libya" },
  { code: "TN", ar: "تونس", en: "Tunisia" },
  { code: "DZ", ar: "الجزائر", en: "Algeria" },
  { code: "MA", ar: "المغرب", en: "Morocco" },
  { code: "MR", ar: "موريتانيا", en: "Mauritania" },
  { code: "SO", ar: "الصومال", en: "Somalia" },
  { code: "DJ", ar: "جيبوتي", en: "Djibouti" },
  { code: "KM", ar: "جزر القمر", en: "Comoros" },
];
const ARAB = new Map(ARAB_COUNTRIES.map((c) => [c.code, c]));

function countryLabel(code: string): { ar: string; en: string } {
  const arab = ARAB.get(code);
  if (arab) return arab;
  const named = COUNTRY_NAMES[code];
  if (named) return { ar: named.ar, en: named.en.replace(/^the /, "") };
  const region = (lang: string) => {
    try { return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code; } catch { return code; }
  };
  return { ar: region("ar"), en: region("en") };
}

type Source = "auto" | "manual" | "none";

interface Group {
  key: string;
  /** The stored key for a typed name (normalized), null for a listed university. */
  nameKey: string | null;
  name: string;
  nameEn: string | null;
  users: UniUser[];
  autoCountry: string | null;
}

interface Placed extends Group { country: string | null; source: Source }

const typedKey = (name: string) => normalizeName(name) || name.trim().toLowerCase();

function groupUsers(users: UniUser[]): Group[] {
  const groups = new Map<string, Group>();
  for (const u of users) {
    const known = (u.slug ? universityBySlug(u.slug) : undefined) ?? (u.name ? matchUniversityByName(u.name) : undefined);
    const nameKey = known || !u.name?.trim() ? null : typedKey(u.name);
    const key = known ? known.slug : `custom:${nameKey ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, nameKey, name: known ? known.name : (u.name?.trim() || "(no name entered)"), nameEn: known ? known.nameEn : null, users: [], autoCountry: null };
      groups.set(key, g);
    }
    g.users.push(u);
    // Every university in the known list is Saudi; a typed one takes the first
    // user whose name (or saved pick) places it.
    if (!g.autoCountry) g.autoCountry = known ? "SA" : universityCountry({ universitySlug: u.slug, universityName: u.name });
  }
  return [...groups.values()];
}

const bySize = (a: { users: UniUser[]; name: string }, b: { users: UniUser[]; name: string }) =>
  b.users.length - a.users.length || a.name.localeCompare(b.name);

export function UniversitiesSection() {
  const C = useC();
  const drill = useDrill();
  const [data, setData] = useState<{ total_users: number; users: UniUser[] } | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [manualReady, setManualReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overCode, setOverCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [users, countries] = await Promise.all([
      supabase.rpc("admin_university_users"),
      supabase.rpc("admin_university_countries"),
    ]);
    if (users.error) setError(users.error.message);
    else setData(users.data as { total_users: number; users: UniUser[] });
    if (countries.error) setManualReady(false);
    else { setManualReady(true); setManual((countries.data ?? {}) as Record<string, string>); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const placed = useMemo<Placed[]>(() => {
    if (!data) return [];
    return groupUsers(data.users).map((g) => {
      // Her choice wins over the app's guess for a typed name (the guess can be wrong).
      const m = g.nameKey ? manual[g.nameKey] : undefined;
      if (m) return { ...g, country: m, source: "manual" as const };
      if (g.autoCountry) return { ...g, country: g.autoCountry, source: "auto" as const };
      return { ...g, country: null, source: "none" as const };
    });
  }, [data, manual]);

  const byCountry = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const g of placed) {
      if (!g.country) continue;
      const list = map.get(g.country) ?? [];
      list.push(g);
      map.set(g.country, list);
    }
    return [...map.entries()]
      .map(([code, unis]) => ({ code, unis: unis.sort(bySize), students: unis.reduce((s, u) => s + u.users.length, 0) }))
      .sort((a, b) => b.students - a.students || a.code.localeCompare(b.code));
  }, [placed]);

  const unplaced = useMemo(() => placed.filter((g) => !g.country).sort(bySize), [placed]);

  const assign = useCallback(async (nameKey: string, country: string | null) => {
    setSaveError("");
    const before = manual;
    setManual((m) => {
      const next = { ...m };
      if (country) next[nameKey] = country; else delete next[nameKey];
      return next;
    });
    const { error: e } = await supabase.rpc("admin_set_university_country", { p_key: nameKey, p_country: country });
    if (e) { setManual(before); setSaveError(e.message); }
  }, [manual]);

  if (loading && !data) return <Loading text="Loading universities…" />;

  const withUni = data?.users.length ?? 0;
  const unplacedStudents = unplaced.reduce((s, g) => s + g.users.length, 0);
  const max = Math.max(1, ...placed.map((g) => g.users.length));
  const top = [...placed].sort(bySize)[0];

  const open = (g: Group) => {
    const users: DrillUser[] = g.users.map((u) => ({
      user_id: u.user_id,
      email: u.email,
      last_active_at: u.last_active_at,
      detail: [u.major, u.level && (/^\d{1,2}$/.test(u.level) ? `Level ${u.level}` : u.level)].filter(Boolean).join(" · ") || null,
      badge: null,
    }));
    drill({ title: g.name, users });
  };

  const drop = (code: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain") || dragKey;
    setOverCode(null); setDragKey(null);
    if (key) void assign(key, code);
  };
  const dropTarget = (code: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragKey) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overCode !== code) setOverCode(code); } },
    onDragLeave: () => setOverCode((c) => (c === code ? null : c)),
    onDrop: drop(code),
  });

  const row = (g: Placed, i: number, last: boolean) => {
    const n = g.users.length;
    const pct = withUni ? Math.round((n / withUni) * 100) : 0;
    // Any typed name can be moved (a listed university is always Saudi).
    const movable = manualReady && !!g.nameKey;
    return (
      <div
        key={g.key}
        draggable={movable}
        onDragStart={movable ? (e) => { e.dataTransfer.setData("text/plain", g.nameKey!); e.dataTransfer.effectAllowed = "move"; setDragKey(g.nameKey); } : undefined}
        onDragEnd={() => { setDragKey(null); setOverCode(null); }}
        className="flex items-center"
        style={{ borderBottom: last ? "none" : `1px solid ${C.border}`, opacity: dragKey && dragKey === g.nameKey ? 0.5 : 1, cursor: movable ? "grab" : undefined }}
      >
        <InteractionButton
          onClick={() => open(g)}
          className="admin-hover-row flex-1 min-w-0 text-start flex items-center gap-4 px-5 py-3.5"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          <span className="w-6 text-[12px] tabular-nums shrink-0" style={{ color: C.textFaint }}>{i + 1}</span>
          <div className="min-w-0 w-[38%] shrink-0">
            <div dir="auto" className="text-[13px] font-medium truncate" style={{ color: C.text }}>{g.name}</div>
            <div className="text-[11px] truncate" style={{ color: C.textDim }}>
              {g.nameEn ?? (g.source === "manual" ? "Typed by hand — country set by you" : g.source === "auto" ? "Typed by hand — country detected" : "Typed by hand — country not identified")}
            </div>
          </div>
          <div className="flex-1 rounded-full overflow-hidden" style={{ background: C.border, height: 10 }}>
            <div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: g.country ? C.primary : C.warning, minWidth: 6 }} />
          </div>
          <span className="w-28 text-end text-[13px] tabular-nums shrink-0" style={{ color: C.text }}>
            <b>{fmtNum(n)}</b> <span style={{ color: C.textFaint }}>{n === 1 ? "user" : "users"} · {pct}%</span>
          </span>
          <span className="text-[12px] shrink-0" style={{ color: C.textFaint }}>→</span>
        </InteractionButton>
        {movable && (
          <select
            aria-label={`Country for ${g.name}`}
            value={g.country ?? ""}
            onChange={(e) => void assign(g.nameKey!, e.target.value || null)}
            className="me-4 rounded-lg px-2 py-1 text-[12px] shrink-0"
            style={{ background: C.panel2, color: C.textMuted, border: `1px solid ${C.border2}`, maxWidth: 150 }}
          >
            <option value="">{g.source === "manual" ? "Undo my choice" : g.source === "auto" ? "Change country…" : "Choose country…"}</option>
            {ARAB_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.en} · {c.ar}</option>)}
          </select>
        )}
      </div>
    );
  };

  const panel = (title: React.ReactNode, sub: string, list: Placed[], code: string | null) => (
    <div
      key={code ?? "none"}
      {...(code && ARAB.has(code) ? dropTarget(code) : {})}
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: code && overCode === code ? C.primary : C.border, background: C.panel }}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 py-3" style={{ borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
        <div className="text-[14px] font-semibold" style={{ color: C.text }}>{title}</div>
        <div className="text-[12px] tabular-nums" style={{ color: C.textFaint }}>{sub}</div>
      </div>
      {list.map((g, i) => row(g, i, i === list.length - 1))}
    </div>
  );

  const counts = (unis: number, students: number) =>
    `${fmtNum(unis)} ${unis === 1 ? "university" : "universities"} · ${fmtNum(students)} ${students === 1 ? "user" : "users"}`;

  return (
    <div>
      <SectionHeader
        title="Universities"
        action={
          <InteractionButton onClick={() => void load()} className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: C.border, color: C.textMuted, border: "none", cursor: "pointer" }}>
            {loading ? "…" : "↻ Refresh"}
          </InteractionButton>
        }
      />
      {error && <ErrorBanner message={error} onRetry={load} />}

      {data && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Universities represented" value={placed.length} />
            <StatCard label="Users who set a university" value={withUni} sub={`of ${fmtNum(data.total_users)} users · ${data.total_users ? Math.round((withUni / data.total_users) * 100) : 0}%`} />
            <StatCard label="Countries" value={byCountry.length} sub={byCountry[0] ? `most: ${countryLabel(byCountry[0].code).en}` : undefined} />
            <StatCard label="Top university" value={top ? top.users.length : "—"} sub={top?.name} />
          </div>

          {/* Country tally — each card is also a drop target. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {byCountry.map((c) => {
              const l = countryLabel(c.code);
              const arab = ARAB.has(c.code);
              return (
                <div
                  key={c.code}
                  {...(arab ? dropTarget(c.code) : {})}
                  className="rounded-xl border px-4 py-3"
                  style={{ borderColor: overCode === c.code ? C.primary : C.border, background: overCode === c.code ? C.primarySoft : C.panel }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold truncate" style={{ color: C.text }}>{l.en}</span>
                    <span dir="rtl" className="text-[12px] truncate" style={{ color: C.textMuted }}>{l.ar}</span>
                  </div>
                  <div className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: C.text }}>{fmtNum(c.students)}</div>
                  <div className="text-[11px]" style={{ color: C.textFaint }}>{counts(c.unis.length, c.students)}</div>
                </div>
              );
            })}
            {unplaced.length > 0 && (
              <div className="rounded-xl border px-4 py-3" style={{ borderColor: C.warning, background: C.panel }}>
                <div className="text-[13px] font-semibold" style={{ color: C.warningText }}>Not identified</div>
                <div className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: C.text }}>{fmtNum(unplacedStudents)}</div>
                <div className="text-[11px]" style={{ color: C.textFaint }}>{counts(unplaced.length, unplacedStudents)}</div>
              </div>
            )}
          </div>

          {!manualReady && (
            <p className="rounded-lg px-4 py-2.5 text-[12px]" style={{ background: C.panel2, color: C.warningText, border: `1px solid ${C.border}` }}>
              Setting a country isn&apos;t available yet: the admin_university_countries migration hasn&apos;t been applied.
            </p>
          )}
          {saveError && <ErrorBanner message={`Couldn't save the country: ${saveError}`} onRetry={() => setSaveError("")} />}

          {/* While dragging: every Arab country, so one with no university yet can take it. */}
          {dragKey && (
            <div className="sticky top-2 z-10 rounded-xl border p-3" style={{ borderColor: C.primary, background: C.panel2 }}>
              <div className="mb-2 text-[12px]" style={{ color: C.textMuted }}>Drop on a country</div>
              <div className="flex flex-wrap gap-2">
                {ARAB_COUNTRIES.map((c) => (
                  <div
                    key={c.code}
                    {...dropTarget(c.code)}
                    className="rounded-lg px-3 py-2 text-[12px]"
                    style={{ border: `1px solid ${overCode === c.code ? C.primary : C.border2}`, background: overCode === c.code ? C.primarySoft : C.panel, color: C.text }}
                  >
                    {c.en} · <span dir="rtl">{c.ar}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {placed.length === 0 ? (
            <div className="rounded-xl border p-8 text-center text-[13px]" style={{ borderColor: C.border, background: C.panel, color: C.textFaint }}>
              No user has set a university yet.
            </div>
          ) : (
            <>
              {unplaced.length > 0 && panel(
                <span style={{ color: C.warningText }}>Not identified</span>,
                counts(unplaced.length, unplacedStudents),
                unplaced,
                null,
              )}
              {byCountry.map((c) => {
                const l = countryLabel(c.code);
                return panel(<>{l.en} <span dir="rtl" className="font-normal" style={{ color: C.textMuted }}>· {l.ar}</span></>, counts(c.unis.length, c.students), c.unis, c.code);
              })}
            </>
          )}
          <p className="text-[12px]" style={{ color: C.textFaint }}>
            Percentages are of users who set a university. Click a university to see its users with their major and level.
            Drag a typed university onto a country (or pick one from its list) to place it or correct the app&apos;s guess. This only sorts this page; students&apos; holidays and calendars don&apos;t change.
          </p>
        </div>
      )}
    </div>
  );
}
