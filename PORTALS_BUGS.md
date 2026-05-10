# Portals Bug Log — Customer & Careers Portals

**Date**: 2026-05-07
**Source**: Frontend test sweep (Task #140)

## Critical / High — Fixed this round

### BUG-PORTAL-001 (Critical) — `/api/portal/invoices` 500
- **Symptom**: GET `/api/portal/invoices` (and the customer-facing `/portal/invoices` list page) crashed with HTTP 500.
- **Root cause**: SELECT referenced `"issueDate"`, which does not exist on the `invoices` table. The closest column is `"createdAt"`.
- **Fix**: `artifacts/api-server/src/routes/clientPortal.ts` line 329 — `"issueDate"` → `"createdAt" AS "issueDate"` (preserves the JSON shape consumed by the React component).
- **Verified**: Re-running the sweep returns `/api/portal/invoices` = 200 and the list renders.

### BUG-PORTAL-002 (High) — Nested `<a>` hydration warnings in customer portal
- **Symptom**: Every authenticated customer-portal page logged React errors `<a> cannot contain a nested <a>` and `In HTML, <a> cannot be a descendant of <a>`.
- **Root cause**: wouter v3.3.5 renders `<Link>` as an `<a>` itself; the codebase was still using the v2-style pattern `<Link href="..."><a className="...">…</a></Link>`, producing nested anchors.
- **Fix**: Removed inner `<a>` wrappers and merged their props onto the surrounding `<Link>` directly. Changes applied via `/tmp/fix_anchors.cjs`. Files touched (15 occurrences total):
  - `artifacts/client-portal/src/pages/dashboard.tsx` (4)
  - `artifacts/client-portal/src/pages/tickets.tsx` (3)
  - `artifacts/client-portal/src/pages/new-ticket.tsx` (2)
  - `artifacts/client-portal/src/pages/kb.tsx` (2)
  - `artifacts/client-portal/src/pages/invoice-detail.tsx` (1)
  - `artifacts/client-portal/src/pages/ticket-detail.tsx` (1)
  - `artifacts/client-portal/src/pages/invoices.tsx` (1)
  - `artifacts/client-portal/src/components/layout.tsx` (1)
- **Verified**: Console-error axis (A3) is now PASS for all 11 customer-portal routes.

## Low — Logged, not fixed

### NOTE-PORTAL-003 (Low) — Stray `block` utility class on merged Link
- **Where**: A few `<Link>` elements (e.g. `dashboard.tsx`) end with `transition-colors block` after the auto-merge from BUG-PORTAL-002. The `block` keyword is harmless because `<Link>` already renders an `<a>` (inline by default) with the supplied utility classes overriding that. No visual regression observed in the sweep.
- **Recommendation**: cosmetic clean-up in a future pass.

### NOTE-PORTAL-004 (Low) — `emitEvent` warning for portal.login
- **Where**: API server log: `[emitEvent] payload warnings for portal.login: Missing required field "id" (expected number)`.
- **Impact**: Warning only — login still succeeds and audit row is written.
- **Recommendation**: include `account.id` (or `userId: account.id`) in the `emitEvent` payload from `clientPortal.ts` login handler.

### NOTE-PORTAL-005 (Environmental) — Replit dev-banner 502
- All pages report `GET /@replit/vite-plugin-dev-banner/banner-script.js → 502` in the browser. This is a Replit preview-iframe artifact, not portal code, and is filtered out of the matrix.
