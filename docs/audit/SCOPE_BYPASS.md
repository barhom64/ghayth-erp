# Scope Bypass — Static Detector Report

Generated: 2026-05-20T15:07:26.335Z

Scope: `artifacts/api-server/src/routes/**.ts` only (per #685 PR-1, owner-approved boundary).

Detector: flags hand-rolled `"companyId" = $N` predicates that bypass
`buildScopedWhere` / `parseScopeFilters` in `artifacts/api-server/src/lib/scopedQuery.ts`.
Per-line opt-out: `// scope-ok: <reason>` on the same line.
File allowlist for Category C/D: `audit/system-review/tooling/scope-bypass-allowlist.txt`.

**This is a report-only detector.** The companion CI wrapper
`scripts/src/check-scope-bypass.mjs` exits 0 by default (warning-first)
so a new hand-rolled predicate does not break `main`. Strict-mode is
opt-in via env: `SCOPE_BYPASS_STRICT=1`.

## Totals

| Metric | Value |
|---|---:|
| Route files scanned | 88 |
| Files with ≥1 hand-rolled hit | 82 |
| Total hand-rolled hits | 2286 |

## By Category

| Class | Meaning | Files | Hits |
|---|---|---:|---:|
| **A** | Safe — mechanical `buildScopedWhere` swap | 57 | 1876 |
| **B** | Risky — aliased company column / report joins | 19 | 304 |
| **C** | Manual — allowlist (portals / auth / admin / pdpl) | 5 | 101 |
| **D** | Helper — caller-side normalisation first | 1 | 5 |

## Files

| File | Class | Hits | Aliased | Uses `buildScopedWhere` | Reason |
|---|:---:|---:|---:|---:|---|
| `artifacts/api-server/src/routes/hr.ts` | A | 259 | 99 | 2 | aliased fraction 38% (99/259) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 99 aliased hits) |
| `artifacts/api-server/src/routes/properties.ts` | A | 134 | 40 | 0 | aliased fraction 30% (40/134) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 40 aliased hits) |
| `artifacts/api-server/src/routes/fleet.ts` | A | 119 | 29 | 6 | aliased fraction 24% (29/119) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 29 aliased hits) |
| `artifacts/api-server/src/routes/umrah.ts` | A | 86 | 18 | 0 | aliased fraction 21% (18/86) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 18 aliased hits) |
| `artifacts/api-server/src/routes/bi.ts` | A | 81 | 26 | 0 | aliased fraction 32% (26/81) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 26 aliased hits) |
| `artifacts/api-server/src/routes/admin.ts` | C | 74 | 15 | 0 | intentionally cross-tenant; system-wide admin operations |
| `artifacts/api-server/src/routes/umrah-entities.ts` | A | 65 | 20 | 0 | aliased fraction 31% (20/65) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 20 aliased hits) |
| `artifacts/api-server/src/routes/projects.ts` | A | 58 | 19 | 1 | aliased fraction 33% (19/58) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 19 aliased hits) |
| `artifacts/api-server/src/routes/legal.ts` | A | 55 | 7 | 0 | aliased fraction 13% (7/55) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 7 aliased hits) |
| `artifacts/api-server/src/routes/governance.ts` | A | 54 | 1 | 0 | aliased fraction 2% (1/54) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/finance-invoices.ts` | A | 52 | 12 | 1 | aliased fraction 23% (12/52) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 12 aliased hits) |
| `artifacts/api-server/src/routes/finance-algorithms.ts` | A | 50 | 23 | 0 | aliased fraction 46% (23/50) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 23 aliased hits) |
| `artifacts/api-server/src/routes/moduleDashboards.ts` | A | 50 | 8 | 0 | aliased fraction 16% (8/50) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 8 aliased hits) |
| `artifacts/api-server/src/routes/finance-journal.ts` | A | 46 | 18 | 4 | aliased fraction 39% (18/46) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 18 aliased hits) |
| `artifacts/api-server/src/routes/finance-reports.ts` | B | 46 | 31 | 0 | aliased fraction 67% (31/46) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/warehouse.ts` | A | 46 | 7 | 4 | aliased fraction 15% (7/46) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 7 aliased hits) |
| `artifacts/api-server/src/routes/documents.ts` | A | 44 | 4 | 0 | aliased fraction 9% (4/44) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 4 aliased hits) |
| `artifacts/api-server/src/routes/employees.ts` | B | 43 | 23 | 1 | aliased fraction 53% (23/43) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/clients.ts` | A | 36 | 3 | 1 | aliased fraction 8% (3/36) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 3 aliased hits) |
| `artifacts/api-server/src/routes/finance-hardening.ts` | A | 34 | 16 | 0 | aliased fraction 47% (16/34) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 16 aliased hits) |
| `artifacts/api-server/src/routes/support.ts` | A | 34 | 5 | 2 | aliased fraction 15% (5/34) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 5 aliased hits) |
| `artifacts/api-server/src/routes/crm.ts` | A | 32 | 7 | 1 | aliased fraction 22% (7/32) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 7 aliased hits) |
| `artifacts/api-server/src/routes/finance-purchase.ts` | A | 32 | 5 | 2 | aliased fraction 16% (5/32) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 5 aliased hits) |
| `artifacts/api-server/src/routes/rbacV2.ts` | B | 32 | 16 | 0 | aliased fraction 50% (16/32) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/finance-zatca.ts` | A | 29 | 7 | 0 | aliased fraction 24% (7/29) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 7 aliased hits) |
| `artifacts/api-server/src/routes/finance-custodies.ts` | B | 27 | 24 | 0 | aliased fraction 89% (24/27) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/intelligence.ts` | A | 27 | 12 | 0 | aliased fraction 44% (12/27) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 12 aliased hits) |
| `artifacts/api-server/src/routes/mySpace.ts` | B | 24 | 15 | 0 | aliased fraction 63% (15/24) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/requests.ts` | A | 24 | 8 | 0 | aliased fraction 33% (8/24) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 8 aliased hits) |
| `artifacts/api-server/src/routes/accounting-engine.ts` | A | 23 | 11 | 0 | aliased fraction 48% (11/23) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 11 aliased hits) |
| `artifacts/api-server/src/routes/communications.ts` | A | 23 | 1 | 0 | aliased fraction 4% (1/23) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/settings.ts` | A | 23 | 0 | 0 | aliased fraction 0% (0/23) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/store.ts` | A | 23 | 3 | 0 | aliased fraction 13% (3/23) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 3 aliased hits) |
| `artifacts/api-server/src/routes/tasks.ts` | A | 22 | 2 | 1 | aliased fraction 9% (2/22) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 2 aliased hits) |
| `artifacts/api-server/src/routes/hr-contracts.ts` | A | 21 | 4 | 0 | aliased fraction 19% (4/21) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 4 aliased hits) |
| `artifacts/api-server/src/routes/training.ts` | A | 21 | 9 | 0 | aliased fraction 43% (9/21) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 9 aliased hits) |
| `artifacts/api-server/src/routes/activityLog.ts` | B | 20 | 12 | 0 | aliased fraction 60% (12/20) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/marketing.ts` | A | 20 | 0 | 0 | aliased fraction 0% (0/20) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/hr-discipline.ts` | A | 19 | 3 | 0 | aliased fraction 16% (3/19) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 3 aliased hits) |
| `artifacts/api-server/src/routes/notification-engine.ts` | A | 19 | 1 | 0 | aliased fraction 5% (1/19) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/recruitment.ts` | B | 18 | 9 | 0 | aliased fraction 50% (9/18) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/automation.ts` | A | 16 | 1 | 0 | aliased fraction 6% (1/16) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/hr-exit.ts` | A | 16 | 3 | 0 | aliased fraction 19% (3/16) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 3 aliased hits) |
| `artifacts/api-server/src/routes/clientPortal.ts` | C | 15 | 1 | 0 | portal own-token scope; req.scope is not the employee RequestScope |
| `artifacts/api-server/src/routes/execDashboard.ts` | A | 15 | 5 | 0 | aliased fraction 33% (5/15) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 5 aliased hits) |
| `artifacts/api-server/src/routes/gov-integrations.ts` | A | 15 | 7 | 1 | aliased fraction 47% (7/15) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 7 aliased hits) |
| `artifacts/api-server/src/routes/hr-overtime.ts` | A | 14 | 5 | 0 | aliased fraction 36% (5/14) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 5 aliased hits) |
| `artifacts/api-server/src/routes/workflows.ts` | A | 14 | 2 | 1 | aliased fraction 14% (2/14) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 2 aliased hits) |
| `artifacts/api-server/src/routes/calendar.ts` | B | 13 | 7 | 0 | aliased fraction 54% (7/13) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/finance-budget.ts` | B | 13 | 7 | 1 | aliased fraction 54% (7/13) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/finance-vendors.ts` | B | 13 | 8 | 2 | aliased fraction 62% (8/13) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/hr-loans.ts` | A | 13 | 4 | 0 | aliased fraction 31% (4/13) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 4 aliased hits) |
| `artifacts/api-server/src/routes/entityMeta.ts` | A | 12 | 0 | 0 | aliased fraction 0% (0/12) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/operationsCenter.ts` | A | 12 | 1 | 1 | aliased fraction 8% (1/12) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/warehouse-advanced.ts` | B | 12 | 9 | 0 | aliased fraction 75% (9/12) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/permissions.ts` | A | 11 | 2 | 0 | aliased fraction 18% (2/11) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 2 aliased hits) |
| `artifacts/api-server/src/routes/search.ts` | B | 11 | 9 | 0 | aliased fraction 82% (9/11) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/finance-accounts.ts` | B | 10 | 5 | 3 | aliased fraction 50% (5/10) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/finance-cost-centers.ts` | A | 10 | 2 | 0 | aliased fraction 20% (2/10) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 2 aliased hits) |
| `artifacts/api-server/src/routes/impactPreview.ts` | B | 10 | 6 | 0 | aliased fraction 60% (6/10) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/print.ts` | A | 10 | 3 | 0 | aliased fraction 30% (3/10) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 3 aliased hits) |
| `artifacts/api-server/src/routes/rules.ts` | A | 9 | 0 | 0 | aliased fraction 0% (0/9) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/correspondence.ts` | A | 8 | 2 | 0 | aliased fraction 25% (2/8) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 2 aliased hits) |
| `artifacts/api-server/src/routes/hr-saudi-compliance.ts` | A | 8 | 1 | 0 | aliased fraction 13% (1/8) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/notifications.ts` | A | 8 | 0 | 0 | aliased fraction 0% (0/8) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/pdpl.ts` | C | 7 | 4 | 0 | PDPL exports are scoped by data-subject, not tenant-list |
| `artifacts/api-server/src/routes/finance-gl-helpers.ts` | D | 5 | 1 | 0 | scope passed in by caller; normalise at the call site first |
| `artifacts/api-server/src/routes/finance-recurring.ts` | A | 5 | 1 | 1 | aliased fraction 20% (1/5) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/finance-vendor-contracts.ts` | A | 5 | 1 | 1 | aliased fraction 20% (1/5) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/finance-collection.ts` | A | 4 | 1 | 1 | aliased fraction 25% (1/4) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/scheduled-reports.ts` | B | 4 | 2 | 0 | aliased fraction 50% (2/4) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/careersPortal.ts` | C | 3 | 0 | 0 | portal own-token scope; req.scope is not the employee RequestScope |
| `artifacts/api-server/src/routes/digital-signature.ts` | A | 3 | 1 | 0 | aliased fraction 33% (1/3) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 1 aliased hit) |
| `artifacts/api-server/src/routes/obligations.ts` | A | 3 | 0 | 0 | aliased fraction 0% (0/3) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/approvalActions.ts` | B | 2 | 2 | 0 | aliased fraction 100% (2/2) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/auditLogs.ts` | B | 2 | 1 | 1 | aliased fraction 50% (1/2) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/auth.ts` | C | 2 | 2 | 0 | /me bootstrap — resolves userRoles by (userId, companyId); the scope object is what the response creates |
| `artifacts/api-server/src/routes/dashboard.ts` | A | 2 | 0 | 2 | aliased fraction 0% (0/2) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/publicData.ts` | B | 2 | 1 | 0 | aliased fraction 50% (1/2) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/storage.ts` | B | 2 | 1 | 0 | aliased fraction 50% (1/2) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision |
| `artifacts/api-server/src/routes/import.ts` | A | 1 | 0 | 0 | aliased fraction 0% (0/1) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |
| `artifacts/api-server/src/routes/index.ts` | A | 1 | 0 | 0 | aliased fraction 0% (0/1) — predominantly plain `"companyId" = $N`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the 0 aliased hits) |

## Sites (first 20 per file)

### `artifacts/api-server/src/routes/hr.ts` (A, 259 hits)

- L494 *(aliased)*: `WHERE ea.id = $1 AND ea."companyId" = $2\`,`
- L512: `WHERE "companyId" = $1 AND status = 'active' AND "deletedAt" IS NULL`
- L534: `WHERE "companyId"=$1 AND $2::date BETWEEN "startDate"::date AND "endDate"::date\`,`
- L562: `FROM attendance_policies WHERE "companyId" = $1\`,`
- L837 *(aliased)*: `WHERE ea.id = $1 AND ea."companyId" = $2\`,`
- L857: `WHERE "companyId" = $1 AND status = 'active' AND "deletedAt" IS NULL`
- L866: `\`SELECT "gpsRadiusMeters" FROM attendance_policies WHERE "companyId" = $1\`,`
- L934: `\`UPDATE attendance SET "checkOut" = $1, notes = COALESCE($2, notes), "checkOutLat" = $4, "checkOutLon" = $5, "overtimeMinutes" = $6 WHERE id = $3 AND "companyId" = $7 AND "checkOut" IS NULL AND "delet`
- L959: `\`UPDATE hr_excuse_requests SET "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2\`,`
- L1097 *(aliased)*: `WHERE ea."companyId" = $1 AND ea.status = 'active'`
- L1123 *(aliased)*: `WHERE a.id = $1 AND a."companyId" = $2 AND a."deletedAt" IS NULL\`,`
- L1140: `FROM hr_leave_types WHERE "companyId" = $1 ORDER BY name\`,`
- L1159 *(aliased)*: `WHERE lb."companyId" = $1 AND lb."employeeId" = $2 AND lb.year = $3\`,`
- L1180 *(aliased)*: `WHERE lt."companyId" = $1`
- L1272 *(aliased)*: `WHERE lr.id = $1 AND lr."companyId" = $2 AND lr."deletedAt" IS NULL\`,`
- L1332: `\`SELECT id FROM hr_leave_types WHERE LOWER(name)=LOWER($1) AND "companyId"=$2\`,`
- L1354: `WHERE "companyId"=$3`
- L1364: `FROM hr_leave_types WHERE id = $1 AND "companyId" = $2\`,`
- L1379: `WHERE "companyId" = $1 AND "employeeId" = $2 AND "leaveTypeId" = $3 AND year = $4\`,`
- L1524: `\`SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "companyId" = $1 AND "departmentId" = $2 AND status = 'active'\`,`

### `artifacts/api-server/src/routes/properties.ts` (A, 134 hits)

- L507 *(aliased)*: `const conditions = [\`u."companyId" = $1\`];`
- L548: `\`SELECT id, name FROM property_buildings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L557: `\`SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L567: `WHERE "unitNumber"=$1 AND "companyId"=$2`
- L592: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L620: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L628: `FROM rental_contracts rc WHERE "unitId"=$1 AND "companyId"=$2 AND rc."deletedAt" IS NULL ORDER BY rc.id DESC LIMIT 10\`,`
- L632 *(aliased)*: `\`SELECT rp.*, c."tenantName" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" AND c."deletedAt" IS NULL WHERE c."unitId"=$1 AND c."companyId"=$2 ORDER BY rp."dueDate" DESC LIMIT 2`
- L636: `\`SELECT * FROM maintenance_requests WHERE "unitId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 20\`,`
- L640 *(aliased)*: `\`SELECT al.*, u.email AS "userName" FROM audit_logs al LEFT JOIN users u ON u.id=al."userId" WHERE al.entity='property_units' AND al."entityId"=$1 AND al."companyId"=$2 ORDER BY al."createdAt" DESC LI`
- L667: `\`SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L710: `WHERE "unitNumber"=$1 AND "companyId"=$2`
- L724: `\`SELECT id FROM property_buildings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L733: `\`SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L772: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L805: `\`SELECT id, "unitNumber", status FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L811: `\`SELECT id FROM rental_contracts WHERE "unitId"=$1 AND "companyId"=$2 AND status IN ('active','draft') AND "deletedAt" IS NULL LIMIT 1\`,`
- L821: `\`SELECT id FROM maintenance_requests WHERE "unitId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status NOT IN ('completed','closed','rejected','cancelled') LIMIT 1\`,`
- L831: `const { affectedRows } = await rawExecute(\`UPDATE property_units SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L867: `\`SELECT "unitNumber", status FROM property_units WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/fleet.ts` (A, 119 hits)

