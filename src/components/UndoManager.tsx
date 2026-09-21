"use client";

// ---------------------------------------------------------------------------
// Undo manager — one shared "deleted … [Undo]" toast for the whole app.
//
// Any delete of an IMPORTANT item (a course, a task/exam, a grade component, a
// class session) routes through `useUndo().undoableDelete(...)` instead of
// deleting outright. The item is removed from local state immediately (so the UI
// feels instant), but the real cloud delete is DEFERRED: it only runs after the
// undo window closes, or when a NEW delete replaces this one, or when the tab is
// about to close. Tapping Undo restores the item and the cloud delete never runs.
//
// Each caller supplies three things:
//   • message  — the fully-formed toast line (already translated),
//   • onUndo   — put the item back in local state,
//   • onCommit — actually delete it (the store's normal delete, incl. cloud).
// Centralised here so every surface shares one timer, one toast, one behaviour.
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, Undo2 } from "lucide-react";
import { useT } from "@/i18n";

const UNDO_MS = 5000;

interface UndoRequest {
  /** Fully-formed, already-translated toast text (e.g. `"…" deleted`). */
  message: string;
  /** Restore the item to local state. */
  onUndo: () => void;
  /** Perform the real delete (local no-op + cloud). Runs when the window closes. */
  onCommit: () => void;
}

interface UndoCtx {
  undoableDelete: (req: UndoRequest) => void;
}

const Ctx = createContext<UndoCtx | null>(null);

/** Access the shared undo flow. Safe to call anywhere under <UndoProvider>. */
export function useUndo(): UndoCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUndo must be used within <UndoProvider>");
  return ctx;
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const [visible, setVisible] = useState<{ message: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  // Bumped per toast so its entrance + countdown-bar animation replay even when
  // one delete immediately replaces another (same DOM node otherwise).
  const [seq, setSeq] = useState(0);
  const pendingRef = useRef<UndoRequest | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  const undoableDelete = useCallback((req: UndoRequest) => {
    // A delete already waiting? Commit it before starting the new one — only one
    // item can sit in the undo window at a time.
    if (pendingRef.current) {
      const prev = pendingRef.current;
      if (timerRef.current) clearTimeout(timerRef.current);
      prev.onCommit();
    }
    pendingRef.current = req;
    setVisible({ message: req.message });
    setSeq((s) => s + 1);
    timerRef.current = setTimeout(() => {
      const p = pendingRef.current;
      timerRef.current = null;
      pendingRef.current = null;
      setVisible(null);
      p?.onCommit();
    }, UNDO_MS);
  }, []);

  const handleUndo = useCallback(() => {
    const p = pendingRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    setVisible(null);
    p?.onUndo();
  }, []);

  // If the tab closes mid-window, don't leave a half-deleted item — commit it.
  useEffect(() => {
    const commit = () => {
      pendingRef.current?.onCommit();
    };
    window.addEventListener("beforeunload", commit);
    return () => window.removeEventListener("beforeunload", commit);
  }, []);

  // Clear any live timer on unmount.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <Ctx.Provider value={{ undoableDelete }}>
      {children}
      {mounted && visible && createPortal(
        <div
          key={seq}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] overflow-hidden rounded-full haven-fade-up max-w-[calc(100vw-2rem)]"
          style={{ background: "var(--color-ink)", boxShadow: "var(--shadow-card-hover)" }}
        >
          <div className="flex items-center gap-3 ps-3 pe-2 py-2">
            <span
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 28, height: 28, background: "rgba(255,255,255,0.12)" }}
            >
              <Trash2 size={13} style={{ color: "var(--color-bg)" }} />
            </span>
            <span
              className="text-sm font-medium truncate min-w-0"
              style={{ color: "var(--color-bg)" }}
            >
              {visible.message}
            </span>
            <button
              onClick={handleUndo}
              className="haven-undo-btn shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold cursor-pointer"
              style={{ background: "var(--color-primary)", color: "#fff" }}
            >
              <Undo2 size={14} />
              {t("undo")}
            </button>
          </div>
          {/* Depleting countdown — mirrors the time left before the delete commits. */}
          <div className="h-[3px] w-full" style={{ background: "rgba(255,255,255,0.10)" }}>
            <div
              className="h-full"
              style={{
                background: "var(--color-primary)",
                animationName: "haven-undo-bar",
                animationDuration: `${UNDO_MS}ms`,
                animationTimingFunction: "linear",
                animationFillMode: "forwards",
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </Ctx.Provider>
  );
}

// Keep the deferred flush available to callers that must commit synchronously
// (currently unused externally, but exported for symmetry / future use).
export type { UndoRequest };
