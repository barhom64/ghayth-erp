/**
 * Canonical Arabic labels and tonal classes for the four-level
 * priority scale (low · medium · high · critical) used by tasks,
 * linked-tasks, requests, and tickets — matching the backend
 * z.enum(["low","medium","high","critical"]). «critical» (حرجة) is the
 * canonical top level; «urgent» is NOT a value and stays unmapped.
 *
 * Until this file existed, `linked-tasks.tsx` and `tasks.tsx` each
 * carried their own copy of the same maps. Centralise them so the
 * colour scheme stays identical between an entity card's "linked
 * tasks" badge and the global /tasks list.
 */

export type Priority = "critical" | "high" | "medium" | "low";

const PRIORITY_LABEL: Record<string, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  critical: "bg-red-200 text-red-800",
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-status-warning-foreground",
  low: "bg-emerald-100 text-emerald-700",
};

/**
 * Arabic label for a priority key. Falls back to the raw key when the
 * value isn't recognised, so a typo surfaces as the slug instead of
 * silently disappearing.
 */
export function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "";
  return PRIORITY_LABEL[priority] ?? priority;
}

/**
 * Tailwind class string for the priority badge background + text.
 * Defaults to a neutral slate when the priority isn't catalogued.
 */
export function priorityBadgeClass(priority: string | null | undefined): string {
  if (!priority) return "bg-slate-100 text-slate-700";
  return PRIORITY_BADGE_CLASS[priority] ?? "bg-slate-100 text-slate-700";
}
