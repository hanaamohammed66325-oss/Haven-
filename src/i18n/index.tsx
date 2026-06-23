"use client";

import React, { createContext, useContext, useEffect, ReactNode } from "react";
import { en, type TranslationKey } from "./translations/en";
import { ar } from "./translations/ar";
import { useStore } from "@/store";

const dictionaries = { en, ar };

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key]) : `{${key}}`
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
  const { language } = useStore();
  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const el = document.documentElement;
    el.lang = language;
    el.dir = dir;
    // Keep the tab title + meta description in the active language.
    document.title = dictionaries[language].metaTitle;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", dictionaries[language].metaDescription);
  }, [language, dir]);

  const t = (key: TranslationKey, params?: Params): string => {
    const template = dictionaries[language][key] ?? en[key] ?? key;
    return interpolate(template, params);
  };

  return (
    <I18nContext.Provider value={{ t, lang: language, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
