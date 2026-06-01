# Document Reconciliation Matrix — Ghaith Platform Stabilization

> **Scope:** `docs/audit/`, `docs/audit/inventory/`, `docs/architecture/`,
> `docs/rbac/`, `docs/testing/`, `docs/ux/`.
> **Date:** 2026-05-31 · **Branch:** `claude/enterprise-hardening-roadmap-AOfO7`
> **Baseline:** `main` after sweep PRs #1463, #1466, #1471, #1480, #1488 +
> reconciliation commit `cf28d78b`.

This matrix classifies every `.md` file in the scope directories as
**keep**, **merge**, **archive**, **obsolete**, or **replace**, and
records the action taken. Physical moves used `git mv` so history is
preserved.

## Legend

| Classification | Meaning |
|---|---|
| **keep** | Current source of truth — still authoritative; do not touch. |
| **merge** | Content lives elsewhere; should be consolidated. None this pass. |
| **archive** | Point-in-time historical record; moved to `docs/audit/archive/`. |
| **obsolete** | Superseded by another doc; moved to `docs/audit/archive/`. |
| **replace** | Needs full rewrite. None this pass. |

---

## `docs/audit/*.md`

| Doc path | Classification | Reason | Replacement / supersedes | Action taken |
|---|---|---|---|---|
| `docs/audit/API_DATABASE_ENTITY_MAPPING.md` | keep | 2026-05-30 Deep Sweep input feeding `GHAITH_SYSTEM_GAP_MATRIX.md`. Still referenced. | — | kept |
| `docs/audit/BYPASS_TRIAGE.md` | archive | Read-only triage for closed Issue #664 (regenerable). RCA was archived too. | superseded by source-level `// bypass-ok` anchors + `WORKFLOW_AUDIT` (also archived) | git mv → archive |
| `docs/audit/DANGEROUS_BYPASS_RCA_664.md` | archive | RCA for closed Issue #664; PRs #706/#707 merged. Documentation-only by design. | resolution lives in source via JSDoc + `// bypass-ok` anchors | git mv → archive |
| `docs/audit/DEAD_DUPLICATE_PAGE_AUDIT.md` | keep | Active Deep Sweep input (2026-05-30). Feeds `GHAITH_SYSTEM_GAP_MATRIX.md`. | — | kept |
| `docs/audit/EXECUTIVE_INVENTORY_REPORT.md` | keep | Authoritative executive reference; explicitly listed as "keep" in the heuristic. | — | kept |
| `docs/audit/FINANCE_CERTIFICATION.md` | archive | Auto-generated point-in-time snapshot (2026-05-25). Cited as stale by `inventory/finance.md`. Regenerable via `audit/system-review/tooling/finance-cert.mjs`. | `inventory/finance.md` + `GHAITH_SYSTEM_GAP_MATRIX.md` are current | git mv → archive |
| `docs/audit/FINANCE_CRITICAL_REMEDIATION_REPORT.md` | archive | All six fix waves are merged to `main` (#728–#736). Final report frozen at 2026-05-21. | superseded by `GHAITH_SWEEP_EXECUTION_PROGRESS.md` for current finance status | git mv → archive |
| `docs/audit/FINANCE_DEEP_GOVERNANCE_RCA.md` | archive | RCA / governance analysis dated 2026-05-21. Finance hardening landed in subsequent waves. | follow-on work tracked in `GHAITH_SYSTEM_GAP_MATRIX.md` | git mv → archive |
| `docs/audit/FINANCE_INVOICE_APPROVAL_RCA.md` | archive | Wave 1 RCA — fix shipped per `FINANCE_CRITICAL_REMEDIATION_REPORT.md`. | — | git mv → archive |
| `docs/audit/FINANCE_MANUAL_JOURNAL_RCA.md` | archive | Wave 2 RCA — fix shipped per `FINANCE_CRITICAL_REMEDIATION_REPORT.md`. | — | git mv → archive |
| `docs/audit/FIVE_FIXES_STATUS_25018.md` | archive | Point-in-time status report for task #25018 (2026-05-20). Findings closed. | — | git mv → archive |
| `docs/audit/FROMSTATE_RCA_663.md` | archive | RCA for closed Issue #663; 8 fromState fixes shipped via PR #667 + companion. | resolution recorded in source | git mv → archive |
| `docs/audit/FUNCTIONAL_FINANCE_VERIFICATION.md` | archive | Stale per `inventory/finance.md` §"خلاف"; superseded by Deep Sweep matrix. | `GHAITH_SYSTEM_GAP_MATRIX.md` + `inventory/finance.md` are current | git mv → archive |
| `docs/audit/FUNCTIONAL_HR_VERIFICATION.md` | archive | Stale per `inventory/hr.md` §"خلاف"; 7 of 8 critical gaps closed by PRs #779–#806. | `GHAITH_SYSTEM_GAP_MATRIX.md` + `inventory/hr.md` are current | git mv → archive |
| `docs/audit/FUNCTIONAL_UMRAH_VERIFICATION.md` | archive | Stale per `inventory/umrah.md` §"خلاف"; C1–C5 fixed in PRs #757–#768. | `GHAITH_SYSTEM_GAP_MATRIX.md` + `inventory/umrah.md` are current | git mv → archive |
| `docs/audit/GHAITH_SWEEP_CONFLICT_RESOLUTIONS.md` | keep | Living record of cross-workstream conflict resolutions for the active sweep. | — | kept |
| `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md` | keep | Latest execution log (2026-05-31, post-#1488). Source of truth for Top-20 status. | — | kept |
| `docs/audit/GHAITH_SYSTEM_GAP_MATRIX.md` | keep | 128-row authoritative gap matrix (2026-05-30) driving the sweep. | — | kept |
| `docs/audit/GHAITH_SYSTEM_SWEEP_EXECUTIVE_SUMMARY.md` | keep | Executive summary for #1418 + #1413 (2026-05-30). | — | kept |
| `docs/audit/HR_CERTIFICATION.md` | archive | Auto-generated 2026-05-25 snapshot; referenced as partially stale by `inventory/hr.md`. Regenerable via `module-cert.mjs`. | `inventory/hr.md` + `GHAITH_SYSTEM_GAP_MATRIX.md` are current | git mv → archive |
| `docs/audit/IMPORT_MAPPING_REQUIREMENT.md` | keep | Standing design rule (deferred, not obsolete). Applies to every current and future import. | — | kept |
| `docs/audit/INVENTORY_CLARIFICATION.md` | archive | Point-in-time owner-facing companion to original inventory (2026-05-21). | `SYSTEM_INVENTORY_MATRIX.md` + `inventory/*.md` remain authoritative | git mv → archive |
| `docs/audit/INVENTORY_RECONCILIATION.md` | archive | Snapshot diff-matching at PR #816 (2026-05-21). Reconciliation cycle moved on (sweep PRs #1463–#1488). | `GHAITH_SWEEP_EXECUTION_PROGRESS.md` is the current reconciliation log | git mv → archive |
| `docs/audit/LIFECYCLE_DRIFT_665.md` | archive | Report-only output for closed Task #665 (2026-05-20). | — | git mv → archive |
| `docs/audit/PAGE_API_MAPPING.md` | keep | Active 2026-05-30 audit input. | — | kept |
| `docs/audit/PAGE_SERVICE_CLASSIFICATION.md` | keep | Active 2026-05-30 audit input. | — | kept |
| `docs/audit/PAGE_VISIBILITY_AND_SERVICE_EXPOSURE.md` | keep | Active 2026-05-30 audit input. | — | kept |
| `docs/audit/PRINT_EXPORT_UNIFICATION_AUDIT.md` | keep | Active 2026-05-30 audit input feeding the sweep. | — | kept |
| `docs/audit/PROPERTIES_CERTIFICATION.md` | archive | Auto-generated 2026-05-25 snapshot; `EXECUTIVE_INVENTORY_REPORT.md` calls out classification weakness. Regenerable. | `inventory/properties.md` is current | git mv → archive |
| `docs/audit/RESCAN_2026-05-22.md` | archive | Point-in-time rescan v1; superseded by v2 then v3. No external links. | `GHAITH_SWEEP_EXECUTION_PROGRESS.md` is current rescan equivalent | git mv → archive |
| `docs/audit/RESCAN_2026-05-22-v2.md` | archive | Point-in-time rescan v2; superseded by v3. No external links. | — | git mv → archive |
| `docs/audit/RESCAN_2026-05-22-v3.md` | archive | Point-in-time rescan (2026-05-22); referenced by `KNOWN_ISSUES.md`, `UNIFICATION_PLAN.md`, `production-hardening/enterprise-hardening-roadmap.md`. Links updated to archive path. | follow-on work in `GHAITH_SWEEP_EXECUTION_PROGRESS.md` | git mv → archive + 4 link updates |
| `docs/audit/RUNTIME_STABILIZATION.md` | archive | Operator runbook for completed Phase 1 instrumentation (PRs #693–#696). Heuristic-flagged. | — | git mv → archive |
| `docs/audit/SCOPE_BYPASS.md` | archive | Auto-generated detector report (2026-05-20). Regenerable via `audit/system-review/tooling`. Companion CI is the live source of truth. | `SCOPE_HELPER_ADOPTION_AUDIT.md` carries the current ratchet status | git mv → archive |
| `docs/audit/SCOPE_HELPER_ADOPTION_AUDIT.md` | keep | Active 2026-05-30 audit — current ratchet allowlist + re-audit notes from #1488. Sweep heuristic explicitly lists it as keep. | — | kept |
| `docs/audit/SCOPE_NORMALIZATION_RCA_685.md` | archive | RCA / prioritization report for Issue #685 (2026-05-20). Work now tracked via `SCOPE_HELPER_ADOPTION_AUDIT.md` ratchet. | `SCOPE_HELPER_ADOPTION_AUDIT.md` | git mv → archive |
| `docs/audit/SESSION_AUDIT_2026-05-23.md` | archive | Heuristic-flagged: `SESSION_AUDIT_*` is a point-in-time autonomous-audit record. Referenced from `KNOWN_ISSUES.md`; link updated. | — | git mv → archive + 1 link update |
| `docs/audit/SHARED_INFRA_GATEKEEPER.md` | archive | Gatekeeper decision doc for closed-out PRs #832/831/830/822/820. | — | git mv → archive |
| `docs/audit/STATUS_PERCENTAGE_RECONCILIATION.md` | archive | 2026-05-21 owner-percentage reconciliation; superseded by current sweep status. | `GHAITH_SWEEP_EXECUTION_PROGRESS.md` | git mv → archive |
| `docs/audit/SYSTEM_INVENTORY_MATRIX.md` | keep | Sweep heuristic explicitly lists it as keep — still-authoritative 184-defect reference. | — | kept |
| `docs/audit/SYSTEM_PAGE_INVENTORY.md` | keep | 2026-05-30 audit input feeding the gap matrix. | — | kept |
| `docs/audit/UI_LIBRARY_UNIFICATION_AUDIT.md` | keep | Active 2026-05-30 audit input. | — | kept |
| `docs/audit/UMRAH_CERTIFICATION.md` | archive | Auto-generated 2026-05-25 snapshot; `inventory/umrah.md` calls it stale. Regenerable. | `inventory/umrah.md` + `GHAITH_SYSTEM_GAP_MATRIX.md` | git mv → archive |
| `docs/audit/UMRAH_EVENTS_DRIFT_684.md` | archive | Report-only output for closed Task #684 (2026-05-20). Catalog drift addressed in subsequent PRs. | resolution noted in `FUNCTIONAL_UMRAH_VERIFICATION.md` §closing — now also archived | git mv → archive |
| `docs/audit/UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` | archive | 2026-05-21 architecture map; multiple per-track inventory files explicitly call out its classifications as outdated. Superseded by Deep Sweep matrix. | `GHAITH_SYSTEM_GAP_MATRIX.md` | git mv → archive + 2 link updates in `SYSTEM_PAGE_INVENTORY.md` |
| `docs/audit/WORKFLOW_AUDIT.md` | archive | Auto-generated static workflow integrity output (2026-05-20). Regenerable. Live signal is the CI workflow ratchet. | — | git mv → archive |

## `docs/audit/inventory/*.md`

Per the sweep heuristic, **all inventory files are kept** — they remain
referenced from `EXECUTIVE_INVENTORY_REPORT.md`, `SYSTEM_INVENTORY_MATRIX.md`,
`GHAITH_FOUNDATION_GAP_MATRIX.md`, the production-hardening roadmap, the
core-services inventory, and the unification plan.

| Doc path | Classification | Reason | Action taken |
|---|---|---|---|
| `docs/audit/inventory/CROSS_TRACK_ANALYSIS.md` | keep | Cross-track defect analysis still referenced. | kept |
| `docs/audit/inventory/SCOPE_MAP.md` | keep | Methodology + scope baseline still referenced. | kept |
| `docs/audit/inventory/communications.md` | keep | Track-level inventory of 184 defects. | kept |
| `docs/audit/inventory/crm.md` | keep | Track-level inventory. | kept |
| `docs/audit/inventory/finance.md` | keep | Track-level inventory + dispute notes vs. now-archived verification docs. | kept |
| `docs/audit/inventory/fleet.md` | keep | Track-level inventory. | kept |
| `docs/audit/inventory/foundation.md` | keep | Track-level inventory. | kept |
| `docs/audit/inventory/hr.md` | keep | Track-level inventory + dispute notes. | kept |
| `docs/audit/inventory/projects.md` | keep | Track-level inventory. | kept |
| `docs/audit/inventory/properties.md` | keep | Track-level inventory. | kept |
| `docs/audit/inventory/support.md` | keep | Track-level inventory. | kept |
| `docs/audit/inventory/umrah.md` | keep | Track-level inventory + dispute notes. | kept |
| `docs/audit/inventory/warehouses.md` | keep | Track-level inventory. | kept |

## `docs/architecture/*.md`

All architecture docs are dated 2026-05-29 → 2026-05-30 (Phase 2 of
Ghaith Operating Foundation #1418) and are **active design references**
linked from `core-services/`, `frontend/`, `rbac/`, `testing/`, `ux/`,
and the top-level foundation status. **All kept.**

| Doc path | Classification | Reason | Action taken |
|---|---|---|---|
| `docs/architecture/AI_ASSISTANT_GOVERNANCE.md` | keep | Phase-6 Foundation governance spec. | kept |
| `docs/architecture/APPROVAL_POLICY_EVOLUTION.md` | keep | Foundation evolution model. | kept |
| `docs/architecture/AUTHORIZATION_EVOLUTION_MODEL.md` | keep | Active RBAC evolution design. | kept |
| `docs/architecture/DECISION_OWNERSHIP_MATRIX.md` | keep | Foundation decision matrix. | kept |
| `docs/architecture/DECISION_REPORTING_MODEL.md` | keep | Foundation reporting model. | kept |
| `docs/architecture/ENTITY_CATALOG.md` | keep | Authoritative entity catalog. | kept |
| `docs/architecture/ENTITY_LIFECYCLE_CATALOG.md` | keep | Authoritative lifecycle catalog. | kept |
| `docs/architecture/ENTITY_OWNERSHIP_MATRIX.md` | keep | Authoritative ownership matrix. | kept |
| `docs/architecture/FEATURE_ACCEPTANCE_GATE.md` | keep | Active acceptance gate spec. | kept |
| `docs/architecture/GHAITH_MASTER_OPERATING_BLUEPRINT.md` | keep | Top-level operating constitution. | kept |
| `docs/architecture/IMPACT_CATALOG.md` | keep | Authoritative impact catalog. | kept |
| `docs/architecture/NOTIFICATION_EVENT_MATRIX.md` | keep | Authoritative notification/event matrix. | kept |
| `docs/architecture/OPERATING_JOURNEY_CATALOG.md` | keep | Authoritative operating-journey catalog. | kept |
| `docs/architecture/ORGANIZATION_MODEL_EVOLUTION.md` | keep | Active evolution model. | kept |
| `docs/architecture/PARTY_MODEL_EVOLUTION.md` | keep | Active evolution model. | kept |
| `docs/architecture/PATH_LEADER_SERVICE_MATRIX.md` | keep | Active leader-service mapping. | kept |
| `docs/architecture/REPORTING_PURPOSE_MATRIX.md` | keep | Active reporting matrix. | kept |
| `docs/architecture/SLA_ESCALATION_MODEL.md` | keep | Active SLA model. | kept |
| `docs/architecture/TASK_AND_DECISION_CENTER_MODEL.md` | keep | Active task/decision-center model. | kept |
| `docs/architecture/VISIBILITY_GOVERNANCE_MATRIX.md` | keep | Active visibility-governance matrix. | kept |
| `docs/architecture/communications-unification.md` | keep | Active platform architecture doc — Phase 5 still pending. | kept |
| `docs/architecture/numbering-center.md` | keep | Locked architecture for the numbering platform. | kept |
| `docs/architecture/numbering-coverage-report-2026-05-27.md` | keep | Living coverage report; hard-rule baseline = 0. | kept |
| `docs/architecture/phase4-final-drop.sql` | keep | Deferred destructive SQL with explicit soak-window guidance. | kept |
| `docs/architecture/print-platform-roadmap.md` | keep | Active roadmap companion to print-platform.md. | kept |
| `docs/architecture/print-platform.md` | keep | Locked print-platform architecture. | kept |

## `docs/rbac/*.md`

All rbac docs are Foundation Phase 3 active design (2026-05-29 → 2026-05-30)
for Issue #1413. Referenced by `frontend/`, `core-services/`, `ux/`,
`testing/`, and the top-level foundation status. **All kept.**

| Doc path | Classification | Reason | Action taken |
|---|---|---|---|
| `docs/rbac/EFFECTIVE_PERMISSIONS_SPEC.md` | keep | Active spec for `/admin/users/:id/effective-permissions`. | kept |
| `docs/rbac/MULTI_ROLE_EMPLOYEE_JOURNEY.md` | keep | Active design — multi-role journey. | kept |
| `docs/rbac/PERMISSION_EXPLAINER_SPEC.md` | keep | Active spec for `/admin/permissions/explain`. | kept |
| `docs/rbac/RBAC_AUDIT_CONTEXT_SPEC.md` | keep | Active spec for active-role audit context (RBAC-001). | kept |
| `docs/rbac/RBAC_EXISTING_ASSETS_AUDIT.md` | keep | Authoritative #1413 baseline + decisions. | kept |
| `docs/rbac/ROLE_COMPOSER_SPEC.md` | keep | Active spec. | kept |
| `docs/rbac/ROLE_CONFLICT_ANALYZER.md` | keep | Active spec. | kept |
| `docs/rbac/UNIFIED_USER_ROLE_MODEL.md` | keep | Foundation Phase 3 canonical user/role model. | kept |
| `docs/rbac/USER_QUICK_CREATE_FLOW.md` | keep | Active spec for `/admin/user-onboarding` flow. | kept |

## `docs/testing/*.md`

Testing acceptance docs (2026-05-29 → 2026-05-30) — active acceptance
suites referenced from `FULL_EXPERIENCE_ACCEPTANCE_TESTS.md` and the
operating-journey catalog. **All kept.**

| Doc path | Classification | Reason | Action taken |
|---|---|---|---|
| `docs/testing/ARABIC_UX_LANGUAGE_ACCEPTANCE.md` | keep | Active acceptance suite. | kept |
| `docs/testing/CRITICAL_DEFECTS_REPORT.md` | keep | Active blocker list (2026-05-29) driving stabilization. | kept |
| `docs/testing/END_TO_END_USER_JOURNEYS.md` | keep | Active end-to-end journey trace; referenced from architecture. | kept |
| `docs/testing/FULL_EXPERIENCE_ACCEPTANCE_TESTS.md` | keep | Aggregate acceptance gate. | kept |
| `docs/testing/FULL_OPERATIONAL_ACCEPTANCE_TEST.md` | keep | Black-box acceptance program. | kept |
| `docs/testing/MODULE_INTEGRATION_MATRIX.md` | keep | Active integration map. | kept |
| `docs/testing/NON_TECHNICAL_USER_EXPERIENCE_TESTS.md` | keep | Active acceptance suite. | kept |
| `docs/testing/OPERATING_JOURNEY_ACCEPTANCE_TESTS.md` | keep | Active acceptance suite. | kept |
| `docs/testing/PRODUCTION_READINESS_SCORE.md` | keep | Active readiness scorecard. | kept |
| `docs/testing/RBAC_FRONTEND_E2E_SCENARIOS.md` | keep | Active RBAC E2E spec. | kept |
| `docs/testing/RBAC_MULTI_ROLE_ACCEPTANCE_TESTS.md` | keep | Active multi-role acceptance. | kept |
| `docs/testing/ROLE_BASED_TEST_SCENARIOS.md` | keep | Active per-role scenario set. | kept |
| `docs/testing/USER_JOURNEY_USABILITY_SCORECARD.md` | keep | Active usability scorecard. | kept |
| `docs/testing/UX_AND_USABILITY_REPORT.md` | keep | Active UX/usability assessment. | kept |

## `docs/ux/*.md`

UX foundation docs (2026-05-29 → 2026-05-30) referenced from
`frontend/`, `architecture/`, `testing/`. **All kept.**

| Doc path | Classification | Reason | Action taken |
|---|---|---|---|
| `docs/ux/ARABIC_BUSINESS_TERMS.md` | keep | Mandatory Arabic terminology dictionary. | kept |
| `docs/ux/GHAITH_FULL_EXPERIENCE_MODEL.md` | keep | UX foundation model. | kept |
| `docs/ux/USER_WORK_CENTERS.md` | keep | Work-center catalog per role. | kept |
| `docs/ux/WORK_CENTERED_EXPERIENCE.md` | keep | Active UX principle doc. | kept |

---

## Link updates performed

The following surviving docs were updated to point at the new archive
paths after the moves:

| Surviving doc | Link(s) updated |
|---|---|
| `docs/KNOWN_ISSUES.md` | `audit/SESSION_AUDIT_2026-05-23.md` → `audit/archive/SESSION_AUDIT_2026-05-23.md`; `audit/RESCAN_2026-05-22-v3.md` → `audit/archive/RESCAN_2026-05-22-v3.md` |
| `docs/UNIFICATION_PLAN.md` | `docs/audit/RESCAN_2026-05-22-v3.md` → `docs/audit/archive/RESCAN_2026-05-22-v3.md` |
| `docs/production-hardening/enterprise-hardening-roadmap.md` | both `RESCAN_2026-05-22-v3.md` references rewritten to archive path |
| `docs/audit/GHAITH_SWEEP_EXECUTION_PROGRESS.md` | `RESCAN_2026-05-22-v3.md` reference rewritten to archive path |
| `docs/audit/SYSTEM_PAGE_INVENTORY.md` | `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` (twice) → archive path |

Intra-archive cross references (RCA → companion RCA, finance-remediation
→ functional-finance, etc.) are **not** rewritten — they already sit in
the archive folder together. Inventory-track files (`inventory/*.md`)
that cite now-archived `FUNCTIONAL_*_VERIFICATION.md` or
`*_CERTIFICATION.md` keep their relative filenames since the
"خلاف" sections document the disputes themselves — readers reach the
disputed doc via `git log` or the archive folder; the filename token in
prose stays accurate.

Inline prose mentions in `EXECUTIVE_INVENTORY_REPORT.md` (e.g.
`FUNCTIONAL_UMRAH_VERIFICATION.md` / `PROPERTIES_CERTIFICATION.md` /
`UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` in §"خلافات") were intentionally
left as-is: the prose is the dispute log, and the filename token is the
content under discussion, not a navigation link.

---

## Summary

- Total `.md` files in scope: **46** under `docs/audit/`, **13** under
  `docs/audit/inventory/`, **26** under `docs/architecture/` (incl.
  `phase4-final-drop.sql`), **9** under `docs/rbac/`, **14** under
  `docs/testing/`, **4** under `docs/ux/`.
- **Archived: 30 files** (all from `docs/audit/`); none from any other
  scope directory.
- **Kept: everything else** — every file under `architecture/`, `rbac/`,
  `testing/`, `ux/`, and `audit/inventory/` is still current.
- **Merge / replace: none** this pass — the archive moves are sufficient
  to drop the noise, and no surviving doc needs rewrite.
