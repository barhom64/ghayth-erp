/**
 * Canonical Arabic labels and tonal classes for the three-level
 * priority scale used by tasks, linked-tasks, requests, and tickets.
 *
 * Until this file existed, `linked-tasks.tsx` and `tasks.tsx` each
 * carried their own copy of the same `{ high, medium, low }` maps.
 * Centralise them so a future bump (adding "urgent" / "critical")
 * lands in one place and so the colour scheme stays identical
 * between an entity card's "linked tasks" badge and the global
 * /tasks list.
 */

export type Priority = "high" | "medium" | "low";

const PRIORITY_LABEL: Record<string, string> = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
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
