import { ar } from "./ar";
import { en } from "./en";
import { ur } from "./ur";
import { id } from "./id";
import { ms } from "./ms";
import { fr } from "./fr";
import { tr } from "./tr";
import { zh } from "./zh";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { hi as hiRaw } from "./hi";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hi = hiRaw as unknown as typeof ar;

export type { Translations } from "./ar";

// hi.ts uses @ts-nocheck to allow partial translations with fallback to Arabic
export const translations = { ar, en, ur, id, ms, fr, tr, zh, hi } as const;

export type LangCode = keyof typeof translations;

export const LANGUAGES: { code: LangCode; name: string; flag: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", name: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "en", name: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "ur", name: "اردو", flag: "🇵🇰", dir: "rtl" },
  { code: "id", name: "Indonesia", flag: "🇮🇩", dir: "ltr" },
  { code: "ms", name: "Melayu", flag: "🇲🇾", dir: "ltr" },
  { code: "fr", name: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷", dir: "ltr" },
  { code: "zh", name: "中文", flag: "🇨🇳", dir: "ltr" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
];

export function detectBrowserLanguage(): LangCode {
  const browserLang = navigator.language?.split("-")[0]?.toLowerCase();
  const supported = Object.keys(translations) as LangCode[];
  if (supported.includes(browserLang as LangCode)) {
    return browserLang as LangCode;
  }
  return "ar";
}
