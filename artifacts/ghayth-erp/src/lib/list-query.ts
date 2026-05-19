/**
 * Shared list-endpoint URL composer.
 *
 * The four warehouse tabs, three CRM/tasks pages and four fleet tabs all
 * speak the same query-string dialect to their list endpoints:
 *
 *   ?search=…&status=…&dateFrom=…&dateTo=…
 *
 * Before this module they each carried a private 13-line copy of the
 * helper (added incrementally in PRs #653 and #656). Issue #652 set the
 * extraction criterion at "three or more modules adopt the pattern" —
 * we now have four — so this module is the single source of truth.
 *
 * What this helper deliberately does NOT splice
 *   - companyIds / branchIds (scope): `useApiQuery → injectScope` adds
 *     those automatically and widens the cache key.
 *   - page / limit / sort / arbitrary domain-specific knobs: those stay
 *     on the base URL the caller composes.
 *
 * Keeping the API tight is intentional — broadening this signature is
 * how shared helpers turn back into spaghetti.
 */

export interface ListFilters {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Append the standard list filters (search/status/dateFrom/dateTo) to
 * a base URL. Empty values are omitted so the URL stays clean.
 *
 *   withListFilters("/warehouse/products", { search: "abc" })
 *     // → "/warehouse/products?search=abc"
 *
 *   withListFilters("/fleet/vehicles?page=1&limit=20", { dateFrom: "2026-05-01" })
 *     // → "/fleet/vehicles?page=1&limit=20&dateFrom=2026-05-01"
 *
 *   withListFilters("/crm/opportunities", {})
 *     // → "/crm/opportunities"  (untouched)
 */
export function withListFilters(base: string, f: ListFilters): string {
  const parts: string[] = [];
  if (f.search) parts.push(`search=${encodeURIComponent(f.search)}`);
  if (f.status) parts.push(`status=${encodeURIComponent(f.status)}`);
  if (f.dateFrom) parts.push(`dateFrom=${encodeURIComponent(f.dateFrom)}`);
  if (f.dateTo) parts.push(`dateTo=${encodeURIComponent(f.dateTo)}`);
  if (parts.length === 0) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${parts.join("&")}`;
}
