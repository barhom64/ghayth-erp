import { useMemo } from "react";
import { useApiQuery } from "@/lib/api";
import { ROLE_OPTIONS } from "./shared";

export interface RbacRoleRow {
  id: number;
  role_key: string;
  label_ar: string;
  level?: number;
  is_system?: boolean;
  member_count?: number;
}

/**
 * Single source of truth for "which roles can I assign" across the admin
 * user screens. Reads the authoritative RBAC v2 roles list (custom roles
 * included — e.g. ones cloned in the role composer) and exposes both the
 * raw rows and a {value,label} options list for dropdowns.
 *
 * Every consumer shares the same query key so React Query dedupes to ONE
 * request, and falls back to the static standard list until loaded / on
 * error so the dropdowns are never empty. Centralising this here removes
 * the previously-hardcoded ROLE_OPTIONS dropdowns (which couldn't see
 * custom roles) and the duplicated per-page fetches.
 */
export function useRbacRoles() {
  const { data } = useApiQuery<{ data: RbacRoleRow[] }>(["rbac-roles-options"], "/rbac/v2/roles");
  const roles = data?.data ?? [];
  const options = useMemo(
    () => (roles.length > 0
      ? roles.map((r) => ({ value: r.role_key, label: r.label_ar || r.role_key }))
      : ROLE_OPTIONS),
    [roles],
  );
  return { roles, options };
}
