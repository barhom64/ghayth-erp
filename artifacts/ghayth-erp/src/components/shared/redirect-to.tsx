/**
 * RedirectTo — tiny wouter `<Redirect>` wrapper used by the route
 * registry's `component:` slot. PR-3 (#2163) introduces it so legacy
 * route paths can stay reachable (no 404 for bookmarks / old links)
 * while still proving the new canonical URL is the single owner.
 *
 * The wouter docs: `<Redirect>` immediately replaces the current
 * history entry with `to=`. Wrapping it in a thin function lets us
 * pass it where the route registry expects a `component`.
 *
 * Usage:
 *   const RedirectToHrAttendanceCategories =
 *     redirectTo("/hr/attendance-categories");
 *   { path: "/admin/attendance-categories",
 *     component: RedirectToHrAttendanceCategories,
 *     subKey: "attendance" }
 *
 * Why a factory (and not `() => <Redirect to="..."/>` inline) — the
 * route registry pins component identity for memoisation; a factory
 * ensures each legacy path has a stable identity, and the function
 * name shows up in React devtools so a reviewer can see at a glance
 * which legacy path is being served.
 */
import { Redirect } from "wouter";

export function redirectTo(target: string) {
  const RedirectComponent = () => <Redirect to={target} />;
  RedirectComponent.displayName = `RedirectTo(${target})`;
  return RedirectComponent;
}
