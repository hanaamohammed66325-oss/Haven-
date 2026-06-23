"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";

const STORAGE_KEY = "haven-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore the collapsed state after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });

  return (
    <div className="flex min-h-dvh">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="haven-main flex-1 min-w-0">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-8 md:px-12 md:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
