import { PageStatusBadge } from "@/components/page-status-badge";

/**
 * @deprecated Use `PageStatusBadge` from `@/components/page-status-badge`.
 *
 * R.1.3 (Reference UI/UX phase) — this file used to render its own pill
 * via `STATUSES` + `getStatusColor` from `lib/constants.ts`, which meant
 * the same status value could display differently depending on which
 * page rendered it. Phase 1.6 of the architectural unification landed
 * `PageStatusBadge` as the single source of truth for status → arabic
 * label + tone mapping, but 48 call sites still import `StatusBadge`
 * from this path.
 *
 * This file is now a thin forwarder: `<StatusBadge status={x} />` just
 * renders `<PageStatusBadge status={x} />`. The two components are
 * visually identical on every status covered by `STATUS_MAP`, and they
 * fall back to the same neutral gray pill for unknown statuses — so all
 * 48 call sites automatically pick up the canonical rendering without a
 * single refactor.
 *
 * New code should import `PageStatusBadge` directly. The `StatusBadge`
 * shim is kept here so no import breaks in this iteration; a later
 * iteration will migrate the 48 call sites and delete this file.
 *
 * See `docs/UI_TEMPLATES.md` section "Status chip — PageStatusBadge" for
 * the target usage.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return <PageStatusBadge status={status} className={className} />;
}