- L317: `\`SELECT id FROM fleet_vehicles WHERE "plateNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L326: `\`SELECT id FROM fleet_vehicles WHERE "vinNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L339: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L436: `\`SELECT id FROM fleet_drivers WHERE "licenseNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L446 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1\`,`
- L459: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L488 *(aliased)*: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT v.*, d.name AS "driverName", d.phone AS "driverPhone" FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id = v."assignedDriverId" AND d`
- L494 *(aliased)*: `WHERE t."vehicleId"=$1 AND t."companyId"=$2 AND t."deletedAt" IS NULL ORDER BY t.id DESC LIMIT 20\`,`
- L499: `FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 20\`,`
- L504: `FROM fleet_fuel_logs WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 20\`,`
- L509: `FROM fleet_insurance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY "endDate" DESC LIMIT 5\`,`
- L535: `\`SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L562: `\`SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND id<>$3\`,`
- L573: `\`SELECT id, status FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L625: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L674: `\`SELECT id, "plateNumber", status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L683: `\`SELECT id FROM fleet_trips WHERE "vehicleId"=$1 AND "companyId"=$2 AND status IN ('scheduled','planned','in_progress') AND "deletedAt" IS NULL LIMIT 1\`,`
- L690: `\`SELECT id FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 AND status IN ('scheduled','in_progress') AND "deletedAt" IS NULL LIMIT 1\`,`
- L697: `const { affectedRows } = await rawExecute(\`UPDATE fleet_vehicles SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L725: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`

### `artifacts/api-server/src/routes/umrah.ts` (A, 86 hits)

