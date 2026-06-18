"use client";

import { useState } from "react";
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

  if (!hydrated) return <div className="h-40" />;

  return (
    <div className="haven-fade-in">
      <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-ink)" }}>
          {t("nav_courses")}
        </h1>
        <button
          onClick={() => setAdding(true)}
          className="haven-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
        >
          <Plus size={17} />
          {t("addCourse")}
        </button>
      </div>
      <p className="text-sm mb-7" style={{ color: "var(--color-muted)" }}>
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
          <h3 className="font-semibold mb-1.5" style={{ color: "var(--color-ink)" }}>{t("emptyTitle")}</h3>
          <p className="max-w-sm text-sm" style={{ color: "var(--color-muted)" }}>{t("emptyHint")}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {courses.map((c) => (
            <CoursePanel key={c.id} course={c} />
          ))}
        </div>
      )}

      <AddCourseModal open={adding} onClose={() => setAdding(false)} onSubmit={addCourse} />
    </div>
  );
}
