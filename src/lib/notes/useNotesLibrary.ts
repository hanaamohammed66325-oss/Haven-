"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyLibrary, type NotesLibrary } from "./types";
import { loadLibrary, NotesConflictError, NotesStorageError, saveLibrary } from "./storage";

export type NotesLibraryStatus = "loading" | "saved" | "saving" | "error" | "conflict";

export interface UseNotesLibraryResult {
  library: NotesLibrary | null;
  update: (change: (current: NotesLibrary) => NotesLibrary) => void;
  status: NotesLibraryStatus;
  error: string | null;
  retry: () => void;
}

/**
 * Updates are immutable: return a fresh library/root for changed data and
 * preserve references for untouched folders, notebooks, pages and points.
 * The hook keeps that structural sharing through its pending snapshot.
 */
type LibraryChange = (current: NotesLibrary) => NotesLibrary;
type ErrorPhase = "load" | "save" | null;

interface ScopeSession {
  scope: string;
  active: boolean;
  loaded: boolean;
  baseRevision: number;
  library: NotesLibrary | null;
  pending: NotesLibrary | null;
  queuedChanges: LibraryChange[];
  saving: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  conflict: boolean;
  saveBlocked: boolean;
  retryable: boolean;
  errorPhase: ErrorPhase;
  lastError: unknown;
  reload: (() => void) | null;
}

function localLibrary(value: NotesLibrary, revision: number): NotesLibrary {
  if (
    value === null ||
    typeof value !== "object" ||
    value.schema !== 1 ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.notebooks)
  ) {
    throw new TypeError("The Notes update did not return a compatible library.");
  }
  return { ...value, schema: 1, revision, folders: value.folders, notebooks: value.notebooks };
}

function errorText(error: unknown): string {
  if (error instanceof NotesConflictError) return error.message;
  if (error instanceof NotesStorageError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Notes storage failed.";
}

function transientError(error: unknown): boolean {
  if (error instanceof NotesConflictError) return false;
  if (error instanceof NotesStorageError) return error.code === "unavailable" || error.code === "blocked" || error.code === "failed";
  const name = error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name) : "";
  return ["AbortError", "QuotaExceededError", "TimeoutError", "UnknownError"].includes(name);
}

