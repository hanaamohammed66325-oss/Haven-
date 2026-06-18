"use client";

import { StoreProvider } from "@/store";
import { I18nProvider } from "@/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <I18nProvider>{children}</I18nProvider>
    </StoreProvider>
  );
}
