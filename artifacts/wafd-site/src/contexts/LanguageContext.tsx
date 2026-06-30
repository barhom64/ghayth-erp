import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translations, LANGUAGES, detectBrowserLanguage } from "@/i18n";
import type { LangCode, Translations } from "@/i18n";

const STORAGE_KEY = "wafd_lang";

interface LanguageContextValue {
  lang: LangCode;
  t: Translations;
  dir: "rtl" | "ltr";
  setLang: (code: LangCode) => void;
  languages: typeof LANGUAGES;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (saved && translations[saved]) return saved;
    // Default to Arabic for all new visitors - primary market is Saudi Arabia
    const browserLang = detectBrowserLanguage();
    // If browser language is Arabic or any Arabic variant, use Arabic
    // Otherwise still default to Arabic as primary market
    const arabicLocales = ["ar", "ar-SA", "ar-EG", "ar-AE", "ar-KW", "ar-QA", "ar-BH", "ar-OM"];
    const nav = navigator.language?.toLowerCase() || "";
    if (arabicLocales.some(l => nav.startsWith(l.toLowerCase()))) return "ar";
    // For non-Arabic browsers, still default to Arabic (can be changed by user)
    return "ar";
  });

  const setLang = useCallback((code: LangCode) => {
    if (!translations[code]) return;
    setLangState(code);
    localStorage.setItem(STORAGE_KEY, code);
  }, []);

  const t = translations[lang];
  const dir = t.dir;

  // Apply dir and lang to <html> element
  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
    // Apply font based on language
    if (lang === "ar" || lang === "ur") {
      document.documentElement.style.fontFamily = "'Cairo', 'Tajawal', sans-serif";
    } else if (lang === "zh") {
      document.documentElement.style.fontFamily = "'Noto Sans SC', sans-serif";
    } else if (lang === "hi") {
      document.documentElement.style.fontFamily = "'Noto Sans Devanagari', sans-serif";
    } else {
      document.documentElement.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";
    }
  }, [lang, dir]);

  return (
    <LanguageContext.Provider value={{ lang, t, dir, setLang, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
