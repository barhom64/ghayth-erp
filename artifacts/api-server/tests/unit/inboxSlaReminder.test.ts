import { describe, it, expect } from "vitest";
import {
  shouldFireSlaReminder,
  resolveTaskSlaReminderConfig,
  validateTaskSlaReminderConfig,
  DEFAULT_TASK_SLA_REMINDER_CONFIG,
  type TaskSlaReminderConfig,
} from "../../src/lib/inboxClassifier.js";

// ─── inbox_task_sla_reminder_scan decision logic ────────────────────────────
// Pure-function contract for the cron that nudges a task's assignee before its
// slaDeadline. No DB — the SQL handler only fetches candidate rows and applies
// this decision per row, so locking the decision here is the real gate.

const HOUR = 3_600_000;
const NOW = new Date("2026-06-14T12:00:00.000Z");
const mkDate = (offsetHours: number) => new Date(NOW.getTime() + offsetHours * HOUR);

function decide(
  overrides: Partial<{
    createdAt: Date;
    slaDeadline: Date;
    config: TaskSlaReminderConfig;
    reminderSentAt: Date | null;
    finalReminderSentAt: Date | null;
  }> = {},
) {
  return shouldFireSlaReminder({
    now: NOW,
    createdAt: overrides.createdAt ?? mkDate(-20),
    slaDeadline: overrides.slaDeadline ?? mkDate(4),
    config: overrides.config ?? DEFAULT_TASK_SLA_REMINDER_CONFIG,
    reminderSentAt: overrides.reminderSentAt ?? null,
    finalReminderSentAt: overrides.finalReminderSentAt ?? null,
  });
}

describe("shouldFireSlaReminder — leadFraction mode (default)", () => {
  it("does NOT fire while plenty of window remains", () => {
    // 24h window, 20h remaining → 83% left, threshold is 20% → no reminder
    const r = decide({ createdAt: mkDate(-4), slaDeadline: mkDate(20) });
    expect(r.firstReminder).toBe(false);
    expect(r.finalReminder).toBe(false);
  });

  it("fires once remaining window drops to/below leadFraction of the total", () => {
    // 24h window (created -20h, deadline +4h), 4h remaining = ~16.7% ≤ 20%
    const r = decide({ createdAt: mkDate(-20), slaDeadline: mkDate(4) });
    expect(r.firstReminder).toBe(true);
  });

  it("does NOT fire once the deadline is already breached (pre-breach only)", () => {
    const r = decide({ createdAt: mkDate(-26), slaDeadline: mkDate(-2) });
    expect(r.firstReminder).toBe(false);
    expect(r.finalReminder).toBe(false);
  });

  it("is idempotent — never re-fires after slaReminderSentAt is stamped", () => {
    const r = decide({ createdAt: mkDate(-20), slaDeadline: mkDate(4), reminderSentAt: mkDate(-1) });
    expect(r.firstReminder).toBe(false);
  });
});

describe("shouldFireSlaReminder — absolute leadHours mode", () => {
  const config: TaskSlaReminderConfig = { leadFraction: 0.2, leadHours: 3, finalReminderHours: null };

  it("fires when remaining ≤ leadHours regardless of total window size", () => {
    // huge 100h window but only 2h remaining, leadHours=3 → fire
    const r = decide({ createdAt: mkDate(-98), slaDeadline: mkDate(2), config });
    expect(r.firstReminder).toBe(true);
  });

  it("does NOT fire while remaining > leadHours", () => {
    const r = decide({ createdAt: mkDate(-98), slaDeadline: mkDate(5), config });
    expect(r.firstReminder).toBe(false);
  });
});

describe("shouldFireSlaReminder — optional final reminder", () => {
  const config: TaskSlaReminderConfig = { leadFraction: 0.2, leadHours: null, finalReminderHours: 1 };

  it("fires the final reminder within finalReminderHours of the deadline", () => {
    const r = decide({ createdAt: mkDate(-23), slaDeadline: mkDate(0.5), config });
    expect(r.finalReminder).toBe(true);
  });

  it("does NOT fire the final reminder when finalReminderHours is disabled (null)", () => {
    const r = decide({
      createdAt: mkDate(-23),
      slaDeadline: mkDate(0.5),
      config: { leadFraction: 0.2, leadHours: null, finalReminderHours: null },
    });
    expect(r.finalReminder).toBe(false);
  });

  it("is idempotent on the final reminder once slaFinalReminderSentAt is stamped", () => {
    const r = decide({ createdAt: mkDate(-23), slaDeadline: mkDate(0.5), config, finalReminderSentAt: mkDate(-0.1) });
    expect(r.finalReminder).toBe(false);
  });
});

describe("config validation + resolver", () => {
  it("rejects a leadFraction outside (0,1)", () => {
    expect(validateTaskSlaReminderConfig({ leadFraction: 1.5 }).errors.length).toBeGreaterThan(0);
    expect(validateTaskSlaReminderConfig({ leadFraction: 0 }).errors.length).toBeGreaterThan(0);
  });

  it("rejects non-positive leadHours / finalReminderHours", () => {
    expect(validateTaskSlaReminderConfig({ leadHours: -1 }).errors.length).toBeGreaterThan(0);
    expect(validateTaskSlaReminderConfig({ finalReminderHours: 0 }).errors.length).toBeGreaterThan(0);
  });

  it("accepts a valid override and round-trips through the resolver", () => {
    const raw = { leadFraction: 0.3, leadHours: 2, finalReminderHours: 1 };
    expect(validateTaskSlaReminderConfig(raw).errors).toHaveLength(0);
    expect(resolveTaskSlaReminderConfig(raw)).toEqual(raw);
  });

  it("falls back to defaults for a non-object / garbage stored value", () => {
    expect(resolveTaskSlaReminderConfig("nope")).toEqual(DEFAULT_TASK_SLA_REMINDER_CONFIG);
    expect(resolveTaskSlaReminderConfig(null)).toEqual(DEFAULT_TASK_SLA_REMINDER_CONFIG);
  });
});
