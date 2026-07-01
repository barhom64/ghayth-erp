/**
 * settings-store — tests. Batch 11 of the FE behavioral-coverage effort
 * (ghayth-review documented gap).
 *
 * The module-level singleton behind formatters (currency label, calendar mode,
 * timezone, company name). The subtle, easy-to-break parts: a falsy currency /
 * timezone in setGlobalSettings is IGNORED (so a blank form field can't wipe the
 * setting), companyName CAN be cleared with "", the currency label falls back to
 * the raw code for unknown currencies, and calendarMode is mirrored to
 * localStorage. beforeEach resets the singleton so tests don't bleed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setGlobalSettings,
  getGlobalCurrency,
  getGlobalCurrencyLabel,
  getGlobalTimezone,
  getGlobalCompanyName,
  getGlobalCalendarMode,
} from "./settings-store";

beforeEach(() => {
  setGlobalSettings({ currency: "SAR", timezone: "Asia/Riyadh", companyName: "", calendarMode: "hijri" });
});

describe("settings-store", () => {
  it("maps a known currency to its Arabic label and falls back to the raw code", () => {
    setGlobalSettings({ currency: "SAR" });
    expect(getGlobalCurrencyLabel()).toBe("ر.س");
    setGlobalSettings({ currency: "USD" });
    expect(getGlobalCurrencyLabel()).toBe("$");
    setGlobalSettings({ currency: "XYZ" }); // unknown → raw code
    expect(getGlobalCurrencyLabel()).toBe("XYZ");
    expect(getGlobalCurrency()).toBe("XYZ");
  });

  it("updates currency, timezone and company name", () => {
    setGlobalSettings({ currency: "AED", timezone: "Asia/Dubai", companyName: "مجموعة الدور" });
    expect(getGlobalCurrency()).toBe("AED");
    expect(getGlobalCurrencyLabel()).toBe("د.إ");
    expect(getGlobalTimezone()).toBe("Asia/Dubai");
    expect(getGlobalCompanyName()).toBe("مجموعة الدور");
  });

  it("ignores a falsy currency/timezone but lets companyName be cleared with ''", () => {
    setGlobalSettings({ currency: "EUR", timezone: "Europe/Paris", companyName: "س" });
    setGlobalSettings({ currency: "", timezone: "", companyName: "" });
    expect(getGlobalCurrency()).toBe("EUR"); // falsy currency ignored
    expect(getGlobalTimezone()).toBe("Europe/Paris"); // falsy timezone ignored
    expect(getGlobalCompanyName()).toBe(""); // "" clears it (!== undefined)
  });

  it("updates calendarMode and mirrors it to localStorage", () => {
    setGlobalSettings({ calendarMode: "gregorian" });
    expect(getGlobalCalendarMode()).toBe("gregorian");
    expect(localStorage.getItem("calendarMode")).toBe("gregorian");

    setGlobalSettings({ calendarMode: "both" });
    expect(getGlobalCalendarMode()).toBe("both");
    expect(localStorage.getItem("calendarMode")).toBe("both");
  });
});