- L39: `\`SELECT id, status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L338: `const rows = await rawQuery(\`SELECT * FROM umrah_seasons WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "startDate" DESC LIMIT 100\`, [scope.companyId]);`
- L348: `\`SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L378: `const [existing] = await rawQuery<Record<string, unknown>>(\`SELECT status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L393: `\`SELECT COUNT(*) as c FROM umrah_pilgrims WHERE "seasonId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status IN ('arrived','active','overstayed')\`,`
- L400: `\`SELECT COUNT(*) as c FROM umrah_agent_invoices WHERE "seasonId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status NOT IN ('paid','cancelled')\`,`
- L420: `const [row] = await rawQuery(\`SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L432: `const rows = await rawQuery(\`SELECT * FROM umrah_agents WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500\`, [scope.companyId]);`
- L441: `const [row] = await rawQuery(\`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L446: `FROM umrah_pilgrims WHERE "agentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L475: `const [existing] = await rawQuery<Record<string, unknown>>(\`SELECT status FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L499: `const [row] = await rawQuery(\`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L510: `const [existing] = await rawQuery<Record<string, unknown>>(\`SELECT id, name FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L512: `const [inUse] = await rawQuery<Record<string, unknown>>(\`SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "agentId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L516: `await rawExecute(\`UPDATE umrah_agents SET "deletedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L526 *(aliased)*: `const rows = await rawQuery(\`SELECT p.*, s.title as "seasonTitle" FROM umrah_packages p LEFT JOIN umrah_seasons s ON p."seasonId"=s.id AND s."deletedAt" IS NULL WHERE p."companyId"=$1 AND p."deletedAt`
- L554 *(aliased)*: `WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL\`,`
- L559: `\`SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L581: `const [row] = await rawQuery(\`SELECT * FROM umrah_packages WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L593: `\`SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/bi.ts` (A, 81 hits)

- L50: `const rows = await rawQuery(\`SELECT * FROM bi_dashboards WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`, [scope.companyId]);`
- L77: `const rows = await rawQuery(\`SELECT * FROM bi_kpis WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY module, name LIMIT 500\`, [scope.companyId]);`
- L104: `const rows = await rawQuery(\`SELECT * FROM bi_reports WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`, [scope.companyId]);`
- L134: `(SELECT COUNT(*) FROM employee_assignments WHERE "companyId" = $1 AND status = 'active') AS employees,`
- L135: `(SELECT COUNT(*) FROM clients WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS clients,`
- L136: `(SELECT COUNT(*) FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS invoices,`
- L137: `(SELECT COUNT(*) FROM projects WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS projects,`
- L138: `(SELECT COUNT(*) FROM fleet_vehicles WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS vehicles,`
- L139: `(SELECT COUNT(*) FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status = 'open') AS "openTickets",`
- L140: `(SELECT COALESCE(SUM("paidAmount"), 0) FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "paidAmount" > 0) AS "totalRevenue"\`,`
- L160 *(aliased)*: `const conditions = [\`t."companyId" = $1\`, \`t."deletedAt" IS NULL\`];`
- L177 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = t."assignedTo" AND ea."companyId" = $1 AND ea.status = 'active'`
- L193: `const conditions = [\`"companyId" = $1\`, \`"deletedAt" IS NULL\`];`
- L219 *(aliased)*: `const conditions = [\`t."companyId" = $1\`, \`t."deletedAt" IS NULL\`];`
- L235 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = t."assignedTo" AND ea."companyId" = $1 AND ea.status = 'active'`
- L245 *(aliased)*: `const approvalConds = [\`lr."companyId" = $1\`, \`lr.status = 'pending'\`, \`lr."deletedAt" IS NULL\`];`
- L259 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'`
- L277 *(aliased)*: `const conditions = [\`t."companyId" = $1\`, \`t."deletedAt" IS NULL\`];`
- L301 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'`
- L306 *(aliased)*: `WHERE a."assignmentId" IN (SELECT id FROM employee_assignments WHERE "employeeId" = e.id) AND a."companyId" = $1`

### `artifacts/api-server/src/routes/admin.ts` (C, 74 hits)

- L116: `\`SELECT MAX(level) AS level FROM user_roles WHERE "userId" = $1 AND "companyId" = $2\`,`
- L130 *(aliased)*: `WHERE u.id = $1 AND ea."companyId" = $2 LIMIT 1\`,`
- L146 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1`
- L147 *(aliased)*: `WHERE ea."companyId" = $1`
- L148: `OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $1)`
- L164: `\`SELECT 1 FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 LIMIT 1\`,`
- L181: `\`SELECT label, level, modules FROM custom_roles WHERE "companyId"=$1 AND "roleKey"=$2 LIMIT 1\`,`
- L243 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2`
- L245 *(aliased)*: `ea."companyId" = $2`
- L246: `OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $2)`
- L254: `\`SELECT 1 FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 LIMIT 1\`,`
- L275: `\`SELECT label, level, modules FROM custom_roles WHERE "companyId"=$1 AND "roleKey"=$2 LIMIT 1\`,`
- L317 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2`
- L319 *(aliased)*: `ea."companyId" = $2`
- L320: `OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $2)`
- L327: `\`DELETE FROM user_roles WHERE "userId"=$1 AND "companyId"=$2\`,`
- L334 *(aliased)*: `AND ea."companyId"=$2\`,`
- L366 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2`
- L368 *(aliased)*: `ea."companyId" = $2`
- L369: `OR u.id IN (SELECT "userId" FROM user_roles WHERE "companyId" = $2)`

### `artifacts/api-server/src/routes/umrah-entities.ts` (A, 65 hits)

- L42: `\`SELECT id, status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L212 *(aliased)*: `WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL`
- L255 *(aliased)*: `WHERE sa.id = $1 AND sa."companyId" = $2 AND sa."deletedAt" IS NULL\`,`
- L267 *(aliased)*: `let where = \`sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."clientId" IS NULL\`;`
- L310: `const [row] = await rawQuery(\`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L322: `\`UPDATE umrah_sub_agents SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`,`
- L352: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L357: `\`UPDATE clients SET classification = 'umrah_agent' WHERE id = $1 AND "companyId" = $2\`,`
- L364: `WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL\`,`
- L371 *(aliased)*: `WHERE sa.id=$1 AND sa."companyId"=$2 AND sa."deletedAt" IS NULL\`,`
- L388: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L394: `WHERE "companyId"=$3 AND "nuskCode"=$4 AND "deletedAt" IS NULL\`,`
- L410: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L416: `WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL\`,`
- L419: `const [row] = await rawQuery(\`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L439 *(aliased)*: `WHERE p."companyId" = $1 AND p."deletedAt" IS NULL`
- L455: `WHERE "companyId" = $1 AND "agentId" = $2 AND "deletedAt" IS NULL`
- L492: `const [current] = await rawQuery(\`SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L501: `WHERE "companyId" = $1 AND "agentId" = $2 AND "deletedAt" IS NULL AND id != $3`
- L517: `const [row] = await rawQuery(\`SELECT * FROM umrah_pricing WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`

### `artifacts/api-server/src/routes/projects.ts` (A, 58 hits)

- L237 *(aliased)*: `\`SELECT e.name FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1\`, [Number(mana`
- L242: `WHERE "managerId" = $1 AND "companyId" = $2`
- L357: `let where = \`id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`;`
- L428: `\`SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L437 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1\`,`
- L464: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L517 *(aliased)*: `let detailWhere = \`p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL\`;`
- L594: `let findQuery = \`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`;`
- L649 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1\`,`
- L675: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L710: `let findQuery = \`SELECT id, name, status FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`;`
- L726: `const { affectedRows } = await rawExecute(\`UPDATE projects SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L871: `const { affectedRows } = await rawExecute(\`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`, [progressPct, projectId, scope.companyId]);`
- L893 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1\`,`
- L942: `await client.query(\`UPDATE project_tasks SET status='blocked' WHERE id=$1 AND status='todo' AND "deletedAt" IS NULL AND "projectId" IN (SELECT id FROM projects WHERE "companyId"=$2)\`, [insertId, scope`
- L947 *(aliased)*: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT pt.* FROM project_tasks pt JOIN projects p ON p.id=pt."projectId" WHERE pt.id=$1 AND p."companyId"=$2 AND pt."deletedAt" IS NULL\`, [insert`
- L951: `\`SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1\`,`
- L1015 *(aliased)*: `WHERE pt.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL\`,`
- L1099: `await client.query(\`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`, [pPct, tsk.projectId, scope.companyId]);`
- L1137: `WHERE "employeeId" = ANY($1) AND "companyId" = $2 AND status='active'`

### `artifacts/api-server/src/routes/legal.ts` (A, 55 hits)

- L168: `const conditions = [\`"companyId" = $1\`];`
- L204: `\`SELECT id FROM legal_contracts WHERE ref=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L220: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L253: `FROM legal_contracts WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`
- L259: `FROM legal_contracts WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`
- L265: `FROM legal_contracts WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`
- L290: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT *, ("endDate"::date - CURRENT_DATE) AS "daysToExpiry" FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, s`
- L301: `\`SELECT * FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L367: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L400: `\`SELECT id, title, status FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L410: `const { affectedRows } = await rawExecute(\`UPDATE legal_contracts SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L443: `\`SELECT id, "endDate", value, "renewalCount" FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L572: `const conditions = [\`"companyId" = $1\`];`
- L597: `\`SELECT id FROM legal_cases WHERE "caseNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L648: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L659: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L672: `const [existing] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L742: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L753: `\`SELECT id, title, status FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L763: `const { affectedRows } = await rawExecute(\`UPDATE legal_cases SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`

### `artifacts/api-server/src/routes/governance.ts` (A, 54 hits)

- L172: `const conditions = [\`("companyId"=$1 OR "companyId" IS NULL)\`, \`"deletedAt" IS NULL\`];`
- L206: `const selectRes = await client.query(\`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L227: `\`SELECT * FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L232: `\`SELECT module FROM policy_module_links WHERE "policyId"=$1 AND ("companyId"=$2 OR "companyId" IS NULL)\`,`
- L268: `await client.query(\`DELETE FROM policy_module_links WHERE "policyId"=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L277: `const selectRes = await client.query(\`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L297: `\`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L309: `const existingLinks = await rawQuery<Record<string, unknown>>(\`SELECT module FROM policy_module_links WHERE "policyId"=$1 AND ("companyId"=$2 OR "companyId" IS NULL)\`, [parentId, scope.companyId]);`
- L331: `\`UPDATE governance_policies SET status='archived', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status IN ('draft','active') AND "deletedAt" IS NULL\`,`
- L343: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L366: `\`SELECT id FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L385 *(aliased)*: `WHERE pml.module = $1 AND (gp."companyId" = $2 OR gp."companyId" IS NULL)`
- L401: `const [before] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L402: `const result = await rawExecute(\`UPDATE governance_policies SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L419: `const rows = await rawQuery(\`SELECT * FROM governance_risks WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`, [scope.companyId]);`
- L445: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [r.insertId, scope.companyId]);`
- L454: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM governance_risks WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L478: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L495: `const [before] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L496: `const result = await rawExecute(\`UPDATE governance_risks SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`

### `artifacts/api-server/src/routes/finance-invoices.ts` (A, 52 hits)

- L173: `\`SELECT name FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L207: `FROM invoices WHERE "clientId" = $1 AND "companyId" = $2 AND status NOT IN ('paid','cancelled') AND "deletedAt" IS NULL\`,`
- L328: `\`SELECT id FROM branches WHERE id=$1 AND "companyId"=$2 AND status='active'\`,`
- L341: `\`SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L493 *(aliased)*: `const [invoice] = await rawQuery<Record<string, unknown>>(\`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i`
- L514 *(aliased)*: `WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL\`,`
- L582 *(aliased)*: `WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL\`,`
- L639: `\`UPDATE clients SET "totalRevenue" = COALESCE("totalRevenue",0) + $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`,`
- L647: `\`UPDATE budgets SET used = used + $1 WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL\`,`
- L653 *(aliased)*: `const [updated] = await rawQuery<Record<string, unknown>>(\`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i`
- L683: `\`SELECT id FROM journal_entries WHERE "sourceType"='invoice' AND "sourceId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L692 *(aliased)*: `const [updated] = await rawQuery<Record<string, unknown>>(\`SELECT i.*, c.name AS "clientName" FROM invoices i LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL WHERE i.id = $1 AND i`
- L723: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE\`,`
- L752: `\`UPDATE invoices SET "paidAmount" = $1, status = $2, "paidAt" = $3 WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL\`,`
- L757: `\`UPDATE invoices SET "paidAmount" = $1, status = $2 WHERE id = $3 AND "companyId" = $4 AND "deletedAt" IS NULL\`,`
- L819 *(aliased)*: `WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL\`,`
- L825 *(aliased)*: `rawQuery<Record<string, unknown>>(\`SELECT je.id, je.ref, je.description, je."createdAt" AS date, COALESCE(SUM(jl.debit), 0) AS amount FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = `
- L826 *(aliased)*: `rawQuery<Record<string, unknown>>(\`SELECT je.id, je.ref, je.description, je."createdAt" AS date FROM journal_entries je WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND (je.ref LIKE $2 OR je.r`
- L842: `\`SELECT * FROM invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L930: `\`SELECT id, ref, status, "paidAmount" FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/finance-algorithms.ts` (A, 50 hits)

- L142 *(aliased)*: `WHERE i."companyId" = $2`
- L234 *(aliased)*: `WHERE po."companyId" = $2 AND po."deletedAt" IS NULL`
- L254 *(aliased)*: `WHERE pr."companyId" = $2`
- L275 *(aliased)*: `WHERE je."companyId" = $2`
- L422: `WHERE "companyId" = $1`
- L445 *(aliased)*: `WHERE je."companyId" = $1`
- L464: `\`UPDATE bank_statements SET "matchStatus" = 'matched', "matchedJournalLineId" = $1 WHERE id = $2 AND "companyId" = $3\`,`
- L513 *(aliased)*: `WHERE bs."companyId" = $1 AND bs."importBatchId" = $2`
- L549: `\`SELECT * FROM bank_statements WHERE id=$1 AND "companyId"=$2 AND "matchStatus"='unmatched'\`,`
- L557 *(aliased)*: `WHERE jl.id=$1 AND je."companyId"=$2`
- L566: `\`UPDATE bank_statements SET "matchStatus"='matched', "matchedJournalLineId"=$1 WHERE id=$2 AND "companyId"=$3\`,`
- L603 *(aliased)*: `let conditions = [\`je."companyId"=$1\`, \`je."deletedAt" IS NULL\`];`
- L644: `WHERE "companyId" = $1`
- L664: `\`SELECT * FROM fixed_assets WHERE "companyId" = $1 ORDER BY "purchaseDate" DESC LIMIT 500\`,`
- L700: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM fixed_assets WHERE id = $1 AND "companyId" = $2\`, [insertId, scope.companyId]);`
- L737: `\`SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2\`,`
- L742: `\`SELECT * FROM depreciation_entries WHERE "assetId"=$1 AND "companyId"=$2 ORDER BY period ASC\`,`
- L857: `\`SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2\`,`
- L936: `\`SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2 AND status='active'\`,`
- L942: `\`SELECT id FROM depreciation_entries WHERE "assetId"=$1 AND period=$2 AND "companyId"=$3\`,`

### `artifacts/api-server/src/routes/moduleDashboards.ts` (A, 50 hits)

- L31: `sq1(\`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active FROM employee_assignments WHERE "companyId" = $1\`, [cid]),`
- L32: `sq1(\`SELECT COUNT(*) FILTER (WHERE status = 'present') AS present, COUNT(*) FILTER (WHERE status = 'absent') AS absent, COUNT(*) FILTER (WHERE status = 'late') AS late, COUNT(*) FILTER (WHERE "lateMin`
- L33: `sq1(\`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'approved') AS approved, COUNT(*) FILTER (WHERE status = 'rejected') AS rejected FROM hr_leave_reques`
- L34: `sq1(\`SELECT COUNT(*) AS total, COALESCE(SUM(deduction), 0) AS "totalDeductions" FROM employee_violations WHERE "companyId" = $1 AND period = $2 AND "deletedAt" IS NULL\`, [cid, today.slice(0, 7)]),`
- L35: `sq1(\`SELECT COUNT(*) AS "expiring" FROM employee_contracts WHERE "companyId" = $1 AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND "deletedAt" IS NULL\`, [cid]),`
- L36: `sq1(\`SELECT COUNT(*) AS total FROM employee_kpi_snapshots WHERE "companyId" = $1 AND "snapshotDate" >= CURRENT_DATE - INTERVAL '30 days'\`, [cid]),`
- L40: `\`SELECT date, COUNT(*) FILTER (WHERE status = 'present') AS present, COUNT(*) FILTER (WHERE status = 'absent') AS absent, COUNT(*) FILTER (WHERE status = 'late') AS late FROM attendance WHERE "company`
- L68: `sq1(\`SELECT COALESCE(SUM(total), 0) AS "totalRevenue", COALESCE(SUM("paidAmount"), 0) AS "totalPaid", COALESCE(SUM(total - "paidAmount"), 0) AS "outstanding", COUNT(*) AS count, COUNT(*) FILTER (WHERE`
- L69: `sq1(\`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expense_claims WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" >= $2\`, [cid, monthStart]),`
- L70: `sq1(\`SELECT COALESCE(SUM(total - "paidAmount"), 0) AS amount, COUNT(*) AS count FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('sent','partial','overdue') AND "dueDate" < `
- L71 *(aliased)*: `sq1(\`SELECT COUNT(*) AS total, COALESCE(ROUND(AVG(CASE WHEN b.amount > 0 THEN (COALESCE(b.used,0)::numeric / b.amount) * 100 ELSE 0 END), 0), 0) AS "avgUsage" FROM budgets b WHERE b."companyId" = $1 A`
- L75: `\`SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM("paidAmount"), 0) AS collected FROM invoices WHERE "companyId" = $1 AND "deleted`
- L79 *(aliased)*: `\`SELECT ca.code, ca.name, COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit FROM chart_of_accounts ca LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_line`
- L102: `sq1(\`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active' OR status = 'available') AS active, COUNT(*) FILTER (WHERE status = 'in_use') AS "inUse", COUNT(*) FILTER (WHERE status = 'needs`
- L103: `sq1(\`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'in_progress') AS active, COUNT(*) FILTER (WHERE status = 'completed') AS completed, COALESCE(SUM(distance), 0) AS "totalDistance", COALE`
- L104: `sq1(\`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'pending' OR status = 'scheduled') AS pending, COALESCE(SUM(cost), 0) AS "totalCost" FROM fleet_maintenance WHERE "companyId" = $1 AND "d`
- L105: `sq1(\`SELECT COALESCE(SUM("totalCost"), 0) AS "totalCost", COALESCE(SUM(liters), 0) AS "totalLiters" FROM fleet_fuel_logs WHERE "companyId" = $1 AND "deletedAt" IS NULL\`, [cid]),`
- L109: `\`SELECT TO_CHAR(DATE_TRUNC('month', "startTime"), 'YYYY-MM') AS month, COUNT(*) AS trips, COALESCE(SUM(distance), 0) AS distance, COALESCE(SUM(cost), 0) AS cost FROM fleet_trips WHERE "companyId" = $1`
- L130: `sq1(\`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active, COUNT(*) FILTER (WHERE status = 'active' AND "endDate"::date - CURRENT_DATE <= 30) AS "expiringSoon", COALESCE(SUM(v`
- L131: `sq1(\`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'open') AS open, COUNT(*) FILTER (WHERE status = 'in_progress') AS "inProgress", COUNT(*) FILTER (WHERE priority = 'high') AS "highPriori`

### `artifacts/api-server/src/routes/finance-journal.ts` (A, 46 hits)

- L296 *(aliased)*: `COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" WHERE je."companyId" = $2 AND jl."costCenter" = cc.name AND je."deletedAt" IS NULL), 0) AS "usedA`
- L297 *(aliased)*: `FROM cost_centers cc WHERE cc.name = $1 AND cc."companyId" = $2 LIMIT 1\`,`
- L333: `\`SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L403: `\`SELECT value FROM system_settings WHERE "companyId" = $1 AND key = 'costCenterEnabled' LIMIT 1\`,`
- L434: `WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3 AND "deletedAt" IS NULL`
- L508: `\`UPDATE journal_entries SET "costCenter" = $1, "departmentId" = $2, "relatedEntityType" = $3, "relatedEntityId" = $4, "paymentMethod" = $5, reference = $6, "isPaid" = $7, "attachmentUrl" = $8, "attach`
- L514: `\`SELECT id FROM gov_integrations WHERE id = $1 AND "companyId" = $2\`,`
- L528: `if (approvalResult.requiresApproval) { await rawExecute(\`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL\`, [journ`
- L536 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`
- L551: `const [existing] = await rawQuery<Record<string, unknown>>(\`SELECT id, "createdAt" FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L558: `const [row] = await rawQuery<Record<string, unknown>>(\`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING *\`, [description, id, scope.comp`
- L570: `const [row] = await rawQuery<Record<string, unknown>>(\`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'draft' RETURNING id\`, [id`
- L588: `\`SELECT ref FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'EXP%'\`,`
- L692 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`
- L743: `WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L818: `\`UPDATE journal_entries SET "paymentMethod" = $1, reference = $2, "attachmentUrl" = $3, "attachmentType" = $4, "relatedEntityType" = $5, "relatedEntityId" = $6, "operationType" = $7, "departmentId" = `
- L828 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`
- L843: `const [row] = await rawQuery<Record<string, unknown>>(\`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING *\`, [description, id, scope.comp`
- L855: `const [row] = await rawQuery<Record<string, unknown>>(\`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'draft' RETURNING id\`, [id`
- L867 *(aliased)*: `const rows = await rawQuery<Record<string, unknown>>(\`SELECT je.id, je.ref, je.description, COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt" AS date, 'active' AS status FROM journal_entries je JOI`

### `artifacts/api-server/src/routes/finance-reports.ts` (B, 46 hits)

- L66: `rows = await rawQuery<Record<string, unknown>>(\`SELECT id, name, phone, email FROM clients WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500\`, [scope.companyId]);`
- L69: `rows = await rawQuery<Record<string, unknown>>(\`SELECT id, name, phone, email FROM suppliers WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500\`, [scope.companyId]);`
- L73 *(aliased)*: `rows = await rawQuery<Record<string, unknown>>(\`SELECT e.id, e.name, e.phone, e.email FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 WHERE e."deletedAt`
- L103 *(aliased)*: `JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}${branchFilter}`
- L105 *(aliased)*: `WHERE coa."companyId" = $1 AND coa."deletedAt" IS NULL`
- L135 *(aliased)*: `const revenues = await rawQuery<Record<string, unknown>>(\`SELECT coa.code, coa.name, COALESCE(SUM(fl.credit) - SUM(fl.debit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode"`
- L136 *(aliased)*: `const expenses = await rawQuery<Record<string, unknown>>(\`SELECT coa.code, coa.name, COALESCE(SUM(fl.debit) - SUM(fl.credit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode"`
- L161 *(aliased)*: `JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}${branchFilter}`
- L163 *(aliased)*: `WHERE coa."companyId" = $1 AND coa.type IN ('asset','liability','equity') AND coa."deletedAt" IS NULL`
- L202: `WHERE "companyId" = $1 AND type = 'asset'`
- L224 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted'`
- L244 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted'`
- L260 *(aliased)*: `ON coa.code = jl."accountCode" AND coa."companyId" = $1`
- L387 *(aliased)*: `const [emp] = await rawQuery<Record<string, unknown>>(\`SELECT e.id, e.name, ea.id AS "assignmentId" FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 WHER`
- L397 *(aliased)*: `rawQuery<Record<string, unknown>>(\`SELECT pr.id, pr.period AS ref, CONCAT('راتب ', pr.period) AS description, pr."grossSalary" AS debit, 0 AS credit, pr."createdAt" AS date, 'payroll' AS "movementType`
- L398 *(aliased)*: `rawQuery<Record<string, unknown>>(\`SELECT je.id, je.ref, CONCAT('سلفة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'advance' AS "moveme`
- L399 *(aliased)*: `rawQuery<Record<string, unknown>>(\`SELECT je.id, je.ref, CONCAT('عهدة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'custody' AS "moveme`
- L400 *(aliased)*: `rawQuery<Record<string, unknown>>(\`SELECT v.id, CONCAT('VIO-', v.id::text) AS ref, CONCAT('خصم مخالفة: ', v.description) AS description, 0 AS debit, COALESCE(v.deduction, 0) AS credit, v."createdAt" A`
- L423 *(aliased)*: `const invoiceRows = await rawQuery<Record<string, unknown>>(\`SELECT i.id, i.ref, i.total AS debit, i."paidAmount" AS credit, i."createdAt" AS date, CONCAT('فاتورة ', i.ref) AS description, 'invoice' A`
- L434 *(aliased)*: `const poRows = await rawQuery<Record<string, unknown>>(\`SELECT po.id, po.ref, po."totalAmount" AS debit, 0 AS credit, po."createdAt" AS date, CONCAT('أمر شراء ', po.ref) AS description, 'purchase_orde`

### `artifacts/api-server/src/routes/warehouse.ts` (A, 46 hits)

- L157: `\`SELECT "currentStock", "costPrice" FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L173: `\`UPDATE warehouse_products SET "costPrice"=$1, "lastWaCost"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`,`
- L178: `\`UPDATE warehouse_products SET "lastWaCost"="costPrice", "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L311: `\`SELECT id FROM warehouse_products WHERE sku=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L323: `\`SELECT id FROM warehouse_categories WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L337: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L368 *(aliased)*: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT p.*, c.name AS "categoryName" FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id=p."categoryId" AND c."deletedAt" IS NULL `
- L379: `\`SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L398: `\`SELECT id FROM warehouse_products WHERE sku=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND id<>$3\`,`
- L477: `const [fetched] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L516: `\`SELECT id, sku, name, "currentStock" FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L581 *(aliased)*: `WHERE m.id=$1 AND m."companyId"=$2\`,`
- L603: `\`SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE\`,`
- L674: `await client.query(\`UPDATE warehouse_products SET "currentStock" = "currentStock" + $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`, [sign * Math.abs(b.quantity), b`
- L685: `\`UPDATE warehouse_products SET "costPrice"=$1, "lastWaCost"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`,`
- L690: `\`UPDATE warehouse_products SET "lastWaCost"="costPrice", "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L767: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM warehouse_movements WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L818 *(aliased)*: `\`SELECT pri."unitPrice" AS "unitCost" FROM purchase_request_items pri JOIN purchase_requests pr ON pr.id=pri."requestId" WHERE pri."productId"=$1 AND pr."companyId"=$2 ORDER BY pr."createdAt" DESC LIM`
- L826 *(aliased)*: `\`SELECT s.* FROM suppliers s JOIN purchase_requests pr ON pr."supplierId"=s.id WHERE pr."companyId"=$1 AND s."deletedAt" IS NULL ORDER BY pr."createdAt" DESC LIMIT 1\`,`
- L835: `const [asgn] = await rawQuery<Record<string, unknown>>(\`SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1\`, [userId, companyId]);`

### `artifacts/api-server/src/routes/documents.ts` (A, 44 hits)

- L224 *(aliased)*: `AND (d."companyId" = $3 OR d."companyId" IS NULL) AND d."deletedAt" IS NULL`
- L234: `let where = \`WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`;`
- L288: `const [row] = await rawQuery<DocumentRow>(\`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L334: `const [doc] = await rawQuery(\`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [docId, scope.companyId]);`
- L357: `\`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L398: `\`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L446: `\`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L466: `WHERE id=$6 AND "companyId"=$7 AND "deletedAt" IS NULL\`,`
- L475: `WHERE "documentId"=$1 AND "companyId"=$2 AND status='pending' AND "deletedAt" IS NULL\`,`
- L480: `const [updated] = await rawQuery(\`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [docId, scope.companyId]);`
- L504: `\`SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L528: `const [beforeDoc] = await rawQuery<DocumentRow>(\`SELECT * FROM documents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [docId, scope.companyId]);`
- L532: `\`UPDATE documents SET status=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND status != $1 AND "deletedAt" IS NULL\`,`
- L563: `const [doc] = await rawQuery(\`SELECT * FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [docId, scope.companyId]);`
- L577: `\`SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L610: `\`SELECT id FROM documents WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L626: `const rows = await rawQuery(\`SELECT * FROM document_folders WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY name LIMIT 500\`, [scope.companyId]);`
- L644: `\`SELECT id FROM document_folders WHERE id = $1 AND "companyId" = $2 LIMIT 1\`,`
- L671: `const [row] = await rawQuery<DocumentFolderRow>(\`SELECT * FROM document_folders WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L680: `\`SELECT * FROM document_templates WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`,`

### `artifacts/api-server/src/routes/employees.ts` (B, 43 hits)

- L376: `\`SELECT id FROM departments WHERE name = $1 AND "companyId" = $2 LIMIT 1\`,`
- L395 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1\`,`
- L408 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.email = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1\`,`
- L421 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e."nationalId" = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1\`,`
- L468: `\`SELECT id FROM job_titles WHERE name = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1\`,`
- L484: `\`SELECT id, "annualDays" FROM hr_leave_types WHERE "companyId" = $1\`,`
- L506: `\`SELECT id FROM shifts WHERE "companyId" = $1 AND "isDefault" = true AND status = 'active' AND "deletedAt" IS NULL LIMIT 1\`,`
- L518: `\`SELECT id FROM attendance_policies WHERE "companyId" = $1 LIMIT 1\`,`
- L576: `\`SELECT id FROM salary_components WHERE "companyId" = $1 AND "isActive" = true\`,`
- L611: `\`SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 ELSE 2 END LIMIT 1\`,`
- L687 *(aliased)*: `JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2`
- L688 *(aliased)*: `LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = $2`
- L716 *(aliased)*: `const conditions = [\`ot."companyId" = $1\`];`
- L760: `WHERE id = $3 AND "companyId" = $4 AND status != 'completed' RETURNING *\`,`
- L787: `\`SELECT * FROM job_titles WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY name LIMIT 500\`,`
- L809 *(aliased)*: `WHERE ed."companyId" = $1`
- L855 *(aliased)*: `WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL${extraCondition}\`,`
- L868 *(aliased)*: `WHERE pt."assigneeId" = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL`
- L875 *(aliased)*: `WHERE a."assignmentId" = $1 AND a."companyId" = $2`
- L884 *(aliased)*: `WHERE lr."employeeId" = $1 AND lr."companyId" = $2`

### `artifacts/api-server/src/routes/clients.ts` (A, 36 hits)

- L238: `\`SELECT id FROM clients WHERE email = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1 FOR UPDATE\`,`
- L245: `\`SELECT id FROM clients WHERE phone = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1 FOR UPDATE\`,`
- L259: `\`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L293: `\`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L305: `WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`
- L312: `WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`
- L319: `WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`
- L326: `WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`
- L339: `WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L345 *(aliased)*: `WHERE wq."clientId" = $1 AND wq."companyId" = $2`
- L349 *(aliased)*: `WHERE sq."companyId" = $2 AND sq."recipientPhone" = (SELECT phone FROM clients WHERE id = $1 AND "companyId" = $2 LIMIT 1)`
- L355: `FROM invoices WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)`
- L358: `FROM crm_opportunities WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)`
- L361: `FROM support_tickets WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)`
- L364: `FROM projects WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)`
- L373: `WHERE "companyId" = $2 AND status = 'active' AND "deletedAt" IS NULL`
- L375: `SELECT id FROM rental_contracts WHERE "tenantName" = $3 AND "companyId" = $2 AND "deletedAt" IS NULL`
- L405: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L425: `const [updated] = await rawQuery<ClientRow>(\`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L479: `? \`UPDATE clients SET "taxNumber" = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING id\``

### `artifacts/api-server/src/routes/finance-hardening.ts` (A, 34 hits)

- L142 *(aliased)*: `WHERE fp."companyId" = $1 AND fp."deletedAt" IS NULL`
- L163: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM financial_periods WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L200: `\`SELECT id, name, "startDate", "endDate" FROM financial_periods WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L207: `WHERE "companyId"=$1 AND "deletedAt" IS NULL`
- L269: `\`SELECT name FROM financial_periods WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L386 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`
- L400 *(aliased)*: `const conditions = [\`je."companyId"=$1\`, \`je."isManual"=TRUE\`, \`je."deletedAt" IS NULL\`];`
- L439 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`
- L471: `\`SELECT ref FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL\`,`
- L511: `\`SELECT ref, "createdBy" FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL\`,`
- L572: `\`SELECT ref FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL\`,`
- L623: `\`SELECT ref FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "isManual"=TRUE AND "deletedAt" IS NULL\`,`
- L681 *(aliased)*: `WHERE bg."companyId"=$1 AND bg."deletedAt" IS NULL`
- L710: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM bank_guarantees WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L792: `\`SELECT id, ref, bank, status, amount FROM bank_guarantees WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L814: `WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL RETURNING id\`,`
- L863: `\`SELECT ref, bank, notes FROM bank_guarantees WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L910: `\`SELECT ref, bank, notes FROM bank_guarantees WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L1051: `\`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2\`,`
- L1160 *(aliased)*: `WHERE p."companyId"=$1 AND p."deletedAt" IS NULL`

### `artifacts/api-server/src/routes/support.ts` (A, 34 hits)

- L233: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L262 *(aliased)*: `JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'`
- L295: `const [row] = await rawQuery<SupportTicketRow>(\`SELECT * FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L299: `\`SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1\`,`
- L359 *(aliased)*: `\`SELECT t.*, cl.name AS "clientName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" AND cl."deletedAt" IS NULL WHERE t."companyId"=$1 AND t.status IN ('open','in_progress','field_vi`
- L366: `\`UPDATE support_tickets SET priority='critical', "slaBreached"=true, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND priority != 'critical' AND "deletedAt" IS NULL\`,`
- L372: `\`SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1\`,`
- L408 *(aliased)*: `\`SELECT t.*, cl.name AS "clientName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" AND cl."deletedAt" IS NULL WHERE t.id=$1 AND t."companyId"=$2 AND t."deletedAt" IS NULL\`,`
- L431: `const [ticket] = await rawQuery<Pick<SupportTicketRow, "id" | "ref" | "title" | "firstResponseAt" | "slaDeadline" | "priority">>(\`SELECT id, ref, title, "firstResponseAt", "slaDeadline", priority FROM`
- L442: `await client.query(\`UPDATE support_tickets SET "firstResponseAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [ticketId, scope.companyId]);`
- L446: `\`UPDATE support_tickets SET priority='critical', "slaBreached"=true, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND priority != 'critical' AND "deletedAt" IS NULL\`,`
- L505: `\`SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1\`,`
- L563: `\`SELECT * FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L653: `\`SELECT id, name, email FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L695: `const [existing] = await rawQuery<Pick<SupportTicketRow, "id" | "ref" | "status">>(\`SELECT id, ref, status FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.comp`
- L697: `await rawExecute(\`UPDATE support_tickets SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L756: `rawQuery<AggCountsRow>(\`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as open, COUNT(*) FILTER (WHERE status='resolved') as resolved, COUNT(*) FILTER (WHERE status IN ('open','in_pro`
- L757: `rawQuery<AvgHoursRow>(\`SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt"::timestamp - "createdAt"::timestamp))/3600) AS "avgHours" FROM support_tickets WHERE "companyId"=$1 AND status='resolved' AND "resolv`
- L758: `rawQuery<AvgHoursRow>(\`SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt"::timestamp - "createdAt"::timestamp))/3600) AS "avgHours" FROM support_tickets WHERE "companyId"=$1 AND "firstResponseAt" IS NOT`
- L759: `rawQuery<AvgTotalRow>(\`SELECT AVG(score) AS avg, COUNT(*) AS total FROM ticket_csat_ratings WHERE "companyId"=$1\`, [cid]).catch((e) => { logger.error(e, "support query failed"); return [{ avg: null, t`

### `artifacts/api-server/src/routes/crm.ts` (A, 32 hits)

- L255: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L274 *(aliased)*: `WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1\`,`
- L306: `\`SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1\`,`
- L324: `const [row] = await rawQuery<CrmOpportunityRow>(\`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L379: `const [existing] = await rawQuery<CrmOpportunityRow>(\`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [oppId, scope.companyId]);`
- L475 *(aliased)*: `WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1\`,`
- L489: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L553: `\`SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1\`,`
- L643: `const [row] = await rawQuery<CrmOpportunityRow>(\`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [oppId, scope.companyId]);`
- L702: `\`SELECT id FROM clients WHERE "companyId"=$1 AND "deletedAt" IS NULL AND (name=$2 OR phone=$3 OR email=$4) LIMIT 1 FOR UPDATE\`,`
- L714: `await txClient.query(\`UPDATE crm_opportunities SET "clientId"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`, [clientId, opp.id, scope.companyId]);`
- L775: `await rawExecute(\`UPDATE clients SET "totalRevenue"=COALESCE("totalRevenue",0)+$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`, [dealValue, clientId, scope.companyId]);`
- L784: `\`SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1\`,`
- L812 *(aliased)*: `const [row] = await rawQuery<CrmOpportunityListRow>(\`SELECT o.*, cl.name AS "clientName", e.name AS "assigneeName" FROM crm_opportunities o LEFT JOIN clients cl ON cl.id=o."clientId" AND cl."deletedAt`
- L839: `\`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L861: `\`SELECT "clientId" FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L904: `const [existing] = await rawQuery<{ id: number }>(\`SELECT id FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L906: `const { affectedRows } = await rawExecute(\`UPDATE crm_opportunities SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L935: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L967 *(aliased)*: `WHERE o."companyId" = $1`

### `artifacts/api-server/src/routes/finance-purchase.ts` (A, 32 hits)

- L134: `\`SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L141: `WHERE "supplierId" = $1 AND "companyId" = $2`
- L286: `\`SELECT id, name FROM store_products WHERE id = ANY($1) AND "companyId" = $2\`,`
- L296: `const [sup] = await rawQuery<{ id: number }>(\`SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1\`, [supplierId, scope.companyId]);`
- L360: `const [pr] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2\`, [insertId, scope.companyId]);`
- L378: `\`SELECT id, status FROM purchase_requests WHERE id = $1 AND "companyId" = $2\`,`
- L406: `const [pr] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L462: `const [pr] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L522: `const [po] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2\`, [poId, scope.companyId]);`
- L589: `const [sup] = await rawQuery<{ id: number }>(\`SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1\`, [supplierId, effectiveCompanyId]);`
- L630: `const [po] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2\`, [insertId, effectiveCompanyId]);`
- L646: `const [po] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L697: `\`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L766: `\`SELECT COALESCE(MAX(id),0)+1 AS seq FROM goods_receipts WHERE "companyId" = $1\`,`
- L825: `await rawExecute(\`UPDATE goods_receipts SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`, [journalId, grnId, scope.companyId]);`
- L914 *(aliased)*: `WHERE gr."poId" = $1 AND gr."companyId" = $2 AND gr."deletedAt" IS NULL`
- L935: `FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L990 *(aliased)*: `let where = \`po."companyId" = $1 AND po.status = 'invoice_matched' AND po."deletedAt" IS NULL\`;`
- L1044: `WHERE id = ANY($1) AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L1170: `await rawExecute(\`UPDATE payment_runs SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3\`, [journalId, runId, scope.companyId]);`

### `artifacts/api-server/src/routes/rbacV2.ts` (B, 32 hits)

- L94 *(aliased)*: `WHERE r."companyId" = $1 OR (r.is_template AND r."companyId" IS NULL)`
- L141: `const [before] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM rbac_roles WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L179: `const [role] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM rbac_roles WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L186: `await rawExecute(\`DELETE FROM rbac_roles WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L200: `const [{ count }] = await rawQuery<{ count: string }>(\`SELECT COUNT(*)::text AS count FROM rbac_roles WHERE id = $1 AND ("companyId" = $2 OR is_template)\`, [id, scope.companyId]);`
- L275: `\`SELECT COUNT(*)::text AS count FROM rbac_roles WHERE id = $1 AND ("companyId" = $2 OR is_template)\`,`
- L334: `\`SELECT COUNT(*)::text AS count FROM rbac_roles WHERE id = $1 AND ("companyId" = $2 OR is_template)\`,`
- L470: `const { affectedRows } = await rawExecute(\`DELETE FROM rbac_sod_rules WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L485 *(aliased)*: `let where = \`ea."companyId" = $1 AND ea.status = 'active'\`;`
- L495 *(aliased)*: `WHERE ur."userId" = u.id AND ur."companyId" = $1`
- L643 *(aliased)*: `WHERE h.role_id = $1 AND h."companyId" = $2`
- L659: `FROM rbac_sod_rules WHERE "companyId" IS NULL OR "companyId" = $1\`,`
- L672 *(aliased)*: `WHERE ur."companyId" = $5\`,`
- L708 *(aliased)*: `WHERE u.id = $1 AND ea."companyId" = $2 LIMIT 1\`,`
- L748 *(aliased)*: `WHERE u.id = $1 AND ea."companyId" = $2 LIMIT 1\`,`
- L757 *(aliased)*: `WHERE ur."userId" = $1 AND ur."companyId" = $2`
- L767 *(aliased)*: `WHERE ur."userId" = $1 AND ur."companyId" = $2`
- L778 *(aliased)*: `WHERE ur."userId" = $1 AND ur."companyId" = $2`
- L788 *(aliased)*: `WHERE ur."userId" = $1 AND ur."companyId" = $2`
- L796: `WHERE "userId" = $1 AND "companyId" = $2`

### `artifacts/api-server/src/routes/finance-zatca.ts` (A, 29 hits)

- L370: `FROM zatca_settings WHERE "companyId" = $1\`,`
- L391: `\`SELECT id FROM zatca_settings WHERE "companyId" = $1\`,`
- L464: `FROM zatca_settings WHERE "companyId" = $1\`,`
- L499: `\`UPDATE zatca_settings SET "lastConnectionTest" = NOW(), "connectionTestStatus" = $1, "connectionTestMessage" = $2 WHERE "companyId" = $3\`,`
- L519: `\`SELECT * FROM zatca_settings WHERE "companyId" = $1\`,`
- L529 *(aliased)*: `WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL\`,`
- L548: `const { affectedRows } = await rawExecute(\`UPDATE invoices SET "zatcaUuid" = $1::uuid WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`, [uuid, id, scope.companyId]);`
- L607: `\`SELECT * FROM zatca_settings WHERE "companyId" = $1\`,`
- L621 *(aliased)*: `WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL\`,`
- L697: `WHERE id = $5 AND "companyId" = $6 AND "deletedAt" IS NULL\`,`
- L738: `\`SELECT * FROM zatca_settings WHERE "companyId" = $1\`,`
- L750 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je.type = 'expense' AND je."deletedAt" IS NULL`
- L785: `WHERE id = $5 AND "companyId" = $6 AND "deletedAt" IS NULL\`,`
- L836 *(aliased)*: `WHERE l."companyId" = $1${whereExtra}`
- L844 *(aliased)*: `\`SELECT COUNT(*) AS total FROM zatca_submission_log l WHERE l."companyId" = $1${whereExtra}\`,`
- L854: `FROM zatca_submission_log WHERE "companyId" = $1\`,`
- L999: `\`SELECT id FROM zatca_settings WHERE "companyId" = $1\`,`
- L1009: `WHERE "companyId" = $4\`,`
- L1051: `\`SELECT "csrPem", environment FROM zatca_settings WHERE "companyId" = $1\`,`
- L1079: `WHERE "companyId" = $4\`,`

### `artifacts/api-server/src/routes/finance-custodies.ts` (B, 27 hits)

- L201 *(aliased)*: `(SELECT ca.name FROM journal_lines jl3 JOIN chart_of_accounts ca ON ca.code = jl3."accountCode" AND ca."companyId" = $1 WHERE jl3."journalId" = je.id AND jl3.debit > 0 LIMIT 1) AS "custodyAccountName"`
- L206 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'${dateFilter}`
- L217 *(aliased)*: `WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.status = 'posted' AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0`
- L290 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`
- L301 *(aliased)*: `WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.status = 'posted' AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0`
- L378 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`
- L387 *(aliased)*: `WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.status = 'posted' AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2.credit > 0`
- L430 *(aliased)*: `(SELECT ca.name FROM journal_lines jl3 JOIN chart_of_accounts ca ON ca.code = jl3."accountCode" AND ca."companyId" = $2 WHERE jl3."journalId" = je.id AND jl3.debit > 0 LIMIT 1) AS "custodyAccountName"`
- L435 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`
- L451 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE%' AND je.description = $2`
- L471 *(aliased)*: `WHERE aa."entityType" = 'custody' AND aa."entityId" = $1 AND aa."companyId" = $2`
- L535 *(aliased)*: `\`SELECT e.name FROM employee_assignments ea JOIN employees e ON e.id = ea."employeeId" WHERE ea.id = $1 AND ea."companyId" = $2\`,`
- L564 *(aliased)*: `\`SELECT e.id FROM employee_assignments ea JOIN employees e ON e.id = ea."employeeId" WHERE ea.id = $1 AND ea."companyId" = $2\`,`
- L571 *(aliased)*: `WHERE sa."companyId" = $1 AND sa."entityType" = 'employee' AND sa."entityId" = $2 AND sa."accountType" = 'custody'\`,`
- L596: `\`UPDATE journal_entries SET notes = $1, "dueDate" = $2 WHERE id = $3 AND "companyId" = $4 AND "deletedAt" IS NULL\`,`
- L609: `\`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL\`,`
- L637 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`
- L674 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`
- L698 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND jl.debit > 0\`,`
- L712 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND je.ref LIKE 'CUSTODY-SETTLE-%'`

### `artifacts/api-server/src/routes/intelligence.ts` (A, 27 hits)

- L86: `const conditions = [\`"companyId" = $1\`];`
- L118: `\`UPDATE smart_alerts SET "isRead"=true WHERE id=$1 AND "companyId"=$2\`,`
- L139: `const conditions = [\`"companyId" = $1\`];`
- L184: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as total FROM employee_assignments WHERE "companyId"=$1 AND status='active'\`, [cid]),`
- L185: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as total FROM fleet_vehicles WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L186: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as total FROM property_units WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L187: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as active FROM projects WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL\`, [cid]),`
- L188: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as open FROM support_tickets WHERE "companyId"=$1 AND status='open' AND "deletedAt" IS NULL\`, [cid]),`
- L189: `rawQuery<Record<string, unknown>>(\`SELECT COALESCE(SUM("paidAmount"),0) as total FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "createdAt" >= date_trunc('month', CURRENT_DATE)\`, [cid]`
- L190: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as unread FROM smart_alerts WHERE "companyId"=$1 AND "isRead"=false\`, [cid]),`
- L215 *(aliased)*: `(SELECT COUNT(*) FROM tasks t WHERE t."assignedTo" = ea.id AND t."companyId" = $1`
- L219 *(aliased)*: `WHERE ea."companyId" = $1 AND ea.status = 'active'`
- L220 *(aliased)*: `AND (SELECT COUNT(*) FROM tasks t WHERE t."assignedTo" = ea.id AND t."companyId" = $1`
- L229 *(aliased)*: `WHERE lc."companyId" = $1 AND lc.status = 'active' AND lc."deletedAt" IS NULL`
- L240 *(aliased)*: `WHERE i."companyId" = $1 AND i."deletedAt" IS NULL AND i.status IN ('overdue','sent') AND i."dueDate" < CURRENT_DATE`
- L251 *(aliased)*: `LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1`
- L253 *(aliased)*: `WHERE lr."companyId" = $1 AND lr.status = 'pending' AND lr."deletedAt" IS NULL`
- L264 *(aliased)*: `WHERE fm."companyId" = $1`
- L275 *(aliased)*: `FROM tasks t WHERE t."companyId"=$1 AND t."deletedAt" IS NULL AND t."scheduledDate"::date >= CURRENT_DATE - INTERVAL '7 days'`
- L280 *(aliased)*: `FROM tasks t WHERE t."companyId"=$1 AND t."deletedAt" IS NULL AND t."scheduledDate"::date BETWEEN CURRENT_DATE - INTERVAL '37 days' AND CURRENT_DATE - INTERVAL '8 days'`

### `artifacts/api-server/src/routes/mySpace.ts` (B, 24 hits)

- L33 *(aliased)*: `WHERE lb."companyId" = $1 AND lb."employeeId" = $2 AND lb.year = $3\`,`
- L52 *(aliased)*: `WHERE lt."companyId" = $1`
- L75 *(aliased)*: `WHERE lr."employeeId" = $1 AND lr."companyId" = $2 AND lr.status = 'pending' AND lr."deletedAt" IS NULL`
- L90 *(aliased)*: `WHERE ol."employeeId" = $1 AND ol."companyId" = $2 AND ol.status IN ('pending','pending_approval') AND ol."deletedAt" IS NULL`
- L141 *(aliased)*: `WHERE lr."companyId" = $1 AND lr.status = 'pending' AND lr."deletedAt" IS NULL`
- L156 *(aliased)*: `WHERE l."companyId" = $1 AND l.status = 'pending' AND l."deletedAt" IS NULL`
- L166 *(aliased)*: `WHERE o."companyId" = $1 AND o.status = 'pending' AND o."deletedAt" IS NULL`
- L176 *(aliased)*: `WHERE x."companyId" = $1 AND x.status = 'pending' AND x."deletedAt" IS NULL`
- L207: `WHERE "employeeId" = $1 AND "companyId" = $2`
- L277: `WHERE "companyId" = $1 AND status = 'active'`
- L293: `WHERE "userId" = $1 AND "companyId" = $2`
- L301 *(aliased)*: `WHERE pr."employeeId" = $1 AND pr."companyId" = $2 AND pr."deletedAt" IS NULL`
- L317 *(aliased)*: `WHERE lr."employeeId" = $1 AND lr."companyId" = $2 AND lr.status = 'pending' AND lr."deletedAt" IS NULL`
- L337: `WHERE "employeeId" = $1 AND "companyId" = $4 AND "expiryDate" IS NOT NULL`
- L346 *(aliased)*: `WHERE c."companyId" = $1 AND c.status = 'active'`
- L356 *(aliased)*: `WHERE fv."companyId" = $1 AND fi."endDate" BETWEEN $2 AND $3`
- L379: `FROM property_units WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L393: `FROM fleet_vehicles WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L406: `FROM legal_cases WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L420 *(aliased)*: `WHERE ea."companyId" = $1\`,`

### `artifacts/api-server/src/routes/requests.ts` (A, 24 hits)

- L147 *(aliased)*: `\`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL\`,`
- L191: `\`SELECT amount, used FROM budgets WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3\`,`
- L240 *(aliased)*: `rows = await rawQuery(\`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE (r."companyId"=$1 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL ORDE`
- L242 *(aliased)*: `rows = await rawQuery(\`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE (r."companyId"=$1 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL AND `
- L280: `\`SELECT id FROM request_types WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1\`,`
- L318: `const [row] = await rawQuery<RequestRow>(\`SELECT * FROM requests WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L340: `WHERE "isActive" = true AND ("companyId" = $1 OR "companyId" IS NULL)`
- L403: `const rows = await rawQuery(\`SELECT * FROM request_types WHERE "isActive"=true AND ("companyId"=$1 OR "companyId" IS NULL) ORDER BY name LIMIT 500\`, [scope.companyId]);`
- L420: `const [row] = await rawQuery<RequestTypeRow>(\`SELECT * FROM request_types WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L428: `const rows = await rawQuery(\`SELECT * FROM workflows WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`, [scope.companyId]);`
- L445: `const [row] = await rawQuery<WorkflowRow>(\`SELECT * FROM workflows WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L455: `rawQuery(\`SELECT COUNT(*) as count FROM requests WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [cid]),`
- L456: `rawQuery(\`SELECT COUNT(*) as count FROM requests WHERE status='pending' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [cid]),`
- L457: `rawQuery(\`SELECT COUNT(*) as count FROM requests WHERE status='approved' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [cid]),`
- L458: `rawQuery(\`SELECT COUNT(*) as count FROM request_types WHERE "isActive"=true AND ("companyId"=$1 OR "companyId" IS NULL)\`, [cid]),`
- L473 *(aliased)*: `const [row] = await rawQuery<RequestRow>(\`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL)`
- L487: `\`SELECT id, status FROM requests WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L572 *(aliased)*: `const [row] = await rawQuery<RequestRow>(\`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL)`
- L587 *(aliased)*: `const [row] = await rawQuery<RequestRow>(\`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL)`
- L791 *(aliased)*: `\`SELECT aa.*, u.email as "actionByEmail" FROM approval_actions aa LEFT JOIN users u ON aa."actionBy"=u.id WHERE aa."entityType"='request' AND aa."entityId"=$1 AND aa."companyId"=$2 ORDER BY aa."create`

### `artifacts/api-server/src/routes/accounting-engine.ts` (A, 23 hits)

- L95 *(aliased)*: `WHERE am."companyId" = $1 AND am."operationType" = $2 AND am."isActive" = true\`,`
- L137 *(aliased)*: `WHERE am."companyId" = $1`
- L197 *(aliased)*: `WHERE am."companyId" = $1 AND am."operationType" = $2\`,`
- L220: `\`SELECT id FROM accounting_mappings WHERE "companyId" = $1 AND "operationType" = $2\`,`
- L232: `WHERE "companyId" = $10 AND "operationType" = $11`
- L261 *(aliased)*: `WHERE am."companyId" = $1 AND am."operationType" = $2\`,`
- L291 *(aliased)*: `const conditions = [\`jt."companyId" = $1\`];`
- L313 *(aliased)*: `LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2`
- L365: `\`SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2\`, [result, scope.companyId]`
- L371 *(aliased)*: `LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2`
- L393: `\`SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L405: `WHERE id = $6 AND "companyId" = $7 AND "deletedAt" IS NULL\`,`
- L422: `const [template] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L427 *(aliased)*: `LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2`
- L445: `\`SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L449: `const { affectedRows } = await rawExecute(\`UPDATE journal_entry_templates SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L467 *(aliased)*: `const conditions = [\`sa."companyId" = $1\`];`
- L498 *(aliased)*: `WHERE sa."companyId" = $1 AND sa."entityType" = $2 AND sa."entityId" = $3 AND sa."isActive" = true`
- L527 *(aliased)*: `WHERE sa.id = $1 AND sa."companyId" = $2\`,`
- L544: `\`SELECT * FROM subsidiary_accounts WHERE id = $1 AND "companyId" = $2\`,`

### `artifacts/api-server/src/routes/communications.ts` (A, 23 hits)

- L92: `\`SELECT id, name FROM clients WHERE "companyId"=$1 AND REPLACE(REPLACE(phone,'+',''),'-','') LIKE $2 AND "deletedAt" IS NULL\`,`
- L101 *(aliased)*: `JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'`
- L362: `\`UPDATE pbx_calls SET status=$1, duration=$2, "recordingUrl"=$3 WHERE id=$4 AND "companyId"=$5 AND status != 'completed'\`,`
- L431: `const conditions = [\`"companyId" = $1\`, \`"deletedAt" IS NULL\`];`
- L467: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM communications_log WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L488: `const conditions = [\`"companyId" = $1\`];`
- L505: `const conditions = [\`"companyId" = $1\`];`
- L522: `const [countRow] = await rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) AS total FROM pbx_calls WHERE "companyId"=$1\`, [scope.companyId]);`
- L523: `const rows = await rawQuery<Record<string, unknown>>(\`SELECT * FROM pbx_calls WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3\`, [scope.companyId, pageLimit, pageOffset]);`
- L569: `\`SELECT * FROM communications_log WHERE id=$1 AND "companyId"=$2\`,`
- L611: `\`UPDATE communications_log SET "relatedType"=$1, "relatedId"=$2 WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL\`,`
- L640: `const [before] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM communications_log WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L642: `\`UPDATE communications_log SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id\`,`
- L663: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE channel='whatsapp') as whatsapp, COUNT(*) FILTER (WHERE channel='sms') as sms, COUNT(*) FILTER (WHERE channel='email`
- L664: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as pending FROM whatsapp_queue WHERE "companyId"=$1 AND status='pending'\`, [cid]),`
- L665: `rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as pending FROM sms_queue WHERE "companyId"=$1 AND status='pending'\`, [cid]),`
- L704: `\`SELECT status, COUNT(*) as count FROM sms_queue WHERE "companyId"=$1${smsDateFilter} GROUP BY status\`,`
- L708: `\`SELECT status, COUNT(*) as count FROM whatsapp_queue WHERE "companyId"=$1${waDateFilter} GROUP BY status\`,`
- L712: `\`SELECT status, COUNT(*) as count FROM email_queue WHERE "companyId"=$1${emailDateFilter} GROUP BY status\`,`
- L716: `\`SELECT COUNT(*) as count FROM push_subscriptions WHERE "companyId"=$1\`,`

### `artifacts/api-server/src/routes/settings.ts` (A, 23 hits)

- L282: `\`SELECT key, value FROM system_settings WHERE "companyId" = $1 AND "branchId" IS NULL\`,`
- L286: `\`SELECT key, value FROM system_settings WHERE "companyId" = $1 AND "branchId" = $2\`,`
- L420: `const [row] = await rawQuery<BranchRow>(\`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2\`, [r.insertId, targetCompanyId]);`
- L450: `const [updated] = await rawQuery(\`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2\`, [id, existing.companyId]);`
- L481: `\`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2\`,`
- L490: `\`SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "branchId" = $1 AND status = 'active' AND "companyId" = $2\`,`
- L494: `\`SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "branchId" = $1 AND status NOT IN ('cancelled','received','completed') AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L510: `\`UPDATE branches SET status='inactive' WHERE id=$1 AND "companyId"=$2\`,`
- L536: `const [row] = await rawQuery<DepartmentRow>(\`SELECT * FROM departments WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L547: `const { affectedRows } = await rawExecute(\`UPDATE departments SET name=$1, "nameEn"=$2, "managerId"=$3 WHERE id=$4 AND "companyId"=$5 RETURNING id\`, [name, nameEn || null, manager || null, id, scope.c`
- L564: `\`SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "departmentId" = $1 AND status = 'active' AND "companyId" = $2\`,`
- L570: `const [beforeDept] = await rawQuery(\`SELECT * FROM departments WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L572: `await rawExecute(\`DELETE FROM departments WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L753: `\`SELECT DISTINCT "roleKey", label, modules, level FROM user_roles WHERE "companyId" = $1 ORDER BY level DESC\`,`
- L767: `\`UPDATE user_roles SET modules=$1 WHERE "roleKey"=$2 AND "companyId"=$3\`,`
- L784: `\`SELECT * FROM approval_chains WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "chainType", "name"\`,`
- L806: `const [row] = await rawQuery<ApprovalChainRow>(\`SELECT * FROM approval_chains WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L815: `const [beforeChain] = await rawQuery(\`SELECT * FROM approval_chains WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L817: `await rawExecute(\`UPDATE approval_chains SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L850: `\`SELECT key, value FROM system_settings WHERE key = ANY($1) AND "companyId" = $2\`,`

### `artifacts/api-server/src/routes/store.ts` (A, 23 hits)

- L156: `\`SELECT COUNT(*) AS total FROM store_products WHERE "companyId"=$1 AND "deletedAt" IS NULL\`,`
- L160: `\`SELECT * FROM store_products WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3\`,`
- L175: `const [row] = await rawQuery<StoreProductRow>(\`SELECT * FROM store_products WHERE id = $1 AND "companyId" = $2\`, [r.insertId, scope.companyId]);`
- L190 *(aliased)*: `FROM store_products sp WHERE sp.id=$1 AND sp."companyId"=$2 AND sp."deletedAt" IS NULL\`, [id, scope.companyId]);`
- L200: `const [existing] = await rawQuery<{ id: number }>(\`SELECT id FROM store_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L218: `const [row] = await rawQuery<StoreProductRow>(\`SELECT * FROM store_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L229: `const [existing] = await rawQuery<StoreProductRow>(\`SELECT * FROM store_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L231: `const { affectedRows } = await rawExecute(\`UPDATE store_products SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L243 *(aliased)*: `let where = \`o."companyId"=$1 AND o."deletedAt" IS NULL\`;`
- L276: `\`SELECT quantity FROM store_products WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE\`,`
- L296: `\`UPDATE store_products SET quantity = quantity - $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`,`
- L304: `const [order] = await rawQuery<StoreOrderRow>(\`SELECT * FROM store_orders WHERE id = $1 AND "companyId" = $2\`, [orderId, scope.companyId]);`
- L323 *(aliased)*: `WHERE o.id=$1 AND o."companyId"=$2 AND o."deletedAt" IS NULL\`,`
- L350: `\`SELECT * FROM store_orders WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE\`,`
- L373: `const stockRes = await client.query(\`UPDATE store_products SET quantity = quantity + $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`, [item.quantity, item.productId, scope.companyId]);`
- L402: `const { rows: [locked] } = await client.query(\`SELECT * FROM store_orders WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE\`, [id, scope.companyId]);`
- L408: `const stockRes = await client.query(\`UPDATE store_products SET quantity = quantity + $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`, [item.quantity, item.productId, scope.companyId]);`
- L412: `const delRes = await client.query(\`UPDATE store_orders SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L426: `rawQuery(\`SELECT COUNT(*) as count FROM store_products WHERE status='active' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L427: `rawQuery(\`SELECT COUNT(*) as count FROM store_orders WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`

### `artifacts/api-server/src/routes/tasks.ts` (A, 22 hits)

- L210: `property_unit: \`SELECT id, "unitNumber" AS name FROM property_units WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L211: `vehicle: \`SELECT id, COALESCE("plateNumber", make || ' ' || model) AS name FROM fleet_vehicles WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L212: `client: \`SELECT id, name FROM clients WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L213: `project: \`SELECT id, name FROM projects WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L214: `contract: \`SELECT id, COALESCE("contractNumber", 'عقد #' || id) AS name FROM rental_contracts WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L215: `legal_case: \`SELECT id, COALESCE(title, "caseNumber", 'قضية #' || id) AS name FROM legal_cases WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L216: `maintenance_request: \`SELECT id, COALESCE(description, category, 'طلب #' || id) AS name FROM maintenance_requests WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L250: `property_unit: \`SELECT id, "unitNumber" AS name FROM property_units WHERE "companyId"=$1 AND "deletedAt" IS NULL AND ("unitNumber" ILIKE $2 OR "buildingName" ILIKE $2) ORDER BY id DESC LIMIT 10\`,`
- L251: `vehicle: \`SELECT id, COALESCE("plateNumber", make || ' ' || model) AS name FROM fleet_vehicles WHERE "companyId"=$1 AND "deletedAt" IS NULL AND ("plateNumber" ILIKE $2 OR make ILIKE $2 OR model ILIKE `
- L252: `client: \`SELECT id, name FROM clients WHERE "companyId"=$1 AND "deletedAt" IS NULL AND (name ILIKE $2 OR phone ILIKE $2) ORDER BY id DESC LIMIT 10\`,`
- L253: `project: \`SELECT id, name FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL AND name ILIKE $2 ORDER BY id DESC LIMIT 10\`,`
- L254: `contract: \`SELECT id, COALESCE("contractNumber", 'عقد #' || id::text) AS name FROM rental_contracts WHERE "companyId"=$1 AND "deletedAt" IS NULL AND ("contractNumber" ILIKE $2 OR "tenantName" ILIKE $2`
- L255: `legal_case: \`SELECT id, COALESCE(title, "caseNumber", 'قضية #' || id::text) AS name FROM legal_cases WHERE "companyId"=$1 AND "deletedAt" IS NULL AND (title ILIKE $2 OR "caseNumber" ILIKE $2) ORDER BY`
- L256: `maintenance_request: \`SELECT id, COALESCE(description, category, 'طلب #' || id) AS name FROM maintenance_requests WHERE "companyId"=$1 AND "deletedAt" IS NULL AND (description ILIKE $2 OR category ILI`
- L273 *(aliased)*: `let scopeCondition = \` AND t."companyId" = $2\`;`
- L311: `\`SELECT id FROM clients WHERE name = $1 AND "companyId" = $2 LIMIT 1\`,`
- L318: `\`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 LIMIT 1\`,`
- L343: `WHERE id = $1 AND "companyId" = $2 AND status = 'active'`
- L359 *(aliased)*: `WHERE a."companyId" = $1`
- L432: `\`SELECT status FROM tasks WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/hr-contracts.ts` (A, 21 hits)

- L58 *(aliased)*: `let where = \`ec."companyId" = $1 AND ec."deletedAt" IS NULL\`;`
- L106 *(aliased)*: `WHERE ec.id = $1 AND ec."companyId" = $2 AND ec."deletedAt" IS NULL\`,`
- L123 *(aliased)*: `\`SELECT e.id, e.name FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id WHERE e.id = $1 AND ea."companyId" = $2 LIMIT 1\`,`
- L132: `WHERE "employeeId"=$1 AND "companyId"=$2 AND ("endDate" IS NULL OR "endDate" >= CURRENT_DATE)`
- L188: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L250: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L260: `WHERE id = $1 AND "companyId" = $2 RETURNING *\`,`
- L291: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L302: `WHERE id = $1 AND "companyId" = $3 AND "approvalStatus" = 'pending_approval' RETURNING *\`,`
- L337: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L348: `WHERE id = $1 AND "companyId" = $3 AND "approvalStatus" = 'pending_approval' RETURNING *\`,`
- L379: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L391: `WHERE id = $1 AND "companyId" = $3 AND "signedByCompany" = FALSE RETURNING *\`,`
- L435 *(aliased)*: `WHERE ec.id = $1 AND ec."companyId" = $2 AND ec."deletedAt" IS NULL`
- L448: `WHERE id = $1 AND "companyId" = $2 RETURNING *\`,`
- L480: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L491: `WHERE id = $1 AND "companyId" = $2 AND "approvalStatus" = 'signed' RETURNING *\`,`
- L524: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L536: `WHERE id = $1 AND "companyId" = $4 AND status = 'active' RETURNING *\`,`
- L570: `\`SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/training.ts` (A, 21 hits)

- L119: `const rows = await rawQuery(\`SELECT * FROM training_programs WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`, [scope.companyId]);`
- L151: `const [row] = await rawQuery<TrainingProgramRow>(\`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L160: `const [row] = await rawQuery<TrainingProgramRow>(\`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L171: `const [existing] = await rawQuery<{ id: number; status: string }>(\`SELECT id, status FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L198: `const [row] = await rawQuery<TrainingProgramRow>(\`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L276: `const [existing] = await rawQuery<{ id: number }>(\`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L278: `await rawExecute(\`UPDATE training_programs SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L293 *(aliased)*: `let where = \`tp."companyId"=$1 AND tp."deletedAt" IS NULL\`;`
- L318: `const [prog] = await rawQuery<{ id: number }>(\`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [programId, scope.companyId]);`
- L322 *(aliased)*: `\`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1\`,`
- L339: `await client.query(\`UPDATE training_programs SET enrolled = enrolled + 1 WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [Number(programId), scope.companyId]);`
- L348 *(aliased)*: `const [row] = await rawQuery<TrainingEnrollmentRow>(\`SELECT e.* FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2\`, [r.insertId, scope.co`
- L357 *(aliased)*: `const [row] = await rawQuery<TrainingEnrollmentRow>(\`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id AND tp."deletedAt" IS NULL`
- L368 *(aliased)*: `const [existing] = await rawQuery<{ id: number }>(\`SELECT e.id FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2\`, [id, scope.companyId])`
- L378 *(aliased)*: `const [row] = await rawQuery<TrainingEnrollmentRow>(\`SELECT e.* FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2 AND e."deletedAt" IS NU`
- L393 *(aliased)*: `const [existing] = await rawQuery<{ id: number; programId: number }>(\`SELECT e.id, e."programId" FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."comp`
- L397: `await client.query(\`UPDATE training_programs SET enrolled = GREATEST(0, enrolled - 1) WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [existing.programId, scope.companyId]);`
- L414: `rawQuery(\`SELECT COUNT(*) as count FROM training_programs WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L415: `rawQuery(\`SELECT COUNT(*) as count FROM training_programs WHERE status='active' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L416 *(aliased)*: `rawQuery(\`SELECT COUNT(*) as count FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE tp."companyId"=$1 AND tp."deletedAt" IS NULL AND e."deletedAt" IS NULL\`, [cid]),`

### `artifacts/api-server/src/routes/activityLog.ts` (B, 20 hits)

- L60 *(aliased)*: `WHERE al."companyId" = $1${moduleFilter}`
- L77 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL`
- L98 *(aliased)*: `WHERE r."companyId" = $1 AND r."deletedAt" IS NULL`
- L118 *(aliased)*: `WHERE cl."companyId" = $1 AND cl."deletedAt" IS NULL`
- L141 *(aliased)*: `WHERE lr."companyId" = $1 AND lr."deletedAt" IS NULL`
- L164 *(aliased)*: `WHERE i."companyId" = $1 AND i."deletedAt" IS NULL`
- L175 *(aliased)*: `SELECT al.id FROM audit_logs al WHERE al."companyId" = $1${moduleFilter}`
- L177 *(aliased)*: `SELECT je.id FROM journal_entries je WHERE je."companyId" = $1 AND je."deletedAt" IS NULL ${module ? \`AND 'finance' = $${moduleParamIndex}\` : ""}`
- L179 *(aliased)*: `SELECT r.id FROM requests r WHERE r."companyId" = $1 AND r."deletedAt" IS NULL ${module ? \`AND 'requests' = $${moduleParamIndex}\` : ""}`
- L181 *(aliased)*: `SELECT cl.id FROM communications_log cl WHERE cl."companyId" = $1 AND cl."deletedAt" IS NULL ${module ? \`AND 'communications' = $${moduleParamIndex}\` : ""}`
- L183 *(aliased)*: `SELECT lr.id FROM hr_leave_requests lr WHERE lr."companyId" = $1 AND lr."deletedAt" IS NULL ${module ? \`AND 'hr' = $${moduleParamIndex}\` : ""}`
- L185 *(aliased)*: `SELECT i.id FROM invoices i WHERE i."companyId" = $1 AND i."deletedAt" IS NULL ${module ? \`AND 'finance' = $${moduleParamIndex}\` : ""}`
- L217: `\`SELECT COUNT(*) AS count FROM requests WHERE status='pending' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L219: `\`SELECT COUNT(*) AS count FROM hr_leave_requests WHERE status='pending' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L221: `\`SELECT COUNT(*) AS count FROM invoices WHERE status='overdue' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L223: `\`SELECT COUNT(*) AS count FROM support_tickets WHERE status='open' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L225: `\`SELECT COUNT(*) AS count FROM attendance WHERE date=CURRENT_DATE AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L227: `\`SELECT COUNT(*) AS count FROM legal_contracts WHERE status='active' AND "endDate"::date - CURRENT_DATE <= 30 AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L229: `\`SELECT COUNT(*) AS count FROM warehouse_products WHERE "currentStock" <= "minStock" AND status='active' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]),`
- L231: `\`SELECT COUNT(*) AS count FROM notifications WHERE "isRead"=false AND "assignmentId"=$2 AND "companyId"=$1\`,`

### `artifacts/api-server/src/routes/marketing.ts` (A, 20 hits)

- L94: `const rows = await rawQuery<MarketingCampaignRow>(\`SELECT * FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`, [scope.companyId]);`
- L134: `const [row] = await rawQuery<MarketingCampaignRow>(\`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L143: `const [row] = await rawQuery<MarketingCampaignRow>(\`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L154: `const [existing] = await rawQuery<{ id: number }>(\`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L175: `const [row] = await rawQuery<MarketingCampaignRow>(\`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L184: `const [existing] = await rawQuery<{ id: number }>(\`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L186: `const { affectedRows } = await rawExecute(\`UPDATE marketing_campaigns SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L198: `const [total] = await rawQuery<CountRow>(\`SELECT COUNT(*) as count FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]);`
- L199: `const [active] = await rawQuery<CountRow>(\`SELECT COUNT(*) as count FROM marketing_campaigns WHERE status='active' AND "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]);`
- L200: `const [budget] = await rawQuery<TotalRow>(\`SELECT COALESCE(SUM(budget),0) as total FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]);`
- L201: `const [spent] = await rawQuery<TotalRow>(\`SELECT COALESCE(SUM(spent),0) as total FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]);`
- L202: `const [revenue] = await rawQuery<TotalRow>(\`SELECT COALESCE(SUM(revenue),0) as total FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL\`, [cid]).catch((e) => { logger.error(e, "mark`
- L207: `\`SELECT source, COUNT(*) AS count FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source IS NOT NULL GROUP BY source ORDER BY count DESC\`,`
- L226: `const [campaign] = await rawQuery<MarketingCampaignRow>(\`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L232: `\`SELECT COUNT(*) AS count FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source=$2\`,`
- L252: `\`SELECT stage, COUNT(*) AS count, COALESCE(SUM(value),0) AS value FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND stage = ANY($2::text[]) GROUP BY stage\`,`
- L263: `FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source IS NOT NULL GROUP BY source ORDER BY total DESC\`,`
- L283: `const { affectedRows } = await rawExecute(\`UPDATE marketing_campaigns SET revenue=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL\`, [revenue || 0, id, scope.companyId]);`
- L287: `const [row] = await rawQuery<MarketingCampaignRow>(\`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L296: `\`SELECT * FROM document_templates WHERE "companyId" = $1 AND category = 'marketing' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`,`

### `artifacts/api-server/src/routes/hr-discipline.ts` (A, 19 hits)

- L235 *(aliased)*: `WHERE m.id = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL\`,`
- L251: `let where = \`"companyId" = $1 AND "deletedAt" IS NULL AND "isActive" = TRUE\`;`
- L294: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L451: `const [row] = await rawQuery<RegulationRow>(\`SELECT * FROM hr_discipline_regulation WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L539: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L574 *(aliased)*: `let where = \`m."companyId" = $1 AND m."deletedAt" IS NULL\`;`
- L612: `WHERE "memoId" = $1 AND "companyId" = $2 ORDER BY "createdAt" ASC\`,`
- L729: `const [row] = await rawQuery<MemoRow>(\`SELECT * FROM hr_inquiry_memos WHERE id=$1 AND "companyId"=$2\`, [memoId, scope.companyId]);`
- L862: `FROM employee_assignments WHERE id = $1 AND "companyId" = $2\`,`
- L920: `\`UPDATE employee_violations SET status = 'rejected' WHERE id = $1 AND "companyId" = $2 AND status = 'pending' AND "deletedAt" IS NULL\`,`
- L950: `WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL\`,`
- L1015: `WHERE id = $1 AND "companyId" = $2 AND status IN ('pending', 'under_review') AND "deletedAt" IS NULL\`,`
- L1110: `\`UPDATE employee_violations SET status = 'appeal_accepted' WHERE id = $1 AND "companyId" = $2 AND status = 'approved' AND "deletedAt" IS NULL\`,`
- L1165: `\`UPDATE employee_violations SET status = 'closed' WHERE id = $1 AND "companyId" = $2 AND status IN ('approved', 'rejected', 'appeal_accepted', 'cancelled') AND "deletedAt" IS NULL\`,`
- L1244: `WHERE "companyId" = $1 AND "employeeId" = $3 AND "deletedAt" IS NULL\`,`
- L1252: `WHERE "companyId" = $1 AND "employeeId" = $2 AND "deletedAt" IS NULL`
- L1277: `WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L1392: `WHERE "companyId" = $1`
- L1404 *(aliased)*: `WHERE adl."companyId" = $1`

### `artifacts/api-server/src/routes/notification-engine.ts` (A, 19 hits)

- L110: `WHERE "companyId" = $1 AND "userId" = $2`
- L118: `WHERE ("companyId" = $1 OR "companyId" IS NULL) AND "isActive" = true`
- L192 *(aliased)*: `WHERE r."companyId" = $1 OR r."companyId" IS NULL`
- L261: `WHERE id = $1 AND "companyId" = $7\`,`
- L292: `\`SELECT * FROM notification_routing_rules WHERE id = $1 AND "companyId" = $2\`,`
- L296: `\`DELETE FROM notification_routing_rules WHERE id = $1 AND "companyId" = $2\`,`
- L329: `WHERE "companyId" = $1 OR "companyId" IS NULL`
- L397: `WHERE id = $1 AND "companyId" = $6\`,`
- L428: `\`SELECT * FROM notification_templates WHERE id = $1 AND "companyId" = $2\`,`
- L432: `\`DELETE FROM notification_templates WHERE id = $1 AND "companyId" = $2 AND "isDefault" = false\`,`
- L464: `WHERE "companyId" = $1 OR "companyId" IS NULL`
- L522: `WHERE id = $1 AND "companyId" = $6\`,`
- L553: `\`SELECT * FROM notification_fallback_chains WHERE id = $1 AND "companyId" = $2\`,`
- L557: `\`DELETE FROM notification_fallback_chains WHERE id = $1 AND "companyId" = $2\`,`
- L590: `WHERE "companyId" = $1`
- L681: `WHERE id = $1 AND "companyId" = $7\`,`
- L717: `\`SELECT * FROM notification_webhooks WHERE id = $1 AND "companyId" = $2\`,`
- L721: `\`DELETE FROM notification_webhooks WHERE id = $1 AND "companyId" = $2\`,`
- L767: `let where = \`"companyId" = $1\`;`

### `artifacts/api-server/src/routes/recruitment.ts` (B, 18 hits)

- L103: `const rows = await rawQuery(\`SELECT * FROM job_postings WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500\`, [scope.companyId]);`
- L135: `const [row] = await rawQuery<JobPostingRow>(\`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2\`, [r.insertId, scope.companyId]);`
- L144: `const [row] = await rawQuery<JobPostingRow>(\`SELECT * FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L171: `const [row] = await rawQuery<JobPostingRow>(\`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L272: `const [before] = await rawQuery<JobPostingRow>(\`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L274: `await rawExecute(\`UPDATE job_postings SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L291 *(aliased)*: `let where = \`(jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL AND jp."deletedAt" IS NULL\`;`
- L304: `\`SELECT id FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L326 *(aliased)*: `\`SELECT ja.* FROM job_applications ja JOIN job_postings jp ON jp.id = ja."postingId" WHERE ja.id=$1 AND jp."companyId"=$2 AND ja."deletedAt" IS NULL\`,`
- L337 *(aliased)*: `const [row] = await rawQuery<JobApplicationRow>(\`SELECT a.*, jp.title as "postingTitle" FROM job_applications a LEFT JOIN job_postings jp ON a."postingId"=jp.id AND jp."deletedAt" IS NULL WHERE a.id=$`
- L347 *(aliased)*: `const [existing] = await rawQuery<{ id: number }>(\`SELECT a.id FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2 AND a."deletedAt" IS NULL\`, [id, `
- L364 *(aliased)*: `\`SELECT ja.* FROM job_applications ja JOIN job_postings jp ON jp.id = ja."postingId" WHERE ja.id=$1 AND jp."companyId"=$2 AND ja."deletedAt" IS NULL\`,`
- L383 *(aliased)*: `const [before] = await rawQuery<JobApplicationRow>(\`SELECT a.* FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2 AND a."deletedAt" IS NULL\`, [id, `
- L385: `await rawExecute(\`UPDATE job_applications SET "deletedAt" = NOW() WHERE id=$1 AND "deletedAt" IS NULL AND "postingId" IN (SELECT id FROM job_postings WHERE "companyId"=$2)\`, [id, scope.companyId]);`
- L403: `rawQuery(\`SELECT COUNT(*) as count FROM job_postings WHERE status='open' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [cid]),`
- L404 *(aliased)*: `rawQuery(\`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL AND jp."deletedAt" `
- L405 *(aliased)*: `rawQuery(\`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='new' AND (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL\``
- L406 *(aliased)*: `rawQuery(\`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='interview' AND (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS`

### `artifacts/api-server/src/routes/automation.ts` (A, 16 hits)

- L23: `const { affectedRows } = await rawExecute(\`UPDATE cron_jobs SET "isActive" = NOT "isActive" WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L25: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM cron_jobs WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L55: `const conditions: string[] = [\`"companyId" = $1\`];`
- L69: `\`SELECT channel, status, COUNT(*) as count FROM notification_log WHERE "companyId"=$1 GROUP BY channel, status ORDER BY channel\`,`
- L72: `const [total] = await rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as total FROM notification_log WHERE "companyId"=$1\`, [cid]);`
- L83: `const conditions = [\`"companyId" = $1\`];`
- L98: `\`SELECT * FROM proactive_rules WHERE "companyId" = $1 ORDER BY module, name LIMIT 500\`,`
- L110: `\`UPDATE proactive_rules SET "isActive" = NOT "isActive" WHERE id=$1 AND "companyId"=$2\`,`
- L114: `\`SELECT * FROM proactive_rules WHERE id=$1 AND "companyId"=$2\`,`
- L131: `const conditions = [\`"companyId" = $1\`];`
- L152: `\`SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1\`,`
- L156: `\`SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1 AND "createdAt"::date = CURRENT_DATE\`,`
- L160: `\`SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'\`,`
- L164: `\`SELECT "automationType", COUNT(*) as count FROM automation_logs WHERE "companyId" = $1 GROUP BY "automationType" ORDER BY count DESC\`,`
- L171 *(aliased)*: `WHERE al."companyId" = $1`
- L177: `FROM automation_logs WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT 5\`,`

### `artifacts/api-server/src/routes/hr-exit.ts` (A, 16 hits)

- L179 *(aliased)*: `let where = \`x."companyId" = $1 AND x."deletedAt" IS NULL\`;`
- L206: `WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L231 *(aliased)*: `WHERE x.id = $1 AND x."companyId" = $2 AND x."deletedAt" IS NULL\`,`
- L238: `WHERE "exitRequestId" = $1 AND "companyId" = $2`
- L261: `WHERE "assignmentId" = $1 AND "companyId" = $2`
- L271 *(aliased)*: `FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2\`,`
- L299: `WHERE "employeeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $1 LIMIT 1) AND "companyId" = $2\`,`
- L310: `WHERE "assignmentId" = $1 AND "companyId" = $2 AND status IN ('active','approved') AND "deletedAt" IS NULL\`,`
- L397: `const [row] = await rawQuery<ExitRequestRow>(\`SELECT * FROM hr_exit_requests WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L424: `\`SELECT * FROM hr_exit_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L526: `\`SELECT * FROM hr_exit_clearance WHERE id = $1 AND "companyId" = $2\`,`
- L536: `WHERE id = $4 AND "companyId" = $5 AND status = 'pending'\`,`
- L541: `WHERE "exitRequestId" = $1 AND "companyId" = $2 AND status = 'pending'\`,`
- L546: `\`UPDATE hr_exit_requests SET "clearanceCompleted" = TRUE, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status NOT IN ('rejected') AND "deletedAt" IS NULL\`,`
- L574: `\`SELECT * FROM hr_exit_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L594: `WHERE id = $1 AND "companyId" = $2 AND status = 'active'\`,`

### `artifacts/api-server/src/routes/clientPortal.ts` (C, 15 hits)

- L152: `\`SELECT id, "isActive", "mustChangePassword", "tokenVersion" FROM client_portal_accounts WHERE id = $1 AND "clientId" = $2 AND "companyId" = $3\`,`
- L418 *(aliased)*: `WHERE i.id = $3 AND i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`
- L476: `WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L491: `\`SELECT id FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L518: `\`SELECT id, status FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L570: `\`SELECT id, ref, title, status, priority, category, "invoiceId", "contractId", "createdAt" FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L595: `\`SELECT "passwordHash" FROM client_portal_accounts WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2\`,`
- L610: `\`UPDATE client_portal_accounts SET "passwordHash" = $1, "mustChangePassword" = false, "tokenVersion" = "tokenVersion" + 1, "updatedAt" = NOW() WHERE id = $4 AND "clientId" = $2 AND "companyId" = $3\`,`
- L640: `\`SELECT id, "assigneeId", status FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L659: `const [row] = await rawQuery<CsatRatingRow>(\`SELECT * FROM ticket_csat_ratings WHERE "ticketId"=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L670: `const conditions = [\`("companyId"=$1 OR "companyId" IS NULL)\`, \`status='published'\`, \`"deletedAt" IS NULL\`];`
- L689: `\`SELECT * FROM kb_articles WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND status='published' AND "deletedAt" IS NULL\`,`
- L693: `await rawExecute(\`UPDATE kb_articles SET views=COALESCE(views,0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [id, scope.companyId]).catch((e) => logger.error(e,`
- L707: `await rawExecute(\`UPDATE kb_articles SET helpful=COALESCE(helpful,0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L709: `await rawExecute(\`UPDATE kb_articles SET "notHelpful"=COALESCE("notHelpful",0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`, [id, scope.companyId]);`

### `artifacts/api-server/src/routes/execDashboard.ts` (A, 15 hits)

- L47: `WHERE "companyId"=$1 AND code LIKE '11%' AND type='asset' AND "deletedAt" IS NULL`
- L71: `WHERE "companyId"=$1 AND status NOT IN ('paid','cancelled') AND "deletedAt" IS NULL\`,`
- L89: `WHERE "companyId"=$1 AND status NOT IN ('paid','cancelled','draft') AND "deletedAt" IS NULL\`,`
- L105: `WHERE "companyId"=$1 AND status='open' AND "deletedAt" IS NULL AND "slaDeadline" < NOW()\`,`
- L110: `WHERE "companyId"=$1 AND status IN ('pending','in_review','escalated')`
- L124: `WHERE "companyId"=$1 AND status IN ('pending','in_review')`
- L150 *(aliased)*: `WHERE b."companyId"=$1 AND b.period=$4 AND b.amount > 0\`,`
- L181 *(aliased)*: `WHERE dl."companyId"=$1 AND i.status NOT IN ('paid','cancelled')`
- L193: `WHERE "companyId"=$1 AND status='active'`
- L204: `WHERE "companyId"=$1 AND "deletedAt" IS NULL`
- L216: `WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`
- L235 *(aliased)*: `WHERE je."companyId"=$1 AND je."deletedAt" IS NULL`
- L245 *(aliased)*: `WHERE je."companyId"=$1 AND je."deletedAt" IS NULL`
- L322 *(aliased)*: `WHERE i."companyId"=$1 AND i.status NOT IN ('paid','cancelled')`
- L345: `WHERE "companyId"=$1 AND status IN ('breached','escalated_l1','escalated_l2')`

### `artifacts/api-server/src/routes/gov-integrations.ts` (A, 15 hits)

- L201: `\`SELECT * FROM gov_integrations WHERE id = $1 AND "companyId" = $2\`,`
- L242: `const [updated] = await rawQuery<GovIntegrationRow>(\`SELECT * FROM gov_integrations WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L254: `\`SELECT * FROM gov_integrations WHERE id = $1 AND "companyId" = $2\`,`
- L282: `\`UPDATE gov_integrations SET "lastCheckedAt"=NOW(), "lastCheckStatus"=$2, "lastCheckMessage"=$3, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$4\`,`
- L337: `\`UPDATE gov_integrations SET "lastCheckedAt"=NOW(), "lastCheckStatus"=$2, "lastCheckMessage"=$3, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$4\`,`
- L372 *(aliased)*: `WHERE ea."companyId" = $1 AND e.status = 'active' AND e."deletedAt" IS NULL`
- L396 *(aliased)*: `WHERE fv."companyId" = $1 AND fv.status != 'decommissioned' AND fv."deletedAt" IS NULL`
- L412 *(aliased)*: `const conditions = [\`gl."companyId" = $1\`];`
- L442: `\`SELECT id FROM gov_integrations WHERE id = $1 AND "companyId" = $2\`,`
- L462 *(aliased)*: `const [row] = await rawQuery<GovLinkRow>(\`SELECT gl.*, gi.type AS "integrationType", gi.name AS "integrationName" FROM gov_integration_links gl JOIN gov_integrations gi ON gi.id = gl."integrationId" W`
- L466 *(aliased)*: `\`SELECT gl.*, gi.type AS "integrationType", gi.name AS "integrationName" FROM gov_integration_links gl JOIN gov_integrations gi ON gi.id = gl."integrationId" WHERE gl."companyId" = $1 AND gl."integrat`
- L482 *(aliased)*: `\`SELECT gl.id FROM gov_integration_links gl WHERE gl.id = $1 AND gl."companyId" = $2 AND gl."deletedAt" IS NULL\`,`
- L505 *(aliased)*: `const [row] = await rawQuery<GovLinkRow>(\`SELECT gl.*, gi.type AS "integrationType", gi.name AS "integrationName" FROM gov_integration_links gl JOIN gov_integrations gi ON gi.id = gl."integrationId" W`
- L515: `\`SELECT * FROM gov_integration_links WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L519: `\`UPDATE gov_integration_links SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/hr-overtime.ts` (A, 14 hits)

- L140 *(aliased)*: `let where = \`o."companyId" = $1 AND o."deletedAt" IS NULL\`;`
- L169: `WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L190 *(aliased)*: `WHERE o."assignmentId" = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL`
- L215 *(aliased)*: `WHERE o."companyId" = $1 AND o."payrollPeriod" = $2`
- L225: `WHERE "companyId" = $1 AND "payrollPeriod" = $2 AND status = 'approved' AND "deletedAt" IS NULL\`,`
- L250 *(aliased)*: `WHERE o.id = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL\`,`
- L274 *(aliased)*: `FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2\`,`
- L287: `AND "companyId" = $3 AND "deletedAt" IS NULL AND status != 'rejected'\`,`
- L364: `const [row] = await rawQuery<OvertimeRow>(\`SELECT * FROM hr_overtime_requests WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L388: `\`SELECT * FROM hr_overtime_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L401: `\`UPDATE hr_overtime_requests SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL\`,`
- L449: `WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL\`,`
- L502: `\`SELECT * FROM hr_overtime_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L515: `\`UPDATE hr_overtime_requests SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/workflows.ts` (A, 14 hits)

- L298 *(aliased)*: `WHERE wi."companyId" = $1`
- L325 *(aliased)*: `WHERE wd."companyId" = $1`
- L340: `\`SELECT * FROM workflow_definitions WHERE id = $1 AND "companyId" = $2\`,`
- L380: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM workflow_definitions WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L401: `WHERE id = $7 AND "companyId" = $8\`,`
- L418: `const [def] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM workflow_definitions WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L432: `const [before] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM workflow_definitions WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L433: `const { affectedRows } = await rawExecute(\`DELETE FROM workflow_definitions WHERE id = $1 AND "companyId" = $2\`, [id, scope.companyId]);`
- L447: `\`SELECT * FROM sla_definitions WHERE "companyId" = $1 ORDER BY "requestType" LIMIT 500\`,`
- L473: `const [row] = await rawQuery<Record<string, unknown>>(\`SELECT * FROM sla_definitions WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L483: `const [total] = await rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL\`, [scope.companyId]);`
- L484: `const [pending] = await rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('pending','in_review')\`, [scop`
- L485: `const [slaWarning] = await rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "slaStatus" IN ('warning','exceeded') `
- L486: `const [escalated] = await rawQuery<Record<string, unknown>>(\`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "slaStatus" = 'escalated' AND status IN`

### `artifacts/api-server/src/routes/calendar.ts` (B, 13 hits)

- L66 *(aliased)*: `WHERE p."companyId" = $1 AND p."deletedAt" IS NULL AND pm.status NOT IN ('completed','cancelled')`
- L74: `WHERE "companyId" = $1 AND status IN ('pending','breached','escalated_l1','escalated_l2')`
- L84 *(aliased)*: `WHERE rc."companyId" = $1 AND rc."deletedAt" IS NULL AND rc.status = 'active'`
- L94 *(aliased)*: `WHERE t."companyId" = $1 AND t."deletedAt" IS NULL AND t.status NOT IN ('completed','cancelled')`
- L102: `WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('planned','ongoing')`
- L112 *(aliased)*: `WHERE ed."companyId" = $1 AND ed."expiryDate" BETWEEN $2 AND $3`
- L122: `WHERE "companyId" = $1 AND "deletedAt" IS NULL`
- L134: `WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "insuranceExpiry" BETWEEN $2 AND $3`
- L145 *(aliased)*: `WHERE lr."companyId" = $1 AND lr."deletedAt" IS NULL`
- L156 *(aliased)*: `WHERE jp."companyId" = $1`
- L167: `WHERE "companyId" = $1`
- L177: `WHERE "companyId" = $1`
- L190 *(aliased)*: `WHERE g."companyId" = $1`

### `artifacts/api-server/src/routes/finance-budget.ts` (B, 13 hits)

- L171 *(aliased)*: `WHERE b."companyId" = $1 AND b."deletedAt" IS NULL AND b.period >= $2 AND b.period <= $3`
- L214: `const [row] = await rawQuery<FullBudgetRow>(\`SELECT * FROM budgets WHERE id=$1 AND "companyId"=$2\`, [insertId || 0, scope.companyId]);`
- L280: `const [beforeBudget] = await rawQuery<FullBudgetRow>(\`SELECT * FROM budgets WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L316: `\`SELECT id, "accountCode", period, amount, used FROM budgets WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L338: `\`UPDATE budgets SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id\`,`
- L420: `\`SELECT amount, used FROM budgets WHERE "companyId"=$1 AND "accountCode"=$2 AND period=$3 AND "deletedAt" IS NULL\`,`
- L491 *(aliased)*: `WHERE ar."companyId"=$1 AND ar.status=$2 AND ar."deletedAt" IS NULL`
- L512: `\`SELECT id, "approvalLevel", "accountCode", period FROM budget_approval_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL\`,`
- L610 *(aliased)*: `WHERE b."companyId" = $1 AND b."deletedAt" IS NULL AND b.period = $4`
- L667 *(aliased)*: `WHERE b.id = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL\`,`
- L687 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted'`
- L729 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND to_char(je."createdAt", 'YYYY-MM') = $2`
- L749 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND to_char(je."createdAt", 'YYYY-MM') = $2\`,`

### `artifacts/api-server/src/routes/finance-vendors.ts` (B, 13 hits)

- L130: `const [row] = await rawQuery<VendorRow>(\`SELECT * FROM suppliers WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L195: `\`SELECT id, name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L201: `\`SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "supplierId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status NOT IN ('cancelled','received','completed')\`,`
- L205: `\`SELECT COUNT(*) AS cnt FROM purchase_requests WHERE "supplierId" = $1 AND "companyId" = $2 AND status NOT IN ('cancelled','rejected','completed')\`,`
- L224: `\`UPDATE suppliers SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id\`,`
- L308 *(aliased)*: `WHERE i."companyId" = $1 AND i."deletedAt" IS NULL`
- L384 *(aliased)*: `WHERE ni."companyId" = $1`
- L418 *(aliased)*: `WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL\`,`
- L441 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL`
- L474 *(aliased)*: `WHERE po."companyId" = $1 AND po.status NOT IN ('cancelled','completed','received') AND po."deletedAt" IS NULL`
- L493 *(aliased)*: `WHERE po.id = $1 AND po."companyId" = $2 AND po."deletedAt" IS NULL\`,`
- L511 *(aliased)*: `WHERE wr.id = $1 AND wr."companyId" = $2 AND wr."deletedAt" IS NULL\`,`
- L537 *(aliased)*: `WHERE wr."companyId" = $1 AND wr."deletedAt" IS NULL AND wr."entityType" IN ('expense','salary_advance','custody','purchase_order')`

### `artifacts/api-server/src/routes/hr-loans.ts` (A, 13 hits)

- L176 *(aliased)*: `let where = \`l."companyId" = $1 AND l."deletedAt" IS NULL\`;`
- L226: `WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L247 *(aliased)*: `WHERE l."assignmentId" = $1 AND l."companyId" = $2 AND l."deletedAt" IS NULL`
- L272 *(aliased)*: `WHERE l.id = $1 AND l."companyId" = $2 AND l."deletedAt" IS NULL\`,`
- L279: `WHERE "loanId" = $1 AND "companyId" = $2`
- L307: `WHERE "assignmentId" = $1 AND "companyId" = $2`
- L321 *(aliased)*: `FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2\`,`
- L400: `const [row] = await rawQuery<LoanRow>(\`SELECT * FROM hr_employee_loans WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L427: `\`SELECT * FROM hr_employee_loans WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L440: `\`UPDATE hr_employee_loans SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL\`,`
- L488: `WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL\`,`
- L573: `\`SELECT * FROM hr_employee_loans WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L591: `\`UPDATE hr_employee_loans SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/entityMeta.ts` (A, 12 hits)

- L35: `WHERE "entityType" = $1 AND "entityId" = $2 AND "companyId" = $3`
- L80: `\`SELECT * FROM entity_comments WHERE id = $1 AND "companyId" = $2\`,`
- L84: `\`DELETE FROM entity_comments WHERE id = $1 AND "companyId" = $2\`,`
- L109: `WHERE "entityType" = $1 AND "entityId" = $2 AND "companyId" = $3`
- L158: `\`SELECT * FROM entity_tags WHERE id = $1 AND "companyId" = $2\`,`
- L162: `\`DELETE FROM entity_tags WHERE id = $1 AND "companyId" = $2\`,`
- L189: `WHERE "entityType" = $1 AND tag = $2 AND "companyId" = $3 LIMIT 1000\`,`
- L205: `WHERE "entityType" = $1 AND "companyId" = $2`
- L265: `\`UPDATE ${table} SET status = 'approved' WHERE id = ANY($1::int[]) AND "companyId" = $2 AND "deletedAt" IS NULL AND status IN ('pending','draft','pending_approval') ${extraWhere} RETURNING id\`,`
- L272: `\`UPDATE ${table} SET status = 'rejected' WHERE id = ANY($1::int[]) AND "companyId" = $2 AND "deletedAt" IS NULL AND status IN ('pending','draft','pending_approval') ${extraWhere} RETURNING id\`,`
- L279: `\`UPDATE ${table} SET "deletedAt" = NOW() WHERE id = ANY($1::int[]) AND "companyId" = $2 AND "deletedAt" IS NULL AND status NOT IN ('approved','posted','paid','completed') ${extraWhere} RETURNING id\`,`
- L287: `\`UPDATE ${table} SET status = $1 WHERE id = ANY($2::int[]) AND "companyId" = $3 AND "deletedAt" IS NULL AND status NOT IN ('closed','completed','cancelled') ${extraWhere} RETURNING id\`,`

### `artifacts/api-server/src/routes/operationsCenter.ts` (A, 12 hits)

- L52: `\`SELECT value FROM system_settings WHERE key='operations_center_thresholds' AND ("companyId"=$1 OR "companyId" IS NULL) ORDER BY "companyId" DESC NULLS LAST LIMIT 1\`,`
- L105: `FROM umrah_pilgrims WHERE "companyId"=$1\`,`
- L125: `FROM property_units WHERE "companyId"=$1 AND "deletedAt" IS NULL\`,`
- L132 *(aliased)*: `WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE\`,`
- L139: `WHERE "companyId"=$1 AND status NOT IN ('completed','closed','rejected') AND "deletedAt" IS NULL\`,`
- L145: `WHERE "companyId"=$1 AND status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND "deletedAt" IS NULL\`,`
- L218: `COALESCE((SELECT SUM(amount) FROM vouchers WHERE "companyId"=$1 AND type='receipt' AND "createdAt" >= date_trunc('month', CURRENT_DATE)), 0) AS inflow,`
- L219: `COALESCE((SELECT SUM(amount) FROM vouchers WHERE "companyId"=$1 AND type='payment' AND "createdAt" >= date_trunc('month', CURRENT_DATE)), 0) AS outflow\`,`
- L272: `WHERE "companyId"=$1 AND status NOT IN ('completed','closed','rejected')`
- L365: `WHERE "companyId"=$1 AND priority IN ('critical','urgent') AND status NOT IN ('completed','closed','rejected')\`,`
- L465: `\`SELECT id FROM daily_close_log WHERE "companyId"=$1 AND "closeDate"=$2\`,`
- L523: `\`SELECT id FROM daily_close_log WHERE "companyId"=$1 AND "closeDate"=$2\`,`

### `artifacts/api-server/src/routes/warehouse-advanced.ts` (B, 12 hits)

- L66 *(aliased)*: `const where: string[] = [\`wsl."companyId" = $1\`, \`wsl."deletedAt" IS NULL\`];`
- L214 *(aliased)*: `const where: string[] = [\`wss."companyId" = $1\`, \`wss."deletedAt" IS NULL\`];`
- L253: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L300: `WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL\`,`
- L325 *(aliased)*: `const where: string[] = [\`wcc."companyId" = $1\`];`
- L394 *(aliased)*: `WHERE p."companyId" = $1`
- L414 *(aliased)*: `WHERE wcc.id = $1 AND wcc."companyId" = $2\`,`
- L553 *(aliased)*: `const where: string[] = [\`pac."companyId" = $1\`];`
- L558: `where.push(\`pac.period = (SELECT MAX(period) FROM product_abc_classification WHERE "companyId" = $1)\`);`
- L597 *(aliased)*: `WHERE wsl."companyId" = $1 AND wsl."deletedAt" IS NULL AND w."deletedAt" IS NULL AND wsl.status = 'active' AND wsl.quantity > 0`
- L624 *(aliased)*: `WHERE wsl."companyId" = $1 AND wsl."deletedAt" IS NULL`
- L657 *(aliased)*: `WHERE wcc."companyId" = $1 AND wcc.status = 'approved'`

### `artifacts/api-server/src/routes/permissions.ts` (A, 11 hits)

- L114: `\`SELECT "roleKey", label, modules, level FROM user_roles WHERE "userId" = $1 AND ("companyId" = $2 OR "companyId" IS NULL) ORDER BY level DESC\`,`
- L124: `\`SELECT "roleKey", label, modules, level FROM custom_roles WHERE "roleKey"=$1 AND "companyId"=$2 LIMIT 1\`,`
- L145: `WHERE role = ANY($1::text[]) AND ("companyId" IS NULL OR "companyId" = $2)\`,`
- L151: `\`SELECT permission, type FROM permissions WHERE "userId" = $1 AND ("companyId" IS NULL OR "companyId" = $2)\`,`
- L174: `\`SELECT * FROM role_permissions WHERE "companyId" IS NULL OR "companyId" = $1 ORDER BY role, permission\`,`
- L211: `\`SELECT * FROM role_permissions WHERE role = $1 AND permission = $2 AND "companyId" = $3\`,`
- L215: `\`DELETE FROM role_permissions WHERE role = $1 AND permission = $2 AND "companyId" = $3\`,`
- L237 *(aliased)*: `WHERE p."userId" = $1 AND (p."companyId" IS NULL OR p."companyId" = $2)`
- L255 *(aliased)*: `JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2`
- L286: `\`SELECT * FROM permissions WHERE "userId" = $1 AND permission = $2 AND "companyId" = $3\`,`
- L290: `\`DELETE FROM permissions WHERE "userId" = $1 AND permission = $2 AND "companyId" = $3\`,`

### `artifacts/api-server/src/routes/search.ts` (B, 11 hits)

- L45 *(aliased)*: `WHERE ea."companyId" = $1`
- L57: `WHERE "companyId" = $1`
- L69 *(aliased)*: `WHERE i."companyId" = $1 AND i."deletedAt" IS NULL`
- L79: `WHERE "companyId" = $1`
- L90 *(aliased)*: `WHERE t."companyId" = $1`
- L101 *(aliased)*: `WHERE pu."companyId" = $1`
- L112 *(aliased)*: `WHERE v."companyId" = $1 AND v."deletedAt" IS NULL`
- L123 *(aliased)*: `WHERE p."companyId" = $1`
- L136 *(aliased)*: `WHERE rc."companyId" = $1 AND rc."deletedAt" IS NULL`
- L149 *(aliased)*: `WHERE b."companyId" = $1`
- L161 *(aliased)*: `WHERE t."companyId" = $1`

### `artifacts/api-server/src/routes/finance-accounts.ts` (B, 10 hits)

- L196 *(aliased)*: `SELECT p.id FROM chart_of_accounts p WHERE p.code = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL`
- L277: `\`SELECT id, code, name FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L286 *(aliased)*: `WHERE jl."accountCode" = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL\`,`
- L301: `\`UPDATE chart_of_accounts SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id\`,`
- L421 *(aliased)*: `WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`
- L452: `\`SELECT name, type, code FROM chart_of_accounts WHERE code = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L461 *(aliased)*: `WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}`
- L493: `FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L507: `FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL\`,`
- L513 *(aliased)*: `WHERE je."companyId" = $1 AND jl."accountCode" LIKE '5%' AND je."deletedAt" IS NULL AND je.status = 'posted'\`,`

### `artifacts/api-server/src/routes/finance-cost-centers.ts` (A, 10 hits)

- L62: `CASE WHEN cc."relatedEntityType" = 'project' THEN (SELECT name FROM projects WHERE id = cc."relatedEntityId" AND "companyId" = $1 AND "deletedAt" IS NULL LIMIT 1)`
- L63: `WHEN cc."relatedEntityType" = 'vehicle' THEN (SELECT "plateNumber" FROM fleet_vehicles WHERE id = cc."relatedEntityId" AND "companyId" = $1 AND "deletedAt" IS NULL LIMIT 1)`
- L64 *(aliased)*: `WHEN cc."relatedEntityType" = 'employee' THEN (SELECT e.name FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id WHERE e.id = cc."relatedEntityId" AND ea."companyId" = $1 AND e."dele`
- L65: `WHEN cc."relatedEntityType" = 'department' THEN (SELECT name FROM departments WHERE id = cc."relatedEntityId" AND "companyId" = $1 LIMIT 1)`
- L66: `WHEN cc."relatedEntityType" = 'branch' THEN (SELECT name FROM branches WHERE id = cc."relatedEntityId" AND "companyId" = $1 LIMIT 1)`
- L70 *(aliased)*: `WHERE cc."companyId" = $1 AND cc.status != 'deleted'`
- L84: `\`SELECT * FROM cost_centers WHERE id = $1 AND "companyId" = $2\`,`
- L100: `\`SELECT id FROM cost_centers WHERE "companyId" = $1 AND code = $2 AND status != 'deleted'\`,`
- L126: `\`SELECT * FROM cost_centers WHERE id = $1 AND "companyId" = $2\`,`
- L164: `\`UPDATE cost_centers SET status = 'deleted', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status != 'deleted'\`,`

### `artifacts/api-server/src/routes/impactPreview.ts` (B, 10 hits)

- L38: `\`SELECT * FROM requests WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) AND "deletedAt" IS NULL\`,`
- L73 *(aliased)*: `WHERE lr.id = $1 AND lr."companyId" = $2 AND lr."deletedAt" IS NULL\`,`
- L110 *(aliased)*: `WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL\`,`
- L138: `\`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2\`,`
- L142: `\`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L174 *(aliased)*: `\`SELECT je.*, COALESCE(SUM(jl.debit), 0) AS amount FROM journal_entries je LEFT JOIN journal_lines jl ON jl."journalId" = je.id WHERE je.id = $1 AND je."companyId" = $2 AND je.ref LIKE 'EXP%' AND je."`
- L197 *(aliased)*: `WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL\`,`
- L207 *(aliased)*: `WHERE pt."assigneeId" = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL AND pt.status NOT IN ('completed','cancelled')\`,`
- L212: `WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'pending'\`,`
- L226 *(aliased)*: `\`SELECT p.name FROM projects p WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/print.ts` (A, 10 hits)

- L132: `\`SELECT * FROM document_templates WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) AND "deletedAt" IS NULL LIMIT 1\`,`
- L296: `WHERE id = $1 AND "companyId" = $2\`,`
- L320 *(aliased)*: `WHERE a."companyId" = $1`
- L350: `WHERE "companyId" = $1 AND "entityType" = $2`
- L379: `\`DELETE FROM print_template_assignments WHERE id = $1 AND "companyId" = $2\`,`
- L402 *(aliased)*: `const where: string[] = [\`pj."companyId" = $1\`];`
- L459: `FROM print_jobs WHERE "jobId" = $1 AND "companyId" = $2 LIMIT 1\`,`
- L522 *(aliased)*: `const where: string[] = [\`r."companyId" = $1\`];`
- L557: `WHERE id = $1 AND "companyId" = $2 LIMIT 1\`,`
- L599: `WHERE id=$1 AND "companyId"=$4\`,`

### `artifacts/api-server/src/routes/rules.ts` (A, 9 hits)

- L92: `WHERE ("companyId" IS NULL OR "companyId" = $1) AND "deletedAt" IS NULL`
- L109: `const conditions = [\`("companyId" IS NULL OR "companyId" = $1)\`];`
- L163: `const [rule] = await rawQuery<BusinessRuleRow>(\`SELECT * FROM business_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [insertId, scope.companyId]);`
- L185: `\`SELECT * FROM business_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L213: `const [rule] = await rawQuery<BusinessRuleRow>(\`SELECT * FROM business_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L233: `\`SELECT * FROM business_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L239: `const { affectedRows } = await rawExecute(\`UPDATE business_rules SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`, [id, scope.companyId]);`
- L261: `\`SELECT id, "isActive" FROM business_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L268: `const { affectedRows } = await rawExecute(\`UPDATE business_rules SET "isActive" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL\`, [newActive, id, scope.companyId])`

### `artifacts/api-server/src/routes/correspondence.ts` (A, 8 hits)

- L113 *(aliased)*: `let where = \`c."companyId" = $1\`;`
- L162 *(aliased)*: `WHERE c.id = $1 AND c."companyId" = $2\`,`
- L214: `\`SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2\`,`
- L261: `\`SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2\`,`
- L272: `WHERE id = $1 AND "companyId" = $2 AND status = 'draft' RETURNING *\`,`
- L295: `\`SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2\`,`
- L324: `\`UPDATE correspondence SET "respondedAt" = NOW(), "responseRef" = $2, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $3\`,`
- L354: `FROM correspondence WHERE "companyId" = $1\`,`

### `artifacts/api-server/src/routes/hr-saudi-compliance.ts` (A, 8 hits)

- L257 *(aliased)*: `WHERE e.id = $1 AND e."companyId" = $2\`,`
- L315: `let where = \`"companyId" = $1\`;`
- L366: `WHERE id = $1 AND "companyId" = $2\`,`
- L399: `WHERE id = $1 AND "companyId" = $2\`,`
- L455: `WHERE id = $1 AND "companyId" = $2\`,`
- L664: `let where = \`"companyId" = $1\`;`
- L740: `WHERE id = $1 AND "companyId" = $2\`,`
- L940: `WHERE "companyId" = $1 AND period = $2 AND "deletedAt" IS NULL`

### `artifacts/api-server/src/routes/notifications.ts` (A, 8 hits)

- L82: `WHERE "assignmentId" = $1 AND "companyId" = $2`
- L103: `rawQuery<{ count: string }>(\`SELECT COUNT(*) AS count FROM notifications WHERE "assignmentId" = $1 AND "companyId" = $2\`, [scope.activeAssignmentId, scope.companyId]),`
- L107: `WHERE "assignmentId" = $1 AND "companyId" = $2`
- L127: `WHERE id = $1 AND "assignmentId" = $2 AND "companyId" = $3 RETURNING id\`,`
- L153: `WHERE "assignmentId" = $1 AND "companyId" = $2 AND "isRead" = false\`,`
- L166: `\`SELECT * FROM notification_preferences WHERE "userId" = $1 AND "companyId" = $2 ORDER BY category\`,`
- L188: `const [row] = await rawQuery<NotificationPreferenceRow>(\`SELECT * FROM notification_preferences WHERE id = $1 AND "companyId" = $2\`, [insertId, scope.companyId]);`
- L208: `WHERE "assignmentId" = $1 AND "companyId" = $2 AND "isRead" = false\`,`

### `artifacts/api-server/src/routes/pdpl.ts` (C, 7 hits)

- L87: `WHERE ("companyId" IS NULL OR "companyId" = $1)`
- L116 *(aliased)*: `JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2`
- L132 *(aliased)*: `WHERE ea."employeeId" = $1 AND ea."companyId" = $2\`,`
- L139: `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2`
- L148 *(aliased)*: `WHERE lr."employeeId" = $1 AND lr."companyId" = $2`
- L217: `const [row] = await rawQuery<any>(\`SELECT * FROM data_access_requests WHERE id=$1 AND "companyId"=$2\`, [insertId, scope.companyId]);`
- L232 *(aliased)*: `WHERE pal."companyId" = $1`

### `artifacts/api-server/src/routes/finance-gl-helpers.ts` (D, 5 hits)

- L117: `WHERE "companyId" = $1`
- L155: `WHERE "companyId" = $1`
- L191 *(aliased)*: `WHERE cc."companyId" = $1`
- L237: `WHERE "companyId" = $1`
- L274: `WHERE "companyId" = $1`

### `artifacts/api-server/src/routes/finance-recurring.ts` (A, 5 hits)

- L148 *(aliased)*: `WHERE rr."recurringJournalId" = $1 AND rr."companyId" = $2`
- L255: `\`SELECT * FROM recurring_journals WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L341: `\`SELECT * FROM recurring_journals WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L394: `\`SELECT id, name FROM recurring_journals WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L401: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/finance-vendor-contracts.ts` (A, 5 hits)

- L114 *(aliased)*: `WHERE vc.id = $1 AND vc."companyId" = $2 AND vc."deletedAt" IS NULL\`,`
- L134: `\`SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L187: `\`SELECT * FROM vendor_contracts WHERE id = $1 AND "companyId" = $2\`,`
- L276: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L282: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/finance-collection.ts` (A, 4 hits)

- L93: `FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L124: `\`SELECT stage FROM invoice_collection_stages WHERE "invoiceId" = $1 AND "companyId" = $2 ORDER BY id DESC LIMIT 1\`,`
- L183: `\`SELECT id FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`
- L193 *(aliased)*: `WHERE ics."invoiceId" = $1 AND ics."companyId" = $2`

### `artifacts/api-server/src/routes/scheduled-reports.ts` (B, 4 hits)

- L72 *(aliased)*: `WHERE sr."companyId" = $1`
- L112: `\`UPDATE scheduled_reports SET ${updates.join(", ")} WHERE id = $1 AND "companyId" = $2 RETURNING *\`,`
- L127: `\`DELETE FROM scheduled_reports WHERE id = $1 AND "companyId" = $2\`,`
- L143 *(aliased)*: `WHERE sr."companyId" = $1`

### `artifacts/api-server/src/routes/careersPortal.ts` (C, 3 hits)

- L186: `WHERE "companyId" = $1 AND status = 'open'`
- L206: `WHERE id = $1 AND "companyId" = $2 AND status = 'open' AND "deletedAt" IS NULL`
- L333: `WHERE id = $1 AND "companyId" = $2 AND status = 'open' AND "deletedAt" IS NULL`

### `artifacts/api-server/src/routes/digital-signature.ts` (A, 3 hits)

- L124: `\`SELECT id FROM digital_signature_otps WHERE "companyId"=$1 AND "userId"=$2 AND "entityType"=$3 AND "entityId"=$4 AND action=$5 AND otp=$6 AND used=false AND "expiresAt" > NOW() ORDER BY "createdAt" D`
- L134: `await client.query(\`UPDATE digital_signature_otps SET used=true, "usedAt"=NOW() WHERE id=$1 AND "companyId"=$2\`, [record.id, scope.companyId]);`
- L173 *(aliased)*: `const conditions = [\`dsl."companyId"=$1\`];`

### `artifacts/api-server/src/routes/obligations.ts` (A, 3 hits)

- L122: `const [row] = await rawQuery<ObligationRow>(\`SELECT * FROM obligations WHERE id=$1 AND "companyId"=$2\`, [id, scope.companyId]);`
- L137: `WHERE id=$1 AND "companyId"=$2 AND status = 'pending' RETURNING id, status\`,`
- L173: `WHERE id=$1 AND "companyId"=$2 AND status = 'pending' RETURNING id, status\`,`

### `artifacts/api-server/src/routes/approvalActions.ts` (B, 2 hits)

- L67 *(aliased)*: `WHERE al."companyId" = $1 AND al.action = 'workflow_override'${dateFilter}`
- L87 *(aliased)*: `WHERE aa."entityType" = $1 AND aa."entityId" = $2 AND aa."companyId" = $3`

### `artifacts/api-server/src/routes/auditLogs.ts` (B, 2 hits)

- L185: `\`SELECT DISTINCT entity FROM audit_logs WHERE "companyId" = $1 ORDER BY entity LIMIT 500\`,`
- L205 *(aliased)*: `WHERE al."companyId" = $1 AND al.entity = $2 AND al."entityId" = $3`

### `artifacts/api-server/src/routes/auth.ts` (C, 2 hits)

- L346 *(aliased)*: `WHERE ur."userId" = $1 AND ur."companyId" = $2`
- L571 *(aliased)*: `WHERE ur."userId" = $1 AND ur."companyId" = $2`

### `artifacts/api-server/src/routes/dashboard.ts` (A, 2 hits)

- L100: `WHERE "assignmentId" = $1 AND "companyId" = $2 AND "isRead" = false`
- L415: `const companyWhere = companyIds.length === 1 ? \`"companyId" = $1\` : \`"companyId" = ANY($1)\`;`

### `artifacts/api-server/src/routes/publicData.ts` (B, 2 hits)

- L32: `WHERE "companyId" = $1 AND "isActive" = true`
- L58 *(aliased)*: `WHERE eom."companyId" = $1 AND eom."isActive" = true`

### `artifacts/api-server/src/routes/storage.ts` (B, 2 hits)

- L134: `\`SELECT id FROM documents WHERE "storageKey"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1\`,`
- L140 *(aliased)*: `WHERE dv."storageKey"=$1 AND d."companyId"=$2 AND d."deletedAt" IS NULL LIMIT 1\`,`

### `artifacts/api-server/src/routes/import.ts` (A, 1 hits)

- L211: `WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL\`,`

### `artifacts/api-server/src/routes/index.ts` (A, 1 hits)

- L167: `? \`SELECT key, value FROM system_settings WHERE key IN ('currency','timezone','companyName') AND ("companyId" IS NULL OR "companyId" = $1) AND "branchId" IS NULL\``

---

Regenerate: `node audit/system-review/tooling/scope-bypass.mjs`
CI wrapper:  `pnpm --filter @workspace/scripts run check:scope-bypass` (warning-first; set `SCOPE_BYPASS_STRICT=1` to fail on new hits)
RCA: `docs/audit/SCOPE_NORMALIZATION_RCA_685.md`
