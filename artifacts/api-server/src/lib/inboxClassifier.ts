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

/**
 * Per-task-type role priority list — ordered by who should own this
 * task type first. Matches role values already used by the existing
 * manager-lookup queries in cronScheduler.ts so the resolver composes
 * naturally with the rest of the codebase. Everything ends at `owner`
 * so a sparse org chart still produces an assignment.
 */
export const ROLES_BY_TASK_TYPE: Record<string, string[]> = {
  complaint: ["support_manager", "branch_manager", "general_manager", "owner"],
  urgent:    ["branch_manager", "general_manager", "owner"],
  billing:   ["accountant", "finance_manager", "general_manager", "owner"],
  request:   ["branch_manager", "general_manager", "owner"],
  inquiry:   ["support_manager", "branch_manager", "general_manager", "owner"],
};

/**
 * Build the SQL ORDER BY clause that picks the most specific role
 * assignment first. Returns the role list + the CASE expression so the
 * listener query can both filter (`role IN (...)`) and order
 * (`ORDER BY CASE ...`) without the caller duplicating the priority
 * mapping.
 *
 * Falls back to general_manager + owner for unknown task types.
 */
export function rolePriorityCase(taskType: string, roleColumn: string = "role"): { roles: string[]; orderCase: string } {
  const roles = ROLES_BY_TASK_TYPE[taskType] ?? ["general_manager", "owner"];
  const clauses = roles.map((r, i) => `WHEN '${r}' THEN ${i + 1}`).join(" ");
  return { roles, orderCase: `CASE ${roleColumn} ${clauses} ELSE ${roles.length + 1} END` };
}

/** Find the first rule whose pattern set matches the haystack. */
export function classifyInboxMessage(haystack: string): ClassifierRule | null {
  if (!haystack.trim()) return null;
  for (const rule of INBOX_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule;
  }
  return null;
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
