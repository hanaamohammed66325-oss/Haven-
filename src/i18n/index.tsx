"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, ReactNode } from "react";
import { en, type TranslationKey } from "./translations/en";
import { ar } from "./translations/ar";
import { useStore } from "@/store";
import { plural } from "@/lib/format";

const dictionaries = { en, ar };

type Params = Record<string, string | number>;

// "{n}" is replaced by the value; "{n|one|two|few|many}" (Arabic) or
// "{n|one|other}" (English) picks the noun form its number takes — see plural().
function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)(?:\|([^{}]*))?\}/g, (whole, key, forms) =>
    !(key in params) ? whole : forms ? plural(params[key], forms.split("|")) : String(params[key])
  );
}

interface I18nContextValue {
  t: (key: TranslationKey, params?: Params) => string;
  lang: "en" | "ar";
  dir: "ltr" | "rtl";
}

const I18nContext = createContext<I18nContextValue>({
  t: (key) => en[key],
  lang: "en",
  dir: "ltr",
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const { language, hydrated } = useStore();
  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    // Until real data loads, `language` is still the default ("en"). The pre-paint
    // boot script already set <html lang/dir> to the user's real locale; leave it
    // alone until we have the real value, otherwise we'd flash it back to default.
    if (!hydrated) return;
    const el = document.documentElement;
    el.lang = language;
    el.dir = dir;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", dictionaries[language].metaDescription);
  }, [language, dir, hydrated]);

  // Stable while the language stays the same: this provider re-renders on every
  // store change, and a new `t` each time broke every memo and effect that
  // depends on it (e.g. the reminder scheduler re-sent its whole queue).
  const t = useCallback(
    (key: TranslationKey, params?: Params): string =>
      interpolate(dictionaries[language][key] ?? en[key] ?? key, params),
    [language]
  );
  const value = useMemo(() => ({ t, lang: language, dir }), [t, language, dir]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}

// Sets the browser tab <title> for a page, in the active locale. By default the
// label is branded with the "· Haven" suffix (matching the metadata template);
// pass { absolute: true } for the homepage brand title, which stands alone, or a
// `prefix` that takes the brand's place (the Pomodoro clock while it runs).
export function usePageTitle(key: TranslationKey, opts?: { absolute?: boolean; prefix?: string | null }) {
  const { t, lang } = useT();
  const { hydrated } = useStore();
  const absolute = opts?.absolute ?? false;
  const prefix = opts?.prefix ?? null;
  useEffect(() => {
    // The boot script set a correct pre-paint tab title (brand, in the real
    // locale). Don't override it until real data loads, or we'd briefly show the
    // per-page title in the DEFAULT locale before correcting.
    if (!hydrated) return;
    const label = t(key);
    document.title = absolute ? label : prefix ? `${prefix} · ${label}` : `${label} · Haven`;
  }, [t, lang, key, absolute, prefix, hydrated]);
}
