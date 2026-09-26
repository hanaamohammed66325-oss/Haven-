"use client";

// For a student whose university is outside Saudi Arabia (told from its name,
// lib/universityCountry): says their holidays are their university's own
// calendar (official, or as its students confirmed it) or their country's
// official holidays, suggested — or asks them to add their university's own —
// and that their absence percentage is counted on them. Nothing for Saudi
// universities.

import Link from "next/link";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { holidayCalendar } from "@/lib/universityCountry";
import { COUNTRY_HOLIDAYS, COUNTRY_NAMES, universityCalendar } from "@/lib/countryHolidays";

export function HolidayCountryNote({ link = false, className = "" }: { link?: boolean; className?: string }) {
  const { t, lang } = useT();
  const { academic } = useStore();
  const calendar = holidayCalendar(academic);
  if (calendar === "SA") return null;

  const en = lang === "en";
  const university = universityCalendar(calendar);
  const country = COUNTRY_NAMES[calendar]?.[en ? "en" : "ar"];
  const text = university
    ? t("source" in university && university.source === "students" ? "holidaysStudentsNote" : "holidaysUniversityNote", {
        university: en ? university.nameEn : university.nameAr,
      })
    : COUNTRY_HOLIDAYS[calendar]?.length && country
      ? t("holidaysCountryNote", { country })
      : t("holidaysOwnNote");

  return (
    <p
      className={`rounded-xl px-4 py-3 text-[13px] leading-relaxed ${className}`}
      style={{ background: "rgba(199,126,46,0.12)", color: "var(--color-ink)" }}
    >
      {text}
      {link && (
        <>
          {" "}
          <Link href="/settings#settings-holidays" className="font-semibold underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
            {t("holidaysEditLink")}
          </Link>
        </>
      )}
    </p>
  );
}
