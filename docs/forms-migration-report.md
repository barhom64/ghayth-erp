# Forms Migration Verification Report

> **Generated**: 2026-05-13
> **Last update**: 2026-05-25 — enterprise-hardening sweep on `claude/enterprise-hardening-roadmap-AOfO7`
> **Scope**: All `useState` form patterns migrated to `FormShell + zod` across the ghayth-erp frontend.
> **Status**: 223 of 431 pages on FormShell (51.7%); 10 shared/embedded components on FormShell that fan out across many detail pages (incl. `entity-comments` add-comment row, `entity-selects` QuickCreateDialog used by 10+ entity pickers, `detail-edit-delete-actions` InlineEditCard used by 18 detail pages, and `approval-actions` ApprovalActions used by 33 approval-bearing pages); all 76 pages/create/* migrated; complex editors (documents/templates, year-end-close, evaluation-360, login, change-password, umrah/sales-wizard, notification-engine templates+webhooks tabs, settings/print-templates) and many detail-page inline edits migrated; reason-prompt AlertDialogs consolidated to shared PromptDialog (12 callsites); all `window.prompt()` AND `window.confirm()` page-level calls eliminated (last `confirm()` replaced with AlertDialog-backed `useDirtyGuard` hook in fiscal-periods-v2); FormShell gains `hideSubmit` to let pages keep custom save-button placement; legacy `useAutoDraft` + `useFieldErrors` hooks deleted; hard lint rule `manual-form-instead-of-formshell` blocks regression.

---

## TL;DR

| Item | Count | Verified On Branch |
|------|-------|------------------|
| Pages using FormShell directly | **159** | ✅ `grep -lr FormShell artifacts/ghayth-erp/src/pages` |
| Pages using InlineEditForm (FormShell-backed) | **22** | ✅ `grep -lr InlineEditForm artifacts/ghayth-erp/src/pages` |
| Detail pages using useDetailEditDelete (FormShell-backed via InlineEditCard) | **17** | ✅ `grep -lr useDetailEditDelete artifacts/ghayth-erp/src/pages` (excluding those already counted) |
| Approval-bearing pages using ApprovalActions (FormShell-backed approve/reject/return/refer/escalate form) | **25** | ✅ `grep -lr ApprovalActions artifacts/ghayth-erp/src/pages` (excluding those already counted) |
| **Total pages on FormShell (direct + indirect)** | **223** | — |
| Shared components using FormShell | **10** | ✅ `grep -lr FormShell artifacts/ghayth-erp/src/components` |
| Pages using shared PromptDialog | **12** | ✅ `grep -lr PromptDialog artifacts/ghayth-erp/src/pages` |
| Page-level `window.prompt()` callers | **0** | ✅ `grep -rn 'window\.prompt' artifacts/ghayth-erp/src/pages` |
| Page-level `window.confirm()` / `confirm()` callers | **0** | ✅ `grep -rn 'window\.confirm\|\bconfirm(' artifacts/ghayth-erp/src/pages` |
| Frontend API calls resolving to real backend routes (path + HTTP method) | **747/747 (100%)** | ✅ `pnpm run audit:wiring` (hard gate in `scripts/guard.sh` — any orphan OR method mismatch fails the build) |
| Backend coverage by UI (Phase C) | **752/1321 (56.9%)** — 569 endpoints have no frontend caller. Phase D Finance pages added: `/finance/cost-centers` (5-endpoint CRUD), `/finance/journal-templates` (4-endpoint CRUD with useFieldArray lines editor), `/finance/fx` (5-endpoint rates + revaluation with tabs), `/finance/contracts` (5-endpoint vendor contracts with expiry-soon highlights), `/finance/subsidiary-accounts` (4-endpoint entity↔GL-account links with entity-type-switched picker), `settings/accounting-mappings-tab` (extended: batch-save + per-row validate + single-row refresh, +3 endpoints), `/finance/customer-advances` (3-endpoint receive-then-apply flow with per-row apply dialog), `/finance/collections` (5-endpoint dunning preview/send/history + bad-debt provision workflow in one tabbed page), `/finance/purchase-requests` (6-endpoint P→PR→PO chain: list / create / impact-preview / submit / approve-decision / convert-to-PO) | ⚠️ report-only — `pnpm run audit:wiring` lists them grouped by domain |
| Wiring-audit fixture tests | **36/36 pass** | ✅ `scripts/src/check-frontend-backend-wiring.test.mjs` (readString, normaliseFrontendUrl, urlsMatch + regression guards, methodsMatch, inferMethod, end-to-end invariant + Phase C unused-backend signal) |
| Sidebar coverage audit | **17 list/dashboard pages missing nav entry** (down from 33 — added 16: 5 umrah ops, 8 admin governance, 1 finance, 2 hr) | ⚠️ `pnpm run audit:sidebar` — report-only; remaining 17 are minor or section-root paths |
| Sidebar accordion behaviour | **on** | ✅ Opening a top-level group closes other top-level groups (request اللي اتطلب) |
| Raw `<table>` ratchet baseline | **27 occurrences** (down from 30 — import-wizard preview tables + commission-plan-editor tiers table migrated to `<DataTable noToolbar>`) | ✅ `raw-table-in-page` rule in `scripts/src/lint-patterns.mjs` — net-new raw `<table>` fails the build; existing ones (mostly print views) stay until per-file migration |
| RTL hardening — physical `left-N`/`right-N` | **0** (hard rule) | ✅ `rtl-position-left-right` — any new physical position class fails the build. This was the class causing print/dropdown buttons to drift left on mobile Arabic |
| RTL hardening — physical `text-left`/`text-right` ratchet | **69** (down from 74 — login + insights + legal cleaned) | ✅ `rtl-text-align-lr` — use `text-start`/`text-end` instead |
| RTL hardening — physical `ml-`/`mr-`/`pl-`/`pr-` ratchet | **47** (locked) | ✅ `rtl-margin-padding-lr` — use logical `ms-`/`me-`/`ps-`/`pe-` instead |
| Legacy `useAutoDraft` / `useFieldErrors` callers | **0** | ✅ both hook files deleted from src/hooks/ |
| Hard lint rule blocking regression | **active** | ✅ `manual-form-instead-of-formshell` in scripts/src/lint-patterns.mjs |
| Lint-pattern test fixtures for the FormShell + native-dialog rules | **9** | ✅ scripts/src/lint-patterns.test.mjs (4 for `manual-form-instead-of-formshell`, 5 for `native-confirm-or-prompt`) |
| Smoke test files (legacy batch) | **42** | ✅ `tests/unit/formMigrationBatch{2,3,…,43}Smoke.test.ts` |
| Smoke test assertions (batch + shared + hook) | **396/396 pass** | ✅ `pnpm vitest run formMigrationBatch` + `sharedFormShellComponentsSmoke` |
| Shared-components smoke file | **1** | ✅ `tests/unit/sharedFormShellComponentsSmoke.test.ts` (7 fixtures: 5 pinning entity-comments / entity-selects / detail-edit-delete-actions / approval-actions / workflow-kit re-export, + 2 pinning the shared `useDirtyGuard` hook contract) |
| Full test suite | **4288/4288 pass** | ✅ on every commit via pre-commit hook |
| Architectural patterns documented | **18** | ✅ as smoke-test fixtures |
| RBAC: `GuardedButton` hides by default | **yes** | ✅ `permission-gate.tsx:66` |

If any of the above is unclear, every artifact below links directly to a `main`-branch file URL. The links are **always evaluated against the current `main` HEAD**, not the branch this report was authored on.

---

## 1. Migrated form files (29)

Each file was previously `useState({...})` with manual `setForm`/`setX` mutators and ad-hoc validation. They now use `FormShell` + `zod` schema, with optional `useFieldArray` / `useWatch` patterns where needed.

### HR (4)
- [`pages/hr/transfers.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/hr/transfers.tsx) — Batch 12 (#321)
- [`pages/hr/public-holidays.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/hr/public-holidays.tsx) — Batch 13 (#333), dual-mode (create + edit)
- [`pages/hr/shifts-management.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/hr/shifts-management.tsx) — Batch 15 (#335), **bug FK fix**: missing `assignmentId` picker
- [`pages/hr/gratuity.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/hr/gratuity.tsx) — Batch 16 (#336)

### Legal / Warehouse / Documents (3)
- [`pages/legal-case-detail.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/legal-case-detail.tsx) — Batch 14 (#334)
- [`pages/warehouse/inventory-count.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/warehouse/inventory-count.tsx) — Batch 17 (#337)
- [`pages/documents/documents-upload.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/documents/documents-upload.tsx) — Batch 23 (#344), mixed-state (file + entityLinks)

### Finance (3)
- [`pages/finance/salary-advances.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/finance/salary-advances.tsx) — Batch 18 (#338)
- [`pages/finance/fixed-assets.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/finance/fixed-assets.tsx) — Batch 21 (#341), modal → inline
- [`pages/finance/custodies.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/finance/custodies.tsx) — Batch 24 (#346), 2 forms in 1 file

### Properties / Fleet (3)
- [`pages/properties/deposits.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/properties/deposits.tsx) — Batch 19 (#339)
- [`pages/properties/inspections.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/properties/inspections.tsx) — Batch 22 (#343)
- [`pages/fleet/preventive-plans.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/fleet/preventive-plans.tsx) — Batch 20 (#340)

### Settings & Admin (10)
- [`pages/settings.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/settings.tsx) — Batch 32 (#360), GeneralSettings
- [`pages/settings-rules.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/settings-rules.tsx) — Batch 25 (#347), 13-field IF-THEN
- [`pages/settings/letterhead-tab.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/settings/letterhead-tab.tsx) — Batch 33 (#361), live-preview pane
- [`pages/settings/system-controls-tab.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/settings/system-controls-tab.tsx) — Batch 34 (#363), dotted-key mapping
- [`pages/settings/zatca-settings-tab.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/settings/zatca-settings-tab.tsx) — Batch 35 (#365), 3-card edit
- [`pages/settings/communication-channels-tab.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/settings/communication-channels-tab.tsx) — Batch 36 (#369), 3 independent FormShells
- [`pages/settings/workflow-definitions-tab.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/settings/workflow-definitions-tab.tsx) — Batches 39+40 (#374, #380), `useFieldArray` for steps
- [`pages/admin/users.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/admin/users.tsx) — Batch 26 (#348), key={id} remount
- [`pages/admin/roles.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/admin/roles.tsx) — Batch 29 (#356), multi-select
- [`pages/admin/rbac-v2-sod-tab.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/admin/rbac-v2-sod-tab.tsx) — Batch 37 (#372), Dialog → inline + dependent dropdowns
- [`pages/admin/rbac-v2-jit-tab.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/admin/rbac-v2-jit-tab.tsx) — Batch 38 (#374)

### Projects / Reports / HR Create / Umrah (6)
- [`pages/details/project-detail.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/details/project-detail.tsx) — Batches 27+28 (#351, #354)
- [`pages/create/properties/owners-edit.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/create/properties/owners-edit.tsx) — Batch 30 (#358), conditional fields
- [`pages/create/hr/evaluation-360-create.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/create/hr/evaluation-360-create.tsx) — Batch 41 (#380), localStorage auto-draft
- [`pages/reports/scheduled-reports.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/reports/scheduled-reports.tsx) — Batch 31 (#358), Switch + email-list
- [`pages/umrah/commission-plan-editor.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/pages/umrah/commission-plan-editor.tsx) — Batches 42+43 (#380, #468), 5-tab `useFieldArray` + dependent dropdowns

---

## 2. Smoke tests (42)

Located in [`artifacts/api-server/tests/unit/`](https://github.com/barhom64/ghayth-erp/tree/main/artifacts/api-server/tests/unit). One file per migration batch, each asserting:
- FormShell stack imports
- Zod schema shape
- Removal of old `useState({...})` shape
- Removal of dead imports
- §3.4 compliance (no Dialog for create/edit)

Run all:
```bash
cd artifacts/api-server && pnpm vitest run formMigrationBatch
# Expected: 42 passed (42), 389 passed (389)
```

---

## 3. Architectural patterns (18) — documented in smoke tests

| # | Pattern | Reference smoke test |
|---|---------|---------------------|
| 1 | FormShell + zod basic | `formMigrationBatch12Smoke.test.ts` |
| 2 | dual-mode (create + edit, key remount) | `formMigrationBatch13Smoke.test.ts` |
| 3 | AlertDialog confirm-and-action | `formMigrationBatch17Smoke.test.ts` |
| 4 | Modal/Dialog → inline Card (§3.4) | `formMigrationBatch21Smoke.test.ts` |
| 5 | `key={id}` remount (server hydration) | `formMigrationBatch26Smoke.test.ts` |
| 6 | Mixed-state (file outside form) | `formMigrationBatch23Smoke.test.ts` |
| 7 | `z.max(remaining)` over-cap | `formMigrationBatch24Smoke.test.ts` |
| 8 | Multi-select array (`ModulesPicker`) | `formMigrationBatch29Smoke.test.ts` |
| 9 | Conditional fields (`useWatch`) | `formMigrationBatch30Smoke.test.ts` |
| 10 | Boolean Switch / custom toggle | `formMigrationBatch31Smoke.test.ts` |
| 11 | Live preview pane | `formMigrationBatch33Smoke.test.ts` |
| 12 | Dotted keys ↔ underscored | `formMigrationBatch34Smoke.test.ts` |
| 13 | Multi-card edit (3 stacked Cards) | `formMigrationBatch35Smoke.test.ts` |
| 14 | Multiple FormShells in one tab | `formMigrationBatch36Smoke.test.ts` |
| 15 | Dialog→inline + **dependent dropdowns** | `formMigrationBatch37Smoke.test.ts` |
| 16 | Live readouts (`useWatch` counters/hints) | `formMigrationBatch38Smoke.test.ts` |
| 17 | **`useFieldArray`** for dynamic rows | `formMigrationBatch40Smoke.test.ts` |
| 18 | **`localStorage` auto-draft** persistence | `formMigrationBatch41Smoke.test.ts` |

---

## 4. RBAC visibility — hide-by-default

[`components/shared/permission-gate.tsx`](https://github.com/barhom64/ghayth-erp/blob/main/artifacts/ghayth-erp/src/components/shared/permission-gate.tsx) — line 66:

```tsx
hideWhenDenied = true,   // default flipped from `false` in PR #480
```

Owner feedback: *"إذا المستخدم ما يملك صلاحية المفروض يخفيها عنه"* — actions a viewer can't perform should not be advertised.

All 212 existing `<GuardedButton>` call sites inherit hiding automatically. Pages that prefer the older "disabled + lock tooltip" UX can opt back in with `hideWhenDenied={false}`.

The 4-layer RBAC model is consistent end-to-end:
1. **Sidebar** — `sidebar-layout.tsx` filters items by `canAccessModule` / `minRoleLevel`
2. **Buttons** — `<GuardedButton>` hides when denied (PR #480)
3. **Sections** — `<PermissionGate>` returns `null` when denied
4. **Routes** — `ModuleRoute` in `App.tsx` renders `<AccessDenied />` for direct URL access

---

## 5. PR audit trail — all merged into `main`

| PR | Title | Commit on main |
|----|-------|----------------|
| #321 | refactor(hr): migrate transfers form | `82ba1605` |
| #333 | refactor(hr): migrate public-holidays | `ea10c638` |
| #334 | refactor(legal): migrate case-detail | `7cb1191a` |
| #335 | fix(hr): shift-assign FK + migration | `ec08ef5f` |
| #336 | refactor(hr): migrate gratuity | `539da356` |
| #337 | refactor(warehouse): inventory-count | `74a64cc0` |
| #338 | refactor(finance): salary-advances | `f7f74b76` |
| #339 | refactor(properties): deposits | `4bbb07b6` |
| #340 | refactor(fleet): preventive-plans | `141f6b2f` |
| #341 | refactor(finance): fixed-assets modal→inline | `9eadcec1` |
| #343 | refactor(properties): inspections | `baf2e098` |
| #344 | refactor(documents): documents-upload | `8a48096f` |
| #346 | refactor(finance): custodies × 2 | `eee8db81` |
| #347 | refactor(settings): business rules | `cc655f04` |
| #348 | refactor(admin): users editUser | `14b60ad2` |
| #351 | refactor(projects): project-detail subs | `b7a94e15` |
| #354 | refactor(projects): project-detail edit | `9aa15dd5` |
| #356 | refactor(admin): roles multi-select | `32e6532d` |
| #358 | refactor(forms): owners-edit + scheduled-reports | `4fda8eeb` |
| #360 | refactor(settings): GeneralSettings | `57c8e2ac` |
| #361 | refactor(settings): letterhead live-preview | `5a870f52` |
| #363 | refactor(settings): system-controls dotted-keys | `36b91bf8` |
| #365 | refactor(settings): zatca multi-card | `b905b825` |
| #369 | refactor(settings): communication-channels × 3 | `d2324b91` |
| #372 | refactor(admin): rbac-v2-sod Dialog→inline | `33761cdc` |
| #374 | refactor(admin+settings): jit-tab + workflow-SLA | `fa9e3c73` |
| #380 | refactor: workflow-main + auto-draft + simulator | `4fda8eeb` |
| #468 | refactor(umrah): commission-plan-editor full | `5bf391b9` |
| #479 | fix(test): batch-36 smoke alignment | `0430fe93` |
| #480 | ui(permission): GuardedButton hides by default | `3e95ba3c` |

---

## 6. How to verify locally

```bash
# 1. Pull latest main
git checkout main && git pull origin main --ff-only

# 2. Confirm 29 form files contain FormShell
for f in hr/transfers hr/public-holidays hr/shifts-management hr/gratuity \
         legal-case-detail warehouse/inventory-count finance/salary-advances \
         properties/deposits fleet/preventive-plans finance/fixed-assets \
         properties/inspections documents/documents-upload finance/custodies \
         settings-rules admin/users details/project-detail admin/roles \
         create/properties/owners-edit reports/scheduled-reports \
         settings settings/letterhead-tab settings/system-controls-tab \
         settings/zatca-settings-tab settings/communication-channels-tab \
         admin/rbac-v2-sod-tab admin/rbac-v2-jit-tab settings/workflow-definitions-tab \
         create/hr/evaluation-360-create umrah/commission-plan-editor; do
  grep -q "FormShell" artifacts/ghayth-erp/src/pages/$f.tsx && echo "✅ $f" || echo "❌ $f"
done

# 3. Run all 42 smoke tests
cd artifacts/api-server && pnpm vitest run formMigrationBatch
# Expected: 42 files passed, 389 assertions passed

# 4. Confirm RBAC default
grep "hideWhenDenied = true" artifacts/ghayth-erp/src/components/shared/permission-gate.tsx
# Expected: line 66 matches
```

All four checks pass on `main` HEAD as of 2026-05-13.
