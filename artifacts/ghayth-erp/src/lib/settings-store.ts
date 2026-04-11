const CURRENCY_LABELS: Record<string, string> = {
  SAR: "ر.س",
  USD: "$",
  AED: "د.إ",
  EUR: "€",
  GBP: "£",
};

let _currency = "SAR";
let _timezone = "Asia/Riyadh";
let _companyName = "";
let _calendarMode: "hijri" | "gregorian" | "both" = (() => {
  try {
    const stored = localStorage.getItem("calendarMode");
    if (stored === "hijri" || stored === "gregorian" || stored === "both") return stored;
  } catch { /* ignore */ }
  return "hijri";
})();

export function setGlobalSettings(settings: { currency?: string; timezone?: string; companyName?: string; calendarMode?: "hijri" | "gregorian" | "both" }) {
  if (settings.currency) _currency = settings.currency;
  if (settings.timezone) _timezone = settings.timezone;
  if (settings.companyName !== undefined) _companyName = settings.companyName;
  if (settings.calendarMode) {
    _calendarMode = settings.calendarMode;
    try { localStorage.setItem("calendarMode", settings.calendarMode); } catch { /* ignore */ }
  }
}

export function getGlobalCurrency(): string {
  return _currency;
}

export function getGlobalCurrencyLabel(): string {
  return CURRENCY_LABELS[_currency] || _currency;
}

export function getGlobalTimezone(): string {
  return _timezone;
}

export function getGlobalCompanyName(): string {
  return _companyName;
}

export function getGlobalCalendarMode(): "hijri" | "gregorian" | "both" {
  return _calendarMode;
}