export function useNotesLibrary(scope: string): UseNotesLibraryResult {
  const sessionRef = useRef<ScopeSession | null>(null);
  const [library, setLibrary] = useState<NotesLibrary | null>(null);
  const [status, setStatus] = useState<NotesLibraryStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const isCurrent = useCallback((session: ScopeSession): boolean => {
    return session.active && sessionRef.current === session;
  }, []);

  const setSessionLibrary = useCallback((session: ScopeSession, next: NotesLibrary) => {
    session.library = next;
    if (isCurrent(session)) setLibrary(next);
  }, [isCurrent]);

  const scheduleSave = useCallback((session: ScopeSession, delay = 200) => {
    if (!session.active || !session.loaded || !session.pending || session.saving || session.conflict || session.saveBlocked) return;
    if (session.timer !== null) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      session.timer = null;
      void flushSave(session);
    }, delay);
  }, []);

  const flushSave = useCallback((session: ScopeSession, allowInactive = false): void => {
    if ((!session.active && !allowInactive) || !session.loaded || !session.pending || session.saving || session.conflict || session.saveBlocked) return;

    const snapshot = session.pending;
    session.pending = null;
    session.saving = true;
    session.saveBlocked = false;
    session.retryable = false;
    session.errorPhase = null;
    session.lastError = null;
    if (isCurrent(session)) {
      setStatus("saving");
      setError(null);
    }

    let operation: Promise<number>;
    try {
      operation = saveLibrary(session.scope, snapshot, session.baseRevision);
    } catch (caught) {
      operation = Promise.reject(caught);
    }

    operation.then((nextRevision) => {
      session.saving = false;
      session.baseRevision = nextRevision;
      session.lastError = null;
      session.retryable = false;
      session.saveBlocked = false;
      if (session.pending) {
        // The pending snapshot was created against the previous revision. The
        // next CAS still uses the revision returned by this committed write.
        session.pending = { ...session.pending, revision: nextRevision };
        if (session.library) setSessionLibrary(session, { ...session.library, revision: nextRevision });
        if (session.active) scheduleSave(session, 0);
        else flushSave(session, true);
        return;
      }
      const committed = { ...(session.library ?? snapshot), revision: nextRevision };
      setSessionLibrary(session, committed);
      if (isCurrent(session)) {
        setStatus("saved");
        setError(null);
      }
    }).catch((caught) => {
      session.saving = false;
      if (!session.pending) session.pending = snapshot;
      session.lastError = caught;
      session.errorPhase = "save";
      if (caught instanceof NotesConflictError) {
        session.conflict = true;
        session.retryable = false;
        session.saveBlocked = false;
        if (isCurrent(session)) {
          setStatus("conflict");
          setError(errorText(caught));
        }
        return;
      }
      session.retryable = transientError(caught);
      session.saveBlocked = !session.retryable;
      if (isCurrent(session)) {
        setStatus("error");
        setError(errorText(caught));
      }
    });
  }, [isCurrent, scheduleSave, setSessionLibrary]);

  useEffect(() => {
    const session: ScopeSession = {
      scope,
      active: true,
      loaded: false,
      baseRevision: 0,
      library: null,
      pending: null,
      queuedChanges: [],
      saving: false,
      timer: null,
      conflict: false,
      saveBlocked: false,
      retryable: false,
      errorPhase: null,
      lastError: null,
      reload: null,
    };
    sessionRef.current = session;
    setLibrary(null);
    setStatus("loading");
    setError(null);

    const loadForSession = () => {
      if (!session.active) return;
      session.loaded = false;
      session.retryable = false;
      session.errorPhase = null;
      session.lastError = null;
      if (isCurrent(session)) {
        setStatus(session.pending ? "saving" : "loading");
        setError(null);
      }

      Promise.resolve().then(() => loadLibrary(session.scope)).then((loaded) => {
        session.loaded = true;
        session.baseRevision = loaded.revision;
        session.conflict = false;
        session.retryable = false;
        session.lastError = null;

        let merged = loaded;
        try {
          if (session.queuedChanges.length > 0) {
            for (const change of session.queuedChanges) {
              merged = localLibrary(change(merged), loaded.revision);
            }
            session.queuedChanges = [];
            session.pending = merged;
          }
        } catch (caught) {
          session.lastError = caught;
          session.errorPhase = "load";
          session.retryable = false;
          if (isCurrent(session)) {
            setStatus("error");
            setError(errorText(caught));
          }
          return;
        }

        session.library = merged;
        if (!session.active) {
          if (session.pending) flushSave(session, true);
          return;
        }
        setLibrary(merged);
        if (session.pending) {
          setStatus("saving");
          scheduleSave(session, 0);
        } else {
          setStatus("saved");
        }
        setError(null);
      }).catch((caught) => {
        session.loaded = false;
        session.lastError = caught;
        session.errorPhase = "load";
        session.retryable = transientError(caught);
        if (isCurrent(session)) {
          setStatus("error");
          setError(errorText(caught));
        }
      });
    };
    session.reload = loadForSession;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushSave(session);
    };
    const onPageHide = () => flushSave(session);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (session.pending || session.saving || session.queuedChanges.length > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("beforeunload", onBeforeUnload);
    }
    loadForSession();

    return () => {
      session.active = false;
      if (session.timer !== null) clearTimeout(session.timer);
      session.timer = null;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
      // A scope switch must not let an old promise update the new scope, but
      // its own pending snapshot is still flushed against its own scope.
      flushSave(session, true);
    };
  }, [flushSave, isCurrent, scheduleSave, scope]);

  const update = useCallback((change: LibraryChange) => {
    const session = sessionRef.current;
    if (!session || !session.active) return;
    const base = session.library ?? emptyLibrary();
    try {
      const next = localLibrary(change(base), session.baseRevision);
      const persistentError = !session.conflict && session.errorPhase === "save" && !session.retryable && session.lastError !== null;
      // A new user edit is an explicit opportunity to try a previously
      // persistent failure again. Keep the error visible during the debounce;
      // flushSave clears it only when the write actually starts.
      if (persistentError) session.saveBlocked = false;
      session.library = next;
      session.pending = next;
      if (!session.loaded) session.queuedChanges.push(change);
      if (isCurrent(session)) {
        setLibrary(next);
        if (session.conflict) {
          setStatus("conflict");
          setError(errorText(session.lastError));
        } else if (persistentError) {
          setStatus("error");
          setError(errorText(session.lastError));
        } else {
          session.lastError = null;
          session.errorPhase = null;
          session.retryable = false;
          setError(null);
          setStatus("saving");
        }
      }
      if (!session.conflict && !persistentError) {
        session.lastError = null;
        session.errorPhase = null;
        session.retryable = false;
      }
      if (session.loaded && !session.conflict && !session.saveBlocked) scheduleSave(session);
    } catch (caught) {
      session.lastError = caught;
      session.retryable = false;
      session.errorPhase = null;
      if (isCurrent(session)) {
        setStatus("error");
        setError(errorText(caught));
      }
    }
  }, [isCurrent, scheduleSave]);

  const retry = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !session.active || !session.retryable || session.conflict) return;
    session.retryable = false;
    session.lastError = null;
    if (session.errorPhase === "save" && session.loaded && session.pending) {
      setStatus("saving");
      setError(null);
      scheduleSave(session, 0);
      return;
    }
    if (session.errorPhase === "load" && session.reload) session.reload();
  }, [scheduleSave]);

  return { library, update, status, error, retry };
}
