"use client";

import Link from "next/link";
import { GraduationCap, BookOpen, Layers, ChevronLeft, Pencil } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { universityBySlug } from "@/lib/tools/universities";

/** Resolve the display name of the student's university from their academic
 *  profile: a known slug maps to the curated list (localised), otherwise the
 *  free-typed name (shown as the student wrote it). */
function universityDisplayName(slug: string | null, custom: string, lang: "en" | "ar"): string {
  if (slug && slug !== "other") {
    const u = universityBySlug(slug);
    if (u) return lang === "en" ? u.nameEn : u.name;
  }
  return custom;
}

/**
 * The student's academic identity (university · major · level) shown as a light,
 * seamless line — no card, no bar — so it blends into the page under the greeting.
 * It personalises the dashboard and the profile.
 *
 * - `editHref` (profile only): renders a subtle "Edit" affordance. The dashboard
 *   passes nothing, so no edit control appears there — editing lives on the profile.
 * - When nothing is filled in yet, it shows a gentle prompt linking to the editor.
 */
export function AcademicBanner({ editHref }: { editHref?: string } = {}) {
  const { academic } = useStore();
  const { t, lang } = useT();

  const uni = universityDisplayName(academic.universitySlug, academic.universityName, lang).trim();
  const major = academic.major.trim();
  const level = academic.level.trim();
  const hasAny = uni || major || level;

  // A pure-numeric level (1–10) reads as "Level N"; a custom value shows as-is.
  const levelText = /^\d{1,2}$/.test(level) ? t("levelOption", { n: level }) : level;

  // Where the empty-state prompt (and any edit link) points. Editing now lives
  // on the profile, so that is the default destination.
  const target = editHref ?? "/profile/";

  if (!hasAny) {
    return (
      <Link
        href={target}
        className="group inline-flex items-center gap-2 mt-3 text-[13px] font-medium transition-opacity opacity-80 hover:opacity-100"
        style={{ color: "var(--color-primary)" }}
      >
        <GraduationCap size={15} />
        {t("academicBannerPrompt")}
        <ChevronLeft
          size={14}
          className="transition-transform group-hover:-translate-x-0.5 rtl:rotate-180"
        />
      </Link>
    );
  }

  const dot = (
    <span aria-hidden className="opacity-40" style={{ color: "var(--color-muted)" }}>
      ·
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-3 text-[13px]">
      {uni && (
        <span
          className="inline-flex items-center gap-1.5 font-medium"
          style={{ color: "var(--color-primary)" }}
        >
          <GraduationCap size={15} />
          {uni}
        </span>
      )}
      {major && (
        <>
          {uni && dot}
          <span className="inline-flex items-center gap-1" style={{ color: "var(--color-muted)" }}>
            <BookOpen size={13} />
            {major}
          </span>
        </>
      )}
      {levelText && (
        <>
          {(uni || major) && dot}
          <span className="inline-flex items-center gap-1" style={{ color: "var(--color-muted)" }}>
            <Layers size={13} />
            {levelText}
          </span>
        </>
      )}
      {editHref && (
        <a
          href={editHref}
          className="inline-flex items-center gap-1 ms-1 text-[12px] font-medium opacity-70 transition-opacity hover:opacity-100"
          style={{ color: "var(--color-primary)" }}
        >
          <Pencil size={11} />
          {lang === "ar" ? "تعديل" : "Edit"}
        </a>
      )}
    </div>
  );
}
