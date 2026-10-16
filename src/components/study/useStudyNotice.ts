"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Dismiss transient feedback without changing the operation or its retry queue. */
export function useStudyNotice<T>(empty: T, expires: (value: T) => boolean = () => true) {
  const [notice, setNotice] = useState<T>(empty);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const expiresRef = useRef(expires);
  expiresRef.current = expires;
  const show = useCallback((next: T) => {
    if (!mounted.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setNotice(next);
    if (next !== empty && expiresRef.current(next)) timer.current = setTimeout(() => {
      timer.current = null;
      setNotice(empty);
    }, 10_000);
  }, [empty]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);
  return [notice, show] as const;
}
