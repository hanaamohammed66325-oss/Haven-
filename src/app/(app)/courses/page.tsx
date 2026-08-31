"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus, BookOpen, Undo2 } from "lucide-react";
import { useStore } from "@/store";
import { useT, usePageTitle } from "@/i18n";
import { Card } from "@/components/Card";
import { CoursePanel } from "@/components/CoursePanel";
import { AddCourseModal } from "@/components/AddCourseModal";
import { PremiumGate } from "@/components/PremiumGate";
import { useSubscription } from "@/lib/subscription";
import { canAddCourse } from "@/lib/premium";
import type { Course } from "@/types";

const UNDO_MS = 5000;

export default function CoursesPage() {
  const { t } = useT();
  usePageTitle("nav_courses");
  const { hydrated, courses, semester, addCourse, deleteCourse, softDeleteCourse, restoreCourse } = useStore();
  const { sub, profile } = useSubscription();
  const [adding, setAdding] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Course | null>(null);
  const pendingRef = useRef<Course | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    setPendingDelete(null);
  }, []);

  const handleDeleteCourse = useCallback((id: string) => {
    if (pendingRef.current) {
      deleteCourse(pendingRef.current.id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const removed = softDeleteCourse(id);
    if (!removed) return;

    pendingRef.current = removed;
    setPendingDelete(removed);
    timerRef.current = setTimeout(() => {
      const c = pendingRef.current;
      if (c) {
        deleteCourse(c.id);
        pendingRef.current = null;
        timerRef.current = null;
        setPendingDelete(null);
      }
    }, UNDO_MS);
  }, [deleteCourse, softDeleteCourse]);

  const handleUndo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const course = pendingRef.current;
    if (!course) return;
    restoreCourse(course);
    clearPending();
  }, [restoreCourse, clearPending]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingRef.current) return;
    const commit = () => {
      const c = pendingRef.current;
      if (c) deleteCourse(c.id);
    };
    window.addEventListener("beforeunload", commit);
    return () => window.removeEventListener("beforeunload", commit);
  }, [pendingDelete, deleteCourse]);

  const canAdd = canAddCourse(profile, sub, courses.length);

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
          onClick={() => (canAdd ? setAdding(true) : setGateOpen(true))}
          className="haven-btn shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
        >
          <Plus size={17} />
          {t("addCourse")}
        </button>
      </div>
      <p className="text-[15px] mb-12" style={{ color: "var(--color-muted)" }}>
        {t("coursesSubtitle")}
      </p>

      {courses.length === 0 && !pendingDelete ? (
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
              <CoursePanel course={c} onDeleteCourse={handleDeleteCourse} />
            </div>
          ))}
        </div>
      )}

      {pendingDelete && createPortal(
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg haven-fade-up"
          style={{ background: "var(--color-ink)", color: "var(--color-bg)" }}
        >
          <span className="text-sm font-medium">
            {t("courseDeleted", { name: pendingDelete.name })}
          </span>
          <button
            onClick={handleUndo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
            style={{ background: "var(--color-primary)", color: "#fff" }}
          >
            <Undo2 size={14} />
            {t("undo")}
          </button>
        </div>,
        document.body
      )}

      <AddCourseModal
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={addCourse}
        defaultLimit={semester.withdrawalLimit}
      />

      <PremiumGate open={gateOpen} onClose={() => setGateOpen(false)} feature="course" />
    </div>
  );
}
