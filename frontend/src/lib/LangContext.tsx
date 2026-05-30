"use client";
import { createContext, useContext, useState } from "react";
import { t, Lang } from "./i18n";

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  tr: (key: string) => string;
}>({ lang: "en", setLang: () => {}, tr: (k) => k });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const tr = (key: string) => t[lang][key] ?? t["en"][key] ?? key;
  return (
    <LangContext.Provider value={{ lang, setLang, tr }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
