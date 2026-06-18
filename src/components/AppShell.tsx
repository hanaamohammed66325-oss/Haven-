"use client";

import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="haven-bg" aria-hidden="true">
        <span className="haven-orb-1" />
        <span className="haven-orb-2" />
        <span className="haven-orb-3" />
        <span className="haven-orb-4" />
      </div>
      <div className="flex min-h-dvh">
        <Sidebar />
        <main className="haven-main flex-1 min-w-0">
          <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
