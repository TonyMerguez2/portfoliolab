"use client";
import { useState, useEffect, useCallback } from "react";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";
import zh from "@/locales/zh.json";
import de from "@/locales/de.json";

export type Locale = "en" | "fr" | "es" | "zh" | "de";
const LOCALES: Record<Locale, any> = { en, fr, es, zh, de };
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English", fr: "Français", es: "Español", zh: "中文", de: "Deutsch",
};

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem("portfoliolab-locale") as Locale;
  if (saved && LOCALES[saved]) return saved;
  const browser = navigator.language.split("-")[0] as Locale;
  return LOCALES[browser] ? browser : "en";
}

function getNestedValue(obj: any, path: string): string {
  return path.split(".").reduce((acc, key) => acc?.[key], obj) ?? path;
}

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>("en");
  useEffect(() => { setLocaleState(detectLocale()); }, []);
  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem("portfoliolab-locale", l);
    setLocaleState(l);
  }, []);
  const t = useCallback((key: string): string => getNestedValue(LOCALES[locale], key), [locale]);
  return { t, locale, setLocale };
}
