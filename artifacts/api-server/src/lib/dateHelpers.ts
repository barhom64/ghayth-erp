/**
 * Shared date helpers used across routes.
 *
 * Purpose: consolidate the two most duplicated date patterns in the codebase:
 *   - `new Date().toISOString().split("T")[0]`  → today as YYYY-MM-DD
 *   - `new Date().toISOString().slice(0, 7)`    → current month as YYYY-MM
 *
 * Found duplicated across 23+ route files.
 */

export function todayISO(date: Date = new Date()): string {
  return date.toISOString().split("T")[0]!;
}

export function currentPeriod(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function periodOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 7);
}

export function currentYear(date: Date = new Date()): number {
  return date.getFullYear();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
