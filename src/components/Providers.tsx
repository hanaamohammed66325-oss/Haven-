"use client";

import { StoreProvider } from "@/store";
import { I18nProvider } from "@/i18n";
import { UndoProvider } from "@/components/UndoManager";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <I18nProvider>
        <UndoProvider>{children}</UndoProvider>
      </I18nProvider>
    </StoreProvider>
  );
}
