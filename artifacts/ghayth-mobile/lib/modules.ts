/**
 * Navigation module catalog + RBAC visibility.
 *
 * `userRoles[].modules` (from login / `/auth/me`) is the visibility signal: each
 * value is a `moduleKey` the user has at least one grant in. The app shows the
 * union across roles. Self-service modules are always visible (employee floor).
 * The server stays the final authority — every endpoint still enforces RBAC and
 * returns 403 if a guard fails.
 *
 * Source of truth: api-server featureCatalog.ts + routes/index.ts guards.
 * See docs/mobile/RBAC_MODULE_MAPPING.md.
 */
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { UserRole } from "@/lib/api";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface NavModule {
  key: string;
  label: string;
  icon: IoniconName;
  /** In-app route when a dedicated screen exists, else undefined → generic info screen. */
  route?: string;
  /** Always visible regardless of grants (self-service / employee floor). */
  selfService?: boolean;
  /** Implemented in this build vs. pending a dedicated screen. */
  built?: boolean;
}

export const NAV_MODULES: NavModule[] = [
  { key: "dashboard", label: "لوحة القيادة", icon: "grid-outline", route: "/(tabs)", selfService: true, built: true },
  { key: "my-space", label: "مساحتي", icon: "person-circle-outline", route: "/(tabs)/me", selfService: true, built: true },
  { key: "notifications", label: "الإشعارات", icon: "notifications-outline", route: "/(tabs)/notifications", selfService: true, built: true },
  { key: "approvals", label: "مركز الاعتماد", icon: "checkmark-done-outline", route: "/(tabs)/approvals", selfService: true, built: true },
  { key: "hr", label: "الموارد البشرية", icon: "people-outline", built: true },
  { key: "finance", label: "المالية", icon: "cash-outline", built: true },
  { key: "fleet", label: "الأسطول", icon: "car-outline", built: true },
  { key: "warehouse", label: "المستودع", icon: "cube-outline", built: true },
  { key: "operations", label: "العمليات", icon: "construct-outline", built: true },
  { key: "umrah", label: "العمرة", icon: "moon-outline", built: true },
  { key: "crm", label: "العملاء", icon: "briefcase-outline", built: true },
  { key: "documents", label: "المستندات", icon: "document-text-outline", built: true },
  { key: "support", label: "الدعم", icon: "help-buoy-outline", built: true },
  { key: "marketing", label: "التسويق", icon: "megaphone-outline", built: true },
  { key: "property", label: "العقارات", icon: "business-outline", built: true },
  { key: "legal", label: "الشؤون القانونية", icon: "shield-checkmark-outline", built: true },
  { key: "requests", label: "الطلبات", icon: "file-tray-full-outline", built: true },
  { key: "governance", label: "الحوكمة", icon: "ribbon-outline", built: true },
  { key: "comms", label: "التواصل", icon: "chatbubbles-outline", built: true },
  { key: "bi", label: "التقارير والتحليلات", icon: "analytics-outline", built: true },
  { key: "admin", label: "إدارة النظام", icon: "settings-outline", built: true },
];

const ALWAYS_VISIBLE = new Set(["dashboard", "my-space", "notifications"]);

/** Action Center / approvals require a managerial role level (server: requireMinLevel(20)). */
export const APPROVAL_MIN_LEVEL = 20;

export function allowedModuleSet(userRoles: UserRole[] | undefined | null): Set<string> {
  const set = new Set<string>();
  for (const role of userRoles ?? []) {
    for (const m of role.modules ?? []) set.add(m);
  }
  return set;
}

export function maxRoleLevel(userRoles: UserRole[] | undefined | null): number {
  return (userRoles ?? []).reduce((max, r) => Math.max(max, r.level ?? 0), 0);
}

export function canApprove(userRoles: UserRole[] | undefined | null): boolean {
  return maxRoleLevel(userRoles) >= APPROVAL_MIN_LEVEL;
}

export function isModuleVisible(key: string, allowed: Set<string>, level = 0): boolean {
  // Approvals/Action Center + unified calendar are manager-only (server:
  // requireMinLevel(20)) — don't surface a 403 button to ordinary staff.
  if (key === "approvals" || key === "calendar") return level >= APPROVAL_MIN_LEVEL;
  if (ALWAYS_VISIBLE.has(key)) return true;
  // Umrah nav is gated on the `operations` grant (routes use requireModule("operations")).
  if (key === "umrah") return allowed.has("operations") || allowed.has("umrah");
  if (key === "operations") return allowed.has("operations");
  if (key === "admin") return level >= 90;
  if (key === "bi") return level >= 50 && allowed.has("bi");
  if (key === "comms") return allowed.has("comms");
  return allowed.has(key);
}

export function visibleModules(userRoles: UserRole[] | undefined | null): NavModule[] {
  const allowed = allowedModuleSet(userRoles);
  const level = maxRoleLevel(userRoles);
  return NAV_MODULES.filter((m) => isModuleVisible(m.key, allowed, level));
}
