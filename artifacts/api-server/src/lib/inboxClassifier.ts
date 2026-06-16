/**
 * Inbox classifier — pure helpers shared with the inbox.message.received
 * event listener (eventListeners.ts). Extracted so the regex table and
 * the priority-lift / sla-deadline math are testable without spinning
 * up the event bus.
 *
 * v2 vs v1 (#N10):
 *   - matches subject + body window, not subject only
 *   - VIP/premium client classification lifts priority one notch
 *   - SLA deadline derived from priority so the cron escalator has a
 *     deadline to enforce instead of an open-ended task
 */

export type Priority = "low" | "normal" | "high" | "urgent";

export interface ClassifierRule {
  patterns: RegExp[];
  type: string;
  priority: Priority;
  titlePrefix: string;
}

/**
 * Canonical rule table. Order matters — more specific keywords first,
 * so "شكوى" classifies as complaint even though a complaint email may
 * also contain "طلب".
 */
export const INBOX_RULES: ReadonlyArray<ClassifierRule> = [
  { patterns: [/شكوى/i, /complaint/i],                          type: "complaint", priority: "high",   titlePrefix: "شكوى من" },
  { patterns: [/عاجل/i, /urgent/i, /asap/i, /\bemergency\b/i],   type: "urgent",    priority: "urgent", titlePrefix: "عاجل من" },
  { patterns: [/فاتورة/i, /invoice/i, /payment/i, /دفع/i],      type: "billing",   priority: "normal", titlePrefix: "استفسار فاتورة" },
  { patterns: [/طلب/i, /request/i, /apply/i],                   type: "request",   priority: "normal", titlePrefix: "طلب من" },
  { patterns: [/استفسار/i, /inquiry/i, /question/i],            type: "inquiry",   priority: "low",    titlePrefix: "استفسار من" },
];

/** SLA window per priority — feeds tasks.slaDeadline + tasks.slaHours. */
export const SLA_HOURS_BY_PRIORITY: Record<Priority, number> = {
  urgent: 2, high: 4, normal: 24, low: 72,
};

/** Find the first rule whose pattern set matches the haystack. */
export function classifyInboxMessage(haystack: string): ClassifierRule | null {
  if (!haystack.trim()) return null;
  for (const rule of INBOX_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule;
  }
  return null;
}

/**
 * Role escalation chain per classified task type. The auto-classifier
 * tries to pre-assign each new inbox task to the most appropriate role:
 * it picks the active assignment whose role appears earliest in this
 * list. Every chain ends at `owner` so there is always a final
 * catch-all — if no earlier role has an active assignment, the owner
 * gets it (and if even the owner has none, the task stays unassigned).
 */
export const ROLES_BY_TASK_TYPE: Readonly<Record<string, readonly string[]>> = {
  complaint: ["support_manager", "branch_manager", "general_manager", "owner"],
  urgent:    ["branch_manager", "general_manager", "owner"],
  billing:   ["accountant", "finance_manager", "general_manager", "owner"],
  request:   ["branch_manager", "general_manager", "owner"],
  inquiry:   ["support_manager", "branch_manager", "owner"],
};

/** Fallback chain for any task type without an explicit mapping. */
export const DEFAULT_TASK_ROLE_CHAIN: readonly string[] = ["owner"];

/**
 * The catch-all role every escalation chain MUST end at. It guarantees
 * there is always a final fallback assignee so a task is never silently
 * un-routable. Per-company overrides are validated against this.
 */
export const CATCHALL_ROLE = "owner";

/**
 * Settings key (3-level engine: system → company → branch) holding the
 * per-tenant role escalation chain override. The stored value is a JSON
 * object: `{ [taskType]: string[] }`. Any task type absent from the
 * override (or whose chain fails validation) falls back to the hardcoded
 * `ROLES_BY_TASK_TYPE` default below.
 */
export const TASK_ROLE_CHAIN_SETTING_KEY = "inbox.task_role_chains";

/** Canonical list of classifier-emitted task types (the override surface). */
export const INBOX_TASK_TYPES: readonly string[] = Object.keys(ROLES_BY_TASK_TYPE);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A single role key is a non-empty `[a-z0-9_]` identifier. */
export function isValidRoleKey(role: unknown): role is string {
  return typeof role === "string" && /^[a-z][a-z0-9_]*$/i.test(role.trim());
}

/**
 * Validate one escalation chain. Returns `null` when valid, or an Arabic
 * error message describing the first problem. A valid chain is a
 * non-empty array of distinct role keys that ends at `CATCHALL_ROLE`.
 */
