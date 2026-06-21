/**
 * Tests for honoring user notification preferences.
 *
 * Regression guard: the preferences UI (notifications.tsx) writes
 * row-per-channel rows (channel + category + enabled). The engine used
 * to read legacy boolean columns the UI never wrote, so every toggle
 * was ignored. computeDisabledChannels now reads the UI's shape, with a
 * category-specific row overriding the global 'general' master switch.
 */
import { describe, it, expect } from "vitest";
import { computeDisabledChannels, type PreferenceRow } from "../../src/lib/notificationDispatch.js";

describe("computeDisabledChannels", () => {
  it("returns empty when there are no preference rows (default: all on)", () => {
    expect(computeDisabledChannels([], "leave").size).toBe(0);
  });

  it("honors a global 'general' opt-out (the master switch the UI writes)", () => {
    const rows: PreferenceRow[] = [
      { channel: "email", category: "general", enabled: false },
      { channel: "sms", category: "general", enabled: true },
    ];
    const disabled = computeDisabledChannels(rows, "leave");
    expect(disabled.has("email")).toBe(true);
    expect(disabled.has("sms")).toBe(false);
  });

  it("lets a category-specific row override the general master switch", () => {
    const rows: PreferenceRow[] = [
      { channel: "whatsapp", category: "general", enabled: false }, // off globally
      { channel: "whatsapp", category: "payroll", enabled: true },  // but on for payroll
    ];
    const disabled = computeDisabledChannels(rows, "payroll");
    expect(disabled.has("whatsapp")).toBe(false); // category wins → not disabled
  });

  it("category override can also disable a globally-enabled channel", () => {
    const rows: PreferenceRow[] = [
      { channel: "email", category: "general", enabled: true },
      { channel: "email", category: "invoice", enabled: false },
    ];
    expect(computeDisabledChannels(rows, "invoice").has("email")).toBe(true);
  });

  it("ignores rows for other categories", () => {
    const rows: PreferenceRow[] = [
      { channel: "email", category: "leave", enabled: false },
    ];
    // Target category is 'invoice' — the 'leave' row must not apply.
    expect(computeDisabledChannels(rows, "invoice").size).toBe(0);
  });

  it("collects multiple disabled channels", () => {
    const rows: PreferenceRow[] = [
      { channel: "email", category: "general", enabled: false },
      { channel: "sms", category: "general", enabled: false },
      { channel: "whatsapp", category: "general", enabled: false },
    ];
    const disabled = computeDisabledChannels(rows, "leave");
    expect(disabled.size).toBe(3);
    expect([...disabled].sort()).toEqual(["email", "sms", "whatsapp"]);
  });
});
