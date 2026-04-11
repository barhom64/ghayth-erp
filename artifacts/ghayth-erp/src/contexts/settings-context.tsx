import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { setGlobalSettings, getGlobalCurrencyLabel, getGlobalCalendarMode } from "@/lib/settings-store";

const CURRENCY_LABELS: Record<string, string> = {
  SAR: "ر.س",
  USD: "$",
  AED: "د.إ",
  EUR: "€",
  GBP: "£",
};

interface SystemSettings {
  companyName: string;
  companyNameEn: string;
  currency: string;
  timezone: string;
  taxNumber: string;
  crNumber: string;
  phone: string;
  email: string;
  address: string;
  language: string;
  calendarMode: "hijri" | "gregorian" | "both";
}

const defaultSettings: SystemSettings = {
  companyName: "",
  companyNameEn: "",
  currency: "SAR",
  timezone: "Asia/Riyadh",
  taxNumber: "",
  crNumber: "",
  phone: "",
  email: "",
  address: "",
  language: "ar",
  calendarMode: getGlobalCalendarMode(),
};

interface SettingsContextType {
  settings: SystemSettings;
  loading: boolean;
  reload: () => Promise<void>;
  formatCurrency: (amount: number | null | undefined) => string;
  currencyLabel: string;
  calendarMode: "hijri" | "gregorian" | "both";
  setCalendarMode: (mode: "hijri" | "gregorian" | "both") => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);

  const loadDisplay = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Record<string, string> }>("/settings/display");
      const map = res.data || {};
      setSettings((prev) => {
        const updated = {
          ...prev,
          companyName: map.companyName || prev.companyName,
          currency: map.currency || prev.currency,
          timezone: map.timezone || prev.timezone,
        };
        setGlobalSettings({
          currency: updated.currency,
          timezone: updated.timezone,
          companyName: updated.companyName,
        });
        return updated;
      });
    } catch {
      // keep defaults
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: { key: string; value: string }[] }>("/settings/general");
      const rows = res.data || [];
      const map: Record<string, string> = {};
      for (const r of rows) {
        map[r.key] = r.value;
      }
      const rawMode = map.calendarMode;
      const calMode: "hijri" | "gregorian" | "both" =
        rawMode === "gregorian" ? "gregorian" : rawMode === "both" ? "both" : "hijri";
      const newSettings = {
        companyName: map.companyName || defaultSettings.companyName,
        companyNameEn: map.companyNameEn || defaultSettings.companyNameEn,
        currency: map.currency || defaultSettings.currency,
        timezone: map.timezone || defaultSettings.timezone,
        taxNumber: map.taxNumber || defaultSettings.taxNumber,
        crNumber: map.crNumber || defaultSettings.crNumber,
        phone: map.phone || defaultSettings.phone,
        email: map.email || defaultSettings.email,
        address: map.address || defaultSettings.address,
        language: map.language || defaultSettings.language,
        calendarMode: calMode,
      };
      setSettings(newSettings);
      setGlobalSettings({
        currency: newSettings.currency,
        timezone: newSettings.timezone,
        companyName: newSettings.companyName,
        calendarMode: calMode,
      });
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDisplay();
  }, [loadDisplay]);

  useEffect(() => {
    if (isAuthenticated) {
      load();
    }
  }, [isAuthenticated, load]);

  const currencyLabel = CURRENCY_LABELS[settings.currency] || settings.currency;

  const formatCurrency = useCallback(
    (amount: number | null | undefined): string => {
      if (amount == null) return "-";
      const formatted = amount.toLocaleString("en-US");
      return `${formatted} ${CURRENCY_LABELS[settings.currency] || settings.currency}`;
    },
    [settings.currency]
  );

  const setCalendarMode = useCallback((mode: "hijri" | "gregorian" | "both") => {
    setSettings((prev) => ({ ...prev, calendarMode: mode }));
    setGlobalSettings({ calendarMode: mode });
  }, []);

  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      reload: load,
      formatCurrency,
      currencyLabel,
      calendarMode: settings.calendarMode,
      setCalendarMode,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