export function validateRoleChain(chain: unknown): string | null {
  if (!Array.isArray(chain)) return "السلسلة يجب أن تكون قائمة من الأدوار";
  if (chain.length === 0) return "السلسلة لا يمكن أن تكون فارغة";
  const seen = new Set<string>();
  for (const r of chain) {
    if (!isValidRoleKey(r)) return `دور غير صالح: ${String(r)}`;
    const key = (r as string).trim();
    if (seen.has(key)) return `دور مكرر في السلسلة: ${key}`;
    seen.add(key);
  }
  const last = (chain[chain.length - 1] as string).trim();
  if (last !== CATCHALL_ROLE) {
    return `يجب أن تنتهي السلسلة بالدور الجامع (${CATCHALL_ROLE})`;
  }
  return null;
}

export interface RoleChainValidationError {
  taskType: string;
  message: string;
}

/**
 * Strict validation of a whole override payload `{ [taskType]: string[] }`.
 * Returns the trimmed, valid chains plus a list of per-task errors. The
 * settings write path rejects the request when `errors` is non-empty so
 * a tenant can never persist a chain without a catch-all.
 */
export function validateRoleChainMap(raw: unknown): {
  chains: Record<string, string[]>;
  errors: RoleChainValidationError[];
} {
  const chains: Record<string, string[]> = {};
  const errors: RoleChainValidationError[] = [];
  if (!isPlainRecord(raw)) {
    errors.push({ taskType: "*", message: "تنسيق سلاسل الأدوار غير صالح" });
    return { chains, errors };
  }
  for (const [taskType, chain] of Object.entries(raw)) {
    const err = validateRoleChain(chain);
    if (err) errors.push({ taskType, message: err });
    else chains[taskType] = (chain as string[]).map((r) => r.trim());
  }
  return { chains, errors };
}

/**
 * Merge a (possibly partial / partly-invalid) per-company override on top
 * of the hardcoded defaults. Invalid chains are silently ignored at
 * runtime so a bad stored value can never break auto-routing — the write
 * path is where validation is enforced. Returns a fully-populated map.
 */
export function resolveTaskRoleChains(
  override: unknown,
): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = { ...ROLES_BY_TASK_TYPE };
  if (isPlainRecord(override)) {
    for (const [taskType, chain] of Object.entries(override)) {
      if (validateRoleChain(chain) === null) {
        result[taskType] = (chain as string[]).map((r) => r.trim());
      }
    }
  }
  return result;
}

/* ── Per-company SLA reminder tuning ──────────────────────────────
 * The inbox_task_sla_reminder_scan cron nudges a task's assignee before
 * its slaDeadline. How early that first nudge fires (and whether a second
 * nudge fires closer to the deadline) is tunable per company via the
 * 3-level settings engine under this key. The stored value is a JSON
 * object validated by `validateTaskSlaReminderConfig`. Any missing/invalid
 * field falls back to the system default at runtime.
 */
export const TASK_SLA_REMINDER_SETTING_KEY = "inbox.task_sla_reminder";

/** Default fraction of the SLA window remaining when the first reminder fires. */
export const DEFAULT_TASK_SLA_REMINDER_FRACTION = 0.2;

export interface TaskSlaReminderConfig {
  /** First reminder fires once the remaining SLA window drops below this
   *  fraction of the total window (0 < f < 1). Used when `leadHours` is unset. */
  leadFraction: number;
  /** Absolute hours-before-deadline for the first reminder. When set (> 0)
   *  it takes precedence over `leadFraction`. */
  leadHours: number | null;
  /** Optional second reminder this many hours before the deadline (> 0 to
   *  enable). Null disables the second reminder. */
  finalReminderHours: number | null;
}

export const DEFAULT_TASK_SLA_REMINDER_CONFIG: TaskSlaReminderConfig = {
  leadFraction: DEFAULT_TASK_SLA_REMINDER_FRACTION,
  leadHours: null,
  finalReminderHours: null,
};

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Validate a per-company SLA reminder payload. Returns the normalized config
 * (invalid/absent fields keep their default) plus a list of Arabic error
 * messages. The settings write path rejects on any error; the runtime
 * resolver ignores the errors and uses the per-field fallbacks so a bad
 * stored value can never break the scan.
 */
export function validateTaskSlaReminderConfig(raw: unknown): {
  config: TaskSlaReminderConfig;
  errors: string[];
} {
  const errors: string[] = [];
  const config: TaskSlaReminderConfig = { ...DEFAULT_TASK_SLA_REMINDER_CONFIG };
  if (!isPlainRecord(raw)) {
    errors.push("تنسيق إعداد التذكير غير صالح");
    return { config, errors };
  }

  if (raw.leadFraction !== undefined && raw.leadFraction !== null) {
    const f = toFiniteNumber(raw.leadFraction);
    if (f === null || f <= 0 || f >= 1) {
      errors.push("نسبة التذكير المسبق يجب أن تكون رقماً بين 0 و 1");
    } else {
      config.leadFraction = f;
    }
  }

  if (raw.leadHours !== undefined && raw.leadHours !== null) {
    const h = toFiniteNumber(raw.leadHours);
    if (h === null || h <= 0) {
      errors.push("ساعات التذكير المسبق يجب أن تكون رقماً موجباً");
    } else {
      config.leadHours = h;
    }
  }

  if (raw.finalReminderHours !== undefined && raw.finalReminderHours !== null) {
    const h = toFiniteNumber(raw.finalReminderHours);
    if (h === null || h <= 0) {
      errors.push("ساعات التذكير النهائي يجب أن تكون رقماً موجباً");
    } else {
      config.finalReminderHours = h;
    }
  }

  return { config, errors };
}

