"use client";

import { useState, useEffect } from "react";
import { Plus, BookOpen } from "lucide-react";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Card } from "@/components/Card";
import { CoursePanel } from "@/components/CoursePanel";
import { AddCourseModal } from "@/components/AddCourseModal";

export default function CoursesPage() {
  const { t } = useT();
  const { hydrated, courses, addCourse } = useStore();
  const [adding, setAdding] = useState(false);

  // When arriving from Assignments via /courses#<courseId>, scroll to that course.
  useEffect(() => {
    if (!hydrated) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    const id = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("haven-target");
      window.setTimeout(() => el.classList.remove("haven-target"), 1600);
    }, 80);
    return () => window.clearTimeout(id);
  }, [hydrated]);

  if (!hydrated) return <div className="h-40" />;

  return (
    <div className="haven-fade-in">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between mb-2">
        <h1 className="font-display text-[34px] leading-tight" style={{ color: "var(--color-ink)" }}>
          {t("nav_courses")}
        </h1>
        <button
          onClick={() => setAdding(true)}
          className="haven-btn shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
        >
          <Plus size={17} />
          {t("addCourse")}
        </button>
      </div>
      <p className="text-[15px] mb-12" style={{ color: "var(--color-muted)" }}>
        {t("coursesSubtitle")}
      </p>

      {courses.length === 0 ? (
        <Card className="flex flex-col items-center justify-center text-center py-16">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{ width: 56, height: 56, background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
          >
            <BookOpen size={24} />
          </div>
          <h3 className="font-display text-xl mb-2" style={{ color: "var(--color-ink)" }}>{t("emptyTitle")}</h3>
          <p className="max-w-sm text-[15px]" style={{ color: "var(--color-muted)" }}>{t("emptyHint")}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {courses.map((c, i) => (
            <div key={c.id} id={c.id} className="haven-fade-up scroll-mt-8" style={{ animationDelay: `${0.06 + i * 0.07}s` }}>
              <CoursePanel course={c} />
            </div>
          ))}
        </div>
      )}

      <AddCourseModal open={adding} onClose={() => setAdding(false)} onSubmit={addCourse} />
    </div>
  );
}
