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