/** Runtime resolver: merge a stored (possibly partial/invalid) value over the
 *  defaults, dropping any invalid field back to its default. */
export function resolveTaskSlaReminderConfig(stored: unknown): TaskSlaReminderConfig {
  if (!isPlainRecord(stored)) return { ...DEFAULT_TASK_SLA_REMINDER_CONFIG };
  return validateTaskSlaReminderConfig(stored).config;
}

/**
 * Pure decision for the `inbox_task_sla_reminder_scan` cron: given a pending
 * task's timing and the per-company config, decide whether the first
 * (lead-time) reminder and/or the optional final reminder should fire right
 * now. Both are pre-breach only (remaining > 0) and idempotent — already-sent
 * reminders never re-fire because their `*SentAt` stamp gates them here.
 *
 * - First reminder fires when the remaining window drops to/below the lead
 *   threshold: `leadHours` (absolute) when set, otherwise `leadFraction` of the
 *   total window (deadline − createdAt).
 * - Final reminder fires (only when `finalReminderHours` is enabled) when the
 *   remaining window drops to/below that many hours.
 */
export function shouldFireSlaReminder(args: {
  now: Date;
  createdAt: Date;
  slaDeadline: Date;
  config: TaskSlaReminderConfig;
  reminderSentAt: Date | null;
  finalReminderSentAt: Date | null;
}): { firstReminder: boolean; finalReminder: boolean } {
  const { now, createdAt, slaDeadline, config, reminderSentAt, finalReminderSentAt } = args;
  const HOUR_MS = 3_600_000;
  const remainingMs = slaDeadline.getTime() - now.getTime();

  let firstReminder = false;
  if (!reminderSentAt && remainingMs > 0) {
    let thresholdMs: number;
    if (config.leadHours != null && config.leadHours > 0) {
      thresholdMs = config.leadHours * HOUR_MS;
    } else {
      const windowMs = Math.max(0, slaDeadline.getTime() - createdAt.getTime());
      thresholdMs = config.leadFraction * windowMs;
    }
    firstReminder = remainingMs <= thresholdMs;
  }

  let finalReminder = false;
  if (config.finalReminderHours != null && config.finalReminderHours > 0 && !finalReminderSentAt && remainingMs > 0) {
    finalReminder = remainingMs <= config.finalReminderHours * HOUR_MS;
  }

  return { firstReminder, finalReminder };
}

/** Resolve the escalation chain for a task type (defaults to owner-only). */
export function rolesForTaskType(taskType: string): readonly string[] {
  return ROLES_BY_TASK_TYPE[taskType] ?? DEFAULT_TASK_ROLE_CHAIN;
}

/** Resolve a task type's chain from an already-merged chain map. */
export function rolesForTaskTypeFrom(
  chains: Record<string, readonly string[]>,
  taskType: string,
): readonly string[] {
  return chains[taskType] ?? DEFAULT_TASK_ROLE_CHAIN;
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Build the eligible role list + a SQL `CASE` ORDER expression that
 * ranks an assignment by where its role sits in the escalation chain
 * (earlier = higher priority, smaller number). `roleColumn` MUST be a
 * fully-qualified identifier (e.g. `ea."role"`) so the expression is
 * safe to drop into a multi-table JOIN without an ambiguous-column
 * error. Roles outside the chain sort last.
 */
export function buildRolePriorityCase(
  roles: readonly string[],
  roleColumn: string,
): { roles: readonly string[]; orderByExpr: string } {
  const whenClauses = roles
    .map((role, idx) => `WHEN ${quoteSqlLiteral(role)} THEN ${idx}`)
    .join(" ");
  const orderByExpr = `CASE ${roleColumn} ${whenClauses} ELSE ${roles.length} END`;
  return { roles, orderByExpr };
}

/** Convenience wrapper: resolve a task type's default chain then build the CASE. */
export function rolePriorityCase(
  taskType: string,
  roleColumn: string,
): { roles: readonly string[]; orderByExpr: string } {
  return buildRolePriorityCase(rolesForTaskType(taskType), roleColumn);
}

/**
 * Lift the matched priority one notch when the sender is a high-value
 * client (vip/premium). complaint+vip → urgent, request+vip → high.
 * Cap at urgent.
 */
export function liftPriorityForClassification(
  base: Priority,
  classification: string | null,
): Priority {
  if (classification !== "vip" && classification !== "premium") return base;
  if (base === "normal") return "high";
  if (base === "high") return "urgent";
  return base;
}
